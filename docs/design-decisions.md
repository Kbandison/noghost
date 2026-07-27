# Design decisions

Both LuxWeb gates are closed. These are locked — treat a change as a spec
revision, not a preference.

---

## Gate 1 — Archetype (marketing)

**Editorial Refined → Warm Serif Magazine**

| | |
|---|---|
| Fonts | Fraunces (display, variable — `SOFT`/`WONK`/`opsz`) + DM Sans (body) |
| Palette | cream `#FAF7F2` · ink `#1A1815` · ochre `#B8741A` · sage `#8B9D83` |
| Dials | VARIANCE 4 · MOTION 4 · DENSITY 3 · DARK 0 |
| Imagery | 35mm film, editorial, natural light, muted tones, documentary framing |

**Why, over Soft Consumer** — which is where ARCHETYPES.md files dating apps:
Soft Consumer is where every dating app already lives, and this product's whole
argument is that it is not those apps. Editorial also matches the spec's own
phrasing (§7.1: "warm-human-editorial territory"), and it makes a structural
claim rather than a decorative one — profiles are writing to be read properly,
which is exactly what the drop mechanic demands. There is no like button, so
the design should not look like there could be.

### Contrast constraints (computed, not estimated)

Ochre is **3.54:1** on cream — fine as a fill or large accent, **not** for body
text. The palette therefore carries two ochres:

- `--accent` `#B8741A` — fills, rules, large type
- `--accent-text` `#8A5412` — links and accent body copy (5.85:1)
- Text on an ochre fill is **ink**, not cream (4.68:1)

Sage is 2.71:1 and is decorative only; `--sage-text` `#5F7057` (4.99:1) is the
readable one.

### The hand-made element

LUXWEB anti-slop #42 requires one human touch per project. Here it is the ghost
mark and the hero underline in `components/ui/ghost.tsx` — both hand-drawn with
deliberately uneven curves and a bottom wave that doesn't repeat.

---

## Gate 2 — App layouts

MOTION drops to 2–4 (functional only: 150–200ms transitions, skeleton pulses,
drawer slides). DENSITY rises to 6–9. Fonts, accent, neutral scale, radius
discipline and microcopy voice all carry over unchanged.

### Application funnel → Asymmetric Editorial + stepped form

A large Fraunces statement holds the left and changes per step; the form panel
sits lower-right and slides/resizes between steps. Gets the archetype fit of
Asymmetric Editorial with the ergonomics of Multi-Step Card, which is what a
five-step funnel actually needs.

### Member app → Focus Mode, with Split Canvas for Inbox and Chats

Tonight is Focus Mode: one profile fills the view. The drop's entire argument is
that you read three people properly, so a grid of cards would contradict the
product — a rail of thumbnails is the swiping mindset in a different shape.

Inbox and Chats are Split Canvas on desktop (list + detail), tabs on mobile.
That is the honest shape of both surfaces.

### Admin → Split Canvas, with dense sections for cohort health

Admissions is the daily job and §7.3 already describes it as list-and-detail:
application beside selfie beside profile photos. Cohort health is
divider-separated dense sections with monospace numerals, not stat cards —
§7.3 calls it the Season Two design input, so it needs to read as an instrument.

---

## Where creativity lives in app chrome

APP.md requires at least four of eight. Committed:

1. **Page titles in Fraunces at real size** (36–56px). "Tonight" at 48px reads
   as designed; the same word at 18px reads as a starter template.
2. **The nav is the brand moment** — cream ground, ochre active state, ink type.
3. **Empty states carry the §9.6 copy verbatim.** These are not placeholders:
   "A quiet night. We won't pad your drop with weak matches — that's a promise,
   not a bug" is the product arguing for itself. Never replace with "No results."
4. **Functional motion in the accent** — skeletons pulse in ochre; the fuse ring
   animates its own colour transition rather than snapping.
5. **Iconography** — Phosphor at one stroke weight, not Lucide. Lucide is
   identical across every AI-generated admin.
6. **One decorative moment per page**, and on the member app it is almost always
   the fuse ring.
