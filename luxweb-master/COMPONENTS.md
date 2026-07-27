# LuxWeb Module: Components & Sections

> **Read when**: Building page sections, navigation, footers, cards, buttons, or any UI components. Contains patterns, rules, and templates.

---

## Section Architecture

Every section follows this wrapper pattern. Adjust padding and max-width based on VISUAL_DENSITY (see `LUXWEB.md`).

```tsx
<section className="relative py-32 md:py-48 overflow-hidden">
  <div className="mx-auto max-w-7xl px-6 md:px-8">
    {/* Content */}
  </div>
</section>
```

### Section Background Patterns

| Style | When to Use | Implementation |
|-------|-------------|---------------|
| Solid | Default, most sections | `bg-[var(--bg-primary)]` or `bg-[var(--bg-secondary)]` |
| Alternating | Adjacent sections need separation | Alternate `--bg-primary` and `--bg-secondary`. No borders or gaps between. |
| Transparent | 3D scene should bleed through | `bg-transparent` or `bg-[var(--bg-primary)]/80 backdrop-blur-sm` |
| Gradient overlay | Decorative accent glow | Add a large, blurred, low-opacity circle of accent color as a positioned child |

**Accent glow pattern:**

```tsx
<div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--accent)] opacity-[0.04] rounded-full blur-[120px] pointer-events-none" />
```

---

## Navigation

### Rules

- Fixed or sticky. `backdrop-blur-xl` always.
- Transparent over hero. Gains `bg-[var(--bg-primary)]/80` background on scroll.
- Max height: 64px desktop, 56px mobile.
- Logo left. Links center or right. One CTA button far right.
- Mobile: full-screen overlay with staggered link entrance animation (see `MOTION.md`).
- NEVER: hamburger menu on desktop. Dropdown menus on the homepage.
- `z-50` always.

### Desktop Pattern

```tsx
<nav className="fixed top-0 w-full z-50 transition-all duration-300"
  style={{
    backgroundColor: scrolled ? "rgba(10,10,10,0.8)" : "transparent",
    backdropFilter: scrolled ? "blur(20px)" : "none",
  }}
>
  <div className="mx-auto max-w-7xl px-6 md:px-8 h-16 flex items-center justify-between">
    {/* Logo */}
    <a href="/" className="font-display text-xl font-bold tracking-tight">
      BRAND
    </a>

    {/* Center Links */}
    <div className="hidden md:flex items-center gap-8">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-300 relative group"
        >
          {link.label}
          <span className="absolute -bottom-1 left-0 w-0 h-px bg-[var(--accent)] transition-all duration-300 group-hover:w-full" />
        </a>
      ))}
    </div>

    {/* CTA */}
    <a href="#contact" className="hidden md:inline-flex text-sm border border-[var(--border)] px-5 py-2.5 rounded-full hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-white transition-all duration-300">
      Get in touch
    </a>

    {/* Mobile Toggle */}
    <button className="md:hidden" aria-label="Open menu">
      {/* Animated hamburger icon */}
    </button>
  </div>
</nav>
```

### Mobile Menu Pattern

Full-screen overlay. Links animate in with stagger.

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-8"
    >
      {links.map((link, i) => (
        <motion.a
          key={link.href}
          href={link.href}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="text-3xl font-display font-bold"
          onClick={() => setIsOpen(false)}
        >
          {link.label}
        </motion.a>
      ))}
    </motion.div>
  )}
