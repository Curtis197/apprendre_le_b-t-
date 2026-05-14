# UI Redesign — Parlons Bété
**Date:** 2026-05-14  
**Status:** Approved  
**Approach:** Page-by-page with inline component extraction (C)

---

## Overview

Upgrade all pages of the Bété language platform to match the HTML mocks in `web/stitch_parlons_b_t/`, using the Modern Ivorian Heritage design system already applied to `globals.css`. Icons use Lucide React throughout (no Material Symbols). The translator page is skipped — the translator UI lives on the home page only.

---

## Design System Reference

Already applied in `web/app/globals.css`:
- **Primary:** Terracotta `#9e3d00` (`text-primary`, `bg-primary`)
- **Secondary:** Forest Green `#006d38` (`text-secondary`, `bg-secondary`)
- **Accent:** Warm Gold `#735c00` (`text-accent`, `bg-accent`)
- **Background:** Soft Cream `#fbf9f5`
- **Fonts:** Lexend (headings via `font-heading`), Inter (body via `font-sans`)
- **Radius:** `--radius: 0.5rem` (buttons), `rounded-2xl` / `rounded-xl` for cards

---

## Scope

| Page | Route | Status |
|---|---|---|
| Layout + Nav | `app/layout.tsx` | Redesign |
| Home | `app/page.tsx` | Redesign |
| Lexicon | `app/lexicon/page.tsx` | Redesign |
| Contribute | `app/contribute/page.tsx` | Redesign |
| Grammar | `app/grammar/page.tsx` | New (UI shell) |
| Translator | `app/translator/page.tsx` | Skip |

---

## Section 1: Nav & Layout (`app/layout.tsx`)

### Top Navigation
- Logo: **"Bété Lingo"** — `font-heading text-primary font-bold text-xl`
- Links: Lexique (`/lexicon`), Grammaire (`/grammar`), Contribuer (`/contribute`)
- Active link detection via `usePathname()` — active gets `border-b-2 border-primary text-foreground`, inactive gets `text-muted-foreground hover:text-foreground`
- Right side: search input (`hidden md:flex`, `bg-muted rounded-full px-4 py-2`) + `<AuthNav />`
- Nav style: `sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border shadow-sm`
- Container: `max-w-7xl mx-auto px-4 md:px-10 h-[72px] flex items-center`

### Mobile Bottom Nav
- `fixed bottom-0 left-0 right-0 md:hidden bg-background border-t border-border z-50`
- 4 items: Accueil (Home icon), Lexique (BookOpen), Contribuer (PlusCircle), Profil (User)
- Active: `text-primary`, inactive: `text-muted-foreground`
- Each item: `flex flex-col items-center gap-1 text-[10px]`

### Main Content
- `<main className="pb-16 md:pb-0">` to avoid overlap with mobile bottom nav

### NavLink Component
Extract a `<NavLink>` client component to `components/NavLink.tsx` — wraps Next.js `<Link>` with `usePathname()` active state logic.

---

## Section 2: Home Page (`app/page.tsx`)

### Translator Hero Card
- Full-width white card, `rounded-2xl shadow-sm border border-border p-6`
- **Header row:** "Français" pill → Lucide `ArrowLeftRight` icon → "Bété" pill
- **Two-column grid (`md:grid-cols-2`):**
  - Left: `<textarea>` for French input, `h-40`, `bg-muted rounded-lg p-4`, Lucide `Mic` icon button at bottom-right
  - Right: read-only output `div`, same dimensions, Lucide `Copy` icon button at bottom-right
- **Full-width "Traduire" button:** `bg-primary text-white w-full h-12 rounded-lg font-heading font-semibold`, Lucide `Sparkles` icon
- Hooks into existing `/api/translate` route via `fetch`
- Loading state: spinner on button, disabled textarea

### Bento Grid (`md:grid-cols-3 gap-6`)

**Word of the Day card (col-span-1):**
- `bg-surface-container-low rounded-2xl p-8 border-l-4 border-primary`
- Badge: "Mot du Jour" — `bg-secondary text-white text-xs rounded-full px-3 py-1`
- Word: `font-heading text-3xl text-primary font-bold`
- Pronunciation: `text-sm italic text-muted-foreground`
- Thin divider: `w-12 h-0.5 bg-border my-3`
- Meaning: `italic text-foreground/80`
- "En savoir plus →" link: `text-primary text-sm font-semibold`
- Data: hardcoded for now (first entry from lexicon or static placeholder)

