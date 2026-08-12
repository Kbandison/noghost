"use client";

import { useEffect, useState } from "react";

/**
 * The one confetti burst in the product — §6.5, "celebrates in-app (confetti,
 * ghost mascot waving goodbye)".
 *
 * No dependency. A confetti library is 8–40KB of canvas physics for an effect
 * that fires at most once per member per season, so this is 24 divs and one
 * keyframe.
 *
 * The pieces are a hand-written table, not `Math.random()`. Random values
 * generated during render differ between the server pass and the hydration pass,
 * which is a hydration mismatch, and this component is deliberately rendered by
 * the server. Fixed offsets also mean the burst looks the same every time it is
 * reviewed — an animation you can't reproduce is an animation you can't tune.
 *
 * Motion preferences are handled globally: `tokens.css` collapses every
 * animation to 0.01ms under `prefers-reduced-motion: reduce`, which lands each
 * piece on its final keyframe — off-screen at zero opacity — before it is ever
 * painted. So this degrades to nothing rather than to a flash.
 */

interface Piece {
  /** Horizontal start, as a percentage of the viewport. */
  x: number;
  /** How far it slides sideways on the way down. */
  drift: number;
  delayMs: number;
  durationMs: number;
  /** px — a mix of confetti and much smaller flecks. */
  size: number;
  spinDeg: number;
  color: string;
}

// Ochre, sage and clay: the brand's three, no festival primaries.
const COLORS = ["var(--accent)", "var(--sage)", "var(--fuse-urgent)", "var(--accent-text)"];

/** x, drift, delay, duration, size, spin — one row per piece. */
type Row = readonly [number, number, number, number, number, number];

const TABLE: readonly Row[] = [
  [4, 30, 0, 2600, 9, 420],
  [11, -24, 320, 3100, 6, -300],
  [17, 46, 120, 2400, 11, 540],
  [23, -12, 900, 2900, 7, 260],
  [29, 22, 480, 2200, 5, -480],
  [34, -38, 60, 3300, 10, 380],
  [39, 14, 1100, 2500, 8, -220],
  [44, 40, 700, 2800, 6, 600],
  [48, -20, 240, 2300, 12, -360],
  [53, 34, 1300, 3000, 5, 300],
  [58, -44, 400, 2700, 9, -540],
  [63, 18, 840, 2100, 7, 440],
  [68, 28, 180, 3200, 11, -260],
  [73, -16, 1000, 2600, 6, 520],
  [78, 42, 560, 2400, 8, -400],
  [82, -30, 1400, 2900, 10, 240],
  [86, 20, 300, 2200, 5, -580],
  [90, -36, 760, 3100, 9, 340],
  [94, 26, 1200, 2500, 7, -300],
  [97, -22, 140, 2800, 11, 460],
  // The small flecks, scattered back through the gaps.
  [7, 16, 640, 2350, 4, -420],
  [31, -28, 1150, 2750, 4, 500],
  [61, 36, 220, 3050, 4, -340],
  [88, -14, 880, 2450, 4, 380],
];

const PIECES: Piece[] = TABLE.map(([x, drift, delayMs, durationMs, size, spinDeg], i) => ({
  x,
  drift,
  delayMs,
  durationMs,
  size,
  spinDeg,
  color: COLORS[i % COLORS.length] ?? "var(--accent)",
}));

const SETTLED_MS = Math.max(...PIECES.map((p) => p.delayMs + p.durationMs)) + 200;

/**
 * Fires on render and stops when it lands.
 *
 * Nothing here decides *whether* to celebrate — the page does, and it decides on
 * server data: the burst is rendered only while the exit survey is unanswered.
 * That was chosen over a `sessionStorage` latch on purpose. Storage cannot be
 * read during render without a hydration mismatch, so a latch means an empty
 * first paint and a state write on mount, and this component would then be
 * carrying a second, invisible source of truth about a thing the database
 * already knows. Answering the survey ends the celebration, which is also the
 * point at which somebody has stopped wanting one.
 */
export function Confetti() {
  const [falling, setFalling] = useState(true);

  // Dropped from the tree once the last piece has landed. Left in place they'd
  // be two dozen absolutely-positioned elements sitting invisibly over the page
  // until the next navigation.
  useEffect(() => {
    const timer = setTimeout(() => setFalling(false), SETTLED_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!falling) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {/* React 19 hoists and dedupes a styled element with a precedence. */}
      <style href="noghost-confetti" precedence="default">{`
        @keyframes noghost-confetti-fall {
          0%   { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), 100vh, 0) rotate(var(--spin)); opacity: 0; }
        }
      `}</style>

      {PIECES.map((piece, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-[1px]"
          style={
            {
              left: `${piece.x}%`,
              width: piece.size,
              height: piece.size * 1.6,
              background: piece.color,
              "--drift": `${piece.drift}px`,
              "--spin": `${piece.spinDeg}deg`,
              animation: `noghost-confetti-fall ${piece.durationMs}ms cubic-bezier(0.3, 0.1, 0.5, 1) ${piece.delayMs}ms both`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
