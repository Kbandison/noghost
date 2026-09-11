"use client";

import { useActionState, useState } from "react";
import type { SeasonPhase } from "@noghost/types";
import { Button, Field } from "@/components/ui";
import { changePhase, saveSeason, type SeasonState } from "./actions";

const initial: SeasonState = {};

export interface SeasonRow {
  id: string;
  name: string;
  city: string;
  phase: SeasonPhase;
  applications_open_at: string | null;
  starts_at: string;
  ends_at: string;
  member_cap: number;
  drop_time: string;
  drop_max: number;
  fuse_days: number;
  claim_hours: number;
  price_early_cents: number;
  price_standard_cents: number;
  early_bird_cap: number;
  encore_start_week: number;
  timezone: string;
  seats_display_cap: number | null;
  members: number;
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` with no zone. */
const forInput = (iso: string | null): string =>
  iso ? new Date(iso).toISOString().slice(0, 16) : "";

export function SeasonForm({ season }: { season: SeasonRow }) {
  const [state, action, pending] = useActionState(saveSeason, initial);

  return (
    <form action={action} className="space-y-5 p-4">
      <input type="hidden" name="id" value={season.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" name="name" defaultValue={season.name} />
        <Field id="city" label="City" name="city" defaultValue={season.city} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="applications_open_at" label="Applications open" name="applications_open_at"
          type="datetime-local" defaultValue={forInput(season.applications_open_at)}
        />
        <Field
          id="starts_at" label="Day one" name="starts_at"
          type="datetime-local" defaultValue={forInput(season.starts_at)}
        />
        <Field
          id="ends_at" label="Finale" name="ends_at"
          type="datetime-local" defaultValue={forInput(season.ends_at)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="member_cap" label="Member cap" name="member_cap" type="number"
          defaultValue={season.member_cap} />
        <Field id="drop_time" label="Drop time" name="drop_time" type="time"
          defaultValue={season.drop_time.slice(0, 5)} hint="local" />
        <Field id="drop_max" label="Cards per drop" name="drop_max" type="number"
          defaultValue={season.drop_max} />
        <Field id="fuse_days" label="Fuse days" name="fuse_days" type="number"
          defaultValue={season.fuse_days} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="claim_hours" label="Claim hours" name="claim_hours" type="number"
          defaultValue={season.claim_hours} />
        <Field id="price_early_cents" label="Early price" name="price_early_cents" type="number"
          defaultValue={season.price_early_cents} hint="cents" />
        <Field id="price_standard_cents" label="Standard price" name="price_standard_cents"
          type="number" defaultValue={season.price_standard_cents} hint="cents" />
        <Field id="early_bird_cap" label="Early seats" name="early_bird_cap" type="number"
          defaultValue={season.early_bird_cap} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="encore_start_week" label="Encore from week" name="encore_start_week"
          type="number" defaultValue={season.encore_start_week} />
        <Field id="timezone" label="Timezone" name="timezone" defaultValue={season.timezone} />
        <Field
          id="seats_display_cap" label="Show at most" name="seats_display_cap" type="number"
          defaultValue={season.seats_display_cap ?? ""}
          hint="blank = the truth"
        />
      </div>

      {/*
        Said plainly, because the field is the one thing on this screen that
        could be used to lie. It lowers only — the database refuses the other
        direction — so the most it can do is hold seats back, which is a real
        thing to want when releasing a cohort in waves.
      */}
      <p className="text-[12px] leading-relaxed text-[var(--text-dim)]">
        &ldquo;Show at most&rdquo; caps what the marketing site displays. It can only ever show{" "}
        <em>fewer</em> seats than are really left, never more — hold inventory back with it, not
        scarcity. {season.members} of {season.member_cap} seats are taken.
      </p>

      {state.error && (
        <p role="alert" className="text-[13px] leading-snug text-[var(--error)]">{state.error}</p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-[13px] text-[var(--sage-text)]">Saved to the audit trail.</p>
      )}

      <Button type="submit" tone="primary" disabled={pending}>
        {pending ? "Saving…" : "Save season"}
      </Button>
    </form>
  );
}

const PHASES: SeasonPhase[] = [
  "draft", "applications_open", "pre_season", "live", "finale_week", "closed",
];

const EXPLAINS: Record<SeasonPhase, string> = {
  draft: "Invisible. Nobody can apply and no drop is built.",
  applications_open: "The funnel accepts applications. No drops yet.",
  pre_season: "Cohort locked. Members can see their profile; no drops until day one.",
  live: "Drops run nightly at the drop time. The season is happening.",
  finale_week: "Still dropping, and everyone has been told the end is coming.",
  closed: "Ends every open conversation at the next fuse sweep. Nothing drops again.",
};

/**
 * The confirm gate §7.3 asks for.
 *
 * Not a dialog — a second, deliberate step that names what the phase does
 * before it happens. A dialog asking "are you sure?" is answered yes by reflex;
 * a sentence saying "this ends every open conversation" is read.
 */
export function PhaseForm({ season }: { season: SeasonRow }) {
  const [state, action, pending] = useActionState(changePhase, initial);
  const [next, setNext] = useState<SeasonPhase | "">("");

  const backwards = next ? PHASES.indexOf(next) < PHASES.indexOf(season.phase) : false;
  const needsReason = backwards || next === "closed";

  return (
    <form action={action} className="space-y-4 p-4">
      <input type="hidden" name="id" value={season.id} />
      <input type="hidden" name="from" value={season.phase} />

      <p className="text-[14px] text-[var(--text-secondary)]">
        Currently <strong>{season.phase.replace(/_/g, " ")}</strong>.{" "}
        <span className="text-[var(--text-dim)]">{EXPLAINS[season.phase]}</span>
      </p>

      <div>
        <label htmlFor="phase" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-dim)]">
          Move to
        </label>
        <select
          id="phase" name="phase" value={next}
          onChange={(e) => setNext(e.target.value as SeasonPhase)}
          className="w-full rounded-[3px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[15px]"
        >
          <option value="">Leave it where it is</option>
          {PHASES.filter((p) => p !== season.phase).map((p) => (
            <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {next && (
        <p className={`text-[13px] leading-relaxed ${next === "closed" || backwards ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}>
          {EXPLAINS[next]}
          {backwards && " This moves the season backwards — season-tick will not undo it."}
        </p>
      )}

      {needsReason && (
        <Field
          id="reason" label="Why" name="reason"
          hint="internal, goes in the audit trail"
          placeholder={next === "closed" ? "Cohort finished early." : "Reopening applications."}
        />
      )}

      {state.error && (
        <p role="alert" className="text-[13px] leading-snug text-[var(--error)]">{state.error}</p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-[13px] text-[var(--sage-text)]">Phase changed.</p>
      )}

      <Button
        type="submit"
        tone={next === "closed" || backwards ? "danger" : "primary"}
        disabled={pending || !next}
      >
        {pending ? "Changing…" : next ? `Move to ${next.replace(/_/g, " ")}` : "Pick a phase"}
      </Button>
    </form>
  );
}