**Cultural card (col-span-2):**
- `rounded-2xl overflow-hidden border border-border`
- Split: left half image (`object-cover h-full`), right half `p-8 flex flex-col justify-center bg-card`
- Badges: "3M+ Locuteurs" (Lucide `Users`), "Riche Folklore" (Lucide `Mic2`) — `bg-muted rounded-full px-3 py-1 text-sm`
- Button: `border-2 border-secondary text-secondary hover:bg-secondary hover:text-white rounded-lg px-6 h-10`
- Image: use a placeholder from `/public` or a static Unsplash URL

### Patterned Divider
- `flex items-center gap-4 my-12`
- Two `<div className="flex-1 h-px bg-border" />` flanking a Lucide `Layers` icon in `text-muted-foreground`

---

## Section 3: Lexicon Page (`app/lexicon/page.tsx`)

### Page Header
- `pattern-bg` class (repeating radial gradient, primary color at 3% opacity) as `relative` wrapper
- Badge: category label, secondary pill
- Title: `font-heading text-5xl font-bold` (display-lg)
- Subtitle: `text-lg text-muted-foreground max-w-2xl`

### Filter Bar
- Horizontal flex row, `overflow-x-auto`, `gap-2 pb-2`
- Categories: Tous, Noms, Verbes, Adjectifs, Expressions
- Active pill: `bg-primary text-white`
- Inactive pill: `bg-muted hover:border-primary border border-transparent rounded-full px-4 py-2 text-sm`
- Right-aligned word count: `text-muted-foreground text-sm`
- State managed with `useState` for active category, filtering existing lexicon data

### Word Card Grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6`)

**Standard card:**
- `bg-card rounded-xl p-6 border-2 border-transparent hover:border-primary hover:shadow-lg transition-all`
- Header: category badge (green pill) + play button (`w-12 h-12 bg-primary/10 hover:bg-primary hover:text-white rounded-full`, Lucide `Volume2`)
- Word: `font-heading text-2xl font-bold text-foreground`
- Cultural divider: `w-16 h-1` with `repeating-linear-gradient(45deg, ...)` at primary color, opacity 0.2
- Translation: `italic text-muted-foreground`
- Bottom row (border-t, `opacity-60 hover:opacity-100`): contributor name + date

**Featured card (Word of Day — `md:col-span-2 xl:col-span-1`):**
- `bg-primary-container rounded-xl p-6 relative overflow-hidden`
- Text: `text-on-primary-container` (defined in CSS as `--on-primary-container`)
- Word: `font-heading text-4xl font-bold`
- Background Lucide `BookOpen` icon: `absolute -bottom-4 -right-4 text-[120px] opacity-10`

### Pagination
- `flex justify-center items-center gap-2 mt-10`
- Chevrons: `w-10 h-10 border border-border rounded-full flex items-center justify-center`
- Page numbers: same size, active = `bg-primary text-white`
- State: `useState` for current page, slice data accordingly

### Component extraction
`<WordCard>` extracted to `components/WordCard.tsx` — used here and potentially on home page's Word of Day.

---

## Section 4: Contribute Page (`app/contribute/page.tsx`)

### Hero Header
- `bg-primary-container text-on-primary-container rounded-xl p-8 md:p-12 mb-8 relative overflow-hidden`
- `pattern-bg` overlay: `absolute inset-0 opacity-10`
- Title: `font-heading text-4xl font-bold max-w-2xl`
- Subtitle: `text-lg opacity-90`

### Two-column grid (`lg:grid-cols-12 gap-8`)

**Contribution Form (lg:col-span-8):**
- Card: `bg-card border border-border rounded-xl p-8 shadow-sm`
- Title: `font-heading text-2xl text-primary flex items-center gap-2` + Lucide `PenLine`
- Fields grid: `grid-cols-1 md:grid-cols-2 gap-6`
  - Bété word input + French translation input
  - Inputs: `bg-muted border border-border rounded-lg px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20`
  - Labels: always visible above field, `text-sm font-semibold text-foreground`
