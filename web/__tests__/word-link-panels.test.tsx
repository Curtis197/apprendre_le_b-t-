import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))
import { BlockPanel } from '../components/word-link/BlockPanel'
import { PairStrip } from '../components/word-link/PairStrip'
import { LexiconPanel } from '../components/word-link/LexiconPanel'
import { EntryForm } from '../components/word-link/EntryForm'
import { emptyEntryForm } from '../lib/lexicon-links'
import { attachUnits, derive, EMPTY_META, initDraft, setKind } from '../lib/word-link-editor'
import type { LexSummary } from '../lib/word-blocks'

const noop = () => {}

const lex = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: 'S1', spellings: ['ghèhi-wu'], ...over,
})
const panel = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <LexiconPanel client={{ rpc: async () => ({ data: [], error: null }) } as never} kind="word" words="ghèhi-wu" gloss="au ciel"
      dialect="western" meta={EMPTY_META} entry={null} example={null} signedIn onLink={() => {}} onUnlink={() => {}} {...over} />,
  )

describe('PairStrip', () => {
  const BETE = "Sê a'a tatini a yii Yaya"
  const LIT = 'Comme nous laissons nos pardon'

  it('shows the Bété words in sentence order with a partner box for a linked word', () => {
    const d = attachUnits(initDraft(4, BETE, LIT, undefined), 'b', 4, 2)
    const r = derive(d)
    const html = renderToStaticMarkup(
      <PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={d.meta} focus={null} onFocus={noop} />,
    )
    const words = [...html.matchAll(/data-word="([^"]*)"/g)].map(m => m[1].replace(/&#x27;/g, "'"))
    expect(words).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii', 'Yaya'])
    expect(html).toContain(' ↔ yii') // under the block: where its partner is
    expect(html).toContain('↔ tatini') // the partner place points back
    expect(html).toContain('laissons')
  })

  it('flags a Bété word without a mot à mot, and a mot à mot without a Bété word', () => {
    const r = derive(initDraft(1, 'a b', 'x y z', undefined))
    const html = renderToStaticMarkup(<PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={{}} focus={null} onFocus={noop} />)
    expect(html).toContain('aucun mot bhété')
    const r2 = derive(initDraft(1, 'a b c', 'x y', undefined))
    expect(renderToStaticMarkup(<PairStrip pairs={r2.pairs} bw={r2.bw} gw={r2.gw} meta={{}} focus={null} onFocus={noop} />)).toContain('sans équivalent')
  })

  it('shows a marker set aside with its meaning', () => {
    let d = initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined)
    d = setKind(d, '1', 'marker', true)
    const r = derive(d)
    const html = renderToStaticMarkup(<PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={d.meta} focus={null} onFocus={noop} />)
    expect(html).toContain('marqueur')
    expect(html).not.toContain('sans équivalent')
  })
})

describe('LexiconPanel', () => {
  it('offers to search and create for an unlinked word', () => {
    const html = panel()
    expect(html).toContain('Lexique')
    expect(html).toContain('créer l’entrée')
  })
  it('shows the linked entry with its actions', () => {
    const html = panel({ entry: lex(), meta: { ...EMPTY_META, lexiconId: 'L1', translationId: 'S1' } })
    expect(html).toContain('ghèhi-wu')
    expect(html).toContain('ciel')
    expect(html).toContain('Délier')
    expect(html).toContain('Ajouter une graphie')
    expect(html).toContain('Ajouter un sens')
    expect(html).toContain('/lexicon/L1')
  })
  it('asks a signed-out visitor to sign in instead of offering writes', () => {
    expect(panel({ signedIn: false })).toContain('Connectez-vous')
  })
  it('shows the three free marker fields for a linked marker, with no dropdown', () => {
    const html = panel({
      kind: 'marker', gloss: '',
      entry: lex({ kind: 'marker', senses: [], senseId: null, marker: { type: null, meaning: null, french: null } }),
      meta: { ...EMPTY_META, isMarker: true, lexiconId: 'L1' },
    })
    expect(html).toContain('Type')
    expect(html).toContain('Ce qu’il indique')
    expect(html).toContain('Comment le français le rend')
    expect(html).not.toContain('<select')
    expect(html).toContain('sens à préciser')
  })
})

