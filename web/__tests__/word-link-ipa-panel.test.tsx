import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IpaWordsPanel } from '../components/word-link/IpaWordsPanel'
import { derive, initDraft, toggleIpaWord } from '../lib/word-link-editor'
import { blockKey } from '../lib/word-blocks'

const draft = (ipa?: string) => initDraft(1, "Sê a'a tatini yii", 'Comme nous laissons nos', undefined, ipa)
const decode = (s: string) => s.replace(/&#x27;/g, "'")

describe('IpaWordsPanel', () => {
  it('renders nothing when the verse has no IPA line', () => {
    const d = draft()
    expect(renderToStaticMarkup(<IpaWordsPanel draft={d} blockKey={blockKey(derive(d).bu[0])} onChange={() => {}} />)).toBe('')
  })

  it('shows each IPA word as a button, pressed when it belongs to the block, with the linked count', () => {
    let d = draft("Sɛ a'a ta tɩnɩ yɩɩ")                     // 5 IPA words, 4 Latin: nothing linked yet
    const k0 = blockKey(derive(d).bu[0])
    const k1 = blockKey(derive(d).bu[1])
    d = toggleIpaWord(toggleIpaWord(d, k0, 0), k1, 1)
    const html = decode(renderToStaticMarkup(<IpaWordsPanel draft={d} blockKey={k0} onChange={() => {}} />))
    expect(html).toContain('Mots en API')
    expect([...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)</g)].map(m => `${m[2]}:${m[1]}`))
      .toEqual(['Sɛ:true', "a'a:false", 'ta:false', 'tɩnɩ:false', 'yɩɩ:false'])
    expect(html).toContain('2 mots sur 5')                     // linked words of the verse
    expect(html).toContain('non relié')                        // wording of the unlinked count
  })

  it('offers "Relier par position" only when the counts are equal', () => {
    const equal = draft("Sɛ a'a tatɩnɩ yɩɩ")
    const k = blockKey(derive(equal).bu[0])
    expect(renderToStaticMarkup(<IpaWordsPanel draft={equal} blockKey={k} onChange={() => {}} />)).toContain('Relier par position')
    const odd = draft("Sɛ a'a ta tɩnɩ yɩɩ")
    expect(renderToStaticMarkup(<IpaWordsPanel draft={odd} blockKey={blockKey(derive(odd).bu[0])} onChange={() => {}} />)).not.toContain('Relier par position')
  })

  it('shows which block owns a word that is not this block’s', () => {
    let d = draft("Sɛ a'a ta tɩnɩ yɩɩ")
    const [k0, k1] = derive(d).bu.map(blockKey)
    d = toggleIpaWord(d, k1, 2)
    const html = decode(renderToStaticMarkup(<IpaWordsPanel draft={d} blockKey={k0} onChange={() => {}} />))
    expect(html).toContain("a'a")                              // the owner's Latin words, in the word's title
  })
})
