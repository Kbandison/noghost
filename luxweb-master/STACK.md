# LuxWeb Module: Stack & Setup

> **v1.1 — July 2026.** Rewritten for the current stack: Tailwind CSS v4 (CSS-first config, no `tailwind.config.ts`), package renames (`lenis`, `motion`, `@gsap/react`), GSAP's now-free premium plugins, shadcn/ui on Base UI primitives, `next/font` replacing Google Fonts `@import`, Next.js 16 / React 19 patterns (Server Component discipline, Server Actions, React Compiler), a new Speed Upgrades section, an Ecosystem table, and fully rewritten CSS Pitfalls for the v4 era.
> **v1.1.1 — July 2026.** Ecosystem: added Upstash rate limiting (see BACKEND.md → Scale & Cost Resilience).

> **Read when**: Starting a new project. Contains the full dependency stack, directory structure, base file templates, and the CSS error catalog.

---

## Scaffold

```bash
npx create-next-app@latest [project-name] --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd [project-name]
```

This now scaffolds **Next.js 16 + React 19 + Tailwind CSS v4** with Turbopack as the default bundler. Notes:

- There is no `tailwind.config.ts` — Tailwind v4 configures in CSS (see globals.css template below)
- Middleware is now `proxy.ts`, not `middleware.ts`
- The React Compiler is stable — do not hand-write `useMemo`/`useCallback` unless profiling demands it

---

## Dependencies

### ⚠️ Package Renames (Memorize These)

The old names still resolve on npm but are dead. Importing them is an anti-slop violation:

| ❌ Dead | ✅ Current | Import |
|---------|-----------|--------|
| `framer-motion` | `motion` | `import { motion } from "motion/react"` |
| `@studio-freight/lenis` | `lenis` | `import { ReactLenis } from "lenis/react"` |
| custom `use-gsap.ts` hook | `@gsap/react` | `import { useGSAP } from "@gsap/react"` |
| `tailwindcss-animate` | `tw-animate-css` | shadcn's v4-era animation utilities |

### Always Install (Every Project)

```bash
# Animation & scroll
npm install gsap @gsap/react lenis motion

# UI utilities — tailwind-merge MUST be v3+ (v2 silently mis-merges Tailwind v4 classes)
npm install clsx tailwind-merge class-variance-authority lucide-react sharp

# shadcn/ui — new projects default to Base UI primitives (better Combobox,
# Autocomplete, multi-select; actively maintained by the original Radix team at MUI)
npx shadcn@latest init
```

**GSAP is now 100% free including all formerly-paid plugins** — SplitText, ScrollSmoother, MorphSVG, DrawSVG, ScrambleText, and more. Register what you use:

```typescript
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(ScrollTrigger, SplitText);
```

### Install When the Project Requires 3D

```bash
# R3F v9 is required for React 19 — see 3D.md for WebGPU setup
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install -D @types/three
```

### Install for App Surfaces / Global State

```bash
npm install zustand          # global state (3D↔HTML sync, app stores)
npm install nuqs             # type-safe URL search params (tabs, filters — see APP.md)
```

### Install When the Project Has AI Features

```bash
npm install ai @ai-sdk/react @ai-sdk/anthropic zod
```

See `BACKEND.md` for server patterns and `APP.md → AI Interface Patterns` for the UI.

---

## Fonts — next/font (NEVER use Google Fonts @import)

The old `@import url('https://fonts.googleapis.com/...')` pattern is banned: it's a render-blocking external request that causes layout shift. `next/font` self-hosts at build time — zero external requests, zero CLS, automatic fallback sizing.

```tsx
// src/app/layout.tsx
import { Syne, Space_Grotesk } from "next/font/google";
import { SmoothScrollProvider } from "@/components/layout/smooth-scroll-provider";
import "@/styles/globals.css";

const displayFont = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
```

