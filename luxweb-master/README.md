# LuxWeb Design Skill

A modular design system AND production workflow for Claude Code. Turns AI-assisted builds from "one-shot generic output" into a disciplined 7-phase pipeline with mandatory creative direction, structured content planning, asset sourcing, and polished delivery.

## Files

```
luxweb-skill/
├── LUXWEB.md        # Master rules — design constitution, philosophy, dials, anti-slop, gates
├── WORKFLOW.md      # The 7-phase production pipeline (start here for new projects)
├── ARCHETYPES.md    # 8 design archetypes × 3 variations = 24 creative directions (marketing)
├── APP.md           # 21 layout options across dashboards, settings, auth, data displays (admin/CRM/CMS)
├── STACK.md         # Project setup — deps, directory structure, base files, CSS pitfalls
├── BACKEND.md       # Supabase, Stripe, Resend, Vercel platform, AI SDK integration patterns
├── MOTION.md        # Animation — GSAP, Framer Motion, Lenis, scroll choreography
├── COMPONENTS.md    # Marketing UI patterns — nav, hero, cards, CTA, footer, states
├── 3D.md            # WebGL — React Three Fiber, shaders, particles (optional)
└── README.md        # This file
```

## How It Works

When you ask Claude Code to build anything new, it follows the 7 phases from `WORKFLOW.md`:

1. **Brief** — 3 quick questions to understand what you're building
2. **Archetype Gate** — Present 8 archetypes, wait for selection, present 3 variations, wait for selection. Mandatory.
3. **Content Inventory** — Claude Code drafts every section, every piece of copy, every image needed. You review.
4. **Asset Sourcing** — Claude Code generates a batch of Higgsfield-ready image prompts from the archetype template. You generate in Higgsfield, drop files into `public/images/` with the matching filenames, Claude Code optimizes.
5. **Build** — Scaffolds the project, applies the archetype spec, builds sections one at a time. Pauses after the hero for your review. **If the project includes app surfaces (dashboards, admin, settings, auth), Claude Code runs the App Layout Selection Gate from APP.md before building them.**
6. **Polish** — Runs the 40-point anti-slop audit, performance check, accessibility check, responsive testing across 6 widths.
7. **Deploy** — Vercel push, env vars, domain, post-deploy verification checklist.

Each phase has clear ownership (Claude Code / You / Shared) and natural checkpoints where you can course-correct without rebuilding.

## The Two Mandatory Gates

The most important features of this skill are two gates that prevent generic output:

### Gate 1: Archetype Selection (Marketing)

Claude Code cannot start building marketing surfaces until you've picked an archetype + variation. This forces creative range — no more defaults, no more house style repeating across projects. Defined in `LUXWEB.md` and `ARCHETYPES.md`.

### Gate 2: App Layout Selection (Admin/Dashboard)

Claude Code cannot start building dashboards, admin panels, settings pages, or auth flows until you've picked a structural layout for each surface. This solves the "every dashboard ends up as sidebar + 3 stat cards + 2-column grid" problem. Defined in `APP.md`.

Together, these gates structurally prevent the two ways AI-built sites become generic: same visual treatment OR same structural skeleton. With both gates active, every project starts from a distinct creative AND structural direction.

## Setup

### Option 1: Per Project (Recommended)

Copy the full skill folder into your project root as `.luxweb/`:

```
my-project/
├── .luxweb/
│   ├── LUXWEB.md
│   ├── WORKFLOW.md
│   ├── ARCHETYPES.md
│   ├── APP.md
│   ├── STACK.md
│   ├── MOTION.md
│   ├── COMPONENTS.md
│   └── 3D.md
└── CLAUDE.md
```

Then create a `CLAUDE.md` in the project root that routes Claude Code to the skill:

