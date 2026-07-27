"use client";

import { ReactLenis } from "lenis/react";

/**
 * MOTION 4 — smooth scroll is the base layer the section reveals sit on.
 * `lenis`, not the dead `@studio-freight/lenis` (STACK.md package renames).
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
