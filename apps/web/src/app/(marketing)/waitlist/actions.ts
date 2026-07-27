"use server";

import { usingSeedData } from "@noghost/config/env";
import { createServiceClient } from "@noghost/db/service";

export interface WaitlistState {
  status: "idle" | "success" | "error";
  message?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Waitlist sign-up.
 *
 * Runs as service role because the `waitlist` table has no anon insert policy —
 * an open write endpoint on a public marketing page is a free spam target
 * (spec §5). Rate limiting and BotID go in front of this before launch; see the
 * deploy checklist in the README rather than shipping it unbounded.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
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
