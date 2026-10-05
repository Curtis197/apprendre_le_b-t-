import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SpellingsList } from '@/components/lexicon/SpellingsList'
import { removeSpelling } from '@/lib/lexicon-links-data'

const items = [
  { id: 's1', spelling: 'ghéhi-wu', created_by: 'u1' },
  { id: 's2', spelling: 'rhéhi-wu', created_by: 'u2' },
]
const list = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <SpellingsList items={items} userId="u1" isAdmin={false} busy={false} error="" notice="" signInHref="/auth?next=/lexicon/e1" onAdd={() => {}} onRemove={() => {}} {...over} />,
  )

describe('SpellingsList', () => {
  it('lists the other spellings', () => {
    const html = list()
    expect(html).toContain('Autres graphies')
    expect(html).toContain('ghéhi-wu')
    expect(html).toContain('rhéhi-wu')
  })
  it('lets a signed-in user propose one and remove only their own', () => {
    const html = list()
    expect(html).toContain('Proposer une autre graphie')
    expect((html.match(/Retirer/g) ?? []).length).toBe(1)
  })
  it('lets an admin remove every spelling', () => {
    expect((list({ userId: 'boss', isAdmin: true }).match(/Retirer/g) ?? []).length).toBe(2)
  })
  it('only shows the list and a sign-in link to a signed-out visitor', () => {
    const html = list({ userId: null })
    expect(html).not.toContain('Retirer')
    expect(html).not.toContain('Proposer une autre graphie')
    expect(html).toContain('Connectez-vous')
    expect(html).toContain('/auth?next=/lexicon/e1')
  })
  it('says there is no other spelling yet', () => {
    expect(list({ items: [] })).toContain('Aucune autre graphie')
  })
  it('shows an error and a notice', () => {
    const html = list({ error: 'Oups.', notice: 'Graphie ajoutée.' })
    expect(html).toContain('Oups.')
    expect(html).toContain('Graphie ajoutée.')
  })
})

describe('removeSpelling', () => {
  const client = (result: { data: unknown; error: { message: string } | null }) => {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const del = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ delete: del })
    return { c: { from } as unknown as SupabaseClient, from, eq }
  }
  it('deletes the row and reports success', async () => {
    const { c, from, eq } = client({ data: [{ id: 's1' }], error: null })
    expect(await removeSpelling(c, 's1')).toEqual({ data: true, error: null })
    expect(from).toHaveBeenCalledWith('lexicon_spellings')
    expect(eq).toHaveBeenCalledWith('id', 's1')
  })
  it('explains when nothing was removed (not the author, not an admin)', async () => {
    const res = await removeSpelling(client({ data: [], error: null }).c, 's1')
    expect(res.error).toMatch(/auteur de la graphie ou un administrateur/)
  })
  it('maps a database error to a French message', async () => {
    const res = await removeSpelling(client({ data: null, error: { message: 'boom' } }).c, 's1')
    expect(res.error).toMatch(/réessayer/i)
  })
})
