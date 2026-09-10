"use client";

import { useEffect, useState } from "react";
import { createClient } from "@noghost/db/browser";

/**
 * The implicit flow puts the session in the URL fragment, and a fragment is
 * never sent to a server — so this is the one part of the reset that has to
 * happen in the browser.
 *
 * `setSession` writes the same cookies the server reads, so the page it
 * forwards to can change the password exactly as if the exchange had happened
 * server-side.
 *
 * The fragment is cleared from the address bar before forwarding. It carries a
 * live access token, and leaving it in history is how a shared screenshot or a
 * back button hands somebody a session.
 */
export function FragmentSession() {
  const [state, setState] = useState<"working" | "failed">("working");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const error = params.get("error_description") ?? params.get("error");

      if (error || !accessToken || !refreshToken) {
        if (!cancelled) setState("failed");
        window.location.replace("/reset-password?state=expired");
        return;
      }

      const { error: sessionError } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;
      if (sessionError) {
        setState("failed");
        window.location.replace("/reset-password?state=expired");
        return;
      }

      window.history.replaceState(null, "", window.location.pathname);
      window.location.replace("/reset-password?state=set");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[24rem] items-center justify-center px-6">
      <p className="text-[15px] text-[var(--text-secondary)]">
        {state === "working" ? "Checking your link…" : "That link is no longer any good."}
      </p>
    </main>
  );
}
