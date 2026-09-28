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
    return `${fcfa.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} FCFA`
  }

  const euros = (priceCents / 100).toFixed(2).replace('.', ',')
  return `${euros} €`
}

export function isCoursePurchasable(course: { access: string; paid_approved?: boolean }): boolean {
  if (course.access === 'free') return true
  return Boolean(course.paid_approved)
}
