import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SimilarWordsList } from '@/components/SimilarWordsList'
import { shouldSearchSimilar, similarKind } from '@/lib/contribution'
import type { Candidate } from '@/lib/lexicon-links'

const cand = (id: string, matchKind: Candidate['matchKind'], spelling = `mot-${id}`): Candidate => ({
  matchKind,
  matched: spelling,
  distance: matchKind === 'near' ? 1 : 0,
  entry: {
    id, kind: 'word', spelling, ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
    marker: { type: null, meaning: null, french: null }, senses: [{ id: 's', french: 'ciel', context: null }],
    senseId: null, spellings: [],
  },
})
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <SimilarWordsList candidates={[]} typed="ghehi-wu" userId="u1" busy={false} added={null} error="" onAdd={() => {}} onDismiss={() => {}} {...over} />,
  )

describe('shouldSearchSimilar', () => {
  it('searches from 2 characters up to 100, ignoring surrounding spaces', () => {
    expect(shouldSearchSimilar('')).toBe(false)
    expect(shouldSearchSimilar(' a ')).toBe(false)
    expect(shouldSearchSimilar('ab')).toBe(true)
    expect(shouldSearchSimilar('x'.repeat(100))).toBe(true)
    expect(shouldSearchSimilar('x'.repeat(101))).toBe(false)
  })
})

describe('similarKind', () => {
  it('an exact match is the same word, anything else a variant', () => {
    expect(similarKind({ matchKind: 'exact' })).toBe('same')
    expect(similarKind({ matchKind: 'norm' })).toBe('variant')
    expect(similarKind({ matchKind: 'near' })).toBe('variant')
  })
})

describe('SimilarWordsList', () => {
  it('shows nothing when there is no candidate and nothing was added', () => {
    expect(render()).toBe('')
  })
  it('says an identical word exists and links to it, with no way to add a spelling', () => {
    const html = render({ candidates: [cand('e1', 'exact', 'ghehi-wu')] })
    expect(html).toContain('Ce mot existe déjà')
    expect(html).toContain('/lexicon/e1')
    expect(html).not.toContain('ajouter ma graphie')
  })
  it('offers to add the typed spelling to a close entry', () => {
    const html = render({ candidates: [cand('e2', 'near', 'ghèhi-wu')] })
    expect(html).toContain('ghèhi-wu')
    expect(html).toContain('ciel')
    expect(html).toContain('C’est le même mot : ajouter ma graphie « ghehi-wu »')
    expect(html).toContain('Mot différent : continuer')
  })
  it('asks a signed-out visitor to sign in instead of offering the button', () => {
    const html = render({ userId: null, candidates: [cand('e2', 'near')] })
    expect(html).toContain('Connectez-vous')
    expect(html).not.toContain('ajouter ma graphie')
  })
  it('confirms an added spelling with a link to the entry', () => {
    const html = render({ added: { spelling: 'ghehi-wu', entry: cand('e2', 'near', 'ghèhi-wu').entry }, candidates: [cand('e2', 'near')] })
    expect(html).toContain('Graphie « ghehi-wu » ajoutée')
    expect(html).toContain('/lexicon/e2')
    expect(html).not.toContain('Mot différent : continuer')
  })
  it('shows an error', () => {
    expect(render({ candidates: [cand('e2', 'near')], error: 'Cette graphie existe déjà pour cette entrée.' })).toContain('existe déjà pour cette entrée')
  })
})
