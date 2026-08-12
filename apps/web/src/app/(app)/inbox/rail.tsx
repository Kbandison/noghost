import Link from "next/link";
import Image from "next/image";
import { EMPTY_STATES } from "@noghost/config/copy";
import { cn } from "@/lib/utils";
import { publicPhotoUrl } from "@/lib/photos";
import type { Inbox } from "@/lib/inbox";

/**
 * The left half of the Split Canvas (docs/design-decisions.md).
 *
 * Rendered by both `/inbox` and `/inbox/[id]` rather than lifted into a shared
 * layout, so the active row can be highlighted — a layout receives no route
 * params. Same reason the admin console's admissions queue does it.
 *
 * Two sections, and the second is the point: "Your notes" is where the answer
 * to something you sent shows up. A decline is a real reply, so it has to be
 * somewhere a person can actually read it.
 */

function Thumb({ photos, name }: { photos: { path: string }[]; name: string }) {
  const url = photos[0] ? publicPhotoUrl(photos[0].path) : "";
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--bg-tertiary)]">
      {url && <Image src={url} alt="" fill sizes="48px" className="object-cover" />}
      {!url && (
        <span className="flex h-full items-center justify-center font-[family-name:var(--font-display)] text-[18px] text-[var(--text-dim)]">
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}

/** Verbatim from the enum, softened only where the word would mislead. */
const OUTCOME: Record<string, string> = {
  pending: "waiting on them",
  accepted: "they said yes",
  declined: "answered",
  expired: "season ended",
};

export function Rail({ inbox, activeId }: { inbox: Inbox; activeId?: string }) {
  const waiting = inbox.incoming.filter((c) => c.status === "pending");
  const answered = inbox.incoming.filter((c) => c.status !== "pending");

  return (
    <div className="w-full shrink-0 border-[var(--border-subtle)] md:w-[22rem] md:border-r">
      <header className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-extrabold tracking-[-0.03em]">
          Inbox
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-dim)]">
          {waiting.length === 0
            ? "Nothing waiting on you"
            : `${waiting.length} ${waiting.length === 1 ? "note" : "notes"} waiting on you`}
        </p>
      </header>

      {inbox.incoming.length === 0 && inbox.outgoing.length === 0 ? (
        <p className="px-5 py-12 text-[16px] leading-relaxed text-[var(--text-secondary)]">
          {EMPTY_STATES.inbox}
        </p>
      ) : (
        <>
          <Section title="Notes to you" count={waiting.length}>
            {waiting.map((connect) => (
              <Row
                key={connect.id}
                href={`/inbox/${connect.id}`}
                active={connect.id === activeId}
                photos={connect.from.photos}
                name={connect.from.firstName}
                age={connect.from.age}
                detail={connect.replyText ?? "Voice note"}
                accent
              />
            ))}
            {waiting.length === 0 && (
              <p className="px-5 py-6 text-[15px] text-[var(--text-dim)]">
                You&rsquo;re all caught up.
              </p>
            )}
          </Section>

          {answered.length > 0 && (
            <Section title="Answered" count={answered.length}>
              {answered.map((connect) => (
                <Row
                  key={connect.id}
                  href={`/inbox/${connect.id}`}
                  active={connect.id === activeId}
                  photos={connect.from.photos}
                  name={connect.from.firstName}
                  age={connect.from.age}
                  detail={connect.status === "accepted" ? "You said yes" : "You answered"}
                />
              ))}
            </Section>
          )}

          {inbox.outgoing.length > 0 && (
            <Section title="Your notes" count={inbox.outgoing.length}>
              {inbox.outgoing.map((connect) => (
                <Row
                  key={connect.id}
                  href={`/inbox/${connect.id}`}
                  active={connect.id === activeId}
                  photos={connect.to.photos}
                  name={connect.to.firstName}
                  age={connect.to.age}
                  detail={OUTCOME[connect.status] ?? connect.status}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
        {title}
        <span className="opacity-60">{count}</span>
      </h2>
      <ul>{children}</ul>
    </section>
  );
}

function Row({
  href,
  active,
  photos,
  name,
  age,
  detail,
  accent,
}: {
  href: `/inbox/${string}`;
  active: boolean;
  photos: { path: string }[];
  name: string;
  age: number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 transition-colors duration-150",
          active ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-secondary)]",
        )}
      >
        <Thumb photos={photos} name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">
            {name}
            <span className="ml-2 font-normal text-[var(--text-dim)]">{age}</span>
          </span>
          <span
            className={cn(
              "block truncate text-[14px]",
              accent ? "text-[var(--text-secondary)]" : "text-[var(--text-dim)]",
            )}
          >
            {detail}
          </span>
        </span>
      </Link>
    </li>
  );
}
