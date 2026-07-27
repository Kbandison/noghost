# LuxWeb Module: Design Archetypes

> **v1.1 — July 2026.** New 2026 Trend Layer appended: Liquid Glass, kinetic/variable typography, and the hand-made anti-AI-polish counter-current, with per-archetype fit rules.

> **Read when**: Starting any new build. This file contains the 8 design archetypes and 24 variations that replace the LuxWeb defaults with specific, opinionated creative directions.

---

## Mandatory Selection Protocol

**Claude Code MUST follow this protocol before writing any code for a new project:**

1. **Present the 8 archetypes** with full descriptions (use the "Presentation Format" below for each).
2. **Wait for the user to pick ONE archetype.** Do not proceed without a selection.
3. **Present the 3 variations** of the chosen archetype with their full differentiators.
4. **Wait for the user to pick ONE variation.** Do not proceed without a selection.
5. **Apply the complete spec** (fonts, colors, dials, image style, motion character) throughout the build. No substitutions. No defaults.

**Claude Code may skip selection ONLY if the user explicitly names an archetype+variation in their initial prompt** (e.g., "build this with Tech Utilitarian / Light Clinical").

---

## Presentation Format

When presenting archetypes to the user, use this structure for EACH option so the user has enough context to decide without having to imagine the outcome:

```
[NUMBER]. [NAME] — [TAGLINE]
What it is: [2-sentence description]
Best for: [project types with specific examples]
Reference sites: [3-5 real sites]
Feels: [3-5 mood descriptors]
Why it works: [1-2 sentences teaching the principle]
```

When presenting variations, use this structure:

```
[LETTER]. [VARIATION NAME] — [MOOD]
Fonts: [specific pairing]
Palette: [3-4 hex values with names]
Dials: VARIANCE [n] / MOTION [n] / DENSITY [n] / DARK [0 or 1]
Image direction: [1-2 sentences]
Pick this when: [specific scenario]
```

---

# THE 8 ARCHETYPES

## 1. EDITORIAL REFINED — "Content is the main character. Typography does the storytelling."

**What it is:** A design language borrowed from print journalism and literary magazines. Generous whitespace, confident typography, minimal decoration. The reader is assumed to be intelligent, and the design trusts them.

**Best for:** Publications, archives, research platforms, thought leadership, longform content, cultural institutions, newsletters, academic work. *Reparation Road and Truth Independent live here.*

**Reference sites:** The Atlantic, The New York Times, Aeon, Dirt, Pitchfork, Are.na, The New Yorker.

**Feels:** Trustworthy, literary, sophisticated, serious without being cold, timeless.

**Why it works:** When content matters more than the container, design gets out of the way. Editorial design assumes quality writing and photography can carry the page — the typographer's job is just to honor that content with space, hierarchy, and rhythm.

### Variations

**A. Warm Serif Magazine** — Timeless, literary, trustworthy
- **Fonts:** Fraunces (display) + DM Sans (body). Alternative: Instrument Serif + Inter.
- **Palette:** Cream `#FAF7F2`, deep ink `#1A1815`, ochre accent `#B8741A`, muted sage `#8B9D83`
- **Dials:** VARIANCE 4 / MOTION 4 / DENSITY 3 / DARK 0
- **Image direction:** Black and white photography, grainy film aesthetic, warm natural light, documentary framing. Prompt template: *"35mm film photography, editorial, natural lighting, muted tones, documentary composition."*
- **Pick this when:** Content is text-heavy, audience skews literary/educated, trust and permanence matter.

**B. Cool Minimal Sans** — Modern, clean, intellectual
- **Fonts:** Instrument Sans (display) + Inter Tight (body). Alternative: Söhne + Untitled Sans.
- **Palette:** Off-white `#F8F8F8`, near-black `#0A0A0A`, single muted accent `#4A5568`
- **Dials:** VARIANCE 5 / MOTION 3 / DENSITY 4 / DARK 0
- **Image direction:** Crisp architectural photography, high-contrast black and white, geometric subjects, clean backgrounds. Prompt template: *"high contrast architectural photography, minimal composition, clean lighting, geometric subject."*
- **Pick this when:** Modern publication, tech journalism, design content, younger educated audience.

