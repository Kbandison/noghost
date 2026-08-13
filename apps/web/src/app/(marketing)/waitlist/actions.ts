"use server";

import { checkBotId } from "botid/server";
import { usingSeedData } from "@noghost/config/env";
import { createServiceClient } from "@noghost/db/service";
import { allowRequest } from "@/lib/rate-limit";

export interface WaitlistState {
  status: "idle" | "success" | "error";
  message?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One sentence for both refusals — see the note on `joinWaitlist`. */
const TOO_MANY = {
  message: "That didn't go through. Give it a few minutes and try again.",
} as const;

/**
 * Waitlist sign-up.
 *
 * Runs as service role because the `waitlist` table has no anon insert policy —
 * an open write endpoint on a public marketing page is a free spam target
 * (spec §5). This is the only write in the product reachable without an
 * account, so it carries both of the things §11 phase 7 asks for, in this
 * order:
 *
 *   1. BotID, which is cheap and needs no round trip
 *   2. a rate limit, which costs a query
 *
 * A bot that is turned away should not get to spend a database call on the way
 * out, and a human who is over the limit should not be told they look like a
 * robot.
 *
 * Both refusals say the same thing to the caller. Distinguishing "we think you
 * are a bot" from "you have done this too often" tells whoever is probing which
 * wall they hit, and neither sentence helps somebody who typed their email
 * twice.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const { isBot } = await checkBotId();
  if (isBot) return { status: "error", ...TOO_MANY };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const city = String(formData.get("city") ?? "").trim();

  if (!EMAIL.test(email)) {
    return { status: "error", message: "That email doesn't look right." };
  }
  if (city.length < 2 || city.length > 80) {
    return { status: "error", message: "Which city are you in?" };
  }

  /*
   * After validation, so a typo does not spend an attempt, and keyed on the
   * address rather than the email — limiting by email would let one script walk
   * an alphabet of addresses at full speed, which is exactly the shape of the
   * abuse this is for.
   *
   * Ten an hour is generous for a person and useless for a script.
   */
  if (!(await allowRequest("waitlist", { limit: 10, windowSeconds: 3600 }))) {
    return { status: "error", ...TOO_MANY };
  }

  if (usingSeedData()) {
    // No backend provisioned yet. Silently accepting would be a lie, so the
    // form says plainly what happened.
    return {
      status: "success",
      message: "You're on the list. (Seed mode — nothing was stored.)",
    };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("waitlist")
    .upsert({ email, city }, { onConflict: "email,city", ignoreDuplicates: true });

  if (error) {
    return { status: "error", message: "Something went wrong. Try again in a moment." };
  }

  return { status: "success", message: "You're on the list. We'll be in touch." };
}
