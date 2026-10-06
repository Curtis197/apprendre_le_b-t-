import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { ContributionForm } from '@/components/ContributionForm'

describe('ContributionForm word tab', () => {
  it('asks for the Bété spelling first and no longer carries the old inline fields', () => {
    const html = renderToStaticMarkup(<ContributionForm initialType="word" />)
    expect(html).toContain('Mot en bhété (forme phonétique latine)')
    expect(html).not.toContain('Traduction française *')
    expect(html).not.toContain('Soumettre la contribution')
  })
  it('keeps the other tabs as they were', () => {
    const html = renderToStaticMarkup(<ContributionForm initialType="expression" />)
    expect(html).toContain('Sens réel en français')
    expect(html).toContain('Soumettre la contribution')
  })
})
