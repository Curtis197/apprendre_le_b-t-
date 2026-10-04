import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PronunciationList } from '@/components/lexicon/PronunciationList'

const rows = [
  { id: 'r1', path: 'u1/e1/2.webm', author: 'Awa', createdBy: 'u1', createdAt: '2026-10-04T10:00:00Z' },
  { id: 'r2', path: 'u2/e1/1.webm', author: 'Contributeur', createdBy: 'u2', createdAt: '2026-10-03T10:00:00Z' },
]
const list = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <PronunciationList items={rows} userId="u1" isAdmin={false} busy={false} error="" notice="" onDelete={() => {}} onReport={() => {}} {...over} />,
  )

describe('PronunciationList', () => {
  it('shows a player and the author for each recording', () => {
    const html = list()
    expect((html.match(/<audio/g) ?? []).length).toBe(2)
    expect(html).toContain('Awa')
    expect(html).toContain('Contributeur')
    expect(html).toContain('/storage/v1/object/public/lexicon-pronunciations/u1/e1/2.webm')
    expect(html).toContain('preload="none"')
  })
  it('offers « Supprimer » on the author’s own recording and « Signaler » on the others', () => {
    const html = list()
    expect((html.match(/Supprimer/g) ?? []).length).toBe(1)
    expect((html.match(/Signaler/g) ?? []).length).toBe(1)
  })
  it('lets an admin delete every recording', () => {
    const html = list({ userId: 'boss', isAdmin: true })
    expect((html.match(/Supprimer/g) ?? []).length).toBe(2)
  })
  it('offers nothing to a signed-out visitor but the players', () => {
    const html = list({ userId: null })
    expect(html).not.toContain('Supprimer')
    expect(html).not.toContain('Signaler')
    expect((html.match(/<audio/g) ?? []).length).toBe(2)
  })
  it('says there is no recording yet', () => {
    expect(list({ items: [] })).toContain('Aucune prononciation enregistrée')
  })
  it('shows an error and a notice', () => {
    const html = list({ error: 'Oups.', notice: 'Signalement envoyé.' })
    expect(html).toContain('Oups.')
    expect(html).toContain('Signalement envoyé.')
  })
})
