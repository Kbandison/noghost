"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * MOTION 4 — a scroll-fade entrance, fired once. Not a different animation per
 * element (anti-slop #27), never replayed on re-scroll (#29), and `power2.out`
 * rather than a bounce (#25).
 *
 * Transform and opacity only, so it stays on the compositor.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "p";
}) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from(ref.current, {
        scrollTrigger: {
          trigger: ref.current,
          start: "top 88%",
          toggleActions: "play none none none",
        },
        y: 24,
        opacity: 0,
        duration: 0.7,
        delay,
        ease: "power2.out",
      });
    },
    { scope: ref },
  );

  // The intersection of every allowed tag's ref type is uninhabited, so the
  // polymorphic element is widened here rather than in the ref.
  const Component = Tag as React.ElementType;

  return (
    <Component ref={ref} className={cn(className)}>
      {children}
    </Component>
  );
}

/**
 * Staggered children — one timeline for the group rather than N independent
 * reveals, so the eye is led through the list in order.
 */
export function RevealGroup({
  children,
  className,
  stagger = 0.09,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from(ref.current?.children ?? [], {
        scrollTrigger: { trigger: ref.current, start: "top 88%", toggleActions: "play none none none" },
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger,
        ease: "power2.out",
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
