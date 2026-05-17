# Contribution UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stripe one-time payment flow with a monthly funding widget on the homepage and a donation form on the existing `/contribute` page, tracking contributions in Supabase with a 50€/month goal.

**Architecture:** Stripe Checkout redirect flow — Next.js creates a session, Stripe hosts the payment page, a webhook fires on success and inserts into a `contributions` table. `FundingWidget` is a Server Component that reads the current month's total directly from Supabase. `DonateForm` is a Client Component with preset amounts (1€, 2€, 5€, 10€). Monthly reset is automatic: the query filters by the `YYYY-MM` month column written at insertion time.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, `stripe` npm package (server-side SDK), Tailwind CSS, Lucide icons, vitest (unit tests for pure validation logic)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260517000002_contributions.sql` | `contributions` table DDL |
| Create | `web/lib/donation.ts` | Pure functions: amount validation, contribution row builder |
| Create | `web/app/api/donate/checkout/route.ts` | POST — create Stripe Checkout session |
| Create | `web/app/api/donate/webhook/route.ts` | POST — receive Stripe webhook, insert contribution |
| Create | `web/components/FundingWidget.tsx` | Server Component — monthly progress bar |
| Create | `web/components/DonateForm.tsx` | Client Component — amount selector + checkout button |
| Create | `web/__tests__/donation.test.ts` | Unit tests for `web/lib/donation.ts` |
| Modify | `web/lib/types.ts` | Add `Contribution` type |
| Modify | `web/app/page.tsx` | Add `<FundingWidget />` |
| Modify | `web/app/contribute/page.tsx` | Add `<DonateForm />`, handle `?donated=true` banner |
| Modify | `web/app/layout.tsx` | Add "Soutenir" `NavLink` to desktop nav |
| Modify | `web/components/MobileSidebar.tsx` | Add "Soutenir" entry to `links` array |

---

## Task 1: Supabase Migration + Stripe Install

**Files:**
- Create: `supabase/migrations/20260517000002_contributions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260517000002_contributions.sql
create table contributions (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  amount_eur int not null,
  contributor_email text,
  month text not null,
  created_at timestamptz default now()
);

-- Only service role can insert (webhook uses service key)
alter table contributions enable row level security;

create policy "service role full access" on contributions
  using (true)
  with check (true);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Using the Supabase MCP tool `apply_migration` with the SQL above and migration name `contributions`.

Verify by running `list_tables` and confirming `contributions` appears.

- [ ] **Step 3: Install Stripe SDK**

```
cd web && npm install stripe
```

Expected: stripe added to `node_modules`, `package.json` updated.

- [ ] **Step 4: Add env vars to `.env.local.example`**

Open `web/.env.local.example` (create it if it doesn't exist) and append:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

- [ ] **Step 5: Commit**

```
git add supabase/migrations/20260517000002_contributions.sql web/package.json web/package-lock.json
git commit -m "feat: add contributions table migration and install Stripe SDK"
```

---

## Task 2: Vitest Setup + Pure Donation Logic (TDD)

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/lib/donation.ts`
- Create: `web/__tests__/donation.test.ts`

- [ ] **Step 1: Install vitest**

```
cd web && npm install -D vitest
```

- [ ] **Step 2: Create vitest config**

```ts
// web/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add test script to package.json**

In `web/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Write the failing tests**

