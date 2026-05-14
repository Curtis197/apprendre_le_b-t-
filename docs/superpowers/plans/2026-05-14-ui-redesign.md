# UI Redesign — Parlons Bété Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all app pages to match the Modern Ivorian Heritage HTML mocks, using Lucide React icons and the design system already applied in `globals.css`.

**Architecture:** Page-by-page with inline extraction — build one page at a time, extract a component to `/components` only when it appears in a second page. Shared components (NavLink, MobileSidebar, PatternDivider, WordCard, FilterPills, PageHeader) are built just before they're first needed. All data logic in existing components is preserved; only presentation changes.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, Lucide React, Supabase browser client, shadcn/ui primitives.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `web/app/globals.css` | Add `.pattern-bg` utility |
| Create | `web/components/NavLink.tsx` | Active-aware nav link (usePathname) |
| Create | `web/components/MobileSidebar.tsx` | Burger menu + slide-in sidebar |
| Modify | `web/app/layout.tsx` | New sticky nav + MobileSidebar |
| Create | `web/components/PatternDivider.tsx` | Flanked-icon section divider |
| Modify | `web/app/page.tsx` | Home: translator hero + bento grid |
| Create | `web/components/PageHeader.tsx` | Reusable hero header (lexicon, grammar) |
| Create | `web/components/FilterPills.tsx` | Horizontal pill filter bar |
| Create | `web/components/WordCard.tsx` | Lexicon entry card |
| Modify | `web/app/lexicon/page.tsx` | New grid layout with filters + pagination |
| Modify | `web/app/contribute/page.tsx` | Hero + two-col layout wrapping existing form |
| Create | `web/app/grammar/page.tsx` | UI shell with placeholder rule cards |

**Untouched files:** `components/ContributionForm.tsx`, `components/PendingContributions.tsx`, `components/LexiconSearch.tsx`, `components/LexiconEntry.tsx`, `components/AuthNav.tsx`, `app/translator/page.tsx`, `app/api/translate/route.ts`, `lib/types.ts`.

---

## Task 1: Add `.pattern-bg` CSS utility

**Files:**
- Modify: `web/app/globals.css`

- [ ] **Step 1: Add the utility after the `@layer base` block**

Open `web/app/globals.css` and append after the closing `}` of `@layer base`:

```css
@layer utilities {
  .pattern-bg {
    background-image: radial-gradient(circle, var(--color-primary) 0.5px, transparent 0.5px);
    background-size: 24px 24px;
    opacity: 0.04;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd web
git add app/globals.css
git commit -m "feat: add pattern-bg utility class"
```

---

## Task 2: Create `NavLink` component

**Files:**
- Create: `web/components/NavLink.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/components/NavLink.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Props {
  href: string
  children: React.ReactNode
  className?: string
}

export function NavLink({ href, children, className }: Props) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
  return (
    <Link
      href={href}
      className={cn(
        'text-sm transition-colors pb-1',
        isActive
          ? 'border-b-2 border-primary text-foreground font-semibold'
          : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/NavLink.tsx
git commit -m "feat: add NavLink component with active state"
```

---

## Task 3: Create `MobileSidebar` component

**Files:**
- Create: `web/components/MobileSidebar.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/components/MobileSidebar.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, BookOpen, BookText, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthNav } from './AuthNav'

const links = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/lexicon', label: 'Lexique', icon: BookOpen },
  { href: '/grammar', label: 'Grammaire', icon: BookText },
  { href: '/contribute', label: 'Contribuer', icon: PlusCircle },
]

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border flex flex-col md:hidden">
            <div className="flex items-center justify-between px-6 h-[72px] border-b border-border shrink-0">
              <span className="font-heading font-bold text-xl text-primary">Bété Lingo</span>
              <button
                onClick={() => setOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                aria-label="Fermer le menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
              {links.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-6 py-4 text-base transition-colors border-l-4',
                      isActive
                        ? 'bg-primary/10 text-primary border-primary font-semibold'
                        : 'text-foreground hover:bg-muted border-transparent'
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </nav>
            <div className="px-6 py-4 border-t border-border shrink-0">
              <AuthNav />
              <p className="text-xs text-muted-foreground mt-3">Parlons Bété v1.0</p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/MobileSidebar.tsx
git commit -m "feat: add MobileSidebar with burger menu and slide-in panel"
```

---

## Task 4: Redesign `app/layout.tsx`