**C. Documentary Photo-Forward** — Immersive, journalistic, visceral
- **Fonts:** Canela (display) + Söhne (body). Alternative: Tiempos Headline + Inter.
- **Palette:** Deep charcoal `#141414`, warm white `#F5F1EA`, amber `#D4A574`, blood red `#8B2D2D`
- **Dials:** VARIANCE 6 / MOTION 5 / DENSITY 3 / DARK 1
- **Image direction:** Full-bleed photojournalism, strong emotional subjects, golden hour light, natural grain. Prompt template: *"photojournalism, documentary style, golden hour, strong human emotion, film grain, wide composition."*
- **Pick this when:** Imagery carries the weight, cause-driven content, historical or cultural narratives. *Reparation Road leans strongly here.*

---

## 2. LUXURY MINIMAL — "Restraint is the luxury. Everything earned, nothing added."

**What it is:** Design that communicates through what it omits. Massive whitespace, single accent color, one perfect font, slow deliberate motion, zero decoration. Every element has been considered and approved.

**Best for:** Premium brands, HNWI services, boutique agencies, high-end products, exclusive memberships, wealth management, private clubs. *The HNWI members club platform lives here.*

**Reference sites:** Aesop, Byredo, Hermès, Rolls-Royce, Patek Philippe, Rimowa, Le Labo.

**Feels:** Austere, confident, timeless, exclusive, unhurried.

**Why it works:** Cheap brands shout. Expensive brands whisper. Luxury design signals value by refusing to try too hard — the absence of decoration becomes the decoration itself. This only works when every remaining element is perfect, because there's nothing to hide behind.

### Variations

**A. Monochrome Elegant** — Austere, confident, timeless
- **Fonts:** Söhne (display and body). Alternative: Neue Haas Grotesk, or Graphik.
- **Palette:** Pure white `#FFFFFF`, deep black `#1A1A1A`, mid-gray accent `#767676`, subtle beige `#F5F3EF`
- **Dials:** VARIANCE 3 / MOTION 3 / DENSITY 2 / DARK 0
- **Image direction:** Studio photography, single subject, seamless backgrounds, perfect lighting. Prompt template: *"studio photography, seamless white background, single product, soft diffused lighting, minimalist."*
- **Pick this when:** Product-focused luxury, established heritage brands, fashion, watches, jewelry.

**B. Warm Luxury** — Opulent, refined, hospitable
- **Fonts:** Canela (display) + Tenor Sans (body). Alternative: Romana + Proxima Nova.
- **Palette:** Warm cream `#F7F3EC`, deep brown `#2A1F14`, brass `#B8924A`, burgundy `#4A1A1A`
- **Dials:** VARIANCE 4 / MOTION 4 / DENSITY 2 / DARK 0
- **Image direction:** Warm natural light, textured materials (linen, leather, wood), lifestyle photography with rich tones. Prompt template: *"warm natural light, textured materials, golden hour interiors, linen and wood, editorial lifestyle."*
- **Pick this when:** Hospitality, boutique hotels, artisan goods, traditional luxury with warmth.

**C. Dark Premium** — Exclusive, mysterious, powerful
- **Fonts:** Canela Deck (display) + Söhne (body). Alternative: Ogg + Inter.
- **Palette:** Near-black `#0A0A0A`, warm white `#E8E4DC`, antique gold `#A08449`, deep wine `#2A0F14`
- **Dials:** VARIANCE 5 / MOTION 5 / DENSITY 2 / DARK 1
- **Image direction:** Low-key lighting, dramatic shadows, luxe materials, cinematic composition. Prompt template: *"cinematic lighting, dramatic shadows, luxury product photography, dark background, moody."*
- **Pick this when:** Private clubs, exclusive services, high-end spirits/fragrance, wealth management. *HNWI networking platforms live here.*

---

## 3. TECH UTILITARIAN — "Function is the form. Every pixel serves a purpose."

**What it is:** Design borrowed from Swiss modernism and developer tools. Grid discipline, monospace accents, data-forward layouts, flat surfaces. It signals "we respect your time and intelligence."

**Best for:** SaaS tools, developer products, fintech, admin panels, data platforms, technical documentation, B2B products. *LuxWeb CRM, LiveCost, and Truth Independent's admin tools live here.*

**Reference sites:** Linear, Vercel, Stripe, Railway, Resend, Raycast, Cursor, Warp.

