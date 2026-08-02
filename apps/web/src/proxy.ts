import { createClient } from "@noghost/db/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh. (Next 16 renamed Middleware to Proxy; same mechanism.)
 *
 * Supabase access tokens are short-lived. Server Components cannot set
 * cookies, so if the refresh happened there the new tokens would be computed
 * and then thrown away — the member would be signed out mid-application. This
 * runs before the request reaches a route, where setting cookies still works.
 *
 * It deliberately does NOT authorise anything. An optimistic proxy check is
 * not a security boundary: every route re-reads the user, and RLS is what
 * actually protects the data.
 */
export async function proxy(request: NextRequest) {
  // Seed mode has no Supabase to talk to, and the keys may be absent entirely.
  if (process.env.NEXT_PUBLIC_USE_SEED_DATA === "true") {
    return NextResponse.next({ request });
  }

  /*
   * Refreshed cookies are collected here and written to the response once, at
   * the end.
   *
   * The tempting shape — rebuild `NextResponse.next({ request })` inside the
   * setter, as most snippets show — silently drops cookies when more than one
   * arrives. A refresh sets at least the access and refresh tokens, and large
   * sessions get chunked into several more; each rebuild discards the
   * Set-Cookie headers written to the previous response object, so only the
   * last one survives and the session breaks on the very next request.
   */
  const refreshed: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createClient({
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      // Update the request too, so anything downstream in this same pass reads
      // the new tokens rather than the expired ones.
      request.cookies.set(name, value);
      refreshed.push({ name, value, options });
    },
  });

  // Touching the user is what triggers the refresh. The result is unused on
  // purpose — see the note above about this not being an authorisation gate.
  await supabase.auth.getUser();

  const response = NextResponse.next({ request });
  for (const { name, value, options } of refreshed) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  // Scoped to the signed-in surfaces. The marketing pages are anonymous and
  // cached, and running an auth round trip on them would defeat both.
  matcher: ["/apply/:path*", "/app/:path*"],
};
