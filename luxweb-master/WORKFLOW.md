# LuxWeb Module: Project Workflow

> **v1.1 — July 2026.** Phase 5 now routes backend work through BACKEND.md; Phase 7 adds Analytics/Speed Insights, BotID verification, and Stripe/Resend production checks.
> **v1.1.1 — July 2026.** Phase 6 adds scale-audit items (no hot-linked storage, cached public pages, long cache headers); Phase 7 adds usage alerts, spend-cap decision, and rate-limit verification.

> **Read when**: Starting any new project from scratch. This file defines the 7-phase workflow that takes a project from idea to deployed site. Each phase has clear inputs, outputs, and ownership.

---

## The 7 Phases

```
1. BRIEF          →  Quick intake. What are we building and why.
2. ARCHETYPE      →  Mandatory gate (ARCHETYPES.md). Creative direction locked.
3. INVENTORY      →  Content + asset manifest. What goes where.
4. SOURCING       →  Generate images via prompt templates. Organize assets.
5. BUILD          →  Scaffold + code with LuxWeb modules. Use real assets.
6. POLISH         →  Anti-slop audit. Performance. Accessibility. Mobile review.
7. DEPLOY         →  Ship to Vercel. Domain, analytics, launch checklist.
```

Each phase produces a deliverable that feeds the next phase. **Claude Code must complete phases in order** and should pause at natural checkpoints for user review.

### Ownership Key

Throughout this file, each step is marked with an owner:

- 🤖 **Claude Code** — Claude Code does this autonomously
- 👤 **User** — The user must do this (Claude Code cannot)
- 🤝 **Shared** — Claude Code proposes, user reviews/approves

---

## PHASE 1 — BRIEF

> Purpose: Capture just enough context for Claude Code to make good decisions downstream. Keep it lean — this is not formal discovery.

### 🤖 Claude Code asks:

If the user's initial request is vague (e.g., "build me a site for a lawn care company"), ask 3 focused questions before proceeding. Use the `ask_user_input` tool if available, otherwise ask in prose:

1. **Project type**: Marketing/landing page, full multi-page site, web app, or portfolio demo?
2. **Primary goal**: What should a visitor do after landing? (Book a service, sign up, read content, contact, download, etc.)
3. **Page/section list**: Which pages or major sections does it need? (Propose a list, let the user trim or add.)

If the user has already provided answers in their initial message, skip asking and move on.

### Output of Phase 1

A short brief captured in working memory:

```
PROJECT: [Name]
TYPE: [Landing / Multi-page / App / Demo]
GOAL: [One sentence describing the visitor's intended action]
SECTIONS: [List of pages or major sections]
```

### Then proceed to Phase 2.

---

## PHASE 2 — ARCHETYPE SELECTION GATE

> Purpose: Lock in creative direction before any code is written. This is the mandatory gate from `LUXWEB.md`.

### 🤖 Claude Code protocol

This phase is fully defined in `LUXWEB.md` under "🚨 MANDATORY: Archetype Selection Gate" and `ARCHETYPES.md`. Follow that protocol exactly:

1. Read `ARCHETYPES.md`
2. Present all 8 archetypes in the presentation format
3. **STOP and wait** for user selection
4. Present the 3 variations of the chosen archetype
5. **STOP and wait** for user selection
6. Confirm the locked-in spec in one line

### Output of Phase 2

A locked spec in working memory:

```
ARCHETYPE: [e.g., Organic Natural]
VARIATION: [e.g., Botanical Fresh]
FONTS: [e.g., Fraunces + DM Sans]
PALETTE: [4-5 hex values]
DIALS: VARIANCE [n] / MOTION [n] / DENSITY [n] / DARK [0|1]
IMAGE PROMPT TEMPLATE: [from the variation]
```

### Then proceed to Phase 3.

---

## PHASE 3 — CONTENT INVENTORY

> Purpose: Map out every piece of content (copy + imagery) the site needs BEFORE any code is written or any assets are sourced. This becomes the production blueprint.

### 🤝 Shared — Claude Code proposes, user reviews

Claude Code generates a content inventory based on the brief and archetype. The user reviews and edits. Present it as a markdown table the user can skim and modify.