**Files:**
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
// web/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Lexend } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { AuthNav } from '@/components/AuthNav'
import { NavLink } from '@/components/NavLink'
import { MobileSidebar } from '@/components/MobileSidebar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  title: 'Bété Lingo — Plateforme linguistique',
  description: 'Lexique, traducteur et ressources pour la langue bété',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${lexend.variable}`}>
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border shadow-sm">
          <nav className="max-w-7xl mx-auto px-4 md:px-10 h-[72px] flex items-center gap-6">
            <Link href="/" className="font-heading font-bold text-xl text-primary shrink-0">
              Bété Lingo
            </Link>
            <div className="hidden md:flex items-center gap-8 flex-1">
              <NavLink href="/lexicon">Lexique</NavLink>
              <NavLink href="/grammar">Grammaire</NavLink>
              <NavLink href="/contribute">Contribuer</NavLink>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="hidden md:flex items-center gap-2 bg-muted rounded-full px-4 py-2 text-sm text-muted-foreground cursor-text">
                <Search className="w-4 h-4 shrink-0" />
                <span>Rechercher…</span>
              </div>
              <div className="hidden md:block">
                <AuthNav />
              </div>
              <MobileSidebar />
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Verify the dev server renders without errors**

```bash
npm run dev
```

Open `http://localhost:3000`. Confirm:
- "Bété Lingo" logo visible in terracotta
- Desktop: three nav links visible, search pill visible
- Mobile (< 768px): only burger icon visible, clicking it opens sidebar, clicking backdrop closes it

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: redesign nav with sticky bar, NavLink active states, mobile sidebar"
```

---

## Task 5: Create `PatternDivider` component

**Files:**
- Create: `web/components/PatternDivider.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/components/PatternDivider.tsx
import { Layers } from 'lucide-react'

