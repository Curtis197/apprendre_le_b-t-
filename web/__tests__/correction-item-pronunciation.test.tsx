import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/supabase-browser', () => ({ createClient: () => ({}) }))

import { CorrectionItem } from '@/components/CorrectionItem'
import type { Correction } from '@/lib/corrections'

const base: Correction = {
  id: 'c1', target_type: 'pronunciation', target_id: 'rec1', field: 'audio', kind: 'other', message: 'Trop de bruit.',
  suggestion: null, original: 'u1/e1/1.webm', label: 'ghèhi-wu', ref_id: 'e1', owner_id: 'u1', reporter_id: 'u2',
  reporter_name: 'Kofi', status: 'open', resolved_by: null, resolved_at: null, created_at: '2026-10-04T10:00:00Z',
}
const render = (over: { userId: string | null; isAdmin: boolean }) =>
  renderToStaticMarkup(<CorrectionItem correction={base} userId={over.userId} isAdmin={over.isAdmin} showTarget onChanged={() => {}} />)

describe('CorrectionItem for a pronunciation report', () => {
  it('lets the author listen, dismiss or delete the recording', () => {
    const html = render({ userId: 'u1', isAdmin: false })
    expect(html).toContain('<audio')
    expect(html).toContain('/lexicon-pronunciations/u1/e1/1.webm')
    expect(html).toContain('Trop de bruit.')
    expect(html).toContain('Ignorer le signalement')
    expect(html).toContain('Supprimer l’enregistrement')
    expect(html).not.toContain('Accepter')
    expect(html).not.toContain('Proposé')
    expect(html).toContain('/lexicon/e1#prononciation')
  })
  it('gives an admin the same actions', () => {
    const html = render({ userId: 'boss', isAdmin: true })
    expect(html).toContain('Ignorer le signalement')
    expect(html).toContain('Supprimer l’enregistrement')
  })
  it('gives the reporter only the player and « Retirer mon signalement »', () => {
    const html = render({ userId: 'u2', isAdmin: false })
    expect(html).toContain('<audio')
    expect(html).not.toContain('Ignorer le signalement')
    expect(html).not.toContain('Supprimer l’enregistrement')
    expect(html).toContain('Retirer mon signalement')
  })
})
