"use server";

import { redirect } from "next/navigation";
import { BRAND } from "@noghost/config";
import { supabaseServer } from "@/lib/supabase";

export interface EnrolState {
  stage: "idle" | "enrolled";
  factorId?: string;
  /** A finished `data:` URL, ready for an <img src>. Built by `qrDataUrl`. */
  qr?: string;
  secret?: string;
  error?: string;
}

/**
 * Turns Supabase's `totp.qr_code` into a data URL a browser will actually
 * decode.
 *
 * Two problems with using the value directly, both found by loading the page:
 *
 *   1. The value ALREADY carries a `data:image/svg+xml;utf-8,` prefix, even
 *      though auth-js's own type docs say to prepend one. Following the docs
 *      produces `data:image/svg+xml;charset=utf-8,data:image/svg+xml;utf-8,…`
 *      and a silently broken image.
 *   2. `;utf-8` is not a valid media-type parameter — it has to be
 *      `charset=utf-8` — so even the un-doubled form is refused.
 *
 * Base64 rather than percent-encoding: the QR is a large XML SVG, and
 * escaping every angle bracket roughly triples it where base64 adds a third.
 */
function qrDataUrl(raw: string): string {
  const svg = raw.replace(/^data:image\/svg\+xml[^,]*,/, "");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/*
 * The initial state lives in the client component, not here.
 *
 * A "use server" module may only export async functions — every export becomes
 * a callable server reference. Exporting a plain object throws at runtime, and
 * neither `tsc` nor `next build` catches it, because it is a property of the
 * module graph rather than of the types. Found by loading the page.
 */

/**
 * Enrolment is a POST, not a render.
 *
 * `mfa.enroll()` creates an unverified factor server-side. Calling it while
 * rendering the page would mint a new factor on every reload, every prefetch
 * and every back-navigation, and leave a trail of orphans behind — so the page
 * shows a button and this runs when it's pressed.
 */
export async function enrolAction(prev: EnrolState, formData: FormData): Promise<EnrolState> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const intent = String(formData.get("intent") ?? "");

  if (intent === "begin") {
    // Clear out anything left by an abandoned attempt. Only unverified factors
    // are removed — a verified one means enrolment already succeeded and this
    // page shouldn't be reachable.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.factor_type === "totp" && factor.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      // What the authenticator app shows in its list.
      friendlyName: `${BRAND.APP_NAME} admin · ${new Date().toISOString().slice(0, 10)}`,
      issuer: BRAND.DOMAIN,
    });

    if (error || !data) {
      return { stage: "idle", error: `Couldn't start enrolment: ${error?.message ?? "unknown"}` };
    }

    return {
      stage: "enrolled",
      factorId: data.id,
      qr: qrDataUrl(data.totp.qr_code),
      secret: data.totp.secret,
    };
  }

  // ---- confirm ------------------------------------------------------------
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");

  if (!factorId) return { ...prev, error: "That enrolment expired. Start again." };
  if (!/^\d{6}$/.test(code)) return { ...prev, error: "Six digits." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

  if (error) {
    return {
      ...prev,
      error: "That code didn't match. Check your device's clock, then try the next code.",
    };
  }

  redirect("/");
}