### Inventory Template

```markdown
## [Project Name] — Content Inventory

### Global

- Site title: [text]
- Meta description: [text]
- Brand voice: [2-3 adjectives derived from archetype]
- Primary CTA label: [text]

### Navigation

| Label | Link | Notes |
|-------|------|-------|
| Home | / | |
| Services | /services | |
| About | /about | |
| Contact | /contact | |

### Section: Hero

- Headline: [short draft]
- Subheadline: [1-2 sentences]
- Primary CTA: [button label + link]
- Secondary CTA (optional): [button label + link]
- **Imagery needed**: 1x hero visual (full-bleed or split-screen based on DESIGN_VARIANCE)
- Image ID: `hero-main`

### Section: [Feature/Service 1]

- Headline: [draft]
- Supporting copy: [draft]
- **Imagery needed**: 1x supporting visual
- Image ID: `feature-[name]`

[...repeat for each section]

### Section: CTA

- Headline: [draft]
- Subheadline: [draft]
- Button label: [text]
- **Imagery needed**: optional background
- Image ID: `cta-bg` (if used)

### Section: Footer

- Columns: [list]
- Legal links: Privacy, Terms
- Copyright: © [year] [name]
```

### Copy-writing principles

When Claude Code drafts copy for demos (not real clients):

- **Business outcome first.** Lead with what the customer GETS, not what the product DOES. "More leads, less mowing" beats "automated scheduling platform."
- **Avoid technical jargon.** Most visitors don't know what "edge functions" or "vector embeddings" mean. Translate to human language.
- **Short sentences.** Hero headlines max 7 words. Subheadlines max 20 words. Body copy max 3 sentences per paragraph.
- **Specific over generic.** "We handle 3-acre properties in Montgomery County" beats "We serve local communities."
- **Match the archetype voice.** Luxury = restrained and confident. Organic = warm and grounded. Tech utilitarian = precise and direct. Playful = energetic and human.

### 👤 User reviews

The user should confirm:
- Section list matches what they actually want
- Copy drafts are in the right direction (can be refined later)
- Every section that needs an image has an Image ID assigned

### Output of Phase 3

A completed content inventory saved to the project as `CONTENT.md` or similar. The image ID list becomes the input to Phase 4.

### Then proceed to Phase 4.

---

## PHASE 4 — ASSET SOURCING

> Purpose: Generate every image the site needs, efficiently, using the archetype's prompt template. Organize and optimize files for the build phase.

This is the phase that used to break down. Now it's mechanical.

### Step 1 — 🤖 Generate the prompt batch

Claude Code takes the archetype's image prompt template from Phase 2 and combines it with each image ID from the inventory. Produce a batch of complete Higgsfield-ready prompts:

```markdown
## Image Prompts — [Project Name]

Archetype: [e.g., Organic Natural → Botanical Fresh]
Base style: [e.g., "fresh botanical, bright natural light, green plants, minimal wood surfaces, soft focus background"]

### 1. hero-main (hero visual, 16:9 or 21:9)
Full prompt: [base style] + [specific content, e.g., "wide landscape shot of a professionally maintained lawn at golden hour, lush green grass, subtle gardening tools in soft focus background, warm morning light"]

### 2. feature-landscaping (section image, 4:3)
Full prompt: [base style] + [specific content, e.g., "hands holding fresh soil with small green sprouts, overhead shot, natural wood workbench, soft diffused light"]

### 3. feature-maintenance (section image, 4:3)
Full prompt: [base style] + [specific content, e.g., "close-up of pristine garden hedges perfectly trimmed, morning dew, soft depth of field"]

[...one prompt per image ID]
```

Claude Code should produce ALL prompts at once so the user can batch-generate in Higgsfield.

### Step 2 — 👤 Generate in Higgsfield

The user:
1. Opens Higgsfield
2. Pastes prompts one by one (or uses batch if supported)
3. Generates 2-3 variations per prompt
4. Picks the best version of each
5. Downloads all final images

### Step 3 — 👤 Drop images into project

The user places images in `public/images/` using the Image IDs as filenames:

