"use client";

import { useEffect, useState } from "react";

/**
 * Time until the next drop.
 *
 * Renders nothing on the server and on the first client paint, then fills in.
 * That is deliberate: the server would stamp its own idea of "now" into the
 * HTML, and a cached or slow response would show a countdown that is already
 * wrong before anyone reads it. An absolute time is always in the markup, so
 * the information is there either way.
 *
 * §3.3 bans manufactured urgency, so this counts in minutes and stops there —
 * no ticking seconds, no colour change as it closes. It is a schedule, not a
 * pressure device.
 */
export function Countdown({ to }: { to: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(Date.parse(to) - Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [to]);

  const absolute = new Date(to).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <p className="mt-8 text-[15px] text-[var(--text-dim)]">
      <span suppressHydrationWarning>{phrase(remaining)}</span>
      <span className="mx-2 opacity-50" aria-hidden>
        ·
      </span>
      <time dateTime={to}>{absolute}</time>
    </p>
  );
}

function phrase(remaining: number | null): string {
  if (remaining === null) return "Landing soon";
  if (remaining <= 0) return "Landing now — refresh in a moment";

  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `In ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `In ${hours} hour${hours === 1 ? "" : "s"}`;
  return `In ${hours}h ${rest}m`;
}