</AnimatePresence>
```

---

## Hero Section

### Variants by DESIGN_VARIANCE

**Variance 1–3: Centered Classic**

```
┌─────────────────────────┐
│                         │
│       [Label]           │
│    HUGE HEADLINE        │
│    Subheadline text     │
│       [CTA]             │
│                         │
│     [Product Image]     │
│                         │
│      ↓ Scroll           │
└─────────────────────────┘
```

**Variance 4–6: Split Screen**

```
┌─────────────────────────┐
│                         │
│  [Label]       [Image/  │
│  HEADLINE       Video/  │
│  Subtext        3D      │
│  [CTA]         Scene]   │
│                         │
└─────────────────────────┘
```

**Variance 7–10: Asymmetric / Editorial**

```
┌─────────────────────────┐
│                         │
│        MASSIVE          │
│           HEADLINE      │
│    spanning             │
│         the grid        │
│                         │
│  [CTA]    [Subtext      │
│            pushed right] │
│                         │
└─────────────────────────┘
```

### Hero Rules

- `min-h-[100dvh]` (NOT `min-h-screen` — breaks on iOS Safari).
- Maximum 1–2 lines of headline text at hero scale.
- One primary CTA. Optional secondary CTA.
- Scroll indicator at bottom (animated arrow/chevron, infinite yoyo).
- If using a background image/video, add a gradient overlay for text contrast.
- Hero content must be readable within 3 seconds of page load.

---

## Feature / Service Cards

### Card Rules

- 1px border at `var(--border)`.
- Background: `var(--bg-secondary)` or `var(--bg-tertiary)`.
- Hover: border shifts toward accent, subtle lift, optional glow.
- Padding: `p-6` minimum, `p-8` preferred.
- Border-radius: consistent with buttons across the project.
- When VISUAL_DENSITY ≤ 3: consider dropping the card container entirely. Use spacing and typography alone to group content. Cards are not always necessary.

### Standard Card

```tsx
<div className="group relative p-8 border border-[var(--border)] rounded-2xl bg-[var(--bg-secondary)] hover:border-[var(--accent)]/30 transition-all duration-500">
  <span className="text-xs font-mono text-[var(--accent)] mb-4 block">01</span>
  <h3 className="font-display text-2xl font-semibold mb-3">Card Title</h3>
  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
    Description text goes here. Keep it concise.
  </p>
  <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
    <ArrowRight className="w-5 h-5 text-[var(--accent)]" />
  </div>
</div>
```

### Grid Layout by DESIGN_VARIANCE

| Variance | Layout |
|----------|--------|
| 1–3 | `grid-cols-1 md:grid-cols-3 gap-6` (equal columns) |
| 4–6 | `grid-cols-1 md:grid-cols-3 gap-6` with one featured card spanning 2 columns |
| 7–10 | Masonry-style or staggered grid. Variable card heights. Overlapping elements. |

---

## Showcase / Portfolio Section

### Single Project Showcase

Asymmetric 7/5 or 8/4 grid. Image on the wider side, text on the narrow side.

```tsx
<div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
  {/* Image — 7 columns */}
  <div className="md:col-span-7 overflow-hidden rounded-2xl">
    <Image
      src="/images/project.webp"
      width={1200}
      height={900}
      alt="Project name"
      className="w-full h-auto object-cover"
    />
  </div>

  {/* Text — 5 columns */}
  <div className="md:col-span-5">
    <span className="text-xs uppercase tracking-[0.15em] text-[var(--accent)] mb-3 block">
      Featured Project
    </span>
    <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4">
      Project Name
    </h2>
    <p className="text-[var(--text-secondary)] leading-relaxed mb-6">
      Brief project description. What was built, the impact, tech used.
    </p>
    <a href="#" className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:gap-3 transition-all duration-300">
      View case study <ArrowRight className="w-4 h-4" />
    </a>
  </div>
</div>
```

Alternate image left/right on consecutive showcases.

### Portfolio Grid

For displaying multiple projects:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {projects.map((project) => (
    <a key={project.id} href={project.href} className="group relative overflow-hidden rounded-2xl aspect-[16/10]">
      <Image
        src={project.image}
        fill
        alt={project.title}
        className="object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-6 left-6">
        <span className="text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-1 block">
          {project.category}
        </span>
        <h3 className="text-xl font-display font-semibold text-white">
          {project.title}
        </h3>
      </div>
    </a>
  ))}
</div>
```

---

## CTA Section

Centered, large headline, accent-colored keyword, prominent button.

```tsx
<section className="relative py-32 md:py-48">
  {/* Optional accent gradient */}
  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--accent)]/5 to-transparent pointer-events-none" />

  <div className="relative max-w-4xl mx-auto text-center px-6">
    <h2 className="font-display text-4xl md:text-7xl font-bold tracking-tight mb-6">
      Ready to build<br />
      <span className="text-[var(--accent)]">something great?</span>
    </h2>
    <p className="text-[var(--text-secondary)] text-lg mb-10 max-w-xl mx-auto">
      Supporting text. Keep it to 1–2 sentences max.
    </p>
    <a href="#contact" className="group inline-flex items-center gap-3 bg-[var(--accent)] text-white px-10 py-5 rounded-full text-base font-medium hover:bg-[var(--accent-hover)] transition-all duration-300 hover:scale-[1.03]">
      Start a project
      <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
    </a>
  </div>
</section>
```

---

## Buttons

### Primary

