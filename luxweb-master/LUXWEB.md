# LuxWeb Design System — Master Rules

> **v1.1 — July 2026.** WCAG target bumped to 2.2 AA with EAA legal note; anti-slop items 41–43 added (glass overuse, too-perfect AI sheen, dead package imports); BACKEND.md added to the module table.

> **Claude Code**: For any new project from scratch, start with `WORKFLOW.md` — it orchestrates the full 7-phase build process and tells you when to read each other module. This file (`LUXWEB.md`) is the design constitution — read it first, then follow `WORKFLOW.md`. Nothing ships that violates the rules in this file.

---

## 🚨 MANDATORY: Archetype Selection Gate

**Before writing any code for a new build, Claude Code MUST execute this protocol. No exceptions.**

### When this gate applies:

- Any request to build a new website, landing page, or full UI from scratch
- Any request to redesign an existing project
- Any request that involves setting up visual direction (fonts, colors, layout style)

### When this gate does NOT apply:

- Bug fixes, refactors, or isolated component additions to existing projects
- Tasks where the user has explicitly named an archetype + variation in their prompt (e.g., "build this with Tech Utilitarian / Light Clinical")
- Tasks where the user has already answered the gate in the current conversation

### The Protocol

**Step 1.** Read `ARCHETYPES.md` in full.

**Step 2.** Present all 8 archetypes to the user using the Presentation Format from `ARCHETYPES.md`. Include for each:
- Name and tagline
- What it is (2-sentence description)
- Best for (specific project types)
- Reference sites (3-5 real examples)
- Feels (3-5 mood descriptors)
- Why it works (the teaching principle)

**Step 3. STOP AND WAIT.** Do not proceed to code, setup, dependencies, or any implementation work. The user must respond with a selection.

**Step 4.** Once the user picks an archetype, present the 3 variations of that archetype with:
- Variation name and mood
- Specific font pairing
- Full color palette with hex values
- LuxWeb dial settings
- Image direction + prompt template
- "Pick this when" scenario

**Step 5. STOP AND WAIT AGAIN.** The user must pick one variation before proceeding.

**Step 6.** Confirm the selection back to the user in one line (e.g., "Building with Organic Natural → Botanical Fresh. VARIANCE 5 / MOTION 5 / DENSITY 4 / LIGHT mode. Fraunces + DM Sans. Forest green accents."), then proceed to setup and build.

### Why this gate exists

Without forced archetype selection, Claude Code defaults to LuxWeb's baseline values and produces visually similar sites across wildly different projects. The gate guarantees range — every project starts from a distinct creative direction, not a house style. It also surfaces the "why" behind design decisions to help the user develop taste over time.

**Do not skip this gate to be helpful or save time. Skipping it IS the failure mode.**

---

## 🚨 MANDATORY: App Layout Selection Gate

**A second gate exists for non-marketing surfaces.** Before building any dashboard, admin panel, CRM, CMS, settings page, auth flow, or data display surface, Claude Code MUST read `APP.md` and execute the App Layout Selection Gate defined there.

### When this gate applies:
- Building a dashboard, admin shell, CRM, or CMS interior
- Building login, signup, forgot password, or any auth surface
- Building settings, profile, or account pages
- Building data display surfaces (tables, lists, record views)

### Why this gate exists separately:

Even with a locked archetype, app surfaces will default to identical structural skeletons (sidebar + 3 stat cards + 2-column grid + table) unless the layout itself is consciously chosen. The archetype gate handles the visual direction; the app gate handles the structural direction. **Both are required for non-marketing surfaces.**

See `APP.md` for the full layout library (6 dashboard layouts, 5 settings layouts, 5 auth layouts, 5 data display patterns) and protocol.

---

## Tunable Dials

Adjust these per project. Default values are shown. Override them in your prompt (e.g., "build this at variance 3, motion 9, density 2").

```
DESIGN_VARIANCE:  7   (1 = symmetric/centered/safe  →  10 = asymmetric/experimental/artsy)
MOTION_INTENSITY: 6   (1 = static/hover-only        →  10 = cinematic/scroll-driven/physics)
VISUAL_DENSITY:   4   (1 = gallery/luxury/airy       →  10 = cockpit/dashboard/data-packed)
DARK_MODE:        1   (0 = light theme               →  1 = dark theme)
```

**How to interpret the dials:**