```ts
// web/__tests__/donation.test.ts
import { describe, it, expect } from 'vitest'
import { validateDonationAmount, buildContributionRow } from '../lib/donation'

describe('validateDonationAmount', () => {
  it('accepts preset amounts', () => {
    expect(validateDonationAmount(100)).toBe(true)   // 1€
    expect(validateDonationAmount(200)).toBe(true)   // 2€
    expect(validateDonationAmount(500)).toBe(true)   // 5€
    expect(validateDonationAmount(1000)).toBe(true)  // 10€
  })

  it('accepts valid free amounts between 100 and 50000', () => {
    expect(validateDonationAmount(150)).toBe(true)
    expect(validateDonationAmount(49999)).toBe(true)
  })

  it('rejects amounts below 100', () => {
    expect(validateDonationAmount(99)).toBe(false)
    expect(validateDonationAmount(0)).toBe(false)
    expect(validateDonationAmount(-100)).toBe(false)
  })

  it('rejects amounts above 50000', () => {
    expect(validateDonationAmount(50001)).toBe(false)
  })

  it('rejects non-integer amounts', () => {
    expect(validateDonationAmount(1.5)).toBe(false)
  })
})

describe('buildContributionRow', () => {
  it('maps a Stripe session to a contribution row', () => {
    const session = {
      id: 'cs_test_abc123',
      amount_total: 500,
      created: 1747440000, // 2026-05-17 00:00:00 UTC
      customer_details: { email: 'test@example.com' },
    }
    const row = buildContributionRow(session as any)
    expect(row).toEqual({
      stripe_session_id: 'cs_test_abc123',
      amount_eur: 500,
      contributor_email: 'test@example.com',
      month: '2026-05',
    })
  })

  it('sets contributor_email to null when missing', () => {
    const session = {
      id: 'cs_test_xyz',
      amount_total: 200,
      created: 1747440000,
      customer_details: null,
    }
    const row = buildContributionRow(session as any)
    expect(row.contributor_email).toBeNull()
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

```
cd web && npm test
```

Expected: FAIL — `Cannot find module '../lib/donation'`

- [ ] **Step 6: Implement `web/lib/donation.ts`**

```ts
// web/lib/donation.ts
import type Stripe from 'stripe'

const MIN_CENTS = 100
const MAX_CENTS = 50000

export function validateDonationAmount(amount: number): boolean {
  if (!Number.isInteger(amount)) return false
  if (amount < MIN_CENTS || amount > MAX_CENTS) return false
  return true
}

export interface ContributionRow {
  stripe_session_id: string
  amount_eur: number
  contributor_email: string | null
  month: string
}

export function buildContributionRow(session: Stripe.Checkout.Session): ContributionRow {
  const date = new Date(session.created * 1000)
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return {
    stripe_session_id: session.id,
    amount_eur: session.amount_total ?? 0,
    contributor_email: session.customer_details?.email ?? null,
    month,
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```
cd web && npm test
```

Expected: All 6 tests PASS.

- [ ] **Step 8: Add `Contribution` type to `web/lib/types.ts`**

Append to the end of the file:

```ts
// ── Contribution types ─────────────────────────────────────────────────────

export interface Contribution {
  id: string
  stripe_session_id: string
  amount_eur: number
  contributor_email: string | null
  month: string
  created_at: string
}

export interface FundingProgress {
  raised_cents: number
  goal_cents: number
  month: string
}
```

- [ ] **Step 9: Commit**

```
git add web/vitest.config.ts web/lib/donation.ts web/lib/types.ts web/__tests__/donation.test.ts web/package.json web/package-lock.json
git commit -m "feat: add donation validation logic with vitest tests"
```

---

## Task 3: Checkout API Route

**Files:**
- Create: `web/app/api/donate/checkout/route.ts`

- [ ] **Step 1: Create the Stripe client singleton**

```ts
// web/app/api/donate/checkout/route.ts
import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { validateDonationAmount } from '@/lib/donation'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const amount = body?.amount

  if (typeof amount !== 'number' || !validateDonationAmount(amount)) {
    return NextResponse.json(
      { error: 'Montant invalide. Choisissez entre 1€ et 500€.' },
      { status: 400 }
    )
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: amount,
          product_data: {
            name: 'Soutien à Parlons Bété',
            description: 'Contribution au financement de la plateforme linguistique bété.',
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/contribute?donated=true`,
    cancel_url: `${origin}/contribute`,
  })

  return NextResponse.json({ url: session.url })
}
```

- [ ] **Step 2: Manual verification**

Start the dev server: `cd web && npm run dev`

Run in a separate terminal:
```
curl -X POST http://localhost:3000/api/donate/checkout \
  -H "Content-Type: application/json" \
  -d '{"amount": 500}'
```

Expected: JSON response `{ "url": "https://checkout.stripe.com/..." }` with status 200.

Then test invalid amount:
```
curl -X POST http://localhost:3000/api/donate/checkout \
  -H "Content-Type: application/json" \
  -d '{"amount": 50}' 
