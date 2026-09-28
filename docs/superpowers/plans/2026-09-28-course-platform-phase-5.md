# Phase 5: Paid Courses, Dual Payment Rails & Admin Payout Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 5 of the Course Platform: Paid course support with admin approval gating (`paid_approved`), dual payment checkout rails (Cards via Stripe Checkout + Mobile Money via Paystack/CinetPay webhook convergence), course orders tracking table (`course_orders`), webhooks writing `enrollments` rows upon payment completion, and local-first DB/RLS security testing.

**Architecture:**
- **Admin Gating:** Teachers can set a course as `access = 'paid'` with a price, but it cannot be purchased or enrolled until an admin approves it (`paid_approved = true`).
- **Checkout Flow:** Learner clicks "Acheter le cours" on `/courses/[slug]` → Requests checkout session at `/api/courses/checkout` → Server verifies `paid_approved = true` and creates a `pending` row in `course_orders` → Redirects to Stripe Checkout (card) or Mobile Money gateway.
- **Webhook Convergence:** When payment succeeds, Stripe (`checkout.session.completed`) or Mobile Money webhook POSTs to `/api/courses/webhook` → Server verifies HMAC signature, marks `course_orders` as `completed`, and inserts `(user_id, course_id)` into `enrollments`. Both payment rails converge on the exact same `enrollments` table from Phase 1.
- **Zero New Dependencies:** Reuses existing `stripe`, `@supabase/ssr`, `lucide-react`, and Next.js 16 App Router.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase SSR & RLS (Postgres 17), Stripe Node.js SDK, Vitest 4, Tailwind CSS 4.

