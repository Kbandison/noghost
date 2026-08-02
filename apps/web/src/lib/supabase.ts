import { cookies } from "next/headers";
import { createClient } from "@noghost/db/server";

/**
 * The request-scoped Supabase client, carrying the member's session.
 *
 * `packages/db` takes the cookie store as an argument rather than importing
 * `next/headers` itself, so the same client can serve the admin app and the
 * cron routes. This is the Next binding for it.
 *
 * Reads and writes through this client run as the signed-in member, so RLS
 * applies. Anything that needs to bypass RLS uses `createServiceClient()`
 * instead, and there are only three places that legitimately do.
 */
export async function supabaseServer() {
  const store = await cookies();
  return createClient({
    getAll: () => store.getAll(),
    set: (name, value, options) => store.set(name, value, options),
  });
}
