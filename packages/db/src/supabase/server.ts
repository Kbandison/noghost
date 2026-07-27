import { createServerClient } from "@supabase/ssr";
import type { Database } from "@noghost/types";

export interface CookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: Record<string, unknown>): void;
}

/**
 * Server client for Server Components, Server Actions and route handlers.
 *
 * The cookie store is injected rather than imported from `next/headers` so this
 * package stays framework-agnostic — the same client serves web, admin, and the
 * cron route handlers. Callers pass `await cookies()`; in Next 16 that API is
 * async, and synchronous access was removed.
 */
export function createClient(cookieStore: CookieStore) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Harmless when a proxy is
            // refreshing the session; that's where the write actually lands.
          }
        },
      },
    },
  );
}