**Feels:** Precise, competent, modern, technical, no-nonsense.

**Why it works:** Technical users trust tools that respect their attention. Utilitarian design communicates competence through restraint and structure — there's no visual noise because the product itself is the value proposition.

### Variations

**A. Dark Terminal** — Technical, precise, developer-native
- **Fonts:** JetBrains Mono or IBM Plex Mono (accents) + Inter or Geist (body)
- **Palette:** Near-black `#0A0A0A`, terminal green `#4ADE80` OR electric cyan `#00D9FF`, mid-gray `#888888`
- **Dials:** VARIANCE 5 / MOTION 5 / DENSITY 7 / DARK 1
- **Image direction:** UI screenshots, code snippets, dashboard mockups, terminal windows, technical diagrams. Avoid photography of people. Prompt template: *"UI dashboard dark mode, data visualization, minimal interface, technical diagram."*
- **Pick this when:** Developer tools, CLI products, infrastructure, technical audiences.

**B. Light Clinical** — Precise, trustworthy, professional
- **Fonts:** Geist (display) + Geist Mono (accents) + Inter Tight (body)
- **Palette:** Near-white `#FAFAFA`, deep charcoal `#1A1A1A`, strong blue `#0066FF`, subtle borders `#E5E5E5`
- **Dials:** VARIANCE 4 / MOTION 4 / DENSITY 6 / DARK 0
- **Image direction:** Clean product UI, abstract geometric illustrations, 3D renders on neutral backgrounds, infographics. Prompt template: *"clean product UI, minimal 3D render, isometric illustration, white background, geometric."*
- **Pick this when:** B2B SaaS, fintech, enterprise tools, compliance-facing products. *LuxWeb CRM lives here.*

**C. Data-Dense Dashboard** — Information-rich, powerful, command-center
- **Fonts:** Inter (body) + JetBrains Mono (numbers/data) + Instrument Sans (display)
- **Palette:** Deep navy `#0A0E1A`, signal white `#F0F4FF`, status colors (green `#10B981`, amber `#F59E0B`, red `#EF4444`), violet accent `#8B5CF6`
- **Dials:** VARIANCE 5 / MOTION 4 / DENSITY 9 / DARK 1
- **Image direction:** Charts, graphs, data visualizations, maps, flow diagrams. Minimal photography. Prompt template: *"data visualization, dashboard UI, charts and graphs, dark theme, technical diagram."*
- **Pick this when:** Analytics platforms, trading tools, monitoring dashboards, command-center interfaces. *LiveCost leans here.*

---

## 4. ORGANIC NATURAL — "From the earth. Warmth you can feel through the screen."

**What it is:** A rejection of the digital-native look. Earth tones, warm photography, textured backgrounds, hand-drawn touches. When a brand sells something you touch, eat, grow, or experience outdoors, the website should feel like those things.

**Best for:** Local services, wellness, food & beverage, outdoor brands, sustainable products, craft businesses, agricultural services, small hospitality. *Apex Lawn & Landscape lives here.*

**Reference sites:** Ilia Beauty, Our Place, Graza, Ghia, Great Jones, Sunday Riley.

**Feels:** Warm, authentic, grounded, handcrafted, alive.

**Why it works:** Digital design often feels sterile because the web is a cold medium — backlit glass, sharp pixels. Organic design fights that by importing visual cues from physical craft: texture, imperfection, warmth, natural light. It signals "we exist in the real world."

### Variations

**A. Earthy Artisan** — Handcrafted, warm, authentic
- **Fonts:** Recoleta (display) + Inter (body). Alternative: Marcellus + Nunito Sans.
- **Palette:** Warm off-white `#F5EFE4`, terracotta `#C9572D`, olive `#7A8450`, deep brown `#3A2817`
- **Dials:** VARIANCE 5 / MOTION 4 / DENSITY 4 / DARK 0
- **Image direction:** Natural light photography, hands at work, raw ingredients, textured materials, golden hour, slightly imperfect framing. Prompt template: *"natural light, hands crafting, raw materials, warm tones, authentic lifestyle, slight film grain."*
- **Pick this when:** Craft food, pottery, woodworking, farm-to-table, small artisan businesses.

