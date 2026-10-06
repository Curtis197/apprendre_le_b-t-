import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CandidateCard, LexiconPicker } from '../components/lexicon/LexiconPicker'
import type { Candidate } from '../lib/lexicon-links'
import type { LexSummary } from '../lib/word-blocks'

const lex = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: null, spellings: [], ...over,
})
const cand = (over: Partial<Candidate> = {}): Candidate => ({ matchKind: 'norm', matched: 'ghehi-wu', distance: 1, entry: lex(), ...over })
const client = { rpc: async () => ({ data: [], error: null }) } as never
const noop = () => {}

const picker = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <LexiconPicker client={client} kind="word" spelling="ghèhi-wu" gloss="au ciel" dialect="western" signedIn
      canUseExample={false} chooseSense exactLabel="Lier" variantLabel="Variante" busy={false} error=""
      onChoose={noop} onChooseVariant={noop} onCreate={noop} {...over} />,
  )

describe('LexiconPicker', () => {
  it('searches and offers to create a word', () => {
    const html = picker()
    expect(html).toContain('Recherche dans le lexique…')
    expect(html).toContain('Mot différent : créer l’entrée')
  })
  it('does not search a blank spelling', () => {
    const html = picker({ spelling: '   ' })
    expect(html).not.toContain('Recherche dans le lexique…')
  })
  it('offers no creation button for a word while the spelling is blank', () => {
    expect(picker({ spelling: '   ' })).not.toContain('créer l’entrée')
  })
  it('offers no creation form for a marker, only the parent footer', () => {
    const html = picker({ kind: 'marker', footer: <button>Créer ce marqueur</button> })
    expect(html).not.toContain('créer l’entrée')
    expect(html).toContain('Créer ce marqueur')
  })
  it('uses a custom creation label and shows the error', () => {
    const html = picker({ createLabel: 'Créer l’entrée ici', error: 'Boum' })
    expect(html).toContain('Créer l’entrée ici')
    expect(html).toContain('Boum')
  })
})

describe('CandidateCard', () => {
  const base = { kind: 'word' as const, seed: 'ciel', sel: 'S1', namePrefix: 'cand-sense-', busy: false, onSelect: noop, onAction: noop }
  it('shows a variant with the form that matched, and its own button', () => {
    const html = renderToStaticMarkup(<CandidateCard {...base} c={cand()} variant chooseSense actionLabel="Même mot" />)
    expect(html).toContain('variante de « ghehi-wu »')
    expect(html).toContain('Même mot')
    expect(html).toContain('type="radio"')
  })
  it('offers a new sense only when the gloss is not already a sense', () => {
    const withNew = renderToStaticMarkup(<CandidateCard {...base} seed="ciel bleu" c={cand()} variant={false} chooseSense actionLabel="Lier" />)
    expect(withNew).toContain('Nouveau sens : « ciel bleu »')
    const without = renderToStaticMarkup(<CandidateCard {...base} c={cand()} variant={false} chooseSense actionLabel="Lier" />)
    expect(without).not.toContain('Nouveau sens')
  })
  it('lists the senses read-only when the card only opens a page', () => {
    const html = renderToStaticMarkup(<CandidateCard {...base} c={cand()} variant={false} chooseSense={false} actionLabel="Ouvrir cette fiche" />)
    expect(html).not.toContain('type="radio"')
    expect(html).toContain('ciel')
    expect(html).toContain('Ouvrir cette fiche')
  })
})
