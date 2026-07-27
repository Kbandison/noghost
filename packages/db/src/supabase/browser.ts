import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@noghost/types";

/**
 * Browser client. Carries the publishable key, which is public by design —
 * RLS is what protects the data behind it (BACKEND.md).
 *
 * The env vars are read as static property accesses so the bundler can inline
 * them; a dynamic lookup silently resolves to undefined in the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
