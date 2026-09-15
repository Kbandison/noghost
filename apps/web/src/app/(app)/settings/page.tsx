import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@noghost/config";
import { requireMember } from "@/lib/member";
import { readSettings } from "@/lib/settings";
import { PushToggle } from "@/components/push/push-toggle";
import { LiveRefresh } from "@/components/live/live-refresh";
import { LocationForm } from "../profile/edit-forms";
import { DeleteForm, NotificationForm, PauseForm } from "../profile/settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * How the season runs for you — as opposed to what other people see, which is
 * the profile.
 *
 * One page held both, and the split is by audience rather than by topic. A
 * member opening their profile is asking "how do I come across"; a member
 * opening settings is asking "how does this thing behave". Locked identity
 * fields, where you are, what may be sent, pausing and leaving all answer the
 * second question and pushed the first one — the photos and prompts and voice
 * that are the actual product — below the fold.
 *
 * Four of §7.2's list live where they belong and are deliberately not collected
 * here. Found Someone is a thing you do *to a conversation*, so it is in the
 * chat; report/block is on the person being reported; sign out is in the header
 * on every screen. A settings page of things you cannot do from the settings
 * page would be a menu of links.
 *
 * Leaving is last and quietest, which is where it belongs: the one thing here
 * that cannot be undone should be findable without being offered.
 */
export default async function SettingsPage() {
  await requireMember();
  const settings = await readSettings();
  if (!settings) notFound();

  const { identity, prefs } = settings;

  return (
    <div className="mx-auto w-full max-w-[38rem] px-6 py-10">
      <LiveRefresh table="profiles" event="UPDATE" />

      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        Settings
      </h1>

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

      {/* Here rather than on the profile: a radius is not something anybody
          sees, it is who the drop is allowed to show you. */}
      <Section title="Where you are">
        <LocationForm
          lat={identity.lat}
          lng={identity.lng}
          travelRadiusKm={identity.travelRadiusKm}
        />
      </Section>

      <Section title="What we&rsquo;re allowed to send you">
        <NotificationForm prefs={prefs} />
      </Section>

      {/*
        Its own section, below the preferences rather than inside them. Those
        switches are about what you want to hear; this is about whether this
        particular browser is somewhere you can hear it, and a member with two
        devices turns it on twice.
      */}
      <Section id="notifications" title="Notifications on this device">
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </Section>

      <Section title={identity.status === "paused" ? "Paused" : "Taking a break"}>
        <PauseForm paused={identity.status === "paused"} />
      </Section>

      <Section title="Leaving">
        <DeleteForm />
      </Section>

    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  /** An anchor, so the header's bell can land on a section rather than the top
      of a long page. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 border-t border-[var(--border-subtle)] pt-8">
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