**Spec:** [`docs/superpowers/specs/2026-09-25-course-platform-design.md`](file:///c:/Users/DELL%20LATITUDE%207480/traduction%20bété/docs/superpowers/specs/2026-09-25-course-platform-design.md) (Phase 5: Payments).

---

## Global Constraints

- **Zero Accidental Deletion Policy**: NEVER delete existing feature code, routes, or database columns.
- **Local-First Testing Protocol**:
  1. Write migration in `supabase/migrations/20260928000003_courses_phase5_payments.sql`.
  2. Run `npx supabase migration up` on local Docker stack (`127.0.0.1:54322`).
  3. Execute `npm run test:rls` to verify RLS policies against local test actors.
  4. Only after local tests pass 100%, apply to remote Supabase via `supabase-mcp-server:apply_migration`.
- **Typographic Curly Apostrophes**: All French user-facing copy MUST use strict typographic apostrophes (`’`, `U+2019`).
- **Browser Floor**: iOS Safari >= 15.4 (`safari >= 15.4`).
- **Git Hygiene**: Atomic commits per task with explicit file paths and `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.

---

## File Structure & Responsibilities Table

| File Path | Single Responsibility |
|---|---|
| `supabase/migrations/20260928000003_courses_phase5_payments.sql` | Phase 5 DB migration: `paid_approved` column on `courses`, `course_orders` table, indexes, and RLS policies |
| `web/__tests__/rls/phase5-payments.test.ts` | RLS integration test suite for paid course approval and order security |
| `web/lib/courses/payment.ts` | Pure payment domain types, price formatters, and gateway payload builders |
| `web/__tests__/course-payment.test.ts` | Unit tests for price formatting and order validation logic |
| `web/lib/courses/queries.ts` | Server-side queries for `course_orders` and admin pending paid courses |
| `web/lib/courses/mutations.ts` | Mutations for creating pending orders and admin approving paid courses |
| `web/app/api/courses/checkout/route.ts` | Next.js API route creating Stripe/Mobile Money checkout sessions |
| `web/app/api/courses/webhook/route.ts` | Next.js API route handling payment webhook events and writing `enrollments` |
| `web/components/courses/PaidCheckoutModal.tsx` | Learner modal choosing Card vs Mobile Money checkout rail |
| `web/components/courses/AdminPaidCourseApproval.tsx` | Admin moderation component for toggling paid course approvals |
| `web/app/admin/courses/page.tsx` | Admin page route for approving paid courses |
| `web/app/courses/[slug]/page.tsx` | Updated course detail page handling paid checkout modal integration |
| `web/components/courses/LessonEditor.tsx` | Updated course settings adding price input and approval status indicator |

---

### Task 1: Database Migration for Paid Courses & Orders Schema

**Files:**
- Create: `supabase/migrations/20260928000003_courses_phase5_payments.sql`

**Interfaces:**
- Consumes: `courses`, `auth.users`, `is_admin()`.
- Produces: `courses.paid_approved` column, `course_orders` table with RLS policies.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260928000003_courses_phase5_payments.sql`:

```sql
-- Course Platform, Phase 5: Paid courses, dual payment rails & admin payout approval.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Add paid_approved Flag to Courses ────────────────────────────────────
alter table courses
  add column if not exists paid_approved boolean not null default false;

-- ── 2. Course Orders Table ──────────────────────────────────────────────────
create table if not exists course_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    uuid not null references courses(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  currency     text not null default 'eur' check (currency in ('eur', 'xof', 'usd')),
  payment_rail text not null check (payment_rail in ('stripe', 'mobile_money')),
  gateway_ref  text unique check (gateway_ref is null or char_length(gateway_ref) <= 255),
  status       text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists course_orders_user_idx on course_orders (user_id);
create index if not exists course_orders_course_idx on course_orders (course_id);
create index if not exists course_orders_status_idx on course_orders (status);

alter table course_orders enable row level security;

-- Users can read their own orders; admins can read all orders.
create policy course_orders_select on course_orders
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select is_admin())
  );

-- Users can insert pending orders for themselves.
create policy course_orders_insert_own on course_orders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
  );

-- Only admins (or service role) can update order status.
create policy course_orders_admin_update on course_orders
  for update to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
```

- [ ] **Step 2: Apply migration to local Docker stack**

Run from repo root:
```bash
npx supabase migration up
```
Expected: `Applying migration 20260928000003_courses_phase5_payments.sql...` with exit code 0.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/20260928000003_courses_phase5_payments.sql
git commit -m "feat(db): phase 5 paid courses approval flag and course_orders schema" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: RLS Test Suite for Paid Courses & Order Security

**Files:**
- Create: `web/__tests__/rls/phase5-payments.test.ts`

**Interfaces:**
- Consumes: `admin`, `createUser`, `makeAdmin`, `seedCourse`, `must`, `TestUser`, `Seed`.
- Tests: Admin setting `paid_approved`, learner pending order creation, outsider order block, and payment completion gating.

- [ ] **Step 1: Write the RLS test file**

Create `web/__tests__/rls/phase5-payments.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 5 paid courses & orders RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let orderId: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p5-teacher'),
      createUser('p5-learner'),
      createUser('p5-outsider'),
      createUser('p5-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Set course as paid
    await admin.from('courses').update({ access: 'paid', price_cents: 2900, currency: 'eur' }).eq('id', seed.course.id)

    // Create a pending order as learner
    const order = must(
      await learner.client.from('course_orders').insert({
        user_id: learner.id,
        course_id: seed.course.id,
        amount_cents: 2900,
        currency: 'eur',
        payment_rail: 'stripe',
        gateway_ref: `cs_test_${Date.now()}`,
        status: 'pending',
      }).select('id').single(),
      'create course order',
    )
    orderId = order.id
  })

  describe('paid_approved & course_orders RLS', () => {
    it('allows admin to approve paid course sale', async () => {
      const res = await boss.client
        .from('courses')
        .update({ paid_approved: true })
        .eq('id', seed.course.id)

      expect(res.error).toBeNull()

      const { data } = await learner.client.from('courses').select('paid_approved').eq('id', seed.course.id).single()
      expect(data?.paid_approved).toBe(true)
    })

    it('allows learner to read their own course order', async () => {
      const { data, error } = await learner.client
        .from('course_orders')
        .select('amount_cents, payment_rail, status')
        .eq('id', orderId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].amount_cents).toBe(2900)
    })

    it('denies outsider from reading learner course order', async () => {
      const { data } = await outsider.client
        .from('course_orders')
        .select('id')
        .eq('id', orderId)

      expect(data).toEqual([])
    })

    it('denies regular user from updating course order status directly', async () => {
      const res = await learner.client
        .from('course_orders')
        .update({ status: 'completed' })
        .eq('id', orderId)

      // RLS denies update because status update requires admin or service role
      const { data } = await admin.from('course_orders').select('status').eq('id', orderId).single()
      expect(data?.status).toBe('pending')
    })
  })
})
```

- [ ] **Step 2: Run local RLS tests**

Run from `web/`:
```bash
npm run test:rls -- phase5-payments
```
Expected: PASS with 0 failures.

- [ ] **Step 3: Commit RLS tests**

```bash
git add web/__tests__/rls/phase5-payments.test.ts
git commit -m "test(rls): phase 5 paid courses approval and order security RLS tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Pure Payment Domain Library & Price Formatters

**Files:**
- Create: `web/lib/courses/payment.ts`
- Create: `web/__tests__/course-payment.test.ts`

**Interfaces:**
- Produces:
  - `CourseOrder`, `PaymentRail`, `CheckoutPayload`.
  - `formatCoursePrice(priceCents: number | null, currency?: string)`.
  - `isCoursePurchasable(course: { access: string; paid_approved: boolean })`.

- [ ] **Step 1: Write failing unit tests**

Create `web/__tests__/course-payment.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCoursePrice, isCoursePurchasable } from '../lib/courses/payment'

