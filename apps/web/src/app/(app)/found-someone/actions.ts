"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { supabaseServer } from "@/lib/supabase";

export interface SurveyState {
  error?: string;
  done?: boolean;
}

const MAX_QUOTE = 500; // matches the column's check constraint
const MAX_DATES = 99;

/**
 * The exit survey — spec §6.5.
 *
 * `respond_graduation` already opened a row for each of them, so this is an
 * upsert rather than an insert: the row exists with three nulls and a null
 * `submitted_at`, and this fills in whichever of the three they felt like
 * answering. `submitted_at` is what separates "answered" from "opened", which is
 * why the page keys its thank-you off that column and not off the row existing.
 *
 * Every field is optional and a blank one is stored as null, not as zero or
 * false. The difference matters on the reading end: `would_recommend = false` is
 * somebody telling us this didn't work for them, and null is somebody who
 * declined to say. Collapsing those would quietly invent bad reviews.
 *
 * `season_id` comes from the member gate, never from the form. A hidden input
 * is a client-supplied value, and this one selects which row gets written.
 */
export async function submitExitSurvey(
  _prev: SurveyState,
  formData: FormData,
): Promise<SurveyState> {
  const member = await requireMember();

  const rawDates = String(formData.get("datesCount") ?? "").trim();
  let datesCount: number | null = null;
  if (rawDates) {
    const parsed = Number(rawDates);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_DATES) {
      return { error: `Dates should be a whole number between 0 and ${MAX_DATES}.` };
    }
    datesCount = parsed;
  }

  const rawRecommend = String(formData.get("wouldRecommend") ?? "");
  const wouldRecommend = rawRecommend === "yes" ? true : rawRecommend === "no" ? false : null;

  const rawQuote = String(formData.get("quote") ?? "").trim();
  if (rawQuote.length > MAX_QUOTE) {
    return { error: `That's longer than ${MAX_QUOTE} characters — trim it a little.` };
  }
  const quote = rawQuote || null;

  const supabase = await supabaseServer();
  const { error } = await supabase.from("exit_surveys").upsert(
    {
      user_id: member.id,
      season_id: member.seasonId,
      dates_count: datesCount,
      would_recommend: wouldRecommend,
      quote,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,season_id" },
  );

  if (error) {
    console.error(`[survey] exit ${member.id}: ${error.message}`);
    return { error: "That didn't save. Try again." };
  }

  revalidatePath("/found-someone");
  return { done: true };
}