```
public/images/
├── hero-main.jpg
├── feature-landscaping.jpg
├── feature-maintenance.jpg
├── feature-design.jpg
├── about-team.jpg
└── cta-bg.jpg
```

Filenames MUST match the Image IDs from the inventory exactly. This is how Claude Code wires them into the build.

### Step 4 — 🤖 Optimize

Once the user confirms images are in place, Claude Code runs optimization:

```bash
# Convert to WebP for smaller file sizes and better quality
# Claude Code can use sharp (already in LuxWeb STACK.md dependencies) via a quick script
```

Optimization rules:
- Convert to WebP (fallback to original JPG if needed)
- Hero images: max 1920px wide, quality 85
- Section images: max 1280px wide, quality 85
- Background images: max 1920px wide, quality 75 (they're overlayed so can be more compressed)
- Generate blur placeholders for Next.js `<Image>` component

### Step 5 — 🤖 Fallback strategy

If the user says "I don't have images yet, build with placeholders," Claude Code should:
- Use Next.js `<Image>` with a solid color placeholder matching the archetype palette
- Add a `data-image-id` attribute so images can be swapped in later without touching markup
- Leave a `IMAGES_NEEDED.md` file in the project root listing every missing asset + its prompt
- DO NOT use stock placeholder services like placeholder.com or picsum.photos — they look like demo code and will be forgotten

### Output of Phase 4

All images optimized, named per Image IDs, sitting in `public/images/`. Or, if deferred, a `IMAGES_NEEDED.md` file tracking what's still needed.

### Then proceed to Phase 5.

---

## PHASE 5 — BUILD

> Purpose: Execute the actual code build using LuxWeb modules, the locked archetype spec, the inventory, and the real assets.

### 🤖 Claude Code executes

This phase is where the other LuxWeb modules do the heavy lifting:

1. **Scaffold** using `STACK.md` — create project, install deps, set up directory structure, create base files.
2. **Apply archetype spec** — inject fonts from the variation into `globals.css`, apply color palette as CSS variables, set dial-driven spacing/layout defaults.
3. **Build marketing sections** using `COMPONENTS.md` — one section at a time, following the content inventory from Phase 3. Every section uses the patterns from that module, customized to the archetype.
4. **Build app surfaces** using `APP.md` — IF the project includes any non-marketing surfaces (dashboard, admin, CRM, CMS, settings, auth, data displays), Claude Code MUST run the App Layout Selection Gate from `APP.md` before building them. Present layout options for each surface type the project needs (dashboard, settings, auth, etc.) and wait for user selection. Never default to "Classic Shell" or "Centered Card."
5. **Add motion** using `MOTION.md` — apply animation patterns scaled to the MOTION_INTENSITY dial from the variation. Marketing surfaces get cinematic motion. App surfaces get functional motion (drawer slides, skeleton pulses, dropdown reveals).
6. **Add 3D** using `3D.md` if the archetype/project requires it — usually for high DESIGN_VARIANCE or specific archetypes like Retro-Futuristic / Maximalist.
7. **Wire assets** — use the image files from Phase 4, matched by Image ID.
8. **Create 404 and essential pages** — custom 404, privacy, terms (even placeholder versions).

**Backend features**: whenever a step touches auth, database, payments, transactional email, or AI (Supabase, Stripe, Resend, AI SDK), Claude Code MUST read `BACKEND.md` first and follow its integration patterns — env handling, RLS, webhook verification, version pinning.

### App Surface Build Order

If the project has app surfaces, build in this order AFTER the marketing pages are complete:

1. **Auth surfaces first** (login, signup, forgot password) — these are the entry points
2. **App shell** (sidebar/topbar layout chosen from APP.md)
3. **Dashboard** (using the layout chosen from APP.md)
4. **Primary data views** (tables, lists, kanban, etc.)
5. **Detail/record views**
6. **Settings** (using the layout chosen from APP.md)
7. **Profile and account management**

### Build order

Claude Code should build in this order, showing progress to the user:

1. Project scaffold + deps + base files
2. `globals.css` with archetype tokens
3. `layout.tsx` with smooth scroll provider, metadata, fonts
4. Navigation component
5. Hero section (most important, get it right first)
6. Each content section in order from the inventory
7. CTA section
8. Footer
9. 404 page
10. Privacy / Terms placeholders

Pause after the hero section and show the user a preview. This is the highest-value checkpoint — if the hero isn't right, everything downstream needs adjustment.

### Checkpoint after hero

Before building the rest of the sections, Claude Code should say:

> "Hero section is complete. Run `npm run dev` and review at `localhost:3000`. Does the feel match the archetype? Any adjustments to fonts, spacing, or hero imagery before I build the rest?"

### Output of Phase 5

A fully coded project matching the archetype spec, using the content inventory, with real assets wired in.

### Then proceed to Phase 6.

---

## PHASE 6 — POLISH

> Purpose: Final quality pass before deploy. Catches the things that break at the last minute.

### 🤖 Claude Code runs the audit

Work through this checklist. Fix every failure.

#### Anti-slop audit

Run the 40-point checklist from `LUXWEB.md`. Any violations get fixed.

#### Performance audit

- [ ] All images use Next.js `<Image>` with explicit width/height
- [ ] Hero image has `priority` prop
- [ ] Below-fold images lazy load
- [ ] Fonts use `display=swap`
- [ ] No layout shift on page load (reserve space for images)
- [ ] JS bundle size reasonable (< 300KB initial for most projects, < 500KB if 3D is used)
- [ ] Lighthouse performance score 85+ (target 90+)
- [ ] No Supabase Storage URLs hot-linked — every image routes through next/image or the project CDN
- [ ] Public pages verified cached/static — no per-visitor DB queries for identical-for-everyone data
- [ ] Public storage uploads set `cacheControl: "31536000"` (see BACKEND.md → Scale & Cost Resilience)

#### Accessibility audit

- [ ] Every image has meaningful `alt` text
- [ ] Heading hierarchy is logical (one h1 per page, no skipped levels)
- [ ] Focus states visible on all interactive elements
- [ ] Color contrast passes WCAG AA
- [ ] `prefers-reduced-motion` respected
- [ ] Skip-to-content link present
- [ ] Form inputs have labels
- [ ] Interactive elements have appropriate `aria-*` attributes

#### Content audit

- [ ] No Lorem Ipsum anywhere
- [ ] No "TODO" or "FIXME" comments in shipped code
- [ ] All links go somewhere (no `href="#"` placeholders except documented anchor scrolls)
- [ ] Copy reads naturally, matches archetype voice
- [ ] Legal pages exist (privacy, terms — even if brief)
- [ ] Meta tags present (title, description, og:image)
- [ ] Favicon present

#### Responsive audit

Test at these widths:
- [ ] 375px (iPhone SE)
- [ ] 414px (iPhone Pro Max)
- [ ] 768px (iPad)
- [ ] 1024px (small laptop)
- [ ] 1440px (standard desktop)
- [ ] 1920px (large desktop)

Check: text readability, image sizing, navigation usability, button tap targets (min 44x44px on mobile), no horizontal scroll, no content cut off.

### 👤 User does the final eye test

Claude Code can't judge aesthetics the way the user can. After the audit:

> "Polish audit complete. Open the site on your phone and scroll through it once. Does it feel like the archetype we picked? Anything that feels generic, off, or like it needs more personality?"

This is where taste shows up. If something feels off, name it and iterate.

### Output of Phase 6

A polished, production-ready site.

### Then proceed to Phase 7.

---

## PHASE 7 — DEPLOY

> Purpose: Ship it. Claude Code handles the mechanics, the user handles the accounts/domains.

### Step 1 — 🤖 Pre-deploy check

```bash
npm run build
```

Fix any build errors before proceeding. Common issues:
- TypeScript errors (strict mode catches lots)
- Missing env vars
- Import hallucinations (imports that don't exist)
- Unused imports (if eslint is strict)

### Step 2 — 🤝 Environment variables

If the project uses Supabase, Stripe, Resend, etc., create `.env.example` with all required keys documented. The user will add real values in Vercel dashboard.

### Step 3 — 👤 Push to GitHub

```bash
git init
git add .
git commit -m "Initial LuxWeb build: [project name]"
git remote add origin [url]
git push -u origin main
```

### Step 4 — 👤 Deploy to Vercel

1. Import the GitHub repo into Vercel
2. Vercel auto-detects Next.js — accept defaults (Fluid compute is on by default; leave it)
3. Add environment variables in the project settings (match `.env.example` — see BACKEND.md)
4. Enable **Vercel Analytics** and **Speed Insights** (components should already be in the layout)
5. If the project has forms, login, or AI endpoints: verify **BotID** is mounted and verifying server-side
6. Deploy

### Step 5 — 👤 Domain setup (if applicable)

- Point custom domain DNS to Vercel
- Verify SSL certificate provisions
- Test the custom domain loads

### Step 6 — 🤖 Post-deploy checklist

Claude Code reminds the user to verify:

- [ ] Live site loads at the production URL
- [ ] All images load (no broken src paths)
- [ ] All fonts load (check for font flash or fallback)
- [ ] Forms submit successfully (if any)
- [ ] Analytics fire (if set up)
- [ ] Mobile loads and looks correct
- [ ] Lighthouse score on production matches dev
- [ ] OG image appears when sharing the URL (test on Twitter/Slack/iMessage)
- [ ] Analytics events arriving in the Vercel dashboard
- [ ] BotID verified on protected routes — submit the contact form once as a human, confirm it passes
- [ ] Stripe webhooks pointed at the production URL with the live signing secret (if payments)
- [ ] Resend domain verified — SPF/DKIM/DMARC green (if email)
- [ ] Supabase usage alerts set (~70% thresholds) and spend-cap posture consciously decided (default: OFF + alerts)
- [ ] Rate limiting verified — hammer an AI/write endpoint once, confirm the 429

### Output of Phase 7

A live, production site.

---

## The Workflow in One Paragraph

The user asks to build something. Claude Code asks 3 quick questions (Phase 1), presents 8 archetypes and waits for selection, then 3 variations and waits for selection (Phase 2). With the direction locked, Claude Code drafts a content inventory covering every section and every image needed (Phase 3). It generates a batch of Higgsfield-ready prompts using the archetype template, the user generates images and drops them in `public/images/` with matching filenames, Claude Code optimizes (Phase 4). Claude Code scaffolds the project, builds sections one at a time, pauses after the hero for a checkpoint, then finishes the rest (Phase 5). A polish pass catches anti-slop violations, performance issues, accessibility gaps, and content problems (Phase 6). The user pushes to GitHub, deploys on Vercel, and verifies the live site (Phase 7).

**Every project follows this path. No improvisation. No skipped phases.**

---

## Deferred / Asynchronous Variants

Sometimes the user doesn't want to do all 7 phases in one session. Common patterns:

### "Build it with placeholders, I'll source images later"

- Phase 3 and 4 are partially skipped
- Claude Code uses archetype-colored solid placeholders with `data-image-id` attributes
- `IMAGES_NEEDED.md` created in project root with the prompt batch
- Phase 5-7 proceed normally
- Later session: user drops images in, runs optimization, redeploys

### "I want to just see the design first, no content decisions yet"

- Phase 1 gets simplified (just "what kind of site")
- Phase 2 (archetype gate) still mandatory
- Phase 3 uses generic placeholder copy in the archetype voice
- Phase 4 uses placeholders
- Phases 5-7 proceed normally
- User iterates on design first, adds real content in a follow-up session

### "This is just a demo for my portfolio"

- Same flow, but Claude Code is free to invent brand names, content, and narrative that match the archetype
- User still must pick archetype + variation
- Real images from Higgsfield are HIGHLY recommended for portfolio demos since they're what make the demo look real

---

## What Claude Code Should NEVER Do in This Workflow

- ❌ Skip the archetype gate to save time
- ❌ Start coding before the content inventory is approved
- ❌ Use placeholder image services (placeholder.com, picsum.photos, etc.)
- ❌ Hallucinate content details the user didn't approve
- ❌ Ship a build with any checklist item failing
- ❌ Deploy without the user explicitly asking to deploy
- ❌ Combine multiple phases into one output unless the user explicitly asks for speed
- ❌ Ask the user 10 questions at once — batch them by phase and keep each phase's questions under 4
