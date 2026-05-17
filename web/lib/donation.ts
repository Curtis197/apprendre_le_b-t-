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
  amount_cents: number
  contributor_email: string | null
  month: string
}

export function buildContributionRow(session: Stripe.Checkout.Session): ContributionRow {
  if (session.amount_total === null || session.amount_total === undefined) {
    throw new Error(`Stripe session ${session.id} has null amount_total`)
  }
  const date = new Date(session.created * 1000)
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return {
    stripe_session_id: session.id,
    amount_cents: session.amount_total,
    contributor_email: session.customer_details?.email ?? null,
    month,
  }
}