**B. Botanical Fresh** — Clean, growing, vibrant
- **Fonts:** Fraunces (display) + DM Sans (body). Alternative: Playfair Display + Lato.
- **Palette:** Soft cream `#FBF9F4`, forest green `#2D5016`, sage `#8DA78F`, coral pop `#E87461`
- **Dials:** VARIANCE 5 / MOTION 5 / DENSITY 4 / DARK 0
- **Image direction:** Overhead plants, fresh produce, bright natural light, greenery, outdoor spaces. Prompt template: *"fresh botanical overhead shot, bright natural light, green plants, minimal wood surfaces."*
- **Pick this when:** Wellness, skincare, gardening, plant-based food, outdoor services. *Apex Lawn leans here.*

**C. Rustic Premium** — Heritage, confident, grounded
- **Fonts:** Austin (display) + Söhne (body). Alternative: Tiempos + GT America.
- **Palette:** Weathered cream `#EDE7DB`, deep forest `#1F3321`, rust `#A5452B`, charcoal `#2A2520`
- **Dials:** VARIANCE 5 / MOTION 5 / DENSITY 3 / DARK 0
- **Image direction:** Cinematic outdoor photography, weathered textures, muted earth tones, wide landscapes. Prompt template: *"cinematic outdoor photography, muted earth tones, weathered materials, wide landscapes, overcast lighting."*
- **Pick this when:** Outdoor gear, heritage food brands, craft beverages, established local services wanting a premium feel.

---

## 5. BRUTALIST RAW — "The grid is exposed. The design is the statement."

**What it is:** Design that rejects polish in favor of honesty. Exposed structure, raw type as imagery, broken grids, aggressive contrast. It signals creative confidence by refusing to play the premium-SaaS game.

**Best for:** Creative agencies, design portfolios, experimental brands, art galleries, music/fashion labels, rebellious startups, editorial experiments.

**Reference sites:** Balenciaga, Bloomberg Businessweek, Gucci Equilibrium, Read.cv, Are.na, Off-White.

**Feels:** Raw, confident, confrontational, unapologetic, avant-garde.

**Why it works:** When everyone else is trying to look expensive and safe, brutalism signals creative authority by looking deliberately unpolished. It works because the ugliness is obviously intentional — which takes more confidence than hiding behind conventional beauty.

### Variations

**A. Mono Brutalist** — Raw, confident, unapologetic
- **Fonts:** JetBrains Mono OR IBM Plex Mono for everything (yes, even headlines).
- **Palette:** Pure white `#FFFFFF`, pure black `#000000`, ONE neon accent (lime `#CCFF00` OR hot pink `#FF006E` OR safety orange `#FF6600`)
- **Dials:** VARIANCE 9 / MOTION 6 / DENSITY 6 / DARK 0
- **Image direction:** Raw screenshots, documentary photography, high-contrast black and white, photocopied textures. Prompt template: *"high contrast black and white, photocopied texture, raw documentary, brutalist composition."*
- **Pick this when:** Design studios, experimental portfolios, tech-forward anti-establishment brands.

**B. Swiss Brutalist** — Disciplined, confrontational, graphic
- **Fonts:** Neue Haas Grotesk OR Akzidenz-Grotesk (display, oversized) + Inter (body)
- **Palette:** Off-white `#F4F4F4`, jet black `#000000`, single bold accent (blood red `#DC2626` OR electric blue `#2563EB`)
- **Dials:** VARIANCE 8 / MOTION 5 / DENSITY 5 / DARK 0
- **Image direction:** Large format photography with bold overlays, grid-based composition, text overlapping images. Prompt template: *"swiss design photography, bold composition, high contrast, magazine editorial, oversized typography."*
- **Pick this when:** Agencies with a strong point of view, fashion brands, cultural institutions.

**C. Digital Brutalist** — Chaotic, web-native, nostalgic
- **Fonts:** Space Grotesk OR Space Mono (display) + system-ui (body, as a statement)
- **Palette:** Acid green `#AFFF00`, hot magenta `#FF00FF`, cyan `#00FFFF`, pure black backgrounds
- **Dials:** VARIANCE 10 / MOTION 8 / DENSITY 7 / DARK 1
- **Image direction:** Glitch art, pixel art, CRT effects, broken UI screenshots, 90s web nostalgia. Prompt template: *"glitch art, CRT monitor, pixelated, 90s web aesthetic, chromatic aberration."*
- **Pick this when:** Gaming, experimental music, Web3, internet culture brands.

