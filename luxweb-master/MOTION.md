# LuxWeb Module: Motion & Animation

> **v1.1 — July 2026.** Imports updated to `motion/react`; new Tier 0 section (native CSS scroll-driven animations + View Transitions API); official `useGSAP()` hook replaces the custom hook; SplitText (now free) replaces manual character splitting.

> **Read when**: Building any animations, scroll interactions, or transitions. Covers GSAP + ScrollTrigger, Framer Motion, Lenis integration, and choreography patterns.

---

## Motion Rules (Apply Always)

1. **Easing**: Default to `power2.out` for entrances. `power2.inOut` for scrubbed/scroll-linked. NEVER use `bounce` or `elastic` on content elements. Spring physics (Framer Motion) is fine for micro-interactions.
2. **Duration**: 0.5–0.8s for text entrances. 0.8–1.2s for images/large elements. 0.3s for hover transitions.
3. **Stagger**: 0.08–0.15s between grouped elements (cards, text lines, nav links).
4. **Direction**: Content enters from below (`y: positive → 0`). Never from above, left, or right unless intentionally motivated by layout.
5. **Fire once**: All scroll-triggered animations use `toggleActions: "play none none none"`. Content animates in and stays. No exit animations on scroll.
6. **Reduced motion**: ALL animations must be disabled when `prefers-reduced-motion: reduce` is active. Show content immediately, no motion.
7. **GPU only**: Animate ONLY `transform` (translate, scale, rotate) and `opacity`. Never animate `width`, `height`, `padding`, `margin`, `top`, `left`, or `background-color` in scroll-driven contexts.

---

## Tier 0: Native CSS Motion (Use First When It's Enough)

Two platform features now cover the simplest animation tiers with ZERO JavaScript. Reach for these before GSAP/Motion when the effect qualifies — less JS shipped, better LCP.

### Scroll-Driven Reveals (replaces JS for Intensity 1–3 entrances)

```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}

.reveal {
  animation: fade-up linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 60%;
}

/* Unsupported browsers (Firefox behind a flag) just show the content — perfect fallback */
@supports not (animation-timeline: view()) {
  .reveal { animation: none; }
}
```

~90% browser support. Use for simple fade/slide entrances on marketing sections. The fallback is content simply being visible, which is exactly what `prefers-reduced-motion` users get anyway.

### View Transitions (replaces Motion for page-level transitions)

Native cross-page animation, integrated with Next 16 / React 19.2. Agencies are removing entire animation libraries from route transitions — same quality, tens of KB less JS:

```css
/* Customize the default crossfade */
::view-transition-old(root) { animation-duration: 0.25s; }
::view-transition-new(root) { animation-duration: 0.25s; }
```

In React 19.2, wrap route content with the `ViewTransition` component (currently exported as `unstable_ViewTransition` — alias it on import) for element-level morphs between pages. Use this for page navigation; keep Motion for component-level state animation.

### Decision Table

| Effect | Tool |
|--------|------|
| Simple fade/slide entrance on scroll | **Native CSS** (`animation-timeline: view()`) |
| Page/route transitions | **View Transitions API** |
| Staggered/orchestrated entrances, timelines | GSAP |
| Pinning, scrubbing, horizontal scroll, SplitText | GSAP + ScrollTrigger |
| Component state animation, layout animation, presence | Motion |

---

## React Setup: useGSAP (Official Hook)

The custom `use-gsap.ts` hook is retired. Use the official `@gsap/react` hook — automatic cleanup via `gsap.context()`, scoping built in:

```tsx
"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function AnimatedSection({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // selectors here are scoped to the ref — no global leaks
      gsap.from("[data-card]", { y: 60, opacity: 0, stagger: 0.12 });
    },
    { scope }
  );

  return <div ref={scope}>{children}</div>;
}
```

Per `STACK.md` Server Component discipline: these live in small client islands, never in page or section components.

---

## GSAP Patterns by MOTION_INTENSITY

### Intensity 1–3: Subtle & Functional

Simple fade-up entrances on scroll. No scrubbing, no pinning.

