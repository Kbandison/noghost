import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/member";
import { readSettings } from "@/lib/settings";
import { signedVoiceUrls } from "@/lib/voice-urls";
import { AboutForm, PhotosForm, PromptsForm, VoiceIntroForm } from "./edit-forms";
import { LiveRefresh } from "@/components/live/live-refresh";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * Your card — what every other member sees, and nothing else.
 *
 * This page and `/settings` were one, and the split is by audience rather than
 * by topic. Opening your profile is asking "how do I come across"; opening
 * settings is asking "how does this thing behave". Locked identity fields, a
 * travel radius, notification switches, pausing and leaving all answer the
 * second question, and together they pushed the photos and prompts and voice —
 * the actual product — below the fold of the page named after them.
 *
 * What is left is everything printed on a drop card, in the order it appears
 * there.
 *
 * "About you" is new, and it is here because nothing could write it. A card has
 * always printed facts under the name, no funnel step asks for any of them, and
 * the profile had no field: every seeded profile carried them because a
 * generator invented them, and the only real member in the database had none. A
 * real card read as a name and a neighbourhood where a fixture read as a name,
 * a job and a height.
 *
 * A changed photo goes back through review (§7.3) rather than appearing
 * instantly. That loop only became real in 0020 — before it, an editor here
 * would have put unreviewed images straight onto cards, which is why this
 * waited for it.
 */
export default async function ProfilePage() {
  await requireMember();
  const settings = await readSettings();
  if (!settings) notFound();

  const { identity } = settings;

  // Signed here rather than in the client component: the bucket is private, and
  // signing is a server capability.
  const voiceIntroUrl = identity.voiceIntroPath
    ? ((await signedVoiceUrls([identity.voiceIntroPath], "voice-intros")).get(
        identity.voiceIntroPath,
      ) ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-[38rem] px-6 py-12">
      {/*
        * The member's own row and nobody else's — `profiles` RLS is
        * `auth.uid() = id`, so no filter is needed here and none would add
        * anything if it were.
        *
        * `revalidatePath` in the edit actions already refreshes this page after
        * a save on THIS device. This is the other cases: a photo approved by a
        * reviewer, a second tab, the phone still open in a pocket while the
        * edit happened on a laptop.
        */}
      <LiveRefresh table="profiles" event="UPDATE" />

      <h1 className="font-[family-name:var(--font-display)] text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        {identity.firstName}
      </h1>
      <p className="mt-2 text-[16px] text-[var(--text-secondary)]">
        {identity.age}
        {identity.neighborhood && ` · ${identity.neighborhood}`}
      </p>

      <Section title="About you">
        <AboutForm
          bio={identity.bio}
          heightCm={identity.heightCm}
          weightLb={identity.weightLb}
        />
      </Section>

      <Section title="Your photos">
        <PhotosForm photos={identity.photos} />
      </Section>

      <Section title="Your answers">
        <PromptsForm prompts={identity.prompts} />
      </Section>

      <Section title="Your voice">
        <VoiceIntroForm url={voiceIntroUrl} hasIntro={Boolean(identity.voiceIntroPath)} />
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
  /** An anchor, so the header's bell can land on this section rather than the
      top of a long page. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 mt-12 border-t border-[var(--border-subtle)] pt-8">
      <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-[-0.02em]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}