---

## 6. RETRO-FUTURISTIC — "The future as we used to imagine it."

**What it is:** Design that leverages collective nostalgia for eras when the future felt exciting — 80s synthwave, Y2K optimism, 70s sci-fi. Bold accent colors, chrome, grid patterns, motion that feels analog even when digital.

**Best for:** Entertainment, gaming, crypto/Web3, bold consumer brands, music, event promotion, nightlife, anything that benefits from a visceral emotional hit.

**Reference sites:** Diablo IV promotional sites, Stranger Things marketing, Cyberpunk 2077 marketing, Spotify Wrapped, crypto launchpad sites.

**Feels:** Nostalgic, bold, cinematic, emotionally loud, exciting.

**Why it works:** Retro-futurism bypasses rational evaluation and hits nostalgia directly. People who grew up on 80s sci-fi or Y2K optimism have emotional associations baked in — the design borrows that existing emotional weight rather than having to build it from scratch.

### Variations

**A. Synthwave Neon** — Bold, nostalgic, cinematic
- **Fonts:** Monument Extended (display) + Inter (body). Alternative: Unbounded + Space Grotesk.
- **Palette:** Deep purple-black `#0D0221`, hot pink `#FF006E`, electric cyan `#00F5FF`, magenta `#D900FF`
- **Dials:** VARIANCE 7 / MOTION 9 / DENSITY 5 / DARK 1
- **Image direction:** Gradient skies, grid floors, chrome objects, 80s sports cars, palm trees, sunset horizons. Prompt template: *"synthwave, neon grid, sunset sky, chrome, retrofuturistic 80s, cinematic."*
- **Pick this when:** Gaming, nightlife, retro tech, music festivals, anything needing instant 80s mood.

**B. Chrome Y2K** — Futuristic-optimistic, slick, maximalist
- **Fonts:** Druk Wide (display) + Space Grotesk (body). Alternative: PP Neue Machina + Inter.
- **Palette:** Chrome silver gradients, electric blue `#0066FF`, white `#FFFFFF`, black `#000000`, holographic accents
- **Dials:** VARIANCE 8 / MOTION 9 / DENSITY 6 / DARK 0 or 1
- **Image direction:** 3D chrome objects, holographic textures, Y2K optimism, blob shapes, iridescent materials. Prompt template: *"chrome 3D render, holographic, Y2K aesthetic, iridescent, futuristic optimism."*
- **Pick this when:** Web3 projects, futuristic products, music/entertainment, brands selling "the future is now."

**C. Vaporwave Pastel** — Dreamy, surreal, aesthetic
- **Fonts:** Editorial New (display) + Inter (body). Accents: VCR OSD Mono.
- **Palette:** Pastel purple `#C4B5FD`, soft pink `#FBCFE8`, mint `#A7F3D0`, cream `#FDF4E3`
- **Dials:** VARIANCE 8 / MOTION 7 / DENSITY 4 / DARK 0
- **Image direction:** Greek statues, palm trees, sunset gradients, pastel clouds, surreal compositions. Prompt template: *"vaporwave aesthetic, pastel gradients, surreal composition, Greek statue, soft lighting."*
- **Pick this when:** Lifestyle products, creative tools, fashion, Gen Z audiences with internet culture fluency.

---

## 7. SOFT CONSUMER — "Gentle, friendly, approachable. Mobile-native feel."

**What it is:** Design that prioritizes emotional comfort and approachability. Rounded shapes, pastels, gentle spring motion, friendly typography. Feels like a friend rather than a corporation.

**Best for:** Dating apps, wellness, lifestyle, social apps, mobile-first products, consumer tools, community platforms, meditation/journaling. *Your dating app and BizzMatch live here.*

**Reference sites:** Arc browser, Headspace, Calm, Co-Star, Hinge, Fable, Duolingo, Clay.

**Feels:** Gentle, warm, approachable, comforting, optimistic.

**Why it works:** Consumer apps compete for emotional comfort, not information density. Sharp corners and cold colors feel corporate and transactional — soft design signals safety and care, which is what people want from products they use during vulnerable moments (dating, mental health, self-improvement).