describe('EntryForm', () => {
  it('shows every lexical field of a word, seeded from the gloss', () => {
    const html = renderToStaticMarkup(
      <EntryForm kind="word" initial={emptyEntryForm('ghèhi-wu', 'au ciel', 'western')} canUseExample busy={false} error="" onSubmit={() => {}} onCancel={() => {}} />,
    )
    for (const label of ['Graphie', 'Transcription', 'Dialecte', 'Catégorie', 'Sens', 'Synonymes', 'Définition', 'Forme de base', 'Notes d’usage', 'phrase d’exemple']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('value="ciel"')
    expect(html).toContain('Particule')
  })
  it('hides the senses and the example for a marker, and the example when the verse has no French', () => {
    const marker = renderToStaticMarkup(
      <EntryForm kind="marker" initial={emptyEntryForm('ye', '', 'western')} canUseExample busy={false} error="" onSubmit={() => {}} onCancel={() => {}} />,
    )
    expect(marker).not.toContain('Synonymes')
    const noFrench = renderToStaticMarkup(
      <EntryForm kind="word" initial={emptyEntryForm('x', 'y', 'western')} canUseExample={false} busy={false} error="" onSubmit={() => {}} onCancel={() => {}} />,
    )
    expect(noFrench).not.toContain('phrase d’exemple')
  })
  it('shows an error message', () => {
    const html = renderToStaticMarkup(
      <EntryForm kind="word" initial={emptyEntryForm('x', 'y', 'western')} canUseExample busy={false} error="Écrivez la graphie du mot." onSubmit={() => {}} onCancel={() => {}} />,
    )
    expect(html).toContain('Écrivez la graphie du mot.')
  })
})

describe('BlockPanel', () => {
  const fakeClient = { rpc: async () => ({ data: [], error: null }) } as never

  it('shows the empty marker fields and the "sens à préciser" hint for a new marker', () => {
    let d = initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined)
    d = setKind(d, '1', 'marker', true)
    const html = renderToStaticMarkup(
      <BlockPanel
        client={fakeClient}
        draft={d}
        focus={{ side: 'b', head: 1 }}
        entries={{}}
        dialect="western"
        example={null}
        signedIn
        onEntry={noop}
        onChange={noop}
        onFocus={noop}
      />,
    )
    expect(html).toContain('Marqueur grammatical')
    expect(html).toContain('Aucun mot du mot à mot ne lui correspond')
  })

  it('offers to regroup, correct and add words for a selected word', () => {
    const d = initDraft(1, 'a b c', 'x y z', undefined)
    const html = renderToStaticMarkup(
      <BlockPanel
        client={fakeClient}
        draft={d}
        focus={{ side: 'b', head: 0 }}
        entries={{}}
        dialect="western"
        example={null}
        signedIn
        onEntry={noop}
        onChange={noop}
        onFocus={noop}
      />,
    )
    expect(html).toContain('Regrouper avec')
    expect(html).toContain('Corriger, ajouter ou supprimer un mot')
    expect(html).toContain('Marqueur grammatical') // the switch between a word and a marker
  })

  it('shows nothing to edit when no block is selected', () => {
    const d = initDraft(1, 'a b c', 'x y z', undefined)
    const html = renderToStaticMarkup(
      <BlockPanel
        client={fakeClient}
        draft={d}
        focus={null}
        entries={{}}
        dialect="western"
        example={null}
        signedIn
        onEntry={noop}
        onChange={noop}
        onFocus={noop}
      />,
    )
    expect(html).toContain('Touchez un bloc')
  })
})
