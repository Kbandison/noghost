-- ============================================================================
-- 0019 — rate limits
-- ============================================================================
--
-- Spec §11 phase 7: "Rate limits (OTP, connects, waitlist)". The waitlist is the
-- one that needs it first and the one that has been shipping without it — its
-- server action runs as the service role, because `waitlist` deliberately has no
-- anon insert policy, which means the only thing standing between a public
-- marketing page and an unbounded write is an email regex.
--
-- Counted here rather than at the edge, on purpose. A limiter is only useful if
-- it is the same limiter for every instance answering the request, and the one
-- piece of shared state this product already has is Postgres. It also means the
-- rule is testable the way everything else here is: call it eleven times and
-- watch the eleventh be refused.
--
-- Fixed window, not a sliding one. A sliding window is more accurate and needs
-- either a row per hit or a background sweep; a fixed window needs one row per
-- (bucket, key, window) and its worst case — twice the limit across a window
-- boundary — is irrelevant at the scale of "how many times may one address join
-- a waitlist an hour".
--
-- Idempotent: safe to re-run.

create table if not exists rate_limits (
  bucket text not null,
  -- Whatever identifies the caller for this bucket: an IP, a phone number, a
  -- user id. Hashed by the caller when it is personal — see `lib/rate-limit.ts`,
  -- which never sends a raw address here.
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, key, window_start)
);

comment on table rate_limits is
  'Fixed-window counters. Rows are disposable: anything older than its window '
  'is dead weight, and `prune_rate_limits()` is what removes it.';

-- The sweep reads by age across every bucket, which is the only query shape
-- that is not a primary-key lookup.
create index if not exists rate_limits_window_idx on rate_limits (window_start);

alter table rate_limits enable row level security;

/*
 * No policies at all, and that is the point: this table is reachable only by
 * the service role, from the server actions that call `hit_rate_limit`. A member
 * being able to read their own counter would tell them exactly how many
 * attempts they had left, and being able to write one would make the limit
 * advisory.
 */

/**
 * Records a hit and says whether it is allowed.
 *
 * Returns true while the caller is under the limit, false once they are over it.
 * The row is upserted either way — a refused attempt still counts, otherwise
 * somebody who keeps trying gets a free retry every time the window ticks over.
 */
create or replace function hit_rate_limit(
  p_bucket text, p_key text, p_limit int, p_window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz;
  v_count int;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'A rate limit needs a positive limit and window'
      using errcode = 'check_violation';
  end if;

  -- Truncated to the window, so every caller in the same window shares a row
  -- and the primary key does the concurrency work.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (bucket, key, window_start, count)
  values (p_bucket, p_key, v_window, 1)
  on conflict (bucket, key, window_start)
    do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

/** Housekeeping. Anything older than a day is past every window in use. */
create or replace function prune_rate_limits()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_deleted int;
begin
  delete from rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Server-side only. `authenticated` is deliberately absent: a client that can
-- call this can burn somebody else's allowance by guessing their key.
revoke execute on function hit_rate_limit(text, text, int, int) from public, anon, authenticated;
revoke execute on function prune_rate_limits() from public, anon, authenticated;

comment on function hit_rate_limit(text, text, int, int) is
  'Fixed-window counter. True while under the limit; a refused attempt still '
  'counts, so retrying does not earn a fresh allowance.';