### Variations

**A. Dreamy Pastel** — Gentle, optimistic, comforting
- **Fonts:** PP Editorial New (display) + Inter (body). Alternative: Fraunces + DM Sans.
- **Palette:** Cream `#FDF8F0`, soft lavender `#C4B5FD`, peach `#FECACA`, warm gray `#6B6456`
- **Dials:** VARIANCE 5 / MOTION 6 / DENSITY 3 / DARK 0
- **Image direction:** Soft natural light, blurred backgrounds, warm tones, genuine smiling people, cozy interiors. Prompt template: *"soft natural light, warm tones, genuine emotion, cozy atmosphere, shallow depth of field, lifestyle."*
- **Pick this when:** Wellness, meditation, journaling, gentle self-care, calm-focused audiences.

**B. Warm Sunrise** — Hopeful, energetic, friendly
- **Fonts:** Clash Display (display) + General Sans (body). Alternative: Outfit + Plus Jakarta Sans.
- **Palette:** Warm white `#FFF9F0`, sunrise orange `#FB923C`, coral `#F87171`, golden yellow `#FBBF24`
- **Dials:** VARIANCE 6 / MOTION 7 / DENSITY 4 / DARK 0
- **Image direction:** Morning light, genuine moments, diverse community photography, bright colors. Prompt template: *"morning light, genuine moments, diverse community, bright colors, authentic lifestyle."*
- **Pick this when:** Dating apps, community platforms, social apps, anything positive and energetic. *Your dating app and BizzMatch fit here.*

**C. Cool Mint** — Fresh, calm, modern
- **Fonts:** Satoshi (display) + Inter (body). Alternative: General Sans + Manrope.
- **Palette:** Soft white `#F8FBFA`, mint green `#6EE7B7`, sky blue `#7DD3FC`, cool gray `#4B5563`
- **Dials:** VARIANCE 5 / MOTION 6 / DENSITY 4 / DARK 0
- **Image direction:** Clean minimalist product shots, water, sky, fresh food, pastel abstracts. Prompt template: *"clean minimalist, pastel mint, fresh modern, soft natural light, product photography."*
- **Pick this when:** Health tracking, hydration/fitness apps, consumer productivity tools, anything clean and fresh.

---

## 8. MAXIMALIST PLAYFUL — "Rules exist to be broken. Personality over polish."

**What it is:** The controlled opposite of minimalism. Big typography, bold colors, layered elements, experimental layouts. Every element is intentional even though the overall effect is chaotic and alive.

**Best for:** Creative tools, design-forward startups, kids products, entertainment, playful B2C, bold agencies, zines, cultural projects.

**Reference sites:** Figma, Gumroad, Pitch, Cron, Typeform, Arcade, early Notion, Stripe illustrations.

**Feels:** Confident, alive, human, bold, generous.

**Why it works:** Most SaaS looks the same because minimalism is safe — if you can't decide, you remove. Maximalism is the opposite bet: commit hard to a personality and let it dominate. It works for brands that compete on being MEMORABLE rather than being trusted, because you can't ignore a good maximalist design.

### Variations

**A. Bold Blocks** — Confident, graphic, punchy
- **Fonts:** Unbounded (display) + Inter (body). Alternative: Monument Extended + Satoshi.
- **Palette:** Off-white `#F9F9F9`, primary yellow `#FFD60A`, deep navy `#001D3D`, hot coral `#FF5A5F`, grass green `#06A77D`
- **Dials:** VARIANCE 8 / MOTION 7 / DENSITY 5 / DARK 0
- **Image direction:** Bold color blocks, graphic illustrations, geometric shapes, primary color photography. Prompt template: *"bold graphic design, primary colors, geometric, flat illustration, playful composition."*
- **Pick this when:** Bold startups, design tools, playful SaaS, brands that want to feel confident and alive.

**B. Type-Driven** — Loud, typographic, editorial-playful
- **Fonts:** PP Neue Montreal (display, oversized) + Inter (body). Alternative: Editorial New + General Sans.
- **Palette:** Stark white `#FFFFFF`, ink black `#0A0A0A`, single bold accent (electric purple `#7C3AED` OR sunset orange `#F97316`)
- **Dials:** VARIANCE 9 / MOTION 7 / DENSITY 5 / DARK 0
- **Image direction:** Typography AS imagery. Photography secondary and used sparingly. Prompt template: *"bold typographic composition, minimal photography, stark contrast, editorial."*
- **Pick this when:** Creative portfolios, agencies with a strong voice, tools for designers and writers.