| Dial | 1–3 | 4–6 | 7–10 |
|------|-----|-----|------|
| VARIANCE | Centered layouts, symmetric grids, conventional structure | Slight asymmetry, mixed alignment, one grid-breaking element | Overlapping elements, diagonal flow, asymmetric white-space, editorial composition |
| MOTION | Hover color changes, basic transitions | Scroll-fade entrances, staggered reveals, smooth page transitions | GSAP pinned sections, scrub-linked animation, parallax, magnetic interactions, 3D scene transitions |
| DENSITY | One element per screen. Massive padding. Luxury feel. | Normal website spacing. Balanced content-to-whitespace. | Dense data. Compact cards. Minimal padding. Dashboard UI. |

The AI must adapt to these values dynamically. If the user says "make it more spacious" → lower VISUAL_DENSITY. "Add more animation" → raise MOTION_INTENSITY. "Keep it clean and centered" → lower DESIGN_VARIANCE.

---

## Core Philosophy

1. **Intentionality over decoration.** Every element earns its place. If it doesn't guide attention, communicate hierarchy, or serve function — remove it.
2. **One idea per viewport.** At VISUAL_DENSITY ≤ 5, never cram. Sections breathe. Headlines stand alone.
3. **Motion is choreography, not confetti.** Animation guides the eye through content in a deliberate sequence. Nothing moves just to move.
4. **The product/content is the design.** On marketing and portfolio sites, the imagery and typography do the work. Decorative elements are a crutch.
5. **Whitespace is active.** It creates rhythm, hierarchy, and tension. Double the spacing, then decide if it's too much. It usually isn't.
6. **If it looks like a template, start over.**

---

## Typography Rules

### Font Selection

- ALWAYS use a distinctive display font for headings. Source from Google Fonts.
- **ROTATE across projects.** Never reuse the same pairing on consecutive builds.
- Pair a display font (headings) with a readable body font (paragraphs).
- **BANNED**: Inter, Roboto, Arial, Open Sans, system-ui as design choices. These are the hallmark of AI slop.
- Exception: For Apple-style or ultra-clean product pages, a neutral sans like Inter Tight or Geist is acceptable — but ONLY when the design earns distinction through scale, spacing, and restraint.