```tsx
<button className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[var(--accent-hover)] transition-all duration-300 hover:scale-[1.03] hover:shadow-lg">
  Label
  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
</button>
```

### Secondary (Ghost)

```tsx
<button className="inline-flex items-center gap-2 border border-[var(--border)] text-[var(--text-primary)] px-8 py-3.5 rounded-full text-sm font-medium hover:bg-[var(--accent)] hover:border-[var(--accent)] hover:text-white transition-all duration-300">
  Label
</button>
```

### Text Link CTA (Apple Style)

```tsx
<a href="#" className="text-lg text-[var(--accent)] hover:underline inline-flex items-center gap-1">
  Learn more ›
</a>
```

### Rules

- Min height: 48px (touch target).
- `px-8 py-3` minimum padding.
- Commit to ONE border-radius for the project: fully rounded (`rounded-full`) OR subtle (`rounded-lg`). Never mix.
- Arrow icon shifts right on hover.
- `transition-all duration-300` on every button. Always.

---

## Footer

### Minimal Footer (Marketing / Portfolio)

```tsx
<footer className="border-t border-[var(--border)] py-16 px-6 md:px-8">
  <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
    <span className="font-display text-lg font-bold tracking-tight">BRAND</span>
    <div className="flex gap-6 text-sm text-[var(--text-secondary)]">
      <a href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">Privacy</a>
      <a href="/terms" className="hover:text-[var(--text-primary)] transition-colors">Terms</a>
    </div>
    <p className="text-sm text-[var(--text-secondary)]">
      © {new Date().getFullYear()} Brand. All rights reserved.
    </p>
  </div>
</footer>
```

### Full Footer (Business / SaaS)

Multi-column link grid:

```tsx
<footer className="border-t border-[var(--border)] pt-16 pb-8 px-6 md:px-8">
  <div className="max-w-7xl mx-auto">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
      {footerSections.map((section) => (
        <div key={section.title}>
          <h4 className="text-sm font-semibold mb-4">{section.title}</h4>
          <ul className="space-y-3">
            {section.links.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    <div className="border-t border-[var(--border)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
      <span className="font-display font-bold">BRAND</span>
      <p className="text-xs text-[var(--text-secondary)]">
        © {new Date().getFullYear()} Brand. All rights reserved.
      </p>
    </div>
  </div>
</footer>
```

### Footer Rules

- ALWAYS include privacy policy and terms links.
- No newsletter signup forms in the footer (put those in a dedicated CTA section).
- Footer is functional, not decorative. No heavy animation.
- Text entrance animation: simple fade-up on scroll trigger, if any.

---

## Required States (Every Dynamic Component)

### Loading

Use skeleton loaders that match the layout shape. NEVER use a generic circular spinner.

```tsx
<div className="animate-pulse space-y-4">
  <div className="h-8 w-3/4 bg-[var(--bg-tertiary)] rounded-lg" />
  <div className="h-4 w-full bg-[var(--bg-tertiary)] rounded" />
  <div className="h-4 w-5/6 bg-[var(--bg-tertiary)] rounded" />
</div>
```

### Empty

Never show a blank page. Design an empty state with an illustration or icon, a message, and a CTA.

```tsx
<div className="text-center py-20">
  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
    <FolderOpen className="w-8 h-8 text-[var(--text-dim)]" />
  </div>
  <h3 className="text-lg font-display font-semibold mb-2">No projects yet</h3>
  <p className="text-sm text-[var(--text-secondary)] mb-6">Start by adding your first project.</p>
  <button className="btn-primary">Add project</button>
</div>
```

### Error

```tsx
<div className="text-center py-20">
  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
    <AlertCircle className="w-8 h-8 text-red-400" />
  </div>
  <h3 className="text-lg font-display font-semibold mb-2">Something went wrong</h3>
  <p className="text-sm text-[var(--text-secondary)] mb-6">We couldn't load this content. Please try again.</p>
  <button onClick={retry} className="btn-secondary">Retry</button>
</div>
```

---

## 404 Page (MANDATORY)

Every project must have a custom 404. Place at `src/app/not-found.tsx`:

```tsx
export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center text-center px-6">
      <h1 className="font-display text-8xl font-bold text-[var(--accent)] mb-4">404</h1>
      <p className="text-lg text-[var(--text-secondary)] mb-8">
        This page doesn't exist.
      </p>
      <a href="/" className="btn-primary">Back to home</a>
    </div>
  );
}
```
