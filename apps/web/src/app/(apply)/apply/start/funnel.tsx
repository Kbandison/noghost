"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  APPLICATION_STEPS,
  FORM_ERROR,
  type ApplicationDraft,
  type ApplicationStep,
} from "@noghost/logic";
import { Button } from "@/components/ui/button";
import { submitStep, type StepState } from "./actions";
import {
  AboutStep,
  AgreeStep,
  InterestsStep,
  PhoneStep,
  PhotosStep,
  PreferencesStep,
  PromptsStep,
  SelfieStep,
  VoiceStep,
  VerifyStep,
  type StepProps,
} from "./steps";

/**
 * ⚠️ The statements below are authored, not transcribed. Spec §9 covers the
 * marketing site, the notifications and the closure notes; it does not cover
 * the funnel interior. Flagged for owner sign-off alongside the email bodies.
 */
const COPY: Record<
  ApplicationStep,
  { statement: string; sub: string; cta: string; component: (p: StepProps) => React.ReactNode }
> = {
  phone: {
    statement: "Three hundred people, one start date.",
    sub: "Applying is free and takes about ten minutes. You only pay if a person reads this and says yes.",
    cta: "Send me a code",
    component: PhoneStep,
  },
  verify: {
    statement: "Check your messages.",
    sub: "Your number is the first of two things that prove you're a real person. The second is next.",
    cta: "Verify",
    component: VerifyStep,
  },
  /*
   * Third, not last. The old funnel asked for this after eleven screens of
   * writing, which meant somebody who cannot pass it found out at the very end
   * — and somebody who can spent all that effort before anyone knew they were
   * real. It is the other half of the phone code, so it sits next to it.
   */
  selfie: {
    statement: "Now prove you're you.",
    sub: "A few seconds of video, checked on the spot. Review team only — never shown to another member.",
    cta: "Continue",
    component: SelfieStep,
  },
  about: {
    statement: "Who's applying?",
    sub: "Name, age, and who you're hoping to meet. These are the only things that lock after admission — everything else stays editable all season.",
    cta: "Continue",
    component: AboutStep,
  },
  preferences: {
    statement: "Where you are, who you're for.",
    sub: "Both of these narrow the pool. Be honest rather than optimistic — a thin pool means quiet nights, and we won't pad them.",
    cta: "Continue",
    component: PreferencesStep,
  },
  interests: {
    statement: "What you'd actually talk about.",
    sub: "Shared ground nudges who you're shown. Pick the things you'd bring up unprompted, not the ones that sound good.",
    cta: "Continue",
    component: InterestsStep,
  },
  photos: {
    statement: "Let people see you.",
    sub: "Recent, and actually of you — one clear face each. They get compared against the video check you just did.",
    cta: "Continue",
    component: PhotosStep,
  },
  prompts: {
    statement: "Three things worth replying to.",
    sub: "There is no like button here. Someone has to reply to something specific to reach you — these are what they'll reply to.",
    cta: "Continue",
    component: PromptsStep,
  },
  voice: {
    statement: "Say hello, if you want to.",
    sub: "Thirty seconds of your actual voice, on your card next to your name. Nobody has to do this one — Continue skips it.",
    cta: "Continue",
    component: VoiceStep,
  },
  agree: {
    statement: "That's everything.",
    sub: "Here's what happens next, and the rules it happens under.",
    /*
     * Not "Submit application", which described a form rather than a person.
     * This is somebody putting themselves forward for a season, and the button
     * should say the thing they are actually doing.
     */
    cta: "Put me forward",
    component: AgreeStep,
  },
};

const initial: StepState = {};