export function PatternDivider() {
  return (
    <div className="flex items-center gap-4 my-12">
      <div className="flex-1 h-px bg-border" />
      <Layers className="w-5 h-5 text-muted-foreground shrink-0" />
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/PatternDivider.tsx
git commit -m "feat: add PatternDivider component"
```

---

## Task 6: Redesign Home page

**Files:**
- Modify: `web/app/page.tsx`

Note: `/api/translate` accepts `POST { text: string }` and returns `{ input, tokens: [{ french_word, bete_word, bete_phonetic, score, is_expression }], cached }`. The translated output is formed by joining `token.bete_word` with spaces.

- [ ] **Step 1: Rewrite `app/page.tsx`**

```tsx
// web/app/page.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, Copy, Mic, Sparkles, Users, Mic2 } from 'lucide-react'
import { PatternDivider } from '@/components/PatternDivider'
import type { TranslationResult } from '@/lib/types'

export default function HomePage() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleTranslate() {
    if (!input.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const data: TranslationResult = await res.json()
      setOutput(data.tokens?.map(t => t.bete_word).join(' ') ?? '')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10 space-y-10">

      {/* Translator Hero */}
      <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-muted rounded-full px-4 py-1.5 text-sm font-semibold">Français</span>
          <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          <span className="bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold">Bété</span>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="relative">
            <textarea
              className="w-full h-40 bg-muted rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Entrez votre texte en français…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-background border border-border hover:bg-muted transition-colors">
              <Mic className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="relative">
            <div className="w-full h-40 bg-muted rounded-lg p-4 text-sm overflow-auto">
              {output
                ? <span className="text-foreground">{output}</span>
                : <span className="text-muted-foreground">La traduction apparaîtra ici…</span>
              }
            </div>
            <button
              onClick={() => output && navigator.clipboard.writeText(output)}
              className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-background border border-border hover:bg-muted transition-colors"
              aria-label="Copier"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <button
          onClick={handleTranslate}
          disabled={loading || !input.trim()}
          className="w-full h-12 bg-primary text-white rounded-lg font-heading font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          {loading ? 'Traduction en cours…' : 'Traduire'}
        </button>
      </div>

      {/* Bento Grid */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Word of Day */}
        <div className="bg-muted rounded-2xl p-8 border-l-4 border-primary">
          <span className="bg-secondary text-white text-xs rounded-full px-3 py-1 inline-block mb-4">
            Mot du Jour
          </span>
          <h2 className="font-heading text-3xl text-primary font-bold">Gbô</h2>
          <p className="text-sm italic text-muted-foreground mt-1">/ɡbò/</p>
          <div className="w-12 h-0.5 bg-border my-3" />
          <p className="italic text-foreground/80 text-sm">"La parole, la voix"</p>
          <Link href="/lexicon" className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
            En savoir plus →
          </Link>
        </div>

        {/* Cultural Card */}
        <div className="md:col-span-2 rounded-2xl overflow-hidden border border-border">
          <div className="grid md:grid-cols-2 h-full min-h-[280px]">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&q=80"
                alt="Culture bété de Côte d'Ivoire"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-8 flex flex-col justify-center bg-card">
              <h2 className="font-heading text-2xl font-bold mb-3">Patrimoine Vivant</h2>
              <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                La langue bété, parlée par plus de 3 millions de personnes en Côte d'Ivoire,
                est porteuse d'une tradition orale exceptionnelle.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="bg-muted rounded-full px-3 py-1 text-sm flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> 3M+ Locuteurs
                </span>
                <span className="bg-muted rounded-full px-3 py-1 text-sm flex items-center gap-1.5">
                  <Mic2 className="w-3.5 h-3.5" /> Riche Folklore
                </span>
              </div>
              <Link
                href="/lexicon"
                className="self-start border-2 border-secondary text-secondary hover:bg-secondary hover:text-white rounded-lg px-6 h-10 inline-flex items-center text-sm font-semibold transition-colors"
              >
                Explorer le Lexique
              </Link>
            </div>
          </div>
        </div>
      </div>

      <PatternDivider />
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000`. Confirm:
- Translator card renders with two text areas side by side on desktop, stacked on mobile
- Typing text and clicking "Traduire" calls the API and renders the joined Bété words
- Loading spinner appears during API call
- Bento grid shows Word of Day card (left) and Cultural card (right, 2 cols)
- PatternDivider renders at bottom

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: redesign home page with translator hero and bento grid"
```

---

## Task 7: Create `PageHeader` component

**Files:**
- Create: `web/components/PageHeader.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/components/PageHeader.tsx
import { cn } from '@/lib/utils'

interface Props {
  badge?: string
  title: string
  subtitle?: string
  className?: string
}

export function PageHeader({ badge, title, subtitle, className }: Props) {
  return (
    <div className={cn('relative mb-10 rounded-xl overflow-hidden', className)}>
      <div className="pattern-bg absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 py-12 px-4">
        {badge && (
          <span className="inline-block bg-secondary text-white text-xs font-semibold rounded-full px-3 py-1 mb-4">
            {badge}
          </span>
        )}
        <h1 className="font-heading text-4xl md:text-5xl font-bold mb-3">{title}</h1>
        {subtitle && (
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/PageHeader.tsx
git commit -m "feat: add PageHeader component with pattern background"
```

---

## Task 8: Create `FilterPills` component

**Files:**
- Create: `web/components/FilterPills.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/components/FilterPills.tsx
import { cn } from '@/lib/utils'

interface Props {
  options: string[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function FilterPills({ options, value, onChange, className }: Props) {
  return (
    <div className={cn('flex overflow-x-auto gap-2 pb-2', className)}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-full px-4 py-2 text-sm whitespace-nowrap border transition-colors shrink-0',
            value === opt
              ? 'bg-primary text-white border-primary'
              : 'bg-muted border-transparent hover:border-primary'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/FilterPills.tsx
git commit -m "feat: add FilterPills component"
```

---

## Task 9: Create `WordCard` component

**Files:**
- Create: `web/components/WordCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/components/WordCard.tsx
import { Volume2, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LexiconEntry } from '@/lib/types'

interface Props {
  entry: LexiconEntry
  featured?: boolean
  className?: string
}

export function WordCard({ entry, featured = false, className }: Props) {
  if (featured) {
    return (
      <div className={cn('bg-primary/10 border border-primary/20 rounded-xl p-6 relative overflow-hidden', className)}>
        <div className="flex items-start justify-between mb-4">
          <span className="bg-secondary/20 text-secondary text-xs font-semibold rounded-full px-3 py-1">
            Mot du Jour
          </span>
          <button className="w-14 h-14 bg-primary/20 hover:bg-primary hover:text-white text-primary rounded-full flex items-center justify-center transition-colors">
            <Volume2 className="w-6 h-6" />
          </button>
        </div>
        <h2 className="font-heading text-4xl font-bold text-primary mb-1">{entry.bete_word}</h2>
        <p className="text-sm italic text-muted-foreground mb-3">[{entry.bete_phonetic}]</p>
        <div className="w-16 h-0.5 bg-primary/30 mb-3" />
        <p className="italic text-foreground/80">{entry.top_french}</p>
        <BookOpen className="absolute -bottom-4 -right-4 w-32 h-32 text-primary opacity-10" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-card rounded-xl p-6 border-2 border-transparent hover:border-primary hover:shadow-lg transition-all group',
      className
    )}>
      <div className="flex items-start justify-between mb-3">
        <span className="bg-secondary text-white text-xs font-semibold rounded-full px-3 py-1">
          {entry.pos ?? 'Mot'}
        </span>
        <button className="w-12 h-12 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-full flex items-center justify-center transition-colors group-hover:scale-110">
          <Volume2 className="w-5 h-5" />
        </button>
      </div>
      <h3 className="font-heading text-2xl font-bold text-foreground mb-2">{entry.bete_word}</h3>
      <div
        className="w-16 h-1 mb-2 rounded-full"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, var(--color-primary) 0, var(--color-primary) 4px, transparent 4px, transparent 10px)',
          opacity: 0.25,
        }}
      />
      <p className="italic text-muted-foreground text-sm mb-3">{entry.top_french}</p>
      <div className="border-t border-border pt-3 flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground font-mono">[{entry.bete_phonetic}]</span>
        {entry.validated && (
          <span className="text-xs text-secondary font-semibold">✓ validé</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/WordCard.tsx
git commit -m "feat: add WordCard component with standard and featured variants"
```

---

## Task 10: Redesign Lexicon page

**Files:**
- Modify: `web/app/lexicon/page.tsx`

- [ ] **Step 1: Rewrite `app/lexicon/page.tsx`**

```tsx
// web/app/lexicon/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { FilterPills } from '@/components/FilterPills'
import { WordCard } from '@/components/WordCard'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry } from '@/lib/types'

const CATEGORIES = ['Tous', 'Noms', 'Verbes', 'Adjectifs']
const PAGE_SIZE = 9

const POS_MAP: Record<string, string> = {
  Noms: 'noun',
  Verbes: 'verb',
  Adjectifs: 'adj',
}

export default function LexiconPage() {
  const [category, setCategory] = useState('Tous')
  const [entries, setEntries] = useState<LexiconEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    setPage(0)
  }, [category])

  useEffect(() => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabaseRef.current
      .from('lexicon')
      .select('*', { count: 'exact' })
      .order('upvotes', { ascending: false })
      .range(from, to)
    if (category !== 'Tous' && POS_MAP[category]) {
      q = q.ilike('pos', `%${POS_MAP[category]}%`)
    }
    q.then(({ data, count }) => {
      setEntries((data ?? []) as LexiconEntry[])
      setTotal(count ?? 0)
      setLoading(false)
    })
  }, [category, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // First entry becomes the featured card; rest are standard
  const [featured, ...rest] = entries

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Dictionnaire"
        title="Lexique Bété"
        subtitle="Explorez les mots de la langue bété, leur prononciation et leur traduction en français."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <FilterPills options={CATEGORIES} value={category} onChange={setCategory} />
        <span className="text-sm text-muted-foreground shrink-0">
          {loading ? '…' : `${total} mot${total !== 1 ? 's' : ''} trouvé${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="bg-muted rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">
          Aucun mot trouvé pour cette catégorie.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {featured && (
            <WordCard
              entry={featured}
              featured
              className="md:col-span-2 xl:col-span-1"
            />
          )}
          {rest.map(entry => (
            <WordCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-10">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-10 h-10 border border-border rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors"
            aria-label="Page précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
            const pageNum = i
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-10 h-10 rounded-full text-sm font-semibold transition-colors ${
                  page === pageNum
                    ? 'bg-primary text-white'
                    : 'border border-border hover:bg-muted'
                }`}
              >
                {pageNum + 1}
              </button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="w-10 h-10 border border-border rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors"
            aria-label="Page suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000/lexicon`. Confirm:
- PageHeader renders with "Dictionnaire" badge and title
- Filter pills show; clicking a category re-fetches and shows count
- Word cards render in 3-col grid on desktop, 1-col on mobile
- First card uses featured (large) variant
- Skeleton loaders appear while fetching
- Pagination appears when more than 9 entries exist

- [ ] **Step 3: Commit**

```bash
git add app/lexicon/page.tsx
git commit -m "feat: redesign lexicon page with filter pills, word card grid, and pagination"
```

---

## Task 11: Redesign Contribute page

**Files:**
- Modify: `web/app/contribute/page.tsx`

- [ ] **Step 1: Rewrite `app/contribute/page.tsx`**

```tsx
// web/app/contribute/page.tsx
export const dynamic = 'force-dynamic'

import { PenLine, ShieldCheck, CheckCircle2, Clock } from 'lucide-react'
import { ContributionForm } from '@/components/ContributionForm'
import { PendingContributions } from '@/components/PendingContributions'

export default function ContributePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">

      {/* Hero Header */}
      <div className="relative bg-primary text-white rounded-xl p-8 md:p-12 mb-8 overflow-hidden">
        <div className="pattern-bg absolute inset-0" aria-hidden="true" />
        <div className="relative z-10">
          <h1 className="font-heading text-4xl font-bold max-w-2xl mb-3">
            Contribuez au Patrimoine Bété
          </h1>
          <p className="text-lg opacity-90 max-w-xl leading-relaxed">
            Chaque mot que vous ajoutez renforce la préservation d'une langue vivante.
            Les contributions avec 3 votes sont intégrées au traducteur.
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-12 gap-8 mb-10">

        {/* Contribution Form — col 8 */}
        <div className="lg:col-span-8">
          <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
            <h2 className="font-heading text-2xl text-primary flex items-center gap-2 mb-6">
              <PenLine className="w-6 h-6" />
              Ajouter une contribution
            </h2>
            <ContributionForm />
          </div>
        </div>

        {/* Guidelines Panel — col 4 */}
        <div className="lg:col-span-4 space-y-4">

          {/* Community Guidelines */}
          <div className="bg-muted rounded-xl p-6 border border-border">
            <h3 className="font-heading text-lg text-secondary flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5" />
              Directives communautaires
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Authenticité</p>
                  <p className="text-xs text-muted-foreground">Utilisez des mots issus d'usage réel, pas de traductions littérales.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Phonétique précise</p>
                  <p className="text-xs text-muted-foreground">La transcription phonétique aide à la prononciation correcte.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Validation communautaire</p>
                  <p className="text-xs text-muted-foreground">3 votes positifs suffisent pour valider une contribution.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Contributor Level */}
          <div className="bg-accent/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-sm font-bold">Niveau Contributeur</h3>
              <span className="bg-accent/40 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Débutant
              </span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent/40 flex items-center justify-center font-heading font-bold text-sm">
                B
              </div>
              <div>
                <p className="text-sm font-semibold">Contributeur</p>
                <p className="text-xs text-muted-foreground">0 contributions validées</p>
              </div>
            </div>
            <div className="w-full bg-foreground/10 h-2 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full w-[5%]" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">3 contributions pour passer au niveau suivant</p>
          </div>
        </div>
      </div>

      {/* Pending Contributions */}
      <div>
        <h2 className="font-heading text-2xl font-bold mb-2 flex items-center gap-2">
          <Clock className="w-6 h-6 text-muted-foreground" />
          En attente de validation
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Votez pour valider les contributions de la communauté.
        </p>
        <PendingContributions />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000/contribute`. Confirm:
- Terracotta hero header renders with pattern overlay
- Two-column layout: form on left (8 cols), guidelines + level card on right (4 cols)
- Existing `ContributionForm` renders inside the new card
- Guidelines panel shows three checklist items
- `PendingContributions` renders below

- [ ] **Step 3: Commit**

```bash
git add app/contribute/page.tsx
git commit -m "feat: redesign contribute page with hero, two-col layout, guidelines panel"
```

---

## Task 12: Create Grammar page (UI shell)

**Files:**
- Create: `web/app/grammar/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// web/app/grammar/page.tsx
import Link from 'next/link'
import { Music2, BookOpen, Layers } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PatternDivider } from '@/components/PatternDivider'

export default function GrammarPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Piliers Linguistiques"
        title="Architecture Grammaticale"
        subtitle="La langue bété possède une structure tonale et aspectuelle unique qui reflète la richesse de la tradition orale ivoirienne."
      />

      <div className="grid md:grid-cols-12 gap-6">

        {/* Card 1 — Full width: Tones */}
        <div className="md:col-span-12 bg-card border-l-4 border-primary rounded-xl p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Music2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-2xl text-primary font-bold">Les Tons</h2>
              <p className="text-xs text-muted-foreground">Système tonal et phonologie</p>
            </div>
          </div>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Le bété est une langue à tons. Le ton (hauteur mélodique d'une syllabe) est phonémique :
            il distingue des mots de forme identique. On distingue principalement le ton haut et le ton bas.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-muted rounded-lg p-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ton Haut</p>
              <p className="font-heading text-2xl text-primary font-bold">bá</p>
              <p className="text-sm italic text-muted-foreground mt-1">signifie "père"</p>
            </div>
            <div className="bg-muted rounded-lg p-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ton Bas</p>
              <p className="font-heading text-2xl text-secondary font-bold">bà</p>
              <p className="text-sm italic text-muted-foreground mt-1">signifie "mère"</p>
            </div>
          </div>
        </div>

        {/* Card 2 — Asymmetric left: Verb Structure */}
        <div className="md:col-span-7 bg-card border-t-4 border-secondary rounded-xl p-6">
          <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-secondary" />
            Structure Verbale
          </h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Les verbes bété s'organisent selon un système aspectuel distinguant l'accompli de l'inaccompli.
          </p>
          <ul className="space-y-2">
            {[
              { label: 'Perfectif', desc: 'Action achevée, résultat présent' },
              { label: 'Imperfectif', desc: 'Action en cours ou habituelle' },
              { label: 'Progressif', desc: 'Action se déroulant au moment de l\'énoncé' },
            ].map(item => (
              <li key={item.label} className="bg-secondary/10 rounded-lg p-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                <div>
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-sm text-muted-foreground"> — {item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 3 — Focus box right: Key Markers */}
        <div className="md:col-span-5 bg-accent/20 rounded-xl p-6">
          <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent-foreground" />
            Marqueurs Clés
          </h2>
          {[
            { key: 'Sujet', value: 'Préfixe verbal' },
            { key: 'Temps', value: 'Particule préverbale' },
            { key: 'Aspect', value: 'Suffixe ou ton' },
            { key: 'Négation', value: 'Encadrement verbal' },
          ].map((row, i, arr) => (
            <div
              key={row.key}
              className={`flex justify-between py-2.5 text-sm ${i < arr.length - 1 ? 'border-b border-border/50' : ''}`}
            >
              <span className="font-semibold">{row.key}</span>
              <span className="text-muted-foreground">{row.value}</span>
            </div>
          ))}
          <p className="text-xs italic text-muted-foreground mt-3">
            * Contenu indicatif — données complètes à venir.
          </p>
        </div>

      </div>

      <PatternDivider />

      {/* CTA Banner */}
      <div className="bg-primary text-white rounded-xl p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="font-heading text-2xl font-bold mb-2">Prêt à pratiquer ?</h2>
            <p className="opacity-90 text-sm leading-relaxed max-w-lg">
              Mettez en pratique ces règles grammaticales en explorant le lexique ou en contribuant vos propres exemples.
            </p>
          </div>
          <Link
            href="/lexicon"
            className="shrink-0 bg-white text-primary font-semibold px-6 h-10 rounded-lg inline-flex items-center hover:bg-white/90 active:scale-95 transition-all"
          >
            Explorer le Lexique
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000/grammar`. Confirm:
- PageHeader renders with "Piliers Linguistiques" badge
- Three bento cards render in 12-col grid (full, 7, 5)
- PatternDivider between cards and CTA
- CTA banner renders with white "Explorer le Lexique" button linking to `/lexicon`
- Grammaire link in nav is active (underlined) on this page

- [ ] **Step 3: Commit**

```bash
git add app/grammar/page.tsx
git commit -m "feat: add grammar page UI shell with bento rule cards and CTA"
```

---

## Task 13: Final verification and commit

- [ ] **Step 1: Run the build to catch type errors**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: Smoke-test all routes**

Start dev server (`npm run dev`) and manually verify:

| Route | Check |
|---|---|
| `/` | Translator works, bento grid visible, divider at bottom |
| `/lexicon` | Filter pills, word cards, pagination |
| `/contribute` | Hero header, form + guidelines visible |
| `/grammar` | Bento cards, CTA banner |
| Nav (desktop) | Active link underlined on each page |
| Nav (mobile) | Burger opens sidebar, links close it, correct active state |

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete UI redesign — Modern Ivorian Heritage design system across all pages"
```