```typescript
// Basic scroll-triggered fade-up
gsap.from(element, {
  scrollTrigger: {
    trigger: element,
    start: "top 85%",
  },
  y: 30,
  opacity: 0,
  duration: 0.6,
  ease: "power2.out",
});
```

Use this on: section headings, content blocks, cards. Apply stagger (0.1s) when multiple elements enter together.

### Intensity 4–6: Polished & Cinematic

Staggered reveals, text line animation, image scale entrances.

**Staggered Section Entrance:**

```typescript
// Heading, subheading, CTA in sequence
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: sectionRef.current,
    start: "top 70%",
  },
});

tl.from("[data-title]", {
  y: 50,
  opacity: 0,
  duration: 0.7,
  ease: "power2.out",
})
.from("[data-subtitle]", {
  y: 30,
  opacity: 0,
  duration: 0.6,
  ease: "power2.out",
}, "-=0.4")
.from("[data-cta]", {
  y: 20,
  opacity: 0,
  duration: 0.5,
  ease: "power2.out",
}, "-=0.3")
.from("[data-image]", {
  y: 60,
  opacity: 0,
  scale: 0.97,
  duration: 1.0,
  ease: "power2.out",
}, "-=0.5");
```

**Text Line Split Reveal:**

```typescript
// Wrap each line of a headline in an overflow-hidden div
// Animate each line from below
gsap.from("[data-line]", {
  scrollTrigger: {
    trigger: headlineRef.current,
    start: "top 75%",
  },
  y: "100%",
  opacity: 0,
  duration: 0.8,
  stagger: 0.12,
  ease: "power3.out",
});
```

**Card Grid Entrance:**

```typescript
gsap.from("[data-card]", {
  scrollTrigger: {
    trigger: gridRef.current,
    start: "top 75%",
  },
  y: 60,
  opacity: 0,
  scale: 0.95,
  duration: 0.7,
  stagger: 0.12,
  ease: "power2.out",
});
```

### Intensity 7–10: Full Cinematic

All of the above PLUS pinned sections, parallax, horizontal scroll, character-level text animation, scroll-linked scrubbing.

**Pinned Section with Content Swap:**

```typescript
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: pinnedRef.current,
    start: "top top",
    end: "+=300%",
    pin: true,
    scrub: 1,
  },
});

// Frame 1 visible, then fades
tl.to("[data-frame-1]", { opacity: 0, y: -30, duration: 0.3 })
  // Frame 2 enters
  .from("[data-frame-2]", { opacity: 0, y: 40, duration: 0.3 })
  // Pause on frame 2
  .to({}, { duration: 0.5 })
  // Frame 2 fades
  .to("[data-frame-2]", { opacity: 0, y: -30, duration: 0.3 })
  // Frame 3 enters
  .from("[data-frame-3]", { opacity: 0, y: 40, duration: 0.3 });
```

**Parallax Layers:**

```typescript
gsap.to("[data-parallax-bg]", {
  scrollTrigger: {
    trigger: sectionRef.current,
    start: "top bottom",
    end: "bottom top",
    scrub: true,
  },
  y: -150,
  ease: "none",
});

gsap.to("[data-parallax-fg]", {
  scrollTrigger: {
    trigger: sectionRef.current,
    start: "top bottom",
    end: "bottom top",
    scrub: true,
  },
  y: -350,
  ease: "none",
});
```

**Horizontal Scroll Section:**

```typescript
const panels = gsap.utils.toArray<HTMLElement>("[data-h-panel]");

gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: hScrollRef.current,
    pin: true,
    scrub: 1,
    snap: 1 / (panels.length - 1),
    end: () => "+=" + hScrollRef.current!.scrollWidth,
  },
});
```

**Character-by-Character Headline Reveal (GSAP SplitText — now free):**

SplitText is free for all use since 2025 and was rewritten: 50% smaller, built-in accessibility (screen readers get the original text), masking, and automatic re-splitting on resize/font-load. NEVER hand-split headlines into spans anymore.

