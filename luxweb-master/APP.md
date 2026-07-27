# LuxWeb Module: App Chrome (Admin, Dashboards, CRM, CMS, Auth)

> **v1.1 — July 2026.** New sections appended: AI Interface Patterns (streaming chat, copilot panels, inline AI actions), Liquid Glass rules, nuqs for URL state, Base UI note (shadcn's new default).

> **Read when**: Building any non-marketing surface. Login, signup, dashboards, admin panels, CRMs, CMSs, settings, user profiles, data tables, form-heavy pages. This file exists because archetype + colors alone are not enough — the LAYOUT itself has to be chosen intentionally, or every admin ends up looking like every other shadcn starter.

---

## The Core Problem This File Solves

A Botanical Fresh marketing site can feel completely distinct from a Dark Terminal marketing site — different fonts, different colors, different motion, different hero treatment. But when you build the admin panels for both, they both end up as:

```
┌──────┬─────────────────────────────┐
│ Side │  Top bar                    │
│ bar  ├─────────────────────────────┤
│      │  [stat] [stat] [stat]       │
│      │  ┌────────┬────────┐        │
│      │  │ card   │ card   │        │
│      │  └────────┴────────┘        │
│      │  table or list              │
└──────┴─────────────────────────────┘
```

Same skeleton. Same rhythm. Same structure. The archetype just repaints the walls.

**The fix:** force a structural layout decision BEFORE building, the same way we force an archetype decision. Multiple distinct layouts per surface, with the generic default explicitly called out and banned as a "default pick."

---

## The Core Principle

Marketing surfaces **sell**. App surfaces **work**. A user spends 30 seconds on a landing page and 30 hours a month in an admin panel. That difference dictates everything.

**What carries from the marketing archetype:**
- Fonts (display + body)
- Accent color, dark/light commitment, neutral scale
- Voice in microcopy (luxury = restrained, organic = warm, tech = precise)
- Border radius discipline

**What shifts in app chrome:**
- `DESIGN_VARIANCE` — shifts based on which app layout is picked, NOT dropped uniformly
- `MOTION_INTENSITY` drops to 2–4 — motion becomes functional (150–200ms transitions, skeleton pulses, drawer slides). Cinematic scroll stuff disappears.
- `VISUAL_DENSITY` rises to 6–9 — density is the point

**What doesn't disappear — it moves:**

Creativity in app chrome lives in specific places. Claude Code must hit at least 4 of these 8 per project or the admin will feel generic:

1. **Page titles rendered in the display font at real size** (36–56px). A dashboard titled "Contacts" in Fraunces at 48px feels designed. The same word in 18px Inter feels like a shadcn starter.
2. **The sidebar is a brand moment.** Warm cream with forest-green nav for Botanical Fresh. Dark terminal with mono labels for Tech Utilitarian. This is where the archetype actually lives in the admin.
3. **Empty states are the biggest single creative opportunity.** Custom illustration or oversized display-font statement with archetype voice. Never just "No records found."
4. **Iconography choice.** Lucide is the default and looks identical across every AI-generated admin. Pick Phosphor, Tabler, or Iconoir and commit to one stroke weight for the whole project.
5. **Color in data visualization.** Default Recharts palette is a tell. Custom palette derived from the archetype's colors is not.
6. **One decorative moment per page.** A gradient mesh behind the page header. An oversized stat in the display font. A custom divider treatment. A hand-drawn accent. ONE per page, so it lands.
7. **Microcopy voice.** "Something went wrong" vs. "Server took a nap. Try again?" — voice is free personality.
8. **Functional motion.** Skeleton loaders pulsing in the archetype's accent. Drawer slide timings that feel tactile. Dropdown reveals with subtle spring. Nothing cinematic, but nothing default either.

---

## 🚨 MANDATORY: App Layout Selection Gate

**Before building any non-marketing surface, Claude Code MUST execute this protocol.**

### When this gate applies:
- Building a dashboard, admin panel, CRM, CMS, or any app interior
- Building auth pages (login, signup, forgot password, etc.)
- Building a settings page, profile page, or any form-heavy internal surface
- Building data display surfaces (tables, lists, record views)

### When this gate does NOT apply:
- Adding a single component to an already-built app
- Bug fixes or refactors in existing admin code
- User has explicitly named a layout in their prompt

### The Protocol

**Step 1.** For each surface being built (dashboard, settings, auth, etc.), present the full layout options from this file.

**Step 2.** Present them with ASCII diagrams AND real-world reference sites so the user can visualize.

**Step 3. STOP AND WAIT** for the user to pick a layout for each surface.

**Step 4.** Confirm the layout + archetype combination back, then build.

**Step 5.** NEVER default to "Classic Shell" dashboard or "Centered Card" settings unless the user explicitly picks them. These are the generic defaults Claude Code produces on autopilot — making them opt-in is the entire point of this gate.

---

# DASHBOARD LAYOUTS

Six distinct structural approaches. Pick ONE per project. None are universally "better" — each fits different use cases.

## Option A: CLASSIC SHELL ⚠️

```
┌──────┬─────────────────────────────┐
│      │  Top bar                    │
│ Side ├─────────────────────────────┤
│ bar  │  [stat] [stat] [stat]       │
│      │  ┌────────┬────────┐        │
│      │  │ card   │ card   │        │
│      │  └────────┴────────┘        │
│      │  table or list              │
└──────┴─────────────────────────────┘
```

**This is the default shadcn layout and exists in this file ONLY so Claude Code can name it and avoid picking it by default.**

- **Pick this ONLY when:** The user explicitly asks for "a standard admin layout," or the product is an ultra-traditional enterprise tool where familiarity is more valuable than distinctiveness.
- **Reference:** Basically every shadcn template, every generic SaaS admin, every AI-generated dashboard.
- **Default ban:** If the user hasn't specifically requested it, skip this option.

## Option B: BENTO GRID

```
┌──────┬─────────────────────────────┐
│      │  ┌───────┐┌────┐┌─────┐     │
│ Side │  │       ││    ││     │     │
│ bar  │  │ BIG   ││med ││ med │     │
│      │  │ stat  │└────┘└─────┘     │
│      │  │       │┌──────────┐      │
│      │  └───────┘│ wide     │      │
│      │  ┌────┐┌─┐│ card     │      │
│      │  │ sq ││s│└──────────┘      │
│      │  └────┘└─┘                  │
└──────┴─────────────────────────────┘
```

Asymmetric grid where cards have varied sizes. Some span 2 columns wide, some span 2 rows tall, small square stats sit next to wide activity feeds. Creates visual rhythm and lets the most important metric dominate.

- **Pick this when:** One or two metrics matter way more than the rest. You want the dashboard to feel modern and product-y. Primary users are founders, execs, or product managers scanning KPIs.
- **Tech:** CSS Grid with explicit `grid-template-areas` or `col-span-*` / `row-span-*` utilities. Never flexbox — flex can't do this cleanly.
- **Reference sites:** Apple Watch product page, Linear dashboard, Framer dashboard, Arc browser new-tab page, Vercel dashboard.
- **Archetype fit:** Works with all 8 archetypes. Particularly strong for Tech Utilitarian, Maximalist Playful, Soft Consumer.

## Option C: MAGAZINE EDITORIAL

```
┌──────┬─────────────────────────────┐
│      │  ━━━━━━━━━━━━━━━━━━━━━━     │
│ Side │  THIS WEEK                  │
│ bar  │  Welcome back, Kevin        │
│      │  ━━━━━━━━━━━━━━━━━━━━━━     │
│      │                             │
│      │  ┌──────────────┐           │
│      │  │  $48,200     │  This     │
│      │  │  ↑ 12%       │  week     │
│      │  │  (huge)      │  summary  │
│      │  └──────────────┘  text     │
│      │                             │
│      │  ── Activity ──             │
│      │  feed list                  │
└──────┴─────────────────────────────┘
```

Designed like a magazine spread. Big editorial headline ("Welcome back, Kevin" in display font at 48–64px), one massive featured metric, supporting copy in a serif body column, then activity feed below in newspaper-column style. Generous whitespace. Uses dividers and typography hierarchy instead of card containers.

- **Pick this when:** The archetype is Editorial, Luxury Minimal, or Organic Natural. When the dashboard is less about raw data density and more about narrative/status.
- **Tech:** Column grids with typography doing the heavy lifting. Minimal cards, maximal type.
- **Reference sites:** The Browser Company's Arc, Are.na profile pages, Ghost editor dashboard.
- **Archetype fit:** Editorial Refined, Luxury Minimal, Organic Natural. Avoid for Tech Utilitarian (too decorative) and Brutalist (too refined).

## Option D: FOCUS MODE

```
┌──────┬─────────────────────────────┐
│      │                             │
│ Side │      ┌─────────────┐        │
│ bar  │      │             │        │
│      │      │             │        │
│      │      │  ONE primary│        │
│      │      │  thing      │        │
│      │      │             │        │
│      │      └─────────────┘        │
│      │                             │
│      │   [minor] [minor] [minor]   │
│      │                             │
└──────┴─────────────────────────────┘
```

One primary thing dominates the page — the current in-progress project, the main chart, the active record, the next action. Everything else is reduced to small supporting elements at the edges. Minimalist chrome.

- **Pick this when:** The dashboard is for doing ONE thing at a time (writing, designing, processing a queue, reviewing submissions). Users enter the dashboard with a clear intent.
- **Tech:** Standard flex/grid, but with one element dominating 60–70% of the viewport.
- **Reference sites:** Notion editor workspace, Ghost editor, Hemingway, Superhuman.
- **Archetype fit:** Works with all archetypes. Strongest for Editorial and Soft Consumer.

## Option E: COMMAND CENTER

```
┌────────────────────────────────────┐
│ Top bar (no sidebar)               │
├────────────────────────────────────┤
│                                    │
│  metric ── metric ── metric ── ... │
│                                    │
│  ── Section 1 ────────────────     │
│  Dense data, rows with dividers    │
│                                    │
│  ── Section 2 ────────────────     │
│  More data, no cards, monospace    │
│                                    │
│  [command palette overlay: Cmd+K]  │
└────────────────────────────────────┘
```

No sidebar. Top bar with command palette (Cmd+K) as the primary navigation. Ultra-dense, divider-separated sections, no card containers. Monospace for numbers. Feels like a terminal or a pro tool.

- **Pick this when:** Users are power users, developers, analysts, traders. Density matters more than hand-holding. Product includes enough surface area that a command palette makes sense.
- **Tech:** `cmdk` library (by paco coursey) for the palette. Dividers via `border-b` and `divide-y`. No `<Card>` components.
- **Reference sites:** Linear, Retool, Bloomberg Terminal, Raycast, Warp terminal.
- **Archetype fit:** Tech Utilitarian is the perfect match. Also works for Brutalist Raw and dark Editorial.

## Option F: SPLIT CANVAS (Master/Detail)

```
┌──────┬─────────────┬──────────────┐
│      │             │              │
│ Side │ List of     │ Detail view  │
│ bar  │ items       │ of selected  │
│      │ (250px)     │ item         │
│      │             │              │
│      │ item        │ (fills the   │
│      │ item        │  remaining   │
│      │ item        │  space)      │
│      │ item        │              │
│      │             │              │
└──────┴─────────────┴──────────────┘
```

Three columns: sidebar nav, scrollable list of records, detail pane. Clicking a list item updates the detail pane without a page reload. Great for content-heavy tools.

- **Pick this when:** The primary user action is "browse a list and view/edit one record at a time." Inboxes, CMS editors, message tools, queue processors.
- **Tech:** Resizable panes via `react-resizable-panels`. URL state via search params so deep-linking works.
- **Reference sites:** Superhuman, Apple Mail, Things 3, Notion database detail views, Linear issue view.
- **Archetype fit:** All archetypes. Strongest for Tech Utilitarian, Editorial, Soft Consumer.

---

# SETTINGS LAYOUTS

Five distinct approaches. The centered-form-card default is explicitly banned.

## Option A: CENTERED CARD ⚠️

```
┌────────────────────────────────────┐
│                                    │
│         ┌──────────────┐           │
│         │   Settings   │           │
│         │   [form]     │           │
│         │   [form]     │           │
│         │   [Save]     │           │
│         └──────────────┘           │
│                                    │
└────────────────────────────────────┘
```

**BANNED AS DEFAULT.** This is what ByteBoundless and every other shadcn app ships by default. It's in this file only so Claude Code can name it and skip it.

- **Pick this ONLY when:** The user explicitly requests it.

## Option B: SPLIT NAVIGATION

```
┌──────┬─────────────────────────────┐
│      │ Settings (display font, big)│
│ Side ├──────┬──────────────────────┤
│ bar  │      │                      │
│      │ Nav: │  Section content     │
│      │      │                      │
│      │ Prof │  field                │
│      │ Bill │  field                │
│      │ Team │  field                │
│      │ API  │                      │
│      │ ...  │  [Save]              │
│      │      │                      │
└──────┴──────┴──────────────────────┘
```

A second sidebar nav appears ONLY on the settings page, listing setting sections. Content on the right updates as the user clicks sections. No scroll-through-a-giant-form.

- **Pick this when:** Settings are extensive (8+ sections). Most SaaS admin products fit here.
- **Tech:** URL-driven tab state (`/settings/profile`, `/settings/billing`). Each section is its own route.
- **Reference sites:** Linear settings, Vercel settings, Stripe Dashboard settings, GitHub settings.
- **Archetype fit:** All.

## Option C: INLINE EDITABLE PROFILE

```
┌──────┬─────────────────────────────┐
│      │                             │
│ Side │  Kevin Bandison             │
│ bar  │  Lead generation & web dev  │
│      │  (both click to edit)       │
│      │                             │
│      │  ── Profile ──              │
│      │  Full name: Kevin Bandison  │
│      │  Email: kevin@luxweb.dev    │
│      │  (click any value to edit)  │
│      │                             │
└──────┴─────────────────────────────┘
```

The settings page LOOKS LIKE a profile view, not a form. Every value is clickable — click it to turn it into an input field, press Enter to save. No "Save" button. Feels like Notion.

- **Pick this when:** The product has a personality (consumer app, creative tool, CMS). Users who will edit settings frequently. Settings feel like "managing your profile" not "configuring the system."
- **Tech:** Inline state transitions with Framer Motion layout animations. Optimistic UI updates.
- **Reference sites:** Notion user settings, Linear profile, Readwise settings.
- **Archetype fit:** Editorial Refined, Soft Consumer, Luxury Minimal, Organic Natural.

## Option D: COMMAND PALETTE DRIVEN

No traditional settings page at all. Users open the command palette (Cmd+K), type "change theme" or "update email" or "enable 2FA," and a slide-over drawer appears with just that one setting. Once saved, it disappears.

- **Pick this when:** The product is already power-user oriented with a command palette. Settings are accessed rarely. Product values keyboard-first navigation.
- **Tech:** `cmdk` library, slide-over drawers via `vaul` or custom Framer Motion.
- **Reference sites:** Linear, Raycast.
- **Archetype fit:** Tech Utilitarian, Brutalist Raw.

## Option E: TABBED HORIZONTAL

```
┌──────┬─────────────────────────────┐
│      │  Settings                   │
│ Side │  ───────                    │
│ bar  │  [Profile] Billing Team API │
│      │  ──────────────────────     │
│      │                             │
│      │  Section content fills      │
│      │  width, organized in a grid │
│      │  for density                │
│      │                             │
└──────┴─────────────────────────────┘
```

Tabs across the top of the settings page. Each tab reveals a grid of fields below — NOT a single column. Uses the full width.

- **Pick this when:** Settings are moderate (3–6 sections). Each section has 4–12 fields. Want density without the hidden-behind-nav feel of split navigation.
- **Tech:** Radix Tabs or shadcn Tabs, URL-synced.
- **Reference sites:** Figma settings, Vercel project settings.
- **Archetype fit:** All. Particularly Tech Utilitarian and Maximalist Playful.

---

# AUTH LAYOUTS

Five distinct approaches. The plain centered form on gray background is banned as default.

## Option A: CENTERED CLASSIC ⚠️

A single-column form centered on a flat background. This is the boring default.

**Pick this ONLY when:** The user explicitly asks for simplicity, OR the project is an internal tool where auth is a formality. Still needs: archetype fonts, archetype accent on the submit button, custom microcopy. Never ship generic "Sign in to your account."

## Option B: SPLIT SCREEN

```
┌─────────────────┬──────────────────┐
│                 │                  │
│   Brand visual  │   Form           │
│   - full image  │   (centered)     │
│   - gradient    │                  │
│   - 3D scene    │   Email          │
│   - video loop  │   Password       │
│   - testimonial │   [Sign in]      │
│   - big quote   │                  │
│                 │                  │
└─────────────────┴──────────────────┘
```

Two columns. Left side is brand/visual (full-bleed image, gradient mesh, 3D scene, video loop, or big editorial quote). Right side is the form, vertically centered.

- **Pick this when:** Consumer products, marketing-adjacent apps, anything where the first impression matters. Default-best auth layout.
- **Tech:** CSS Grid `grid-cols-[1fr_1fr]` or `grid-cols-[1.2fr_1fr]` for asymmetry. Left side hidden on mobile.
- **Reference sites:** Linear login, Vercel login, Arc browser login, Notion login, Framer login.
- **Archetype fit:** All.

## Option C: FULL-BLEED BACKGROUND

Full-bleed hero image, video, or 3D scene covers the entire viewport. The form sits as a frosted-glass (`backdrop-blur`) card floating over the middle or lower-right of the screen.

- **Pick this when:** Strong brand imagery exists. The product is visual/creative (design tools, photo apps, entertainment, games). Retro-Futuristic, Maximalist, or Editorial Photo-Forward archetypes.
- **Tech:** `position: fixed inset-0` background layer. Form with `backdrop-blur-xl` and semi-transparent background.
- **Reference sites:** Diablo IV account page, Spotify login, most game launcher logins.
- **Archetype fit:** Retro-Futuristic, Maximalist Playful, Editorial Documentary Photo-Forward.

## Option D: ASYMMETRIC EDITORIAL

```
┌────────────────────────────────────┐
│                                    │
│   BIG BRAND                        │
│   STATEMENT                        │
│   spans half the                   │
│   viewport                         │
│                           ┌──────┐ │
│   tagline copy            │ Form │ │
│   supporting the          │      │ │
│   statement               └──────┘ │
│                                    │
└────────────────────────────────────┘
```

A massive editorial headline dominates the left and top of the viewport ("Join the archive" in Fraunces at 96px). The form is pushed to the lower-right corner as a small, focused moment.

- **Pick this when:** Editorial archetype, luxury brand, content/publication products. Want auth to feel like opening a book.
- **Tech:** Grid with explicit placement. Form in a grid cell with `col-start` and `row-start`.
- **Reference sites:** Dirt newsletter signup, Are.na login, The New Yorker subscribe.
- **Archetype fit:** Editorial Refined, Luxury Minimal, Organic Natural.

## Option E: MULTI-STEP CARD

A card that progresses through stages with animation. Step 1: email only. Step 2: password. Step 3: name / profile. Each step animates in with a horizontal slide. The card resizes smoothly as content changes using Framer Motion's `layout` prop.

- **Pick this when:** Signup flow. Want to reduce perceived form length. Onboarding-heavy products.
- **Tech:** Framer Motion `AnimatePresence` + `motion.div` with `layout` prop.
- **Reference sites:** Stripe signup, Hinge signup, Calendly signup.
- **Archetype fit:** Soft Consumer, Tech Utilitarian.

---

# DATA DISPLAY PATTERNS

How records are shown. Pick ONE per data type in the product.

## Option A: Traditional Table

Rows and columns with borders and zebra-free striping. Dense, scannable, sortable. Best for: transactional data, numerical comparisons, bulk operations. Row height 44–52px. Header uppercase 11px. Numbers right-aligned with `tabular-nums`. Hover shifts background subtly, never borders.

## Option B: Card List

Each record is a horizontal card spanning full width. More visual breathing room, room for avatars/images/metadata. Best for: user lists, CRM contacts, content items, rich records.

```
┌────────────────────────────────────┐
│ ◉ Name          meta    status   › │
│   Sub info      meta    status     │
├────────────────────────────────────┤
│ ◉ Name          meta    status   › │
│   Sub info      meta    status     │
└────────────────────────────────────┘
```

## Option C: Card Grid

Records as cards in a responsive grid (2–4 columns). Best for: visual content (products, templates, designs, portfolios), media-heavy records.

## Option D: Master/Detail

List column on the left (narrow, 280–320px), detail column on the right. See Dashboard Option F for the pattern.

## Option E: Dense List (Linear-style)

No cards, no borders between rows except subtle dividers. Row is a single line with flex-layout metadata. Ultra-dense. Best for: tasks, issues, logs, developer tools.

```
  Status  Title              Assignee   Date
  ───────────────────────────────────────────
  ● Open  Fix auth bug       Kevin      2d
  ● Done  Ship skill v2      Kevin      1w
  ○ Todo  Refactor db        Kevin      —
```

---

# CRM / CMS Specific Patterns

For projects that need specialized views beyond dashboards:

- **Pipeline / Kanban view** — columns as stages, cards drag between them. React-DnD or `@dnd-kit`.
- **Calendar view** — FullCalendar or custom with date-fns.
- **Map view** — for location-based data, use Mapbox GL or MapLibre.
- **Timeline view** — vertical chronological for activity/audit logs.
- **Tree view** — hierarchical data, category editors, nested pages.

Every CRM/CMS should include AT LEAST 2 view options for the same data (e.g., "Table" and "Kanban" toggles in the top-right).

---

# Reusable Modern Patterns

These are utility patterns used across any app layout above. Use them liberally. Each pattern includes the implementation approach that was proven in ByteBoundless.

## Command Palette (Cmd+K)

Keyboard-first navigation overlay. Triggered globally, fuzzy-searchable, lists navigation destinations, actions, **and the user's real data**.

**Implementation:**
- Use the `cmdk` library (by paco coursey).
- Register a global `keydown` listener for `Cmd+K` / `Ctrl+K`.
- Render as a fixed overlay with backdrop blur.
- Group items by category: Navigation, **Recent records**, **Saved/Pinned**, **Top results across user data**, Actions.
- Style selected items with `data-[selected=true]:bg-accent/10`.
- Include keyboard hints in the footer: `↑↓` navigate, `↵` select, `esc` close.
- Include theme toggle and sign-out as actions.
- Every app with 5+ routes MUST have one.
- **Critical:** the palette MUST search the user's real data, not just static nav items. A "Search…" button that just opens a static palette is misleading. Fetch recent records, saved items, and top results when the palette opens; rebuild on each open to stay fresh after navigations.

```tsx
// Structure with real data
<Command>
  <Command.Input placeholder="Search leads, lists, searches, pages..." />
  <Command.List>
    <Command.Group heading="Navigation">
      <Command.Item onSelect={() => router.push("/dashboard")}>Dashboard</Command.Item>
    </Command.Group>
    {recentSearches.length > 0 && (
      <Command.Group heading="Recent Searches">
        {recentSearches.map((s) => (
          <Command.Item key={s.id} value={`search ${s.query} ${s.location}`} onSelect={() => router.push(`/search/${s.id}`)}>
            {s.query} in {s.location}
          </Command.Item>
        ))}
      </Command.Group>
    )}
    {topRecords.length > 0 && (
      <Command.Group heading="Top Records">
        {topRecords.map((r) => (
          <Command.Item key={r.id} value={`record ${r.name} ${r.category}`} onSelect={() => router.push(`/records/${r.id}`)}>
            {r.name}
          </Command.Item>
        ))}
      </Command.Group>
    )}
    <Command.Group heading="Actions">
      <Command.Item>Toggle dark mode</Command.Item>
    </Command.Group>
  </Command.List>
</Command>
```

The `value` prop on each `Command.Item` controls what cmdk fuzzy-matches against — include searchable terms (name + category + tags) so users can find a record by any of its attributes.

## User Avatar Menu

Replaces standalone logout/settings icons. Shows user identity at a glance.

**Implementation:**
- Circle with user initials (derived from full name, fallback to email first 2 chars).
- Background: accent color. Text: white.
- Click opens a dropdown with: email + plan badge, Settings link, Guide/Help link, Sign Out.
- Include a `Cmd+K` hint at the bottom of the dropdown.
- Dropdown positioned absolute right, z-50.
- Close on outside click via mousedown listener on document.

## Toast Notifications

Use `sonner` for all transient feedback. Never use inline success messages that auto-dismiss.

**Implementation:**
- Install `sonner`, add `<Toaster>` to root layout.
- Style with CSS variables to match the design system:
  ```tsx
  <Toaster
    position="top-right"
    toastOptions={{
      style: {
        background: "var(--color-bg-tertiary)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-primary)",
        fontSize: "13px",
      },
    }}
  />
  ```
- Use `toast.success("Saved")` for confirmations.
- Use `toast.error("Failed")` for non-blocking errors.
- Keep critical form errors inline (user needs to see them to fix the form).
- Never use `alert()`.

## Skeleton Loaders

ALWAYS match the layout shape of the final content. Never use spinning circles.

**Implementation:**
- Create a `Bone` component: `animate-pulse rounded-lg bg-[var(--color-bg-secondary)]`.
- Create page-specific skeletons that mirror the exact grid/card layout of the loaded state.
- Export from a shared `skeletons.tsx` file.
- Use instead of `<Loader2 className="animate-spin">` everywhere.
- Minimum display time: 300ms to avoid flash.

```tsx
function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[var(--color-bg-secondary)]", className)} />;
}

// Dashboard skeleton mirrors the bento grid
export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Bone className="col-span-2 row-span-2 h-52 rounded-2xl" />
      <Bone className="h-24 rounded-2xl" />
      <Bone className="h-24 rounded-2xl" />
    </div>
  );
}
```

## Slide-Over Drawer

Side panel that slides in from the right for secondary content. Use `vaul` or custom Framer Motion. Prefer over modals for anything more complex than a confirmation.

## Floating Action Button

Single primary action fixed at bottom-right on mobile. Hidden on desktop (desktop has the action in the header).

```tsx
<Link
  href="/search/new"
  className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center shadow-lg"
>
  <Plus className="w-6 h-6" />
</Link>
```

## Sticky Section Headers

Headers that stick to the top of the content area as the user scrolls. Use `sticky top-24` (accounting for nav height). Very effective in settings pages with split navigation.

## Help Tooltips

Small info icons that show explanatory text on hover/click. Use `<span>` elements (not `<div>`) so they can nest inside `<p>` tags without hydration errors.

**Implementation:**
- Hover + click to toggle. Click-outside to dismiss.
- Dark background tooltip with white text, `z-50`.
- Position variants: top, bottom, left, right.
- Keep text under 2 sentences.

## Keyboard Shortcuts

Every app surface should have at least: `Cmd+K` (palette), `Esc` (close modal/drawer). Power-user products add:
- `n` — new record / new search
- `f` — toggle filters
- `/` — focus search input
- `?` — show shortcuts help overlay

## Dark Mode

Support system preference + manual toggle. Persist to localStorage.

**Implementation:**
- Define dark palette as CSS overrides in `html.dark { }` block.
- Use a `useTheme` hook with: `theme` (light/dark/system), `setTheme`, `mounted`, `isDark`.
- Only render theme-dependent icons after `mounted` is true (prevents hydration mismatch).
- Add `suppressHydrationWarning` to `<html>`.
- Toggle button in both desktop nav and mobile menu.
- Dark palette shifts: backgrounds to near-black, text to near-white, accent to brighter variant for contrast.

## Collapsible Sidebar Navigation

Sidebar nav scales better than top nav for apps with 4+ destinations. The collapse toggle should live **next to the title in the header**, not the footer — users expect it there and the footer is for account/settings actions.

**Implementation:**
- Fixed sidebar on the left, full viewport height. Mobile collapses to a top bar + drawer.
- Two widths: expanded (`240px`) and collapsed icon-only (`72px`).
- Persist collapse state to `localStorage` and sync with a CSS variable on `<html>` so the main content's `padding-left` updates without a re-render:
  ```ts
  document.documentElement.style.setProperty("--app-sidebar-w", collapsed ? "72px" : "240px");
  ```
  Then in the layout: `<main className="md:pl-[var(--app-sidebar-w,240px)] transition-[padding-left]">`.
- Use `useSyncExternalStore` (NOT `useState` + `useEffect`) to read localStorage. The new React lint rules forbid setState-in-effect; useSyncExternalStore is the blessed pattern for external state.
- Collapse toggle: a small chevron button in the header next to the logo, **opacity-0 by default, opacity-100 on header hover** so it doesn't add visual noise. When collapsed, swap to a small floating circle button positioned on the sidebar's right edge (`-right-3 absolute`) so users can always find it.
- Section structure: Logo + collapse toggle → Primary CTA (e.g., "New Search") → Nav links → Footer area (upgrade promo, search button, theme toggle, user menu).
- Active link state: `bg-accent/10 text-accent`.
- Icons stay visible when collapsed; labels hidden via conditional render. Add `title` attributes for tooltips.
- The sidebar IS the primary navigation when collapsed — make sure every reachable destination has an icon, including admin links and any conditional links.

## Row Selection + Bulk Actions

Tables with 50+ rows need bulk actions. The pattern: checkbox column + select-all in the header + floating action bar at the bottom that appears when at least one row is selected.

**Implementation:**
- Add a `32px` checkbox column as the first column. The header checkbox is tristate: unchecked, indeterminate (some selected), checked (all visible selected).
  ```tsx
  <input
    type="checkbox"
    checked={allVisibleSelected}
    ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
    onChange={toggleSelectAll}
  />
  ```
- Track selection in a `Set<string>` of IDs. Selection survives across filtering — the user can filter to "hot leads", select 10, change the filter, and selection is preserved.
- **Row click should still navigate to the detail page.** To avoid the checkbox interfering: render the row as a `<div>` with an absolutely-positioned `<Link className="absolute inset-0">` overlay underneath the cells. The checkbox cell gets `relative z-10` to sit above the link; other cells get `relative pointer-events-none` so clicks fall through to the link.
- Floating action bar: `fixed bottom-6 left-1/2 -translate-x-1/2 z-40`, rounded pill with shadow. Show the count, a vertical divider, then action buttons (Save to list, Mark contacted, Export, etc.), then a clear-selection X button.
- When the sidebar is present, offset the action bar so it's centered over the *content* area, not the viewport: `md:left-[calc(var(--app-sidebar-w,240px)/2+50%)] md:-translate-x-1/2`.
- Bulk actions should fan out via `Promise.allSettled` and report partial failures: "Marked 8, failed 2".
- For the "Save to list" action, open a modal list-picker with an option to create a new list inline.
- Bulk endpoints accept either `businessId` (single) or `businessIds[]` (bulk) via the same route. Use `upsert` with `{ ignoreDuplicates: true }` so re-saving is idempotent.

## Sparklines + Delta Indicators

Stat cards become 10× more useful when they show direction, not just a snapshot. Add `+12 this week` deltas and tiny inline sparklines.

**Implementation:**
- Compute weekly buckets server-side for the sparkline (one number per day, oldest → newest).
- Build a tiny SVG sparkline component (no chart library needed):
  ```tsx
  export function Sparkline({ data, width = 80, height = 24, color = "var(--color-accent)" }) {
    const reactId = useId();
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const stepX = width / (data.length - 1);
    const points = data.map((v, i) => [i * stepX, height - ((v - min) / (max - min || 1)) * height]);
    const pathD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
    const areaD = `${pathD} L${width},${height} L0,${height} Z`;
    const gradId = `sparkline-${reactId.replace(/:/g, "")}`;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  ```
- **Critical:** use `useId()` for the gradient ID, NOT `Math.random()`. React's purity rules forbid impure calls in render and the lint rule will fail the build.
- Delta pill: `<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">+12 this week</span>`
- Show the delta only when it's non-zero — a "+0 this week" pill is depressing.

## Shortcuts Help Overlay

A `?` keyboard shortcut that opens a modal listing every shortcut in the app, grouped by category.

**Implementation:**
- Listen for `?` globally (skip when an input/textarea/contenteditable is focused).
- Modal layout: 2-column grid grouped by category (Navigation, Search & Results, Help).
- Each row: action label on the left, kbd badges on the right.
- Support two-key sequences (`g d` → dashboard, `g l` → lists, `g s` → settings) with a 1000ms timeout between keys.
- The `/` key should focus an in-page `input[data-search-input]` if one exists, otherwise dispatch a synthetic `Cmd+K` event to open the command palette.
- Mount globally next to the command palette so it's available on every page.

## Shadow Hierarchy

Premium / hero cards get elevated shadows. Secondary cards stay flat with borders only. Mixing shadows on every card flattens the visual hierarchy.

**Implementation:**
- Premium card: `shadow-[0_4px_24px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_-12px_rgba(0,0,0,0.4)]`
- Accent/highlight card (e.g. AI output, featured tier): `shadow-[0_8px_32px_-12px_var(--color-accent-3)]`
- Secondary card: `border border-[var(--color-border)]` only, no shadow.
- Custom Tailwind shadow values let you tune the spread without using the default shadow scale, which is too aggressive for dark mode.
- Apply shadows to: the headline stat on the dashboard, the lead/record detail main card, AI-generated output panels, the featured pricing tier. NOT to: list items, secondary stat tiles, filter chips.

## Page Transitions

Marketing pages and app pages need different transition speeds. Marketing can be slow and dramatic; app pages need to feel snappy.

**Implementation:**
- Use Next.js `template.tsx` (NOT `layout.tsx`) so the component re-renders on every navigation.
- Root `app/template.tsx`: longer transition for marketing (`y: 12, duration: 0.4`).
- Group-specific `app/(app)/template.tsx`: snappy fast transition (`y: 4, duration: 0.18`).
  ```tsx
  "use client";
  import { motion } from "motion/react";
  export default function AppTemplate({ children }) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    );
  }
  ```
- The cubic-bezier `[0.22, 1, 0.36, 1]` is the "ease-out-expo" curve — it feels native and decelerates correctly.

## Upgrade Promo Card

Surface upgrade prompts to non-top-tier users from a persistent location (sidebar footer is ideal). Tier-aware: free users see Pro, Pro users see Agency, top-tier users see nothing.

**Implementation:**
- Fetch the user's plan once on mount. Pick a promo config keyed by current plan; return null for the top tier.
- Make it dismissible. Persist dismissal to `localStorage` using `useSyncExternalStore` — NOT setState-in-effect.
- Collapsed sidebar variant: just the icon (`Sparkles`) in an accent-tinted square button.
- Expanded variant: gradient background (`bg-gradient-to-br from-accent-2 to-bg-tertiary`), badge with target tier, headline, body, accent CTA link, dismiss X in the top-right corner.
- Copy should sell the *next* tier's specific gains, not generic "upgrade for more". For free → pro: "Saved lists, CSV export, Lighthouse audits". For pro → agency: "200 searches/mo, 1,000 results each, unlimited AI pitches".

```tsx
const PROMOS = {
  free: { badge: "Pro", title: "Unlock the full pipeline", body: "...", cta: "Upgrade to Pro" },
  pro: { badge: "Agency", title: "Scale with your team", body: "...", cta: "Upgrade to Agency" },
};
// return null for "agency" / top tier
```

## Button Loading States

Every button that triggers an async action MUST show inline feedback. The pattern is consistent across the app.

**Implementation:**
- `disabled={loading}` to prevent double-submits.
- Loading state replaces the button's normal content with `<Loader2 className="w-4 h-4 animate-spin" />`.
- Set a `min-w-[Npx]` on the button so it doesn't collapse when its label gets replaced by the spinner.
- For destructive actions, also disable surrounding cancel buttons during loading.
- Wrap critical actions in toast notifications: `toast.success("Saved")` on success, `toast.error("Failed")` on failure.
- Pattern:
  ```tsx
  <button
    onClick={handleAction}
    disabled={loading}
    className="inline-flex items-center justify-center min-w-[100px] disabled:opacity-50 ..."
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
  </button>
  ```

## React 19 / React Compiler gotchas

The new lint rules ship with React 19 / React Compiler will fail the build for patterns that used to be fine. Cheat sheet:

- **`react-hooks/set-state-in-effect`** — calling `setState` synchronously in a `useEffect` body is forbidden. Fix: use `useSyncExternalStore` for hydration-from-localStorage patterns. For data fetching, the setState calls happen *inside* an async IIFE inside the effect, which is allowed.
- **`react-hooks/purity`** — `Math.random()`, `Date.now()`, etc. cannot be called during render. Use `useId()` for stable per-instance IDs.
- **`react-hooks/preserve-manual-memoization`** — manual `useMemo` / `useCallback` deps must match what the compiler infers. Easiest fix: trust the compiler and remove the manual memoization, or fix the deps to match.
- **`react-hooks/immutability`** — `window.location.hash = ...` style assignments inside render or callbacks trigger this. Move into an effect.

These rules feel strict but they're catching real bugs before they ship.

---

# Archetype → App Chrome Translation

Quick reference for how each marketing archetype maps to admin surfaces:

**Editorial Refined** → Magazine Editorial or Focus Mode dashboard. Split Navigation settings. Asymmetric Editorial auth. Cards replaced with typography hierarchy. Display font for page titles stays huge.

**Luxury Minimal** → Focus Mode or Bento Grid dashboard. Inline Editable settings. Split Screen auth with minimal visual. Massive whitespace even in admin. Slow, deliberate motion.

**Tech Utilitarian** → Command Center or Bento Grid dashboard. Command Palette Driven or Tabbed settings. Split Screen or Centered Classic auth. Dense Linear-style lists. Mono fonts in metadata. Full keyboard shortcuts.

**Organic Natural** → Magazine Editorial or Split Canvas dashboard. Inline Editable settings. Asymmetric Editorial or Split Screen auth. Warm sidebar backgrounds. Hand-drawn accent elements possible. Card List for records.

**Brutalist Raw** → Command Center dashboard. Command Palette Driven settings. Centered Classic auth (brutalist embraces utility). Dense lists. The single neon accent stays. Mono type throughout.

**Retro-Futuristic** → Bento Grid dashboard with CRT-scanline effects allowed. Split Navigation settings. Full-Bleed Background auth with looping video. This is where the marketing archetype can bleed into the admin the most.

**Soft Consumer** → Focus Mode or Split Canvas dashboard. Inline Editable settings. Multi-Step Card auth. Card List for records. Gentle spring motion on drawers. Rounded corners everywhere.

**Maximalist Playful** → Bento Grid dashboard. Tabbed Horizontal settings. Split Screen auth with bold visual. Card Grid for records with bold colors. The archetype's color palette extends into data viz.

---

# Anti-Patterns (Banned in App Chrome)

Beyond the LUXWEB.md anti-slop list, these are specific to app surfaces:

1. **Classic Shell dashboard by default** — must be explicitly chosen
2. **Centered Card settings page by default** — must be explicitly chosen
3. **Default shadcn `<Card>` wrapping everything** — use dividers, typography, and spacing instead when possible
4. **Lucide icons at default weight without committing to a single stroke width**
5. **Default Recharts colors** — always override with archetype-derived palette
6. **Generic "No data" empty states** — always custom with voice and illustration or big type
7. **Spinning circle loaders** — skeleton only
8. **Modals for anything more than confirmations** — use slide-over drawers
9. **Breadcrumbs that start with "Home"** — start with the current section
10. **Sidebar nav items at different heights from each other** — tight consistent rhythm
11. **Form labels above AND placeholders saying the same thing** — pick one
12. **Auth pages without the archetype's display font used somewhere**
13. **Dashboards without at least ONE oversized display-font moment** (big stat, page title, section header)
14. **Settings pages that require scrolling through all sections in one column**
15. **Tables without hover states, sort indicators, or selection behavior defined**
16. **Missing `Cmd+K` command palette when app has 5+ routes**, OR a command palette that only searches static nav items instead of the user's real data
17. **Tables with 50+ rows and no bulk actions** — checkbox column + floating action bar minimum
18. **Stat cards without delta/trend indicators** — a number with no direction is just trivia
19. **Premium / hero cards without elevated shadows** — flat cards everywhere flatten the hierarchy
20. **Buttons that trigger async actions without inline loading state** — every async button must disable + show spinner
21. **Sidebar collapse toggle in the footer** — put it in the header next to the title where users expect it
22. **Generic page titles ("Dashboard", "Settings") in body font at 18px** — must be display font at 32–56px
23. **Using `h-screen` on any app surface** — breaks on iOS. Always `min-h-[100dvh]`.
24. **Data viz with default chart library colors**
25. **Dropdowns without keyboard navigation**

---

*When in doubt: look at Linear, Vercel, Notion, Arc, and Superhuman. Those five products have solved distinctive admin UI better than anyone. If your build looks like the shadcn starter and not like one of those — go back and pick a different layout option.*

---

# v1.1 Additions (July 2026)

## AI Interface Patterns

AI features are now standard app chrome. When a project includes chat, generation, or copilot features, these are the patterns. Server-side setup lives in `BACKEND.md`; the UI rules live here.

### The Non-Negotiables

1. **Always stream.** Never spinner-wait for a complete response. Tokens render as they arrive (`useChat` from `@ai-sdk/react` handles this).
2. **Stop button is mandatory** during generation. Users must be able to cancel.
3. **Empty state = suggested prompts.** 3–4 tappable chips showing what the AI can do, written in the archetype's voice. Never an empty text box with "Ask me anything."
4. **Show activity.** When the AI calls tools or thinks, show it ("Searching invoices…") — silence reads as frozen.
5. **Errors get a retry**, inline, with the failed message preserved.
6. **AI Elements** (`npx ai-elements@latest`) provides shadcn-style prebuilt components for all of this — message threads, prompt inputs, reasoning displays. Restyle them with the archetype tokens like any shadcn component; defaults are a starting point, not a shipping state.

### Chat Surface Layout

```
┌─────────────────────────────────┐
│  Thread header (context/model)  │
├─────────────────────────────────┤
│                                 │
│  Message list                   │
│  - user right or full-width     │
│  - AI left, streaming           │
│  - auto-scroll w/ pause-on-     │
│    scroll-up                    │
│                                 │
├─────────────────────────────────┤
│  [suggested chips when empty]   │
│  ┌───────────────────────────┐  │
│  │ Composer        [Send/Stop]│  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

Composer: auto-growing textarea (max ~6 rows), `Enter` sends, `Shift+Enter` newlines, disabled during streaming with the button swapped to Stop.

```tsx
"use client";
import { useChat } from "@ai-sdk/react";

export function AssistantPanel() {
  const { messages, sendMessage, status, stop } = useChat();
  // status: "ready" | "submitted" | "streaming" | "error"
  // Render messages; show stop() button while streaming.
}
```

### Copilot Side Panel (Apps With an AI Assistant)

The assistant lives in a collapsible right-side panel (360–420px), NOT a floating chat bubble — bubbles are for marketing sites. The panel reads the current app context (selected record, current view) and its suggested prompts change accordingly. Toggle with a keyboard shortcut (`Cmd+.` or `Cmd+/`). On mobile it becomes a full-screen sheet.

### Inline AI Actions

For one-shot generation inside forms and editors ("Draft this email," "Summarize"): button states are idle → generating (subtle pulse + Stop) → review (Accept / Regenerate / Discard). Generated content is ALWAYS visually distinct until accepted (accent-tinted background or border) — never silently inserted as if the user typed it.

---

## Liquid Glass (Apply Sparingly)

The evolved glassmorphism from Apple's 2025 redesign: translucency, light-reactive depth, refined blur. In app chrome it belongs on **floating elements only** — sticky toolbars, command palettes, copilot panels, floating action bars. It is a seasoning, not a wall finish.

```tsx
<div className="sticky top-4 z-10 rounded-2xl border border-white/10
  bg-[var(--bg-secondary)]/60 backdrop-blur-2xl
  shadow-lg shadow-black/20">
  {/* floating toolbar content */}
</div>
```

Rules: never stack glass on glass; text on glass must still pass WCAG 2.2 AA (add a solid fallback via `@supports not (backdrop-filter: blur(1px))`); respect `prefers-reduced-transparency` by swapping to solid surfaces; strongest fit is Luxury Minimal, Soft Consumer, and dark Tech Utilitarian — skip it entirely for Brutalist and Editorial.

---

## URL State With nuqs

This module mandates URL-synced tabs and filters. `nuqs` makes that a typed one-liner instead of hand-rolled `useSearchParams` plumbing:

```tsx
"use client";
import { useQueryState, parseAsString } from "nuqs";

const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("profile"));
// /settings?tab=billing — shareable, back-button-safe, SSR-friendly
```

Use for: settings tabs, table filters/sort/pagination, master-detail selection, dashboard date ranges. If the state should survive a refresh or be shareable, it belongs in the URL via nuqs — not useState.

---

## Base UI Note (shadcn's New Default)

shadcn/ui now initializes on **Base UI** primitives (built by the original Radix team at MUI; actively maintained). Practical wins for app chrome: **Combobox, Autocomplete, and multi-select are first-class components now** — stop hand-rolling them from Popover + Input. The shadcn abstraction is unchanged (`@/components/ui/*` imports work identically), so all patterns in this module apply as-is.