**Strong display options** (rotate, don't default to one):
Syne, Clash Display, Cabinet Grotesk, Satoshi, General Sans, Outfit, Plus Jakarta Sans, Instrument Sans, Instrument Serif, Space Grotesk (sparingly), Playfair Display, DM Serif Display, Fraunces, Unbounded, Manrope.

### Scale

| Element | Size | Weight | Line-Height | Letter-Spacing |
|---------|------|--------|-------------|----------------|
| Hero headline | `clamp(3rem, 8vw, 8rem)` | 700–900 | 1.0–1.05 | -0.03em to -0.04em |
| H1 | 3.5–5rem | 700–800 | 1.05–1.1 | -0.02em to -0.03em |
| H2 | 2.5–3.5rem | 600–700 | 1.1 | -0.02em |
| H3 | 1.75–2.25rem | 600 | 1.15 | -0.01em |
| Body | 16–18px | 300–400 | 1.6–1.75 | normal |
| Small/Label | 12–13px | 500, uppercase | 1.4 | +0.08em to +0.12em |

### Constraints

- Max body text width: 65–75 characters. NEVER full-width paragraphs on desktop.
- Bold headings against light body weight creates hierarchy without size alone.
- Subheadlines sit 12–20px below headlines. CTAs sit 16–24px below subheadlines. Don't over-gap.

---

## Color Rules

### Dark Theme (DARK_MODE: 1)

```css
:root {
  --bg-primary: #0A0A0A;
  --bg-secondary: #111111;
  --bg-tertiary: #1A1A1A;
  --text-primary: #E8E8E8;
  --text-secondary: #888888;
  --text-dim: #444444;
  --accent: #[PROJECT_SPECIFIC];
  --accent-hover: #[LIGHTER_VARIANT];
  --border: #1F1F1F;
  --glow: rgba([ACCENT_RGB], 0.12);
}
```

### Light Theme (DARK_MODE: 0)

```css
:root {
  --bg-primary: #FAFAFA;
  --bg-secondary: #F0F0F0;
  --bg-tertiary: #FFFFFF;
  --text-primary: #1A1A1A;
  --text-secondary: #6B6B6B;
  --text-dim: #AAAAAA;
  --accent: #[PROJECT_SPECIFIC];
  --accent-hover: #[DARKER_VARIANT];
  --border: #E5E5E5;
}
```

### Rules

1. **Dominant color takes 60%+.** Usually the background.
2. **One accent color.** Max two if one is used very sparingly.
3. **Never pure `#000` or `#FFF`** unless explicitly building an Apple-style product page.
4. **Accent color is for CTAs, links, highlights, and interactive states ONLY.** Not for backgrounds or large decorative areas.
5. Text must pass **WCAG 2.2 AA** contrast. Hero text over images ALWAYS gets a gradient overlay, backdrop-blur, or text-shadow.
6. Build a 10-step neutral scale for the project. Don't grab arbitrary grays.

---

## Spacing & Layout

### Section Padding

| VISUAL_DENSITY | Vertical Padding | Max Content Width |
|----------------|-----------------|-------------------|
| 1–3 | `py-32 md:py-48` (128–192px) | 980–1080px |
| 4–6 | `py-24 md:py-32` (96–128px) | 1200–1280px |
| 7–10 | `py-12 md:py-20` (48–80px) | 1400–1440px |

### Grid Behavior

| DESIGN_VARIANCE | Grid Style |
|-----------------|------------|
| 1–3 | Centered single-column or symmetric 2/3 column grids |
| 4–6 | Mixed. Some sections centered, some asymmetric (7/5 or 8/4 splits) |
| 7–10 | Asymmetric default. Overlapping elements. Grid-breaking hero sections. Diagonal or staggered layouts. |

### Constraints

- Mobile: ALWAYS single-column. 24–32px side padding minimum.
- Standard section wrapper: `<section className="relative py-[DENSITY] overflow-hidden"><div className="mx-auto max-w-[WIDTH] px-6 md:px-8">`
- When DESIGN_VARIANCE > 5, centered hero sections are discouraged. Use split-screen, left-aligned, or asymmetric layouts.
- Between sections: 0px gap. Background color shifts or subtle borders create separation, not empty space.

---

## Anti-Slop Checklist

> These are the 40 most common patterns that make AI-generated frontends look generic. Violating ANY of these is a failure.

### Layout Sins

1. ❌ Every section is centered with identical padding
2. ❌ All grid columns are equal width (6/6, 4/4/4)
3. ❌ Cards of equal forced height via flexbox when content varies
4. ❌ Uniform border-radius on everything (same radius on buttons, cards, images, inputs)
5. ❌ No overlap or depth — everything sits flat in a single plane
6. ❌ Symmetrical vertical padding everywhere (bottom often needs to be optically larger)
7. ❌ Dashboard always has a left sidebar (try top nav, command menu, or collapsible panel)
8. ❌ Hero section is always centered text + button + stock image below
9. ❌ Hamburger menu on desktop
10. ❌ Full-width body text with no max-width constraint

### Typography Sins

11. ❌ Using Inter, Roboto, Arial, or Open Sans as a design choice
12. ❌ Same font weight for everything
13. ❌ Headings that are too small (under 2rem for H1)
14. ❌ Body text under 16px on desktop
15. ❌ No letter-spacing adjustments on headings or labels
16. ❌ More than 2 font families
17. ❌ Loose line-height on headings (should be 1.0–1.15, not 1.5)

### Color Sins

18. ❌ Purple gradient on white background (the #1 AI cliché)
19. ❌ Pure black (#000) or pure white (#FFF) without intention
20. ❌ Accent color used for backgrounds or large areas instead of just interactive elements
21. ❌ No neutral scale — random grays grabbed from different palettes
22. ❌ Text fails WCAG 2.2 AA contrast against its background
23. ❌ Gradient text on everything (use once per page max, on a key headline)

### Animation Sins

24. ❌ Elements animating in from random directions with no choreography
25. ❌ Bounce or elastic easing on content elements (use `power2.out` or custom cubic bezier)
26. ❌ Animations that block content from being readable
27. ❌ Every element has the same entrance animation
28. ❌ No animation at all when MOTION_INTENSITY > 3
29. ❌ Animations replay on every scroll (should fire once with `toggleActions: "play none none none"`)

### Component Sins

30. ❌ Default shadcn/Radix components with no color, radius, or sizing customization
31. ❌ Buttons without hover/focus/active states
32. ❌ Cards without hover state at MOTION_INTENSITY > 3
33. ❌ No loading/skeleton states for async content
34. ❌ No empty states ("No items found" with no illustration or CTA)
35. ❌ No error states on forms
36. ❌ Generic circular spinner instead of skeleton loaders matching layout shape
37. ❌ Missing `alt` text on meaningful images

### Code Sins

38. ❌ Placeholder comments like `// TODO: implement` or `// add more content here` shipped in final code
39. ❌ Import hallucinations — importing packages that don't exist in `package.json`
40. ❌ Using `h-screen` instead of `min-h-[100dvh]` for full-height sections (breaks on iOS Safari)
41. ❌ Glassmorphism on every surface — Liquid Glass is a treatment for floating chrome, not a wall finish (one glass layer per view)
42. ❌ The too-perfect AI sheen — zero texture, zero human touch anywhere. Every project ships at least one hand-made element (see ARCHETYPES.md → 2026 Trend Layer)
43. ❌ Importing dead packages: `framer-motion` (now `motion`) or `@studio-freight/lenis` (now `lenis`)

---

## Mandatory Quality Gates

Before any section/page is considered complete, verify:

- [ ] **States**: Loading, empty, error, and success states exist for all dynamic content
- [ ] **Responsive**: Mobile (< 768px), tablet (768–1024px), desktop (> 1024px) all tested
- [ ] **Accessibility**: Focus states on interactive elements, `alt` text on images, proper heading hierarchy, skip-to-content link, `prefers-reduced-motion` respected. Target **WCAG 2.2 AA** (EN 301 549 is adopting 2.2). For e-commerce or any project serving EU users, the **European Accessibility Act** (enforceable since June 2025, active enforcement) makes this a legal requirement — include an accessibility statement.
- [ ] **Performance**: Images use Next.js `<Image>` with explicit dimensions. Fonts use `display=swap`. Animations use `transform`/`opacity` only.
- [ ] **Legal**: Privacy policy and terms links in footer. Meta tags (title, description, og:image) present.
- [ ] **Navigation**: No dead ends. Every page has a way back. Custom 404 page exists.
- [ ] **Anti-slop**: Run through the 40-point checklist above. Fix every violation.

---

## Module Reference

Read these files based on the task:

| File | Read When |
|------|-----------|
| `WORKFLOW.md` | **ALWAYS read at the start of any new project.** Defines the 7-phase build process and controls the order of all other modules. |
| `ARCHETYPES.md` | **ALWAYS read before any new build** (enforced by Phase 2 of WORKFLOW.md). Contains the 8 archetypes and 24 variations. |
| `APP.md` | **ALWAYS read before building any non-marketing surface** (admin, dashboard, CRM, CMS, auth, settings). Contains the mandatory layout selection gate and modern layout library. |
| `STACK.md` | Phase 5 of the workflow. Setup, deps, directory structure, base files, CSS pitfalls. |
| `MOTION.md` | Phase 5 of the workflow. Animation patterns. |
| `COMPONENTS.md` | Phase 5 of the workflow. UI section patterns for marketing surfaces. |
| `3D.md` | Phase 5 of the workflow. Only when the project requires WebGL/WebGPU. |
| `BACKEND.md` | Any project with auth, database, payments, transactional email, or AI features. Supabase, Stripe, Resend, and Vercel platform patterns. |

Always read `LUXWEB.md` (this file) and `WORKFLOW.md` at the start of any new project. Read `ARCHETYPES.md` before Phase 2 begins. Read `APP.md` whenever building non-marketing surfaces. Read other modules as the workflow phases reach them.

---

## Pre-Build Checklist

Before writing any code on a new project:

- [ ] **Archetype + variation selected via the mandatory gate** (see top of this file)
- [ ] Fonts, colors, and dials applied from the chosen variation (no substitutions)
- [ ] Hero approach decided (video? 3D? typography? image? split-screen?)
- [ ] Content/copy available or placeholder strategy clear
- [ ] Image sourcing plan using the variation's prompt template
- [ ] Mobile 3D/animation fallback strategy confirmed (if applicable)

---

*This document is the law. The module files are the playbook. Together they ensure every LuxWeb build is premium, intentional, and slop-free.*

**Version: v1.1 — July 2026.**