```typescript
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(SplitText);

const split = SplitText.create(headlineRef.current, {
  type: "lines,chars",
  mask: "lines",      // clips each line for the rise-from-below effect
  autoSplit: true,    // re-splits on resize and font load
});

gsap.from(split.chars, {
  scrollTrigger: {
    trigger: headlineRef.current,
    start: "top 80%",
  },
  yPercent: 120,
  opacity: 0,
  rotateX: -60,
  stagger: 0.02,
  duration: 0.6,
  ease: "back.out(1.5)",
});
```

The same applies to the hero line reveals at Intensity 4–6 — `type: "lines"` with `mask: "lines"` replaces manual overflow-hidden wrapper divs.

**Word-by-Word Reading Reveal (Scrubbed):**

```typescript
// Each word starts dim, becomes bright as scroll reaches it
gsap.to("[data-word]", {
  opacity: 1,
  color: "var(--text-primary)",
  stagger: 0.05,
  scrollTrigger: {
    trigger: paragraphRef.current,
    start: "top 60%",
    end: "bottom 40%",
    scrub: 1,
  },
});
// Set initial state in CSS: opacity: 0.15, color: var(--text-dim)
```

**Counter / Number Animate-Up:**

```typescript
gsap.to(counterRef.current, {
  scrollTrigger: {
    trigger: counterRef.current,
    start: "top 80%",
  },
  innerText: targetNumber,
  snap: { innerText: 1 },
  duration: 1.5,
  ease: "power2.out",
});
// Use font-variant-numeric: tabular-nums on the counter element
```

---

## Motion Patterns (formerly Framer Motion)

> **Package renamed**: install `motion`, import from `"motion/react"`. The `framer-motion` package is dead — importing it is an anti-slop violation. API is unchanged.

Use Motion for component-level animation: state transitions, layout animation, presence. NOT for scroll-driven animation (GSAP handles that) and NOT for page transitions (View Transitions API handles those natively now — see Tier 0).

**Page Transition Wrapper (legacy fallback only):**

Prefer the native View Transitions API for route transitions. Use this Motion pattern only when a project needs exit choreography the native API can't express:

