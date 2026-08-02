import { cookies } from "next/headers";
import { createClient } from "@noghost/db/server";

/**
 * The admin's own session. Every console read goes through this, never the
 * service client, so RLS and `is_admin()` stay in the path — a bug in a page
 * cannot widen what an admin can see beyond what the database allows.
 *
 * The service client exists for exactly one thing here (see `lib/storage.ts`:
 * signing selfie URLs) and is imported nowhere else.
 */
export async function supabaseServer() {
  const store = await cookies();
  return createClient({
    getAll: () => store.getAll(),
    set: (name, value, options) => store.set(name, value, options),
  });
}
