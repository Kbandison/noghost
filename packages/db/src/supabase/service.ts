import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@noghost/types";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only three callers are legitimate: the cron routes in §4.3, the Stripe
 * webhook, and the admin app's server side. It must never be constructed in a
 * Client Component, and the key must never appear in a `NEXT_PUBLIC_` var
 * (BACKEND.md anti-pattern #1).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. The service client is server-only and " +
        "must never be constructed in the browser.",
    );
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