Rules: swap the imported fonts per project (rotation rule from `LUXWEB.md` still applies — the archetype's pairing decides). The variables MUST be attached to `<html>` or the CSS `var()` references silently fall back. For fonts not on Google Fonts, use `next/font/local` with the same variable pattern.

---

## Directory Structure

### Standard Project (No 3D)

```
src/
├── app/
│   ├── layout.tsx          # Fonts + providers (see above)
│   ├── page.tsx            # SERVER component — no "use client"
│   ├── not-found.tsx       # Custom 404 (MANDATORY)
│   └── actions.ts          # Server Actions (forms)
├── components/
│   ├── ui/                 # Buttons, inputs, badges
│   ├── sections/           # Hero, features, CTA — server components
│   ├── layout/             # Navbar, footer, smooth scroll provider
│   └── animations/         # Client islands: Reveal, SplitHeadline, etc.
├── hooks/
│   └── use-viewport.ts
├── lib/
│   ├── utils.ts            # cn() helper
│   ├── math.ts             # lerp/clamp/mapRange (MOTION ≥ 5 or 3D)
│   └── constants.ts        # Site metadata, nav links
├── emails/                 # React Email components (if project sends email)
└── styles/
    └── globals.css
```

3D projects add `components/canvas/`, `shaders/`, and `store/` — see `3D.md`. Backend-heavy projects add `lib/supabase/` and `app/api/` — see `BACKEND.md`.

---

## Server Component Discipline (Ship Less JavaScript)

The single biggest code-efficiency pattern in this stack. Pages and sections are **server components by default**. `"use client"` lives only in small leaf components ("client islands") that actually need interactivity or animation.

```tsx
// src/components/sections/features.tsx — SERVER component, no directive
import { Reveal } from "@/components/animations/reveal";

export function Features() {
  return (
    <section className="relative py-32 md:py-48 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <Reveal>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
            What we do
          </h2>
        </Reveal>
        {/* static content stays server-rendered */}
      </div>
    </section>
  );
}
```

```tsx
// src/components/animations/reveal.tsx — CLIENT island
"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(ref.current, {
        scrollTrigger: { trigger: ref.current, start: "top 85%" },
        y: 30,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out",
      });
    },
    { scope: ref }
  );

  return <div ref={ref}>{children}</div>;
}
```

**Rules:**
- `"use client"` NEVER appears in `page.tsx`, `layout.tsx`, or section components
- Data fetching happens in server components; interactive bits receive data as props
- If a whole page ends up as one client component, the boundary is wrong — split it

---

## React 19 Patterns (Boilerplate Killers)

**`ref` is a prop.** `forwardRef` wrappers are dead:

```tsx
// ✅ React 19
function Input({ ref, ...props }: React.ComponentProps<"input">) {
  return <input ref={ref} {...props} />;
}
```

**Server Actions replace API routes for forms.** Every client-site contact form uses this pattern — no `/api` route, no fetch plumbing:

```typescript
// src/app/actions.ts
"use server";

export async function submitContact(prevState: any, formData: FormData) {
  const name = formData.get("name") as string;
  const message = formData.get("message") as string;
  if (!name || !message) return { error: "All fields are required." };

  // send via Resend — see BACKEND.md
  return { success: true };
}
```

```tsx
// Client island
"use client";
import { useActionState } from "react";
import { submitContact } from "@/app/actions";

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(submitContact, null);

  return (
    <form action={formAction} className="space-y-4">
      {/* fields */}
      <button disabled={isPending} className="btn-primary">
        {isPending ? "Sending..." : "Send message"}
      </button>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-500">Sent — we'll be in touch.</p>}
    </form>
  );
}
```

**React Compiler is on.** Don't write `useMemo`, `useCallback`, or `React.memo` as reflexes — the compiler memoizes automatically. Add them only when profiling shows a real problem.

---

## Required Base Files

### `src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### `src/components/layout/smooth-scroll-provider.tsx`

The Lenis React wrapper replaces the old custom hook entirely:

```tsx
"use client";

import { ReactLenis } from "lenis/react";

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
```

For 3D projects that pipe scroll progress into Zustand, use the `lenis/react` `useLenis` hook inside a client component:

```tsx
"use client";
import { useLenis } from "lenis/react";
import { useAppStore } from "@/store/use-app-store";

export function ScrollSync() {
  useLenis(({ progress }) => {
    useAppStore.getState().setScrollProgress(progress);
  });
  return null;
}
```

### `src/lib/math.ts` (MOTION_INTENSITY ≥ 5 or 3D projects)

```typescript
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function mapRange(
  value: number, inMin: number, inMax: number, outMin: number, outMax: number
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}
```

### `src/hooks/use-viewport.ts`

```typescript
"use client";

import { useState, useEffect } from "react";

export function useViewport() {
  const [viewport, setViewport] = useState({
    width: 0, height: 0, isMobile: false, isTablet: false, isDesktop: true,
  });

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      setViewport({
        width: w,
        height: window.innerHeight,
        isMobile: w < 768,
        isTablet: w >= 768 && w < 1024,
        isDesktop: w >= 1024,
      });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return viewport;
}
```

---

## `src/styles/globals.css` — Tailwind v4 Template

No `tailwind.config.ts`. No `@tailwind` directives. No font `@import` (that's `next/font`'s job now).

```css
@import "tailwindcss";

/* Dark mode via class strategy (v4 replaces darkMode: 'class') */
@custom-variant dark (&:where(.dark, .dark *));

/* ================================================
   PROJECT: [NAME]
   Design tokens — the same names every LuxWeb module
   references via bg-[var(--bg-primary)] etc.
   Override values per project from the archetype spec.
   ================================================ */
:root {
  --bg-primary: #0A0A0A;
  --bg-secondary: #111111;
  --bg-tertiary: #1A1A1A;
  --text-primary: #E8E8E8;
  --text-secondary: #888888;
  --text-dim: #444444;
  --accent: #FF4D00;
  --accent-hover: #FF6B2B;
  --border: #1F1F1F;
  --glow: rgba(255, 77, 0, 0.12);
}

/* Optional: register tokens with Tailwind to generate real utilities
   (text-accent, bg-surface, border-line). Arbitrary values work either way. */
@theme inline {
  --color-accent: var(--accent);
  --color-surface: var(--bg-primary);
  --color-surface-2: var(--bg-secondary);
  --color-line: var(--border);
}

@layer base {
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    scroll-behavior: auto; /* Lenis handles smooth scroll */
  }

  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 17px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-display);
    line-height: 1.05;
    letter-spacing: -0.03em;
    font-weight: 700;
  }
}

::selection {
  background-color: var(--accent);
  color: var(--text-primary);
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Speed Upgrades (Cheap, High-Impact)

### Speculation Rules — Instant Navigation

Prerenders internal pages on hover/viewport so navigation feels instant. Progressive enhancement (Chromium; other browsers ignore it). Add once in the root layout:

```tsx
// src/components/layout/speculation-rules.tsx
export function SpeculationRules() {
  return (
    <script
      type="speculationrules"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          prerender: [{ where: { href_matches: "/*" }, eagerness: "moderate" }],
        }),
      }}
    />
  );
}
```

Skip on pages with side effects on load (auth callbacks, one-time tokens).

### content-visibility — Skip Off-Screen Rendering

Long marketing pages render dramatically faster when below-fold sections opt out of initial layout:

```css
.cv-auto {
  content-visibility: auto;
  contain-intrinsic-size: auto 800px; /* estimated section height — prevents scrollbar jump */
}
```

Apply to every section below the hero. Do NOT apply to the hero or anything visible on load.

### @next/third-parties — The Scripts That Tank Lighthouse

Client sites always want Google Analytics and YouTube embeds. Naive embeds destroy performance scores; the official wrappers fix it:

```bash
npm install @next/third-parties
```

```tsx
import { GoogleAnalytics } from "@next/third-parties/google";
// in root layout, after <body> content:
<GoogleAnalytics gaId="G-XXXXXXX" />