- Category selector: pill buttons (same pattern as lexicon filter bar), `useState` for selection
- Example sentence: `<textarea rows={4}>`, full width
- Buttons row:
  - Submit: `bg-primary text-white h-12 px-8 rounded-lg font-semibold min-w-[200px]` + Lucide `Send`
  - Cancel: `border border-secondary text-secondary h-12 px-6 rounded-lg`
- Reuses existing `ContributionForm` submission logic

**Guidelines Panel (lg:col-span-4):**
- Community guidelines card: `bg-muted rounded-xl p-6 border border-border`
  - Title: `font-heading text-lg text-secondary flex items-center gap-2` + Lucide `ShieldCheck`
  - 3 checklist items: Lucide `CheckCircle2` in `text-primary` + strong title + description
- Contributor level card: `bg-accent/20 rounded-xl p-6 mt-4`
  - Header: "Niveau Contributeur" + "LEGACY" badge
  - Avatar circle + name
  - Progress bar: `bg-foreground/20 h-2 rounded-full` with inner `bg-secondary` div at `w-[40%]`

### Pending Contributions Grid
- `grid-cols-1 md:grid-cols-3 gap-4 mt-10`
- Card: `bg-card border border-border p-5 rounded-lg`
- Header: Bété word in `font-heading text-primary` + status badge
- Meaning: `italic text-muted-foreground`
- Footer: contributor name + Lucide `Clock` icon
- Reuses existing `PendingContributions` data logic

---

## Section 5: Grammar Page (`app/grammar/page.tsx`) — UI Shell

New route. No database backing — all content is hardcoded placeholder.

### Page Header
- Same `pattern-bg` + badge pattern as lexicon
- Badge: "Piliers Linguistiques" (secondary pill)
- Title: "Architecture Grammaticale"
- Subtitle: explanatory body text

### Bento Rule Cards (`md:grid-cols-12 gap-6`)

**Card 1 — Full width (col-span-12):**
- `bg-card border-l-4 border-primary rounded-xl p-8`
- Icon box: `w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center` + Lucide `Music2`
- Title: `font-heading text-2xl text-primary` — "Les Tons"
- Description paragraph
- Two-column example boxes: `bg-muted rounded-lg p-4 border border-border`

**Card 2 — Asymmetric left (col-span-7):**
- `bg-card border-t-4 border-secondary rounded-xl p-6`
- Title: `font-heading text-xl` + Lucide `BookOpen`
- Bullet list: items with `bg-secondary/10 rounded-lg p-3 flex items-center gap-3`

**Card 3 — Focus box right (col-span-5):**
- `bg-accent/20 rounded-xl p-6`
- Title: `font-heading text-xl`
- Key/value rows: `flex justify-between py-2 border-b border-border/50`

### Visual Section Divider
Same `<PatternDivider>` component extracted from home page.

### CTA Banner
- `bg-primary text-white rounded-xl p-8 mt-8`
- Flex row (`md:flex-row`): title + description left, white button right
- Button: `bg-white text-primary font-semibold px-6 h-10 rounded-lg active:scale-95`

---

## Shared Components to Extract

| Component | File | Used by |
|---|---|---|
| `NavLink` | `components/NavLink.tsx` | layout.tsx |
| `PatternDivider` | `components/PatternDivider.tsx` | home, grammar |
| `WordCard` | `components/WordCard.tsx` | lexicon |
| `FilterPills` | `components/FilterPills.tsx` | lexicon, contribute |
| `PageHeader` | `components/PageHeader.tsx` | lexicon, grammar |

---

## CSS Additions (globals.css)

```css
.pattern-bg {
  background-image: radial-gradient(circle, var(--primary) 0.5px, transparent 0.5px);
  background-size: 24px 24px;
  opacity: 0.03;
}
```

Add to `@layer base` or as a utility class.

---

## Implementation Order (page-by-page, approach C)

1. `app/layout.tsx` + `components/NavLink.tsx`
2. `app/page.tsx` (home) + `components/PatternDivider.tsx`
3. `app/lexicon/page.tsx` + `components/WordCard.tsx` + `components/FilterPills.tsx` + `components/PageHeader.tsx`
4. `app/contribute/page.tsx`
5. `app/grammar/page.tsx`

---

## Out of Scope

- `app/translator/page.tsx` — unchanged
- Dark mode — design system supports it but mocks are light-mode only
- Animations beyond `transition-all duration-200`
- Database schema changes
- New API routes
