"use server";

import { redirect } from "next/navigation";
import { OTP_PATTERN } from "@noghost/config";
import { otpMessage } from "@/lib/otp";
import { supabaseServer } from "@/lib/supabase";
import { allowRequest } from "@/lib/rate-limit";
import {
  OTP_SEND_PER_ADDRESS,
  OTP_SEND_PER_PHONE,
  OTP_SLOW_DOWN,
  OTP_VERIFY_PER_PHONE,
} from "@/lib/auth-limits";

/**
 * Member sign-in — the same phone OTP the funnel uses, minus the account
 * creation.
 *
 * `shouldCreateUser: false` is the whole difference and it matters twice. It
 * keeps a typo from silently minting an empty account, and it makes this
 * endpoint useless for enumerating which numbers are members: Supabase returns
 * the same shape whether or not the number exists, and the copy below does not
 * distinguish them either.
 *
 * Both halves are rate limited, and they are the two endpoints in the product
 * an anonymous caller can reach — see `auth-limits.ts` for the numbers and why
 * each one is keyed the way it is. Supabase applies limits of its own; relying
 * on them silently would be trusting a setting nothing in this repository can
 * see, which is the pattern this codebase keeps finding and fixing.
 */

export interface SignInState {
  stage: "phone" | "code";
  phone?: string;
  error?: string;
  /** Set once a code has been sent, so the UI can say so without claiming more. */
  sent?: boolean;
}

const E164 = /^\+[1-9]\d{7,14}$/;

export async function requestCode(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const phone = String(formData.get("phone") ?? "").replace(/[\s()-]/g, "");

  if (!E164.test(phone)) {
    return {
      stage: "phone",
      error: "Include the country code, like +14045550123.",
    };
  }

  /*
   * Both limits before the send, and the address one first: it is the cheaper
   * refusal and the one that stops a script walking numbers. A caller over
   * either limit gets the same sentence, which names neither.
   */
  if (
    !(await allowRequest("otp-send-ip", OTP_SEND_PER_ADDRESS)) ||
    !(await allowRequest("otp-send-phone", OTP_SEND_PER_PHONE, phone))
  ) {
    return { stage: "phone", phone, error: OTP_SLOW_DOWN };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });

  if (error) {
    console.error(`[sign-in] signInWithOtp failed: ${error.message}`);

    /*
     * "Signups not allowed for otp" is what Supabase returns for a number with
     * no account, and it is deliberately not surfaced as "no account found".
     * Telling an anonymous caller which numbers belong to members would turn
     * sign-in into a membership oracle for a dating product.
     */
    if (/signups? not allowed|not found/i.test(error.message)) {
      return { stage: "code", phone, sent: true };
    }
    return { stage: "phone", phone, error: otpMessage(error.message) };
  }

  return { stage: "code", phone, sent: true };
}

export async function verifyCode(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const phone = String(formData.get("phone") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");

  if (!E164.test(phone)) return { stage: "phone", error: "Start again with your number." };
  if (!OTP_PATTERN.test(code)) {
    return { stage: "code", phone, sent: true, error: "Six digits, from the text." };
  }

  /*
   * The one that matters. Six digits is a million combinations, which is
   * nothing to a script — and the refusal has to come before Supabase sees the
   * attempt, or the limit is only as good as somebody else's configuration.
   */
  if (!(await allowRequest("otp-verify", OTP_VERIFY_PER_PHONE, phone))) {
    return { stage: "code", phone, sent: true, error: OTP_SLOW_DOWN };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });

  if (error) {
    console.error(`[sign-in] verifyOtp failed: ${error.message}`);
    return { stage: "code", phone, sent: true, error: otpMessage(error.message) };
  }

  // Where they land is the member gate's decision, not this action's — it knows
  // the difference between a member, an applicant and a half-finished funnel.
  redirect("/tonight");
}