describe('formatCoursePrice', () => {
  it('formats EUR and XOF prices', () => {
    expect(formatCoursePrice(2900, 'eur')).toBe('29,00 €')
    expect(formatCoursePrice(500000, 'xof')).toBe('5 000 FCFA')
    expect(formatCoursePrice(0, 'eur')).toBe('Gratuit')
    expect(formatCoursePrice(null)).toBe('Gratuit')
  })
})

describe('isCoursePurchasable', () => {
  it('checks if a paid course is approved for sale', () => {
    expect(isCoursePurchasable({ access: 'free', paid_approved: false })).toBe(true)
    expect(isCoursePurchasable({ access: 'paid', paid_approved: false })).toBe(false)
    expect(isCoursePurchasable({ access: 'paid', paid_approved: true })).toBe(true)
  })
})
```

- [ ] **Step 2: Implement domain logic in `web/lib/courses/payment.ts`**

Create `web/lib/courses/payment.ts`:

```ts
export type PaymentRail = 'stripe' | 'mobile_money'

export interface CourseOrder {
  id: string
  user_id: string
  course_id: string
  amount_cents: number
  currency: string
  payment_rail: PaymentRail
  gateway_ref: string | null
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export function formatCoursePrice(priceCents?: number | null, currency = 'eur'): string {
  if (!priceCents || priceCents <= 0) return 'Gratuit'

  if (currency.toLowerCase() === 'xof') {
    const fcfa = Math.round(priceCents / 100)
    return `${fcfa.toLocaleString('fr-FR')} FCFA`
  }

  const euros = (priceCents / 100).toFixed(2).replace('.', ',')
  return `${euros} €`
}

export function isCoursePurchasable(course: { access: string; paid_approved?: boolean }): boolean {
  if (course.access === 'free') return true
  return Boolean(course.paid_approved)
}
```

- [ ] **Step 3: Run unit tests**

Run from `web/`:
```bash
npm test -- course-payment
```
Expected: PASS with 0 failures.

- [ ] **Step 4: Commit**

```bash
git add web/lib/courses/payment.ts web/__tests__/course-payment.test.ts
git commit -m "feat(courses): payment domain types, price formatters, and purchasability checks" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Server Payment Queries & Order Mutations

**Files:**
- Modify: `web/lib/courses/queries.ts`
- Modify: `web/lib/courses/mutations.ts`

**Interfaces:**
- Produces: `getPendingPaidCoursesForAdmin`, `getUserOrders`, `createPendingCourseOrder`, `approvePaidCourse`.

- [ ] **Step 1: Add queries in `web/lib/courses/queries.ts`**

Append to `web/lib/courses/queries.ts`:

```ts
import type { CourseOrder } from './payment'

/** Fetches paid courses requesting admin approval for sale. */
export async function getPendingPaidCoursesForAdmin(client: SupabaseClient): Promise<Course[]> {
  const { data } = await client
    .from('courses')
    .select('*')
    .eq('access', 'paid')
    .eq('paid_approved', false)
    .order('created_at', { ascending: false })

  return (data ?? []) as Course[]
}

/** Fetches a user's course orders. */
export async function getUserOrders(client: SupabaseClient, userId: string): Promise<CourseOrder[]> {
  const { data } = await client
    .from('course_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data ?? []) as CourseOrder[]
}
```

- [ ] **Step 2: Add mutations in `web/lib/courses/mutations.ts`**

Append to `web/lib/courses/mutations.ts`:

```ts
import type { CourseOrder, PaymentRail } from './payment'

/** Creates a pending course order for a paid course. */
export async function createPendingCourseOrder(
  client: SupabaseClient,
  courseId: string,
  paymentRail: PaymentRail,
): Promise<Result<CourseOrder>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour acheter ce cours.')

  const { data: course } = await client.from('courses').select('id, access, price_cents, currency, paid_approved').eq('id', courseId).single()
  if (!course) return fail('Cours introuvable.')
  if (course.access !== 'paid' || !course.paid_approved) return fail('Ce cours n’est pas disponible à l’achat.')
  if (!course.price_cents || course.price_cents <= 0) return fail('Le prix du cours est invalide.')

  const { data: order, error } = await client
    .from('course_orders')
    .insert({
      user_id: user.id,
      course_id: course.id,
      amount_cents: course.price_cents,
      currency: course.currency || 'eur',
      payment_rail: paymentRail,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error || !order) return fail(error?.message ?? 'Erreur lors de la création de la commande.')

  return ok(order as CourseOrder)
}

/** Admin toggles paid course sale approval. */
export async function approvePaidCourse(
  client: SupabaseClient,
  courseId: string,
  approved: boolean,
): Promise<Result<null>> {
  const admin = await isAdmin(client)
  if (!admin) return fail('Action réservée aux administrateurs.')

  const { error } = await client.from('courses').update({ paid_approved: approved }).eq('id', courseId)
  return done(error)
}
```

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/courses/queries.ts web/lib/courses/mutations.ts
git commit -m "feat(courses): payment order queries and admin approval mutations" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Checkout API Route & Dual Payment Webhook Endpoint

**Files:**
- Create: `web/app/api/courses/checkout/route.ts`
- Create: `web/app/api/courses/webhook/route.ts`

**Interfaces:**
- Consumes: `Stripe`, `createAdminClient`, `createPendingCourseOrder`.
- Produces: `/api/courses/checkout` and `/api/courses/webhook`.

- [ ] **Step 1: Create `/api/courses/checkout` API route**

Create `web/app/api/courses/checkout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase-server'
import { createPendingCourseOrder } from '@/lib/courses/mutations'
import type { PaymentRail } from '@/lib/courses/payment'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour continuer.' }, { status: 401 })
  }

  const { courseId, paymentRail } = (await request.json().catch(() => ({}))) as {
    courseId?: string
    paymentRail?: PaymentRail
  }

  if (!courseId || !paymentRail) {
    return NextResponse.json({ error: 'Paramètres manquants.' }, { status: 400 })
  }

  const orderRes = await createPendingCourseOrder(supabase, courseId, paymentRail)
  if (orderRes.error || !orderRes.data) {
    return NextResponse.json({ error: orderRes.error }, { status: 400 })
  }

  const order = orderRes.data

  // Handle Stripe Card rail
  if (paymentRail === 'stripe') {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe n’est pas configuré sur le serveur.' }, { status: 500 })
    }

    const stripe = new Stripe(stripeKey)
    const { data: course } = await supabase.from('courses').select('title, slug').eq('id', courseId).single()

    const origin = request.headers.get('origin') || 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: user.id,
      metadata: {
        order_id: order.id,
        course_id: courseId,
        user_id: user.id,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency,
            unit_amount: order.amount_cents,
            product_data: {
              name: course?.title || 'Cours Bété',
            },
          },
        },
      ],
      success_url: `${origin}/courses/${course?.slug || ''}?payment=success`,
      cancel_url: `${origin}/courses/${course?.slug || ''}?payment=cancelled`,
    })

    // Update order gateway_ref with Stripe session ID
    await supabase.from('course_orders').update({ gateway_ref: session.id }).eq('id', order.id)

    return NextResponse.json({ url: session.url })
  }

  // Mobile Money rail placeholder return (or local gateway URL)
  return NextResponse.json({
    url: `/courses?payment=pending_mobile_money&orderId=${order.id}`,
  })
}
```

- [ ] **Step 2: Create `/api/courses/webhook` API route**

Create `web/app/api/courses/webhook/route.ts`:

```ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const stripeKey = process.env.STRIPE_SECRET_KEY

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuration Supabase incomplète.' }, { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Handle Stripe Webhooks
  if (stripeKey && webhookSecret && sig) {
    const stripe = new Stripe(stripeKey)
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signature invalide'
      return NextResponse.json({ error: `Erreur webhook Stripe: ${message}` }, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.order_id
      const courseId = session.metadata?.course_id
      const userId = session.metadata?.user_id || session.client_reference_id

      if (courseId && userId) {
        // 1. Update order status to completed
        if (orderId) {
          await adminClient
            .from('course_orders')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', orderId)
        }

        // 2. Insert enrollment (converges on exact same enrollments table from Phase 1)
        await adminClient.from('enrollments').upsert(
          {
            user_id: userId,
            course_id: courseId,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,course_id' },
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/api/courses/checkout/route.ts web/app/api/courses/webhook/route.ts
git commit -m "feat(api): Stripe Checkout and payment webhook routes writing enrollments" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Paid Checkout Modal & Admin Course Approval Components

**Files:**
- Create: `web/components/courses/PaidCheckoutModal.tsx`
- Create: `web/components/courses/AdminPaidCourseApproval.tsx`
- Create: `web/app/admin/courses/page.tsx`

**Interfaces:**
- Produces: `PaidCheckoutModal({ courseId, courseTitle, priceCents, currency, open, onClose })`, `AdminPaidCourseApproval`.

- [ ] **Step 1: Create PaidCheckoutModal component**

Create `web/components/courses/PaidCheckoutModal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { CreditCard, Smartphone, ShieldCheck, AlertCircle } from 'lucide-react'
import { formatCoursePrice, type PaymentRail } from '@/lib/courses/payment'
import { Button } from '@/components/ui/button'

interface Props {
  courseId: string
  courseTitle: string
  priceCents: number
  currency?: string
  open: boolean
  onClose: () => void
}

export function PaidCheckoutModal({ courseId, courseTitle, priceCents, currency = 'eur', open, onClose }: Props) {
  const [rail, setRail] = useState<PaymentRail>('stripe')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleCheckout() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/courses/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, paymentRail: rail }),
      })

      const data = await res.json()
      setLoading(false)

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Erreur lors du traitement du paiement.')
        return
      }

      window.location.href = data.url
    } catch {
      setLoading(false)
      setError('Erreur réseau lors de la redirection vers le paiement.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <span className="text-xs font-semibold text-primary uppercase">Accès payant</span>
            <h3 className="font-heading text-lg font-bold truncate">{courseTitle}</h3>
          </div>
          <span className="text-lg font-bold font-mono text-primary">{formatCoursePrice(priceCents, currency)}</span>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Choisissez votre moyen de paiement :</p>

          <button
            type="button"
            onClick={() => setRail('stripe')}
            className={`w-full p-4 rounded-xl border text-left flex items-center gap-3 transition-colors ${
              rail === 'stripe' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted'
            }`}
          >
            <CreditCard className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">Carte bancaire (Visa, Mastercard)</p>
              <p className="text-xs text-muted-foreground">Paiement sécurisé Stripe (Diaspora & International)</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setRail('mobile_money')}
            className={`w-full p-4 rounded-xl border text-left flex items-center gap-3 transition-colors ${
              rail === 'mobile_money' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted'
            }`}
          >
            <Smartphone className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Mobile Money (Orange, MTN, Wave, Moov)</p>
              <p className="text-xs text-muted-foreground">Paiement local Côte d’Ivoire & Afrique de l’Ouest</p>
            </div>
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="button" onClick={handleCheckout} disabled={loading}>
            <ShieldCheck className="w-4 h-4 mr-2" />
            {loading ? 'Redirection…' : 'Procéder au paiement'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create AdminPaidCourseApproval component & `/admin/courses/page.tsx` route**

Create `web/components/courses/AdminPaidCourseApproval.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Check, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { approvePaidCourse } from '@/lib/courses/mutations'
import { formatCoursePrice } from '@/lib/courses/payment'
import type { Course } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'

interface Props {
  initialCourses: Course[]
}

export function AdminPaidCourseApproval({ initialCourses }: Props) {
  const [supabase] = useState(() => createClient())
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleApprove(courseId: string) {
    setLoadingId(courseId)
    const res = await approvePaidCourse(supabase, courseId, true)
    setLoadingId(null)

    if (!res.error) {
      setCourses(prev => prev.filter(c => c.id !== courseId))
    }
  }

  return (
    <div className="space-y-4">
      {courses.length === 0 ? (
        <div className="p-10 border border-dashed border-border rounded-xl text-center text-muted-foreground">
          Aucun cours payant en attente d’approbation.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(course => (
            <div key={course.id} className="border border-border rounded-xl p-5 bg-card flex items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-base">{course.title}</h4>
                <p className="text-xs text-muted-foreground">
                  Prix : <strong className="font-mono">{formatCoursePrice(course.price_cents, course.currency)}</strong>
                </p>
              </div>
              <Button size="sm" onClick={() => handleApprove(course.id)} disabled={loadingId === course.id}>
                <Check className="w-4 h-4 mr-1" />
                Approuver la vente
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Create `web/app/admin/courses/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { getPendingPaidCoursesForAdmin, isAdmin } from '@/lib/courses/queries'
import { AdminPaidCourseApproval } from '@/components/courses/AdminPaidCourseApproval'

export const dynamic = 'force-dynamic'

export default async function AdminCoursesPage() {
  const supabase = await createClient()
  const admin = await isAdmin(supabase)
  if (!admin) redirect('/courses')

  const pendingPaid = await getPendingPaidCoursesForAdmin(supabase)

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-6">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour à la gestion des cours
      </Link>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" />
          Approbation des cours payants
        </h1>
        <p className="text-sm text-muted-foreground">
          Validez la commercialisation des cours payants soumis par les enseignants.
        </p>
      </div>

      <AdminPaidCourseApproval initialCourses={pendingPaid} />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/courses/PaidCheckoutModal.tsx web/components/courses/AdminPaidCourseApproval.tsx web/app/admin/courses/page.tsx
git commit -m "feat(courses): PaidCheckoutModal and admin paid course approval page" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Integrate Paid Gating into Course Page & Lesson Editor

**Files:**
- Modify: `web/app/courses/[slug]/page.tsx`
- Modify: `web/components/courses/LessonEditor.tsx`

**Interfaces:**
- Consumes: `PaidCheckoutModal`, `isCoursePurchasable`, `formatCoursePrice`.

- [ ] **Step 1: Integrate PaidCheckoutModal in `/courses/[slug]/page.tsx`**

In `web/app/courses/[slug]/page.tsx`:
- Render `PaidCheckoutModal` when course access is `paid` and learner clicks enroll.

- [ ] **Step 2: Add Price & Access Controls in `LessonEditor.tsx`**

In `web/components/courses/LessonEditor.tsx`:
- Allow teachers to toggle access between `free` and `paid` and enter price in EUR or FCFA.
- Show warning badge if `access === 'paid'` and `paid_approved === false`: "En attente d’approbation par l’administration".

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/courses/[slug]/page.tsx web/components/courses/LessonEditor.tsx
git commit -m "feat(courses): integrate paid checkout modal and teacher pricing settings" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Final Verification & Rollout Documentation

**Files:** None created (verification only).

- [ ] **Step 1: Execute all unit and RLS test suites**

Run from `web/`:
```bash
npm test
npm run test:rls
npx tsc --noEmit
npm run build
```
Expected:
- All 12 unit test files PASS.
- All 7 RLS test files PASS (60+ tests).
- Clean Next.js production build with zero errors.

- [ ] **Step 2: Write walkthrough document**

Create `docs/superpowers/walkthroughs/2026-09-28-course-platform-phase-5-rollout.md`.

- [ ] **Step 3: Final Git commit & push**

Commit walkthrough and push `feat/course-platform-phase-5` branch to remote.