```tsx
// src/app/template.tsx
"use client";
import { motion } from "motion/react";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

**Animate Presence (Conditional Content):**

```tsx
<AnimatePresence mode="wait">
  {activeItem && (
    <motion.div
      key={activeItem.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {activeItem.content}
    </motion.div>
  )}
</AnimatePresence>
```

**Layout Animation (Smooth Reflow):**

```tsx
<motion.div layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
  {/* Content that changes size/position */}
</motion.div>
```

**Stagger Children (Lists, Grids):**

```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

<motion.ul variants={container} initial="hidden" animate="show">
  {items.map((i) => (
    <motion.li key={i.id} variants={item}>{i.name}</motion.li>
  ))}
</motion.ul>
```

---

## Micro-Interactions (Apply at All Intensity Levels)

These are always present, even at MOTION_INTENSITY 1. They're CSS transitions, not GSAP.

**Buttons:**
```css
.btn {
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.btn:hover {
  transform: scale(1.03) translateY(-1px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
```

**Cards:**
```css
.card {
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.card:hover {
  transform: translateY(-4px);
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 12px 32px rgba(0,0,0,0.2);
}
```

**Links (Underline Wipe):**
```tsx
<a className="relative group">
  Link Text
  <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-[var(--accent)] transition-all duration-300 group-hover:w-full" />
</a>
```

**Images (Zoom on Hover):**
```tsx
<div className="overflow-hidden rounded-2xl">
  <img className="transition-transform duration-500 hover:scale-105" />
</div>
```

**Nav Background on Scroll:**
Use Intersection Observer or scroll position to toggle nav from transparent to `bg-[var(--bg-primary)]/80 backdrop-blur-xl`.

---

## Magnetic Button (MOTION_INTENSITY ≥ 7)

Button that follows cursor within its bounds:

```typescript
function handleMouseMove(e: React.MouseEvent) {
  const rect = buttonRef.current!.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;

  gsap.to(buttonRef.current, {
    x: x * 0.3,
    y: y * 0.3,
    duration: 0.3,
    ease: "power2.out",
  });
}

function handleMouseLeave() {
  gsap.to(buttonRef.current, {
    x: 0,
    y: 0,
    duration: 0.5,
    ease: "elastic.out(1, 0.3)",
  });
}
```

---

## Infinite Marquee (MOTION_INTENSITY ≥ 4)

Horizontal scrolling text/logos:

```tsx
<div className="overflow-hidden py-8 border-y border-[var(--border)]">
  <motion.div
    animate={{ x: [0, -totalWidth] }}
    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
    className="flex gap-16 items-center whitespace-nowrap"
  >
    {[...items, ...items].map((item, i) => (
      <span key={i} className="text-5xl font-display font-extrabold text-[var(--text-dim)] select-none">
        {item}
      </span>
    ))}
  </motion.div>
</div>
```

For MOTION_INTENSITY ≥ 8, modulate marquee speed with scroll velocity (speed up when scrolling fast, normalize when idle) using GSAP's `timeScale()`.

---

## Page Load Choreography

On initial page load, animate the hero section in sequence. Everything else is scroll-triggered.

```
0.0s    Nav fades in (opacity 0→1, 0.4s)
0.2s    Hero headline lines cascade (y: 100%, stagger 0.12s, 0.8s each)
0.8s    Subheadline fades up (y: 30, 0.6s)
1.0s    CTA fades up (y: 20, 0.5s)
0.4s    Hero image/3D scene (scale 1.05→1, opacity 0→1, 1.2s)
1.5s    Scroll indicator begins pulsing (infinite yoyo)
```

Adjust timing compression based on MOTION_INTENSITY:
- 1–3: Skip cascade, simple full-section fade-in (0.6s)
- 4–6: Above sequence
- 7–10: Above sequence + loading screen exit animation first

---

## Loading Screen (MOTION_INTENSITY ≥ 8)

A full-viewport loading screen that plays while assets load:

- Shows progress (percentage or bar) tied to actual asset loading
- On complete, exits with `clipPath: "circle(0% at 50% 50%)"` or vertical slide
- After exit, hero entrance sequence fires
- Keep loading screen in its own client component for code-splitting

```typescript
// Exit animation
gsap.to(loadingRef.current, {
  clipPath: "circle(0% at 50% 50%)",
  duration: 1.2,
  ease: "power3.inOut",
  onComplete: () => {
    loadingRef.current!.style.display = "none";
    playHeroEntrance();
  },
});
```

---

## Video Integration

**Background Video (Hero):**

```tsx
<video
  autoPlay muted loop playsInline
  className="absolute inset-0 w-full h-full object-cover"
>
  <source src="/videos/hero.mp4" type="video/mp4" />
</video>
<div className="absolute inset-0 bg-black/40" /> {/* Overlay for text readability */}
```

**Scroll-Scrubbed Video (MOTION_INTENSITY ≥ 9):**

```typescript
const video = videoRef.current!;
ScrollTrigger.create({
  trigger: sectionRef.current,
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => {
    video.currentTime = self.progress * video.duration;
  },
});
```

Use `preload="auto"` for scrubbed video. Use `preload="none"` for below-fold autoplay videos.

---

## Custom Cursor (MOTION_INTENSITY ≥ 8)

Replace browser cursor with a custom element:

```tsx
<motion.div
  className="fixed top-0 left-0 w-4 h-4 rounded-full pointer-events-none z-[9999] mix-blend-difference bg-white"
  animate={{
    x: smoothX - 8,
    y: smoothY - 8,
    scale: cursorVariant === "hover" ? 3 : cursorVariant === "action" ? 2 : 1,
    opacity: cursorVariant === "hidden" ? 0 : 1,
  }}
  transition={{ type: "spring", stiffness: 500, damping: 28 }}
/>
```

- Default: 16px circle, slight lag via lerp
- Hover (links/buttons): expands to 48px
- Disable entirely on touch devices
- `mix-blend-difference` for auto-contrast
