import { cookies } from "next/headers";
import type { ApplicationDraft } from "@noghost/logic";

const COOKIE = "noghost_application";
const MAX_AGE = 60 * 60 * 24 * 14; // two weeks to finish an application

/**
 * The in-progress application lives in an httpOnly cookie until it is
 * submitted.
 *
 * Deliberately not signed: the only thing a member can tamper with is their own
 * draft, and every server action re-runs the `packages/logic` validators before
 * writing anything — so a doctored cookie fails at the boundary rather than
 * getting through. httpOnly keeps it out of reach of injected scripts.
 *
 * Once Supabase phone auth is wired (Phase 2), the draft moves server-side
 * after the verify step and this becomes the pre-auth carrier only. Photo and
 * selfie *paths* are stored here; bytes never are.
 */
export async function readDraft(): Promise<ApplicationDraft> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as ApplicationDraft) : {};
  } catch {
    // A corrupted cookie should restart the application, not crash the page.
    return {};
  }
}

export async function writeDraft(draft: ApplicationDraft): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(draft), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearDraft(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
