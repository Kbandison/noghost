import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@noghost/config";
import { requireMember } from "@/lib/member";
import { readSettings } from "@/lib/settings";
import { NotificationForm, PauseForm } from "./settings-forms";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * Profile & Settings — §7.2's fourth tab, and the last one to exist.
 *
 * §7.2 lists: "Edit photos/prompts/voice intro (identity fields locked),
 * notification prefs, pause account, Found Someone, report/block (from any
 * profile or chat), sign out, delete account (full cascade)."
 *
 * Four of those already live where they belong and are not duplicated here.
 * Found Someone is a thing you do *to a conversation*, so it is in the chat;
 * report/block is on the person you are reporting; sign out is in the header on
 * every screen. Collecting them onto a settings page would be a menu of things
 * you cannot do from the menu.
 *
 * What is here is what has nowhere else to be: who the season thinks you are,
 * what it is allowed to send you, and how to stop.
 *
 * Editing photos, prompts and the voice intro is not here yet — §7.3 sends
 * changed photos back through review ("photo re-review"), which is an
 * admissions-side flow that does not exist, and shipping an editor whose
 * changes appear instantly would quietly route around it.
 */
export default async function ProfilePage() {
  await requireMember();
  const settings = await readSettings();
  if (!settings) notFound();

  const { identity, prefs } = settings;

  return (
    <div className="mx-auto w-full max-w-[38rem] px-6 py-12">
      <h1 className="font-[family-name:var(--font-display)] text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        {identity.firstName}
      </h1>
      <p className="mt-2 text-[16px] text-[var(--text-secondary)]">
        {identity.age}
        {identity.neighborhood && ` · ${identity.neighborhood}`}
      </p>

      <Section title="Who the season thinks you are">
        <dl className="space-y-3">
          <Fact term="Name" value={identity.firstName} />
          <Fact term="Age" value={String(identity.age)} />
          <Fact term="Gender" value={identity.gender} />
          <Fact term="Looking for" value={identity.seeking.join(", ")} />
          {identity.phone && <Fact term="Phone" value={identity.phone} />}
        </dl>

        {identity.locked ? (
          /*
           * The lock is real and enforced by a trigger, so it is stated as a
           * fact rather than implied by the absence of an edit button. A member
           * who tries to change these somewhere else gets a database error;
           * they should have read the reason here first.
           */
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-dim)]">
            These are locked. A real person checked them against your selfie before you were
            admitted, and letting them change afterwards would make that check meaningless. If
            something here is wrong, email {BRAND.SUPPORT_EMAIL} and a person will fix it.
          </p>
        ) : (
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-dim)]">
            These lock once you&rsquo;re admitted, because they get checked against your selfie.
          </p>
        )}
      </Section>

      <Section title="What we're allowed to send you">
        <NotificationForm prefs={prefs} />
      </Section>

      <Section title={identity.status === "paused" ? "Paused" : "Taking a break"}>
        <PauseForm paused={identity.status === "paused"} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t border-[var(--border-subtle)] pt-8">
      <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.02em]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-32 shrink-0 text-[13px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
        {term}
      </dt>
      <dd className="text-[16px]">{value}</dd>
    </div>
  );
}