**C. Collage Experimental** — Creative, artistic, chaotic-intentional
- **Fonts:** PP Editorial New (display) + Söhne (body). Alternative: Canela + Inter Tight.
- **Palette:** Warm paper `#F5E6D3`, multiple accents (teal `#14B8A6`, orange `#F97316`, pink `#EC4899`, purple `#A855F7`)
- **Dials:** VARIANCE 10 / MOTION 8 / DENSITY 6 / DARK 0
- **Image direction:** Cut-out collage, mixed media, vintage photography combined with modern elements, paper textures, torn edges. Prompt template: *"mixed media collage, paper cutout, vintage photography, torn edges, artistic composition."*
- **Pick this when:** Art galleries, zines, experimental projects, cultural products, creative brands with strong voices.

---

# Learning Notes

Each time a project is built using an archetype, pay attention to WHY the choices work together:

- **Editorial archetypes** pair serif display fonts with sans body because serifs carry literary authority but sans bodies improve reading speed.
- **Luxury archetypes** use slow motion and massive whitespace because urgency signals cheapness — luxury says "you have time, and so do we."
- **Tech archetypes** use mono fonts and grids because developers trust systems that look like other systems they already trust.
- **Organic archetypes** use warm off-whites instead of pure white because pure white is a digital artifact — nothing in nature is pure white.
- **Brutalist archetypes** use ONE accent color because having more would require taste decisions, and brutalism rejects taste decisions.
- **Retro-futuristic archetypes** use specific palettes from the source era (not modern interpretations) because nostalgia is triggered by accuracy.
- **Soft consumer archetypes** avoid pure black because black triggers seriousness — soft design uses warm grays instead.
- **Maximalist archetypes** still commit to a clear typography hierarchy because the chaos only reads as intentional when the foundation is disciplined.

After 10-20 builds across different archetypes, these principles become instinctive. That's how taste develops.

---

# 2026 Trend Layer (v1.1)

Trends are treatments applied WITHIN an archetype, never replacements for one. The archetype gate still runs first; these are options to raise during variation selection when they fit.

## Liquid Glass

Apple's 2025 design language matured glassmorphism into light-reactive, translucent depth. **Where it fits:** Luxury Minimal (Dark Premium), Tech Utilitarian (Dark Terminal), Soft Consumer — floating nav bars, pricing cards, feature panels over rich backgrounds. **Where it's banned:** Brutalist Raw (antithetical), Editorial (competes with type), Organic Natural (too digital). Implementation rules live in `APP.md → Liquid Glass`. One glass layer per view; if everything is glass, nothing is.

## Kinetic & Variable Typography

Type that moves as the identity itself — variable-font weight/width animating on scroll or hover, headlines that stretch and morph. **Where it fits:** Maximalist Playful (Type-Driven — this is now its signature move), Retro-Futuristic, Brutalist Raw. Use GSAP to animate `font-variation-settings` on a variable font (Fraunces, Anybody, and Instrument Sans all ship useful axes). One kinetic headline per page maximum; body text never moves.

## The Hand-Made Counter-Current (Anti-AI Polish)

The most important 2026 shift for this system: as AI output floods the web, **deliberately human, imperfect design now signals authenticity** — hand-drawn scribbles and arrows, torn-paper edges, marker-style underlines, off-grid annotations, visible texture. Audiences are learning to distrust the too-perfect sheen. **Where it fits:** Organic Natural (all variations — lean in harder), Maximalist Playful (Collage Experimental), Soft Consumer accents. **The general rule for every archetype:** each project ships at least one human touch — a hand-drawn accent, an imperfect texture, an annotation-style element. Flawless is now a slop tell (see LUXWEB.md anti-slop #42).

## Trend Discipline

Trends date; archetypes don't. Apply at most ONE trend treatment per project, chosen because it serves the archetype — never because it's current. A Botanical Fresh site with hand-drawn accents ages well; a Botanical Fresh site with liquid glass and kinetic type is three trends wearing a trench coat.