import { YouTubeEmbed } from "@next/third-parties/google";
<YouTubeEmbed videoid="dQw4w9WgXcQ" />
```

### Next 16 Caching (When Relevant)

Cache Components (`"use cache"` directive) with Partial Pre-Rendering let dynamic pages ship a static shell instantly. Use for marketing pages with a dynamic fragment (e.g., live pricing, testimonials from a DB). Don't reach for it until the project actually has dynamic data.

---

## Ecosystem (Install When the Job Calls For It)

| Package | Job | When |
|---------|-----|------|
| `ai` + `@ai-sdk/react` + `@ai-sdk/anthropic` | Streaming AI features | Any AI feature — see `BACKEND.md` + `APP.md` |
| `resend` + `@react-email/components` | Transactional email (React Email 5) | Contact forms, CRM notifications — see `BACKEND.md` |
| `nuqs` | Type-safe URL search params | App surfaces with tabs/filters — see `APP.md` |
| `@vercel/og` (`ImageResponse`) | Dynamic OG images | Generate og:image programmatically instead of designing one per project |
| `botid` | Invisible bot protection | Every form, login, and AI endpoint — see `BACKEND.md` |
| `@upstash/ratelimit` + `@upstash/redis` | Edge rate limiting | AI endpoints, auth, search, write routes — see `BACKEND.md → Scale & Cost Resilience` |
| `@vercel/analytics` + `@vercel/speed-insights` | Real-user metrics | Every deployed project |
| Payload CMS 3 | Next-native CMS (installs into the app, runs on Postgres) | Client needs self-serve content editing — natural Care Plan upsell |
| Biome | Rust linter+formatter (replaces ESLint+Prettier, ~25x faster) | Optional DX upgrade; not required |
| `knip` | Find unused files/deps/exports | Pre-deploy hygiene on larger projects |

---

## Performance Baseline

- Images: WebP/AVIF via Next.js `<Image>` with explicit dimensions, `priority` on hero, lazy below fold
- Fonts: `next/font` only — zero external font requests
- JS: server components by default; client islands only for interactivity
- Animations: `transform` and `opacity` only — GPU-accelerated
- Heavy components (3D, complex animation): `dynamic(() => import(...), { ssr: false })`
- Lighthouse target: 90+ performance
- Bundle target: < 200KB initial JS (excluding 3D assets)

---

## CSS Pitfalls — v4 Era

> Read before writing any CSS or Tailwind classes. These are the specific mistakes that cause "the CSS randomly broke" bugs.

### 1. tailwind-merge Version (Silent Killer)

`tailwind-merge` v2 does not understand Tailwind v4's renamed classes and **silently mis-merges them** — `cn()` starts dropping the wrong class with no error. Require v3+:

```bash
npm ls tailwind-merge   # must be 3.x
```

### 2. Renamed Utilities (v3 → v4)

| ❌ v3 (dead or changed) | ✅ v4 |
|------------------------|-------|
| `bg-gradient-to-r` / `-to-b` etc. | `bg-linear-to-r` / `bg-linear-to-b` |
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `blur` / `backdrop-blur` | `blur-sm` / `backdrop-blur-sm` (old `-sm` → `-xs`) |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |
| `outline-none` | `outline-hidden` |
| `ring` (was 3px) | `ring` is now 1px — use `ring-3` for the old look |

### 3. Border & Divide Default Color Changed

v4 borders default to `currentColor`, not gray-200. An unqualified `border` now inherits the text color — which reads as "random dark borders everywhere." **Always specify the color:** `border border-[var(--border)]`.

### 4. First-Line Rule

`@import "tailwindcss";` must be the first statement in globals.css. Nothing above it. (Font imports are gone — `next/font` handles fonts in the layout.)

### 5. Hallucinated Classes (Still the #1 Error)

| ❌ Hallucinated | ✅ Correct |
|----------------|-----------|
| `font-800` / `font-600` etc. | `font-extrabold` / `font-semibold` — weights are named |
| `text-md` | `text-base` |
| `border-1` | `border` |
| `bg-opacity-50` | `bg-black/50` (slash syntax) |

If a class doesn't exist, v4 fails the build with "Cannot apply unknown utility class" — that error means a typo or an unregistered `@theme` token, not a broken install.

### 6. Viewport Height on iOS

Never `h-screen` / `min-h-screen`. Always `min-h-[100dvh]`. (Unchanged rule; still violated constantly.)

### 7. Backdrop Blur Needs a Background

```tsx
/* ❌ invisible */    <nav className="backdrop-blur-xl">
/* ✅ works */        <nav className="backdrop-blur-xl bg-[var(--bg-primary)]/80">
```

### 8. CSS Variables in Classes

Both syntaxes work in v4 — the parenthesis form is new shorthand:

```
bg-[var(--bg-primary)]   /* canonical across all LuxWeb modules */
bg-(--bg-primary)        /* v4 shorthand — equivalent */
```

Either way, the variable must actually exist in `:root`. A `var()` pointing at nothing fails silently (transparent/inherited values).

### 9. @theme vs :root

Tokens that should generate utility classes (`text-accent`, `bg-surface`) go in `@theme` / `@theme inline`. Plain variables consumed only via `var()` stay in `:root`. Registering everything in `@theme` bloats generated CSS; registering nothing means no token utilities. The template above shows the split.

### 10. Dark Mode

`darkMode: 'class'` config is gone. Use `@custom-variant dark (&:where(.dark, .dark *));` in CSS and toggle the `dark` class on `<html>`.

### 11. Hover Is Hover-Only Now

v4's `hover:` variant only fires on devices that actually support hover. Touch-device "sticky hover" bugs are gone — but if a critical action was hover-revealed (row action menus), verify it has a touch path (always-visible on mobile, or tap target).

### 12. Prefer gap Over space-*

`space-y-*` / `space-x-*` use sibling selectors with real performance costs on large lists in v4. Flex/grid + `gap-*` is the default; `space-*` only for simple prose-like stacks.

### 13. next/font Variables Not Applying

If `var(--font-display)` renders a fallback font: the font loader's `variable` name doesn't match the CSS, or the variable classes aren't on `<html>`. Check the layout template above.

### 14. Arbitrary Values With Spaces

Underscores, not spaces: `grid-cols-[1fr_2fr]` ✅ / `grid-cols-[1fr 2fr]` ❌.

### 15. Z-Index Scale

Tailwind ships `z-0`–`z-50` in tens; use `z-[N]` beyond. Project scale: `z-0` base → `z-10` sticky → `z-20` dropdowns → `z-30` mobile overlays → `z-40` modals → `z-50` toasts/palette → `z-[60]` critical.

### 16. Common Build/Runtime Errors

- **"Cannot apply unknown utility class"** → typo, or a custom token used as a utility without `@theme` registration
- **"Module not found: @/..."** → `tsconfig.json` paths must match the import alias
- **Hydration mismatch** → `window`/`localStorage`/`Date.now()` during render; move to `useEffect` or `dynamic({ ssr: false })`
- **PostCSS plugin errors on manual setups** → Tailwind v4 uses `@tailwindcss/postcss`, not `tailwindcss` directly, in PostCSS config

### Validation Checklist (Run Before Any Component Ships)

- [ ] `tailwind-merge` is v3+
- [ ] No dead package imports (`framer-motion`, `@studio-freight/lenis`)
- [ ] No v3-era class names (gradient/shadow/blur/rounded/ring/outline renames)
- [ ] Every `border`/`divide` has an explicit color
- [ ] No `font-XXX` numeric weights, no `h-screen` — `min-h-[100dvh]` only
- [ ] `backdrop-blur-*` paired with a translucent background
- [ ] All `var(--*)` references exist in `:root`
- [ ] `"use client"` only in leaf/island components — never pages or sections
- [ ] Fonts load via `next/font` with variables on `<html>`
