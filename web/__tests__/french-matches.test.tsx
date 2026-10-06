import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrenchMatchesList } from '@/components/FrenchMatchesList'
import type { FrenchMatch } from '@/lib/lexicon-links-data'

const match = (id: string, spelling = `mot-${id}`, over: Partial<FrenchMatch> = {}): FrenchMatch => ({
  matched: 'ciel',
  context: null,
  entry: {
    id, kind: 'word', spelling, ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
    marker: { type: null, meaning: null, french: null }, senses: [{ id: 's', french: 'ciel', context: null }],
    senseId: null, spellings: [],
  },
  ...over,
})
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <FrenchMatchesList matches={[]} typed="ghehi-wu" userId="u1" busy={false} added={null} error="" onAdd={() => {}} onDismiss={() => {}} {...over} />,
  )

describe('FrenchMatchesList', () => {
  it('shows nothing when there is no match and nothing was added', () => {
    expect(render()).toBe('')
  })
  it('names the existing entry, its meaning and a link to it', () => {
    const html = render({ matches: [match('e1', 'ghèhi-wu')] })
    expect(html).toContain('Ce sens existe déjà')
    expect(html).toContain('ghèhi-wu')
    expect(html).toContain('ciel')
    expect(html).toContain('/lexicon/e1')
  })
  it('shows the context of the matched meaning so homonyms can be told apart', () => {
    const html = render({ matches: [match('e1', 'ghèhi-wu', { context: 'en haut' })] })
    expect(html).toContain('en haut')
  })
  it('offers to add the typed spelling as a variant', () => {
    const html = render({ matches: [match('e1', 'ghèhi-wu')] })
    expect(html).toContain('C’est le même mot : ajouter ma graphie « ghehi-wu »')
    expect(html).toContain('Mot différent : continuer')
  })
  it('disables the variant button while no spelling is typed', () => {
    const html = render({ typed: '  ', matches: [match('e1')] })
    expect(html).toMatch(/<button[^>]*disabled[^>]*>C’est le même mot/)
  })
  it('only offers to open the entry when it already has the typed spelling', () => {
    const html = render({ typed: 'Ghèhi-Wu', matches: [match('e1', 'ghèhi-wu')] })
    expect(html).toContain('/lexicon/e1')
    expect(html).not.toContain('ajouter ma graphie')
  })
  it('asks a signed-out visitor to sign in instead of offering the button', () => {
    const html = render({ userId: null, matches: [match('e1')] })
    expect(html).toContain('Connectez-vous')
    expect(html).not.toContain('ajouter ma graphie')
  })
  it('confirms an added spelling with a link to the entry', () => {
    const e = match('e1', 'ghèhi-wu')
    const html = render({ added: { spelling: 'ghehi-wu', entry: e.entry }, matches: [e] })
    expect(html).toContain('Graphie « ghehi-wu » ajoutée')
    expect(html).toContain('/lexicon/e1')
    expect(html).not.toContain('Mot différent : continuer')
  })
  it('shows an error', () => {
    expect(render({ matches: [match('e1')], error: 'Cette graphie existe déjà pour cette entrée.' })).toContain('existe déjà pour cette entrée')
  })
})
