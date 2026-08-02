import { createClient } from "@noghost/db/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh only.
 *
 * This does not gate anything — `requireAdmin()` in lib/auth.ts is the gate,
 * and it runs inside every console page. A proxy check would be a redirect
 * that a direct request to a Server Action never passes through.
 *
 * Refreshed cookies are collected and written once, at the end. Rebuilding the
 * response inside the setter (as most snippets do) drops every cookie but the
 * last, and a refresh always sets at least two.
 */
export async function proxy(request: NextRequest) {
  const refreshed: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createClient({
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      request.cookies.set(name, value);
      refreshed.push({ name, value, options });
    },
  });

  await supabase.auth.getUser();

  const response = NextResponse.next({ request });
  for (const { name, value, options } of refreshed) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  // Everything except static assets. The whole console is behind auth, so
  // there is no anonymous surface worth excluding for cache reasons.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
