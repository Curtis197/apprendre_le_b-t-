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
