import { z } from "zod";

/**
 * Environment schemas — spec §10 Phase 0 ("env schema (zod) for all three apps").
 *
 * Validation runs once at module load so a missing key fails the build or the
 * boot, not the first request that happens to need it.
 *
 * Split by trust boundary: `client` keys are inlined into the browser bundle,
 * `server` keys must never be. Spec §5 and BACKEND.md anti-pattern #1 make
 * this non-negotiable — one leaked `sb_secret_` key defeats every RLS policy
 * in the schema.
 */

const url = z
  .string()
  .refine((value) => URL.canParse(value), { message: "must be a valid URL" });

/** Safe to ship to the browser. RLS is what protects the data behind these. */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: url,
  NEXT_PUBLIC_MARKETING_URL: url,
  /**
   * When true the apps read from the local seed fixtures instead of Supabase.
   * Lets the whole product be clicked through before any service is
   * provisioned; flipping it off is the only change needed to go live.
   */
  NEXT_PUBLIC_USE_SEED_DATA: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  /*
   * The VAPID public key, which is meant to be public — the browser needs it to
   * create a subscription, and it identifies the sender rather than authorising
   * anything. Its private half is in `serverEnvSchema` and must stay there.
   *
   * Optional because push is the one channel that degrades cleanly: with no key
   * the app never offers to enable notifications, and the sweep defers push
   * rows instead of failing.
   */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
});

/** Server-only. Never prefixed `NEXT_PUBLIC_`, never imported by a client component. */
export const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),

  /*
   * Payments — spec §4.2. Money is integer cents everywhere.
   *
   * Optional, like the VAPID pair and the Resend key, and for the same reason:
   * a deployment without them is a valid state — the claim screen says
   * payments are not switched on and the webhook 404s, rather than a button
   * that 500s and an endpoint that is open.
   */
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_EARLY_BIRD: z.string().min(1).optional(),
  STRIPE_PRICE_STANDARD: z.string().min(1).optional(),

  // Transactional email + SMS
  /*
   * §8's email channel. Optional like the VAPID pair and for the same reason:
   * a deployment without it defers email rows rather than failing, which is how
   * every environment starts. Separate from Supabase's SMTP settings, which
   * send auth mail only.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Must be on a Resend-verified domain, or every send is a 550. */
  EMAIL_FROM: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_MESSAGING_SERVICE_SID: z.string().min(1),

  // Tone check on closure personal lines — spec §6.6
  ANTHROPIC_API_KEY: z.string().min(1),

  /** Every cron endpoint verifies this before doing anything — spec §4.3. */
  CRON_SECRET: z.string().min(16),

  /*
   * Web Push — spec §8's only channel that needs no third-party account.
   *
   * Optional as a pair. Push is opt-in infrastructure: without these the app
   * does not offer notifications and the sweep reports push as untransportable
   * rather than crashing, which is what lets the rest of the queue drain on a
   * deployment that has not set them up yet.
   */
  /*
   * Turns on `/auth/confirm`, which redeems an admin-issued link into a session
   * so the member app can be looked at before Twilio exists. Off by default and
   * meant to stay off in production: §7.4 gives this product one credential,
   * and a preview convenience should not quietly become a second one.
   */
  PREVIEW_SIGN_IN: z.enum(["on", "off"]).default("off"),

  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  /*
   * The scheme is not enough: a bare `mailto:` passes a `startsWith` check and
   * is what a half-finished paste leaves behind. FCM accepts it, Mozilla's push
   * service does not — so the failure is push that works in Chrome and silently
   * does nothing in Firefox, which is the hardest kind of bug to be told about.
   */
  VAPID_SUBJECT: z
    .string()
    .refine((v) => /^mailto:.+@.+\..+$/.test(v) || /^https:\/\/.+\..+/.test(v), {
      message:
        "must be a real contact URL — mailto:you@example.com or https://example.com. " +
        "A bare 'mailto:' is accepted by FCM and rejected by Mozilla, so push would " +
        "work in Chrome and silently fail in Firefox.",
    })
    .optional(),
});

/** Admin app only — separate deploy, separate allow-list (spec §7.3). */
export const adminEnvSchema = z.object({
  ADMIN_EMAILS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type AdminEnv = z.infer<typeof adminEnvSchema>;

function formatIssues(name: string, error: z.ZodError): never {
  const lines = error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`Invalid ${name} environment:\n${lines.join("\n")}`);
}

/**
 * Client env is read from an explicit object, not `process.env`, because
 * bundlers only inline `process.env.NEXT_PUBLIC_X` when the property access is
 * statically visible — a dynamic lookup would silently resolve to undefined in
 * the browser.
 */
export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const result = clientEnvSchema.safeParse(source);
  if (!result.success) formatIssues("client", result.error);
  return result.data;
}

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) formatIssues("server", result.error);
  return result.data;
}

export function parseAdminEnv(source: NodeJS.ProcessEnv = process.env): AdminEnv {
  const result = adminEnvSchema.safeParse(source);
  if (!result.success) formatIssues("admin", result.error);
  return result.data;
}

/**
 * Whether the app should run against local seed fixtures. Readable without
 * full env validation so the seed path works with no services configured.
 */
export function usingSeedData(): boolean {
  return process.env.NEXT_PUBLIC_USE_SEED_DATA === "true";
}