export function Funnel({
  initialDraft,
  initialStep,
  voiceIntroUrl,
}: {
  initialDraft: ApplicationDraft;
  initialStep: ApplicationStep;
  /** Signed on the server for a draft resumed after an intro was recorded. */
  voiceIntroUrl: string | null;
}) {
  const [step, setStep] = useState<ApplicationStep>(initialStep);
  const [direction, setDirection] = useState<1 | -1>(1);
  const index = APPLICATION_STEPS.indexOf(step);
  const copy = COPY[step];
  const Body = copy.component;

  function advance(from: ApplicationStep) {
    const next = APPLICATION_STEPS[APPLICATION_STEPS.indexOf(from) + 1];
    setDirection(1);
    if (next) {
      setStep(next);
    } else {
      window.location.href = "/apply/review";
    }
  }

  function back() {
    const prev = APPLICATION_STEPS[index - 1];
    if (!prev) return;
    setDirection(-1);
    setStep(prev);
  }

  const [state, formAction, isPending] = useActionState(
    async (prev: StepState, fd: FormData) => {
      const result = await submitStep(prev, fd);
      if (result.completed) advance(result.completed);
      return result;
    },
    initial,
  );

  return (
    <div className="mx-auto grid w-full max-w-[var(--content-max)] grid-cols-1 gap-12 px-6 pb-24 pt-10 md:px-8 lg:grid-cols-12 lg:gap-16 lg:pt-16">
      {/*
       * The editorial half. Restates why this step exists, in the brand's
       * voice. Sticky, because a long step (prompts is the worst) otherwise
       * scrolls the statement off and leaves half the viewport empty.
       */}
      <div className="lg:sticky lg:top-24 lg:col-span-6 lg:self-start lg:pt-8">
        <p className="mb-6 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--text-dim)]">
          Step {index + 1} of {APPLICATION_STEPS.length}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,4.4vw,3.25rem)] font-extrabold leading-[1.06] tracking-[-0.03em]">
              {copy.statement}
            </h1>
            <p className="prose-measure mt-6 text-[17px] leading-[1.7] text-[var(--text-secondary)]">
              {copy.sub}
            </p>
          </motion.div>
        </AnimatePresence>

        <ProgressRule current={index} total={APPLICATION_STEPS.length} />
      </div>

      {/* The form half. Slides and resizes rather than reloading the page. */}
      <div className="lg:col-span-6 lg:pl-4">
        <motion.div layout transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
          <form
            action={formAction}
            className="border border-[var(--border)] bg-[var(--bg-tertiary)] p-6 md:p-8"
          >
            <input type="hidden" name="step" value={step} />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 18 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 * direction }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {/*
                 * The server echoes the merged draft back on every submission,
                 * and it wins over the entry snapshot. React 19 resets an
                 * uncontrolled form once its action runs, so these defaults are
                 * what repopulate the fields — on a validation error and on
                 * Back alike.
                 */}
                <Body
                  key={`${step}-${state.version ?? 0}`}
                  draft={state.draft ?? initialDraft}
                  errors={state.errors ?? {}}
                  voiceIntroUrl={voiceIntroUrl}
                />
              </motion.div>
            </AnimatePresence>

            {/*
              * Errors that belong to no field — "applications aren't open",
              * "we couldn't reach the season". Rendered here rather than by a
              * step component so that reordering the funnel cannot orphan
              * them, which is exactly what moving the selfie to step three did
              * to the six messages that used to be keyed on it.
              */}
            {state.errors?.[FORM_ERROR] && (
              <p
                role="alert"
                className="mt-6 border-l-2 border-[var(--error)] pl-3 text-[15px] leading-relaxed text-[var(--error)]"
              >
                {state.errors[FORM_ERROR]}
              </p>
            )}

            {state.notice && (
              <p className="mt-6 border-l-2 border-[var(--sage)] pl-3 text-[14px] leading-relaxed text-[var(--sage-text)]">
                {state.notice}
              </p>
            )}

            <div className="mt-8 flex items-center gap-4">
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? "Saving…" : copy.cta}
              </Button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="shrink-0 px-2 text-[15px] text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
                >
                  Back
                </button>
              )}
            </div>
          </form>
        </motion.div>

        <p className="mt-5 text-[14px] leading-relaxed text-[var(--text-dim)]">
          Your answers save as you go. Close the tab and pick this up later.
        </p>
      </div>
    </div>
  );
}

/** A hand-drawn-feeling rule that fills as the application progresses. */
function ProgressRule({ current, total }: { current: number; total: number }) {
  return (
    <div className="mt-12 flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            i <= current
              ? "h-[3px] flex-1 rounded-full bg-[var(--accent)] transition-colors duration-300"
              : "h-[3px] flex-1 rounded-full bg-[var(--border)] transition-colors duration-300"
          }
        />
      ))}
    </div>
  );
}
