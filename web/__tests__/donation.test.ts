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
      created: 1778976000, // 2026-05-17 00:00:00 UTC
      customer_details: { email: 'test@example.com' },
    }
    const row = buildContributionRow(session as any)
    expect(row).toEqual({
      stripe_session_id: 'cs_test_abc123',
      amount_cents: 500,
      contributor_email: 'test@example.com',
      month: '2026-05',
    })
  })

  it('sets contributor_email to null when missing', () => {
    const session = {
      id: 'cs_test_xyz',
      amount_total: 200,
      created: 1778976000,
      customer_details: null,
    }
    const row = buildContributionRow(session as any)
    expect(row.contributor_email).toBeNull()
  })
})