```markdown
# Project Instructions

For any new project or major build, start by reading `.luxweb/LUXWEB.md` 
and `.luxweb/WORKFLOW.md`. Follow the 7-phase workflow and never skip 
the mandatory gates (Archetype Selection, App Layout Selection).

Module files to read on demand based on WORKFLOW.md phase:
- `.luxweb/ARCHETYPES.md` — Before Phase 2 (marketing creative direction)
- `.luxweb/APP.md` — Before building any admin/dashboard/auth/settings surface
- `.luxweb/STACK.md` — Phase 5 setup, and whenever CSS errors appear
- `.luxweb/MOTION.md` — When building animations
- `.luxweb/COMPONENTS.md` — When building marketing UI sections
- `.luxweb/3D.md` — Only when the project uses Three.js / React Three Fiber
```

### Option 2: Global Claude Code Instructions

If you want these rules to apply to ALL your projects by default, add the contents of `LUXWEB.md` (or a pointer to the skill folder) to your global Claude Code settings.

## Usage

### Starting a New Project

Just ask Claude Code to build something. The skill handles the rest:

```
Build a new landing page for a lawn care company in Buford, GA.
```

Claude Code will run the full workflow: ask 3 brief questions, present the 8 archetypes and wait for selection, present variations and wait again, draft a content inventory, generate Higgsfield prompts, build the site.

### Skipping the Gates (Only When You Know the Direction)

If you already know exactly what you want, name it in the initial prompt:

```
Build a dashboard for a CRM tool. Use Tech Utilitarian / Light Clinical 
archetype. Bento Grid dashboard layout. Tabbed Horizontal settings. 
Split Screen auth.
```

Claude Code will skip the selection gates and go straight to building with those locked choices.

### Quick Overrides During a Build

You can steer Claude Code with natural language during any phase:

```
"Make it more spacious"              → Lowers VISUAL_DENSITY
"Add more animation"                 → Raises MOTION_INTENSITY
"Keep it clean and centered"         → Lowers DESIGN_VARIANCE
"Add 3D elements to the hero"        → Claude Code reads 3D.md
"Switch the dashboard to Focus Mode" → Rebuilds dashboard with that layout
```

## Which Files to Read When

| Task | Files Needed |
|------|-------------|
| New project from scratch | LUXWEB + WORKFLOW + ARCHETYPES (gate) + STACK + COMPONENTS |
| Adding an admin/dashboard/auth surface | LUXWEB + APP (gate) + STACK + MOTION |
| Auth, database, payments, email, or AI features | BACKEND + STACK |
| Adding animation to existing page | LUXWEB + MOTION |
| Building a marketing section | LUXWEB + COMPONENTS |
| Adding 3D to a project | LUXWEB + 3D |
| Fixing CSS errors or hallucinated Tailwind classes | STACK (CSS Pitfalls section) |
| Design audit / fixing slop | LUXWEB (40-point anti-slop checklist) |
| Quick isolated component (button, card) | LUXWEB + COMPONENTS or APP |

## What This Skill Does NOT Do

- **It doesn't write your copy.** Claude Code can draft placeholder copy in the archetype voice for demos, but real client projects need real copy.
- **It doesn't generate images.** The Higgsfield prompt batch is the hand-off — you still need to run the prompts through Higgsfield and curate the results.
- **It doesn't replace design sense.** It gives Claude Code strong defaults and forces intentional choices, but your eye during Phase 6 polish is what pushes a build from 8/10 to 10/10.
- **It doesn't design your backend architecture.** `BACKEND.md` covers the integration layer (Supabase, Stripe, Resend, Vercel, AI SDK) so services get wired correctly — but schemas, business logic, and data modeling are planned per-project.

## Version

v1.1 (July 2026) — 9 files, 2 mandatory gates, 24 marketing archetypes + 2026 trend layer, 21 app layouts + AI interface patterns, 7-phase workflow, backend integration module. Stack: Next.js 16 / React 19 / Tailwind v4 / Base UI / GSAP (all plugins free) / Motion / Lenis / WebGPU-ready R3F.