```
Expected: `{ "error": "Montant invalide..." }` with status 400.

- [ ] **Step 3: Commit**

```
git add web/app/api/donate/checkout/route.ts
git commit -m "feat: add POST /api/donate/checkout Stripe session creator"
```

---

## Task 4: Webhook API Route

**Files:**
- Create: `web/app/api/donate/webhook/route.ts`

- [ ] **Step 1: Create the webhook route**

```ts
// web/app/api/donate/webhook/route.ts
import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildContributionRow } from '@/lib/donation'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

// Service role client — bypasses RLS for webhook inserts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const row = buildContributionRow(session)

  const { error } = await supabaseAdmin
    .from('contributions')
    .upsert(row, { onConflict: 'stripe_session_id', ignoreDuplicates: true })

  if (error) {
    console.error('Webhook DB error:', error)
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// Stripe sends a raw body — Next.js must not parse it
export const config = { api: { bodyParser: false } }
```

- [ ] **Step 2: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local.example`**

Append to `web/.env.local.example`:
```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

- [ ] **Step 3: Manual verification (Stripe CLI)**

If Stripe CLI is installed:
```
stripe listen --forward-to localhost:3000/api/donate/webhook
```

Complete a test payment using Stripe's test card `4242 4242 4242 4242`. Verify a row appears in the `contributions` table in Supabase.

- [ ] **Step 4: Commit**

```
git add web/app/api/donate/webhook/route.ts web/.env.local.example
git commit -m "feat: add POST /api/donate/webhook — idempotent contribution recording"
```

---

## Task 5: FundingWidget Server Component

**Files:**
- Create: `web/components/FundingWidget.tsx`

- [ ] **Step 1: Create `FundingWidget.tsx`**

```tsx
// web/components/FundingWidget.tsx
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'

const GOAL_CENTS = 5000

async function getMonthlyProgress(): Promise<{ raised: number; month: string }> {
  const supabase = await createClient()
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('contributions')
    .select('amount_eur')
    .eq('month', month)
  if (error || !data) return { raised: 0, month }
  const raised = data.reduce((sum, row) => sum + row.amount_eur, 0)
  return { raised, month }
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export async function FundingWidget() {
  let raised = 0
  let month = ''
  try {
    const result = await getMonthlyProgress()
    raised = result.raised
    month = result.month
  } catch {
    return null
  }

  const [year, monthNum] = month.split('-')
  const monthLabel = `${MONTH_NAMES_FR[parseInt(monthNum) - 1]} ${year}`
  const pct = Math.min(100, Math.round((raised / GOAL_CENTS) * 100))
  const raisedEur = (raised / 100).toFixed(0)
  const goalEur = (GOAL_CENTS / 100).toFixed(0)
  const reached = raised >= GOAL_CENTS

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-secondary" />
          <span className="text-sm font-semibold text-foreground">
            Financement du mois — {monthLabel}
          </span>
        </div>
        <Link
          href="/contribute"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Contribuer →
        </Link>
      </div>

      <div className="w-full bg-foreground/10 h-2.5 rounded-full overflow-hidden mb-2">
        <div
          className="bg-secondary h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {reached
          ? <span className="text-secondary font-semibold">Objectif atteint !</span>
          : <><span className="font-semibold text-foreground">{raisedEur}€</span> / {goalEur}€ ce mois-ci</>
        }
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Add `FundingWidget` to `web/app/page.tsx`**

Add the import at the top of the file (after existing imports):
```tsx
import { FundingWidget } from '@/components/FundingWidget'
```

Insert `<FundingWidget />` inside the `<div className="... space-y-10">` wrapper, after `<HomeTranslator />` and before the words-of-the-day grid:

```tsx
      {/* Translator */}
      <HomeTranslator />

      {/* Monthly funding */}
      <FundingWidget />

      {/* 3 Words of the Day */}
```

- [ ] **Step 3: Verify visually**

Run `npm run dev`, open `http://localhost:3000`. Confirm:
- Widget appears between the translator and the words of the day
- Progress bar shows (0€ / 50€ if no contributions yet)
- "Contribuer →" link goes to `/contribute`

- [ ] **Step 4: Commit**

```
git add web/components/FundingWidget.tsx web/app/page.tsx
git commit -m "feat: add FundingWidget monthly progress bar on homepage"
```

---

## Task 6: DonateForm Client Component

**Files:**
- Create: `web/components/DonateForm.tsx`
- Modify: `web/app/contribute/page.tsx`

- [ ] **Step 1: Create `DonateForm.tsx`**

```tsx
// web/components/DonateForm.tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'

const PRESETS = [
  { label: '1€', cents: 100 },
  { label: '2€', cents: 200 },
  { label: '5€', cents: 500 },
  { label: '10€', cents: 1000 },
]

export function DonateForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selected, setSelected] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showThanks, setShowThanks] = useState(false)

  useEffect(() => {
    if (searchParams.get('donated') === 'true') {
      setShowThanks(true)
      router.replace('/contribute', { scroll: false })
    }
  }, [searchParams, router])

  function getAmountCents(): number | null {
    if (custom) {
      const euros = parseFloat(custom.replace(',', '.'))
      if (isNaN(euros)) return null
      return Math.round(euros * 100)
    }
    return selected
  }

  async function handleSubmit() {
    const amount = getAmountCents()
    if (!amount || amount < 100 || amount > 50000) {
      setError('Veuillez choisir un montant entre 1€ et 500€.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/donate/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Erreur inconnue')
      window.location.href = data.url
    } catch (e) {
      setError('Une erreur est survenue, veuillez réessayer.')
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
      {showThanks && (
        <div className="mb-6 flex items-start justify-between gap-4 bg-secondary/10 border border-secondary/30 rounded-lg px-4 py-3">
          <p className="text-sm text-secondary font-medium">
            Merci pour votre contribution ! Vous aidez à préserver la langue bété.
          </p>
          <button
            onClick={() => setShowThanks(false)}
            className="text-secondary/60 hover:text-secondary text-lg leading-none shrink-0"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}

      <h2 className="font-heading text-2xl text-primary flex items-center gap-2 mb-2">
        <Heart className="w-6 h-6" />
        Soutenir le projet
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        La plateforme est financée par des contributions volontaires. Chaque euro aide à couvrir
        l&apos;hébergement et les coûts API pour préserver la langue bété.
      </p>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-3 mb-4">
        {PRESETS.map(({ label, cents }) => (
          <button
            key={cents}
            onClick={() => { setSelected(cents); setCustom('') }}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              selected === cents && !custom
                ? 'bg-primary text-white border-primary'
                : 'bg-background border-border hover:border-primary hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm text-muted-foreground">Autre montant :</span>
        <div className="relative">
          <input
            type="number"
            min="1"
            max="500"
            step="1"
            placeholder="Ex: 15"
            value={custom}
            onChange={e => { setCustom(e.target.value); setSelected(null) }}
            className="w-28 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || (!selected && !custom)}
        className="bg-primary text-white font-semibold px-6 py-3 rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirection...' : 'Soutenir le projet →'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add `DonateForm` to `web/app/contribute/page.tsx`**

Add import at the top:
```tsx
import { DonateForm } from '@/components/DonateForm'
```

Insert a new section **before** the `{/* Hero Header */}` block (or after the hero, before the two-column grid — your call; spec says top of the page):

Add it after the hero block and before the `DialectSelector` section:

```tsx
      {/* Donate section */}
      <div className="mb-8">
        <DonateForm />
      </div>
```

Full insertion point in the JSX (after the closing `</div>` of the hero block, before `{/* Two-column layout */}`):

```tsx
      </div>{/* end hero */}

      {/* Financial support */}
      <div className="mb-8">
        <DonateForm />
      </div>

      {/* Two-column layout */}
      <div className="mb-6">
```

- [ ] **Step 3: Verify the thank-you banner**

In the browser, navigate to `http://localhost:3000/contribute?donated=true`. Confirm:
- The green thank-you banner appears at the top of `DonateForm`
- The URL is immediately cleaned up to `/contribute` (no `?donated=true`)
- Clicking `×` dismisses the banner

- [ ] **Step 4: Verify the checkout flow**

Select "5€", click "Soutenir le projet →". Confirm:
- Button shows "Redirection..." briefly
- Browser redirects to `https://checkout.stripe.com/...`

- [ ] **Step 5: Commit**

```
git add web/components/DonateForm.tsx web/app/contribute/page.tsx
git commit -m "feat: add DonateForm with Stripe checkout on /contribute page"
```

---

## Task 7: Navigation Links

**Files:**
- Modify: `web/app/layout.tsx`
- Modify: `web/components/MobileSidebar.tsx`

- [ ] **Step 1: Add "Soutenir" to desktop nav in `web/app/layout.tsx`**

Locate the hidden-md nav links block. Add the new link **after** `Contribuer` and **before** `Contact`:

```tsx
              <NavLink href="/contribute">Contribuer</NavLink>
              <NavLink href="/contribute#soutenir">Soutenir</NavLink>
              <NavLink href="/contact">Contact</NavLink>
```

Wait — the donate form is on `/contribute`, not a separate page. The nav link should go to `/contribute` and scroll to the donate section. Add an `id` to the donate div in `contribute/page.tsx`:

```tsx
      <div className="mb-8" id="soutenir">
        <DonateForm />
      </div>
```

Then in `layout.tsx`:
```tsx
              <NavLink href="/contribute#soutenir">Soutenir</NavLink>
```

- [ ] **Step 2: Add "Soutenir" to mobile sidebar in `web/components/MobileSidebar.tsx`**

Locate the `links` array at the top of the file. Add after the `Contribuer` entry:

```ts
import { Users, Mic2, Home, BookOpen, BookText, MessageCircle, Layers, PlusCircle, Phone, User, Heart } from 'lucide-react'

const links = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/lexicon', label: 'Lexique', icon: BookOpen },
  { href: '/grammar', label: 'Grammaire', icon: BookText },
  { href: '/forum', label: 'Forum', icon: MessageCircle },
  { href: '/resources', label: 'Ressources', icon: Layers },
  { href: '/contribute', label: 'Contribuer', icon: PlusCircle },
  { href: '/contribute#soutenir', label: 'Soutenir', icon: Heart },
  { href: '/contact', label: 'Contact', icon: Phone },
]
```

- [ ] **Step 3: Verify nav**

Open `http://localhost:3000` on desktop. Confirm "Soutenir" appears in the nav bar.
Open the mobile menu. Confirm "Soutenir" appears with a Heart icon.
Click "Soutenir" — confirm it scrolls to / highlights the `DonateForm` section on `/contribute`.

- [ ] **Step 4: Commit**

```
git add web/app/layout.tsx web/components/MobileSidebar.tsx web/app/contribute/page.tsx
git commit -m "feat: add Soutenir nav link on desktop and mobile sidebar"
```

---

## Task 8: Stripe Webhook Configuration

This is a deployment step, not a code step. Do it once before going to production.

- [ ] **Step 1: Register the webhook endpoint in Stripe Dashboard**

Go to Stripe Dashboard → Developers → Webhooks → Add endpoint.

- Endpoint URL: `https://your-domain.com/api/donate/webhook`
- Events to listen to: `checkout.session.completed`
- Copy the signing secret (`whsec_...`) → add to Vercel env vars as `STRIPE_WEBHOOK_SECRET`

- [ ] **Step 2: Add all env vars to Vercel**

In Vercel Dashboard → Project → Settings → Environment Variables, add:
- `STRIPE_SECRET_KEY` = `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` = `whsec_...`
- `SUPABASE_SERVICE_ROLE_KEY` = (from Supabase Dashboard → Project Settings → API → service_role key)

- [ ] **Step 3: Deploy and do a live test**

Deploy to Vercel. Make a real 1€ payment using your own card. Confirm:
- Row appears in `contributions` table in Supabase
- `FundingWidget` on homepage updates (may need a page reload — it's a Server Component)
- Thank-you banner shows on `/contribute`

- [ ] **Step 4: Final commit**

```
git add .
git commit -m "chore: confirm Stripe webhook and env vars configured for production"
```
