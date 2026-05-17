# Contribution UI — Design Spec
**Date:** 2026-05-17
**Status:** Approved

---

## Overview

Add a funding widget and donation form to the Bété language platform so visitors can make one-time financial contributions via Stripe. The monthly goal is **50€**. Progress resets automatically each calendar month. No new pages are introduced — the UI lives on the existing homepage and `/contribute` page.

---

## Platform Cost Context

The 50€/month goal covers:

| Service | Plan | Cost |
|---|---|---|
| Vercel | Hobby → Pro | 0–20€/mo |
| Supabase | Free → Pro | 0–25€/mo |
| Anthropic API | Usage-based (Claude Haiku) | ~10–50€/mo |
| Resend | Free tier | 0€/mo |

**Realistic monthly spend:** 10–50€ (free tiers + API) or up to ~115€ if fully on paid plans. 50€ covers the API costs and contributes toward paid infrastructure.

---

## Architecture: Option A — Stripe Checkout + Webhook

```
User clicks donate
  → POST /api/donate/checkout (creates Stripe session)
  → Redirect to Stripe hosted checkout
  → User pays
  → Stripe fires checkout.session.completed webhook
  → POST /api/donate/webhook (verifies signature, inserts contribution)
  → User redirected to /contribute?donated=true (thank-you toast)
```

---

## 1. Database

**New table: `contributions`**

```sql
create table contributions (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  amount_eur int not null,        -- in cents (100 = 1€, 1000 = 10€)
  contributor_email text,         -- from Stripe, nullable
  month text not null,            -- 'YYYY-MM', used for monthly filtering
  created_at timestamptz default now()
);
```

Monthly total query:
```sql
SELECT COALESCE(SUM(amount_eur), 0) AS raised_cents
FROM contributions
WHERE month = to_char(now(), 'YYYY-MM');
```

The `stripe_session_id unique` constraint prevents duplicate insertions if Stripe retries the webhook.

---

## 2. API Routes

### `POST /api/donate/checkout`

**Input:** `{ amount: number }` — amount in cents

**Validation (server-side):**
- Must be one of `[100, 200, 500, 1000]` (preset amounts)
- OR a free amount between `100` and `50000` (1€–500€)
- Reject anything outside these bounds with 400

**Behaviour:**
- Creates a Stripe Checkout session (`mode: 'payment'`)
- `success_url`: `/contribute?donated=true`
- `cancel_url`: `/contribute`
- Returns `{ url: string }` — frontend redirects

### `POST /api/donate/webhook`

**Input:** Raw Stripe event body + `Stripe-Signature` header

**Behaviour:**
- Verifies signature with `stripe.webhooks.constructEvent`
- Handles `checkout.session.completed` only
- Extracts `session.id`, `session.amount_total`, `session.customer_details.email`
- Computes `month = YYYY-MM` from `session.created`
- Inserts into `contributions` (upsert on `stripe_session_id` to be idempotent)
- Returns 200 on success, 400 on signature failure

---

## 3. Components

### `components/FundingWidget.tsx`

Compact widget placed on the homepage (`web/app/page.tsx`).

**Data:** Server Component — reads `raised_cents` and `goal_cents = 5000` directly from Supabase (no `/api` hop needed).

**Display:**
- Label: "Financement du mois — {month name} {year}"
- Progress bar: filled to `min(raised / goal, 1) * 100%`
- Text: "{raised}€ / 50€ ce mois-ci"
- At 100%: text changes to "Objectif atteint !"
- "Contribuer →" link to `/contribute`

**Failure mode:** If Supabase query throws, the component returns `null` — homepage renders without the widget, no crash.

### `components/DonateForm.tsx`

Client Component added as a new section in `web/app/contribute/page.tsx`.

**Preset amount buttons:** 1€ · 2€ · 5€ · 10€ (visually toggle — one selected at a time)

**Free amount input:** "Autre montant" text field (min 1€, max 500€), clears preset selection when used

**"Soutenir le projet" button:**
- Calls `POST /api/donate/checkout` with selected amount in cents
- On success: `window.location.href = data.url` (redirect to Stripe)
- On error: shows inline message "Une erreur est survenue, veuillez réessayer."
- Button shows loading state during the API call

**Thank-you state:** On mount, if `?donated=true` is in the URL, show a dismissible banner: "Merci pour votre contribution ! Vous aidez à préserver la langue bété." Remove the query param from the URL after display.

---

## 4. Navigation

Add "Soutenir" link to the existing nav, pointing to `/contribute`. Placement: last item before auth links.

---

## 5. Error Handling & Edge Cases

| Scenario | Behaviour |
|---|---|
| Webhook fires twice (Stripe retry) | `stripe_session_id unique` constraint — second insert is ignored |
| `raised >= 5000` cents | Bar shows 100%, text shows "Objectif atteint !" |
| Supabase query fails on homepage | `FundingWidget` returns null — page unaffected |
| `/api/donate/checkout` fails | Inline error in `DonateForm` |
| User closes Stripe tab | No redirect — user stays away from the site (no cancel page needed) |
| Invalid amount sent to checkout API | 400 response, DonateForm shows error message |

---

## 6. Environment Variables

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...   # not needed for Checkout redirect flow
```

---

## 7. Files to Create / Modify

| Action | File |
|---|---|
| Create | `web/components/FundingWidget.tsx` |
| Create | `web/components/DonateForm.tsx` |
| Create | `web/app/api/donate/checkout/route.ts` |
| Create | `web/app/api/donate/webhook/route.ts` |
| Create | `supabase/migrations/20260517000002_contributions.sql` |
| Modify | `web/app/page.tsx` — add `<FundingWidget>` |
| Modify | `web/app/contribute/page.tsx` — add `<DonateForm>` section |
| Modify | `web/components/AuthNav.tsx` and `web/components/MobileSidebar.tsx` — add "Soutenir" link |

---

## 8. Out of Scope

- Recurring/monthly subscriptions
- Donor leaderboard or public contributor list
- Admin panel to manually adjust the goal or reset the counter
- Email receipts beyond what Stripe sends automatically
