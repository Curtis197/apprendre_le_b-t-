import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlockPanel } from '../components/word-link/BlockPanel'
import { PairStrip } from '../components/word-link/PairStrip'
import { attachUnits, derive, initDraft, setKind } from '../lib/word-link-editor'

const noop = () => {}

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

describe('BlockPanel', () => {
  it('shows the empty marker fields and the "sens à préciser" hint for a new marker', () => {
    let d = initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined)
    d = setKind(d, '1', 'marker', true)
    const html = renderToStaticMarkup(<BlockPanel draft={d} focus={{ side: 'b', head: 1 }} markers={{}} onMarkerChange={noop} onChange={noop} onFocus={noop} />)
    expect(html).toContain('Marqueur grammatical')
    expect(html).toContain('sens à préciser')
    expect(html).toContain('Aucun mot du mot à mot ne lui correspond')
    expect(html).not.toContain('<select') // type is free text, not a dropdown
  })

  it('offers to regroup, correct and add words for a selected word', () => {
    const d = initDraft(1, 'a b c', 'x y z', undefined)
    const html = renderToStaticMarkup(<BlockPanel draft={d} focus={{ side: 'b', head: 0 }} markers={{}} onMarkerChange={noop} onChange={noop} onFocus={noop} />)
    expect(html).toContain('Regrouper avec')
    expect(html).toContain('Corriger, ajouter ou supprimer un mot')
    expect(html).toContain('Marqueur grammatical') // the switch between a word and a marker
  })

  it('shows nothing to edit when no block is selected', () => {
    const d = initDraft(1, 'a b c', 'x y z', undefined)
    const html = renderToStaticMarkup(<BlockPanel draft={d} focus={null} markers={{}} onMarkerChange={noop} onChange={noop} onFocus={noop} />)
    expect(html).toContain('Touchez un bloc')
  })
})
