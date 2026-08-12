"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, TextArea } from "@/components/ui/field";
import { submitExitSurvey, type SurveyState } from "./actions";

const initial: SurveyState = {};

/** 0 is a real answer — somebody can find each other without a scheduled date. */
const DATE_COUNTS = ["0", "1", "2", "3", "4", "5+"] as const;

/**
 * The three questions of §6.5, as radio chips and one textarea.
 *
 * Chips rather than a number input for the count: it turns the one question
 * with a keyboard into two taps, and the honest range here is small. "5+" is
 * stored as 5 — the column is an int, and the difference between five dates and
 * nine is not a number this product needs to be precise about.
 *
 * Nothing is pre-selected and nothing is required. The submit button says
 * "Send" whether they answered three questions or none, because a survey that
 * greys out its own button until you comply is a survey that stopped being
 * optional.
 */
export function ExitSurvey() {
  const [state, action, pending] = useActionState(submitExitSurvey, initial);

  if (state.done) {
    return (
      <p role="status" className="text-[17px] leading-relaxed text-[var(--text-secondary)]">
        Thank you for telling us how it went. Go be with them.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          How many dates did you go on?
        </legend>
        <div className="flex flex-wrap gap-2">
          {DATE_COUNTS.map((count) => (
            <Chip
              key={count}
              type="radio"
              name="datesCount"
              value={count === "5+" ? "5" : count}
              label={count}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-dim)]">
          Would you recommend NoGhost to a friend?
        </legend>
        <div className="flex flex-wrap gap-2">
          <Chip type="radio" name="wouldRecommend" value="yes" label="Yes" />
          <Chip type="radio" name="wouldRecommend" value="no" label="No" />
        </div>
      </fieldset>

      <div>
        <TextArea
          name="quote"
          label="Anything we can quote?"
          hint="Optional"
          maxLength={500}
          placeholder="However you'd put it."
        />
        {/* The consent is the field, so the field has to say what it's for.
            Nothing here is used publicly unless somebody types it in knowing
            this sentence. */}
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">
          If you write something here we may use it on the site, with your first name only. Leave
          it empty and we won&rsquo;t.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        <span className="text-[14px] text-[var(--text-dim)]">Or skip it &mdash; truly fine.</span>
      </div>
    </form>
  );
}
