import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseTranslation } from '../components/VerseTranslation'
import type { VerseWords as VerseData } from '../lib/word-blocks'

const decode = (s: string) => s.replace(/&#x27;/g, "'")
const LATIN = "Sê a'a tatini a yii\nKaba nunu"
const FRENCH = 'Comme nous laissons nos\nKaba mange'

describe('VerseTranslation with an IPA text', () => {
  it('offers the Latin / API switch only when an IPA text exists', () => {
    const without = renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} />)
    expect(without).not.toContain('API')
    const withIpa = renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa={"Sɛ a'a tatɩnɩ a yɩɩ\nKaba nʋnʋ"} />)
    expect(withIpa).toContain('Latin')
    expect(withIpa).toContain('API')
  })

  it('shows the Latin lines by default and the IPA lines when the script is API', () => {
    const ipa = "Sɛ a'a tatɩnɩ a yɩɩ\nKaba nʋnʋ"
    const latin = decode(renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa={ipa} />))
    expect(latin).toContain("Sê a'a tatini a yii")
    const api = decode(renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa={ipa} defaultScript="ipa" />))
    expect(api).toContain("Sɛ a'a tatɩnɩ a yɩɩ")
    expect(api).toContain('Kaba nʋnʋ')
    expect(api).not.toContain("Sê a'a tatini a yii")
    expect(api).toContain('Comme nous laissons nos')   // the French is never swapped
  })

  it('keeps a verse in Latin, with a note, when its IPA line is missing', () => {
    const api = decode(renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa="Sɛ a'a tatɩnɩ a yɩɩ" defaultScript="ipa" />))
    expect(api).toContain("Sɛ a'a tatɩnɩ a yɩɩ")
    expect(api).toContain('Kaba nunu')
    expect(api).toContain('Pas d’API pour ce vers')
  })

  it('shows the plain IPA line even when its word count differs, but reads the words in Latin', () => {
    const one: VerseData = {
      verse_no: 1, stale: false, bete_line: "Sê a'a tatini a yii", literal_line: 'Comme nous laissons nos',
      blocks: [0, 1, 2, 3, 4].map(i => ({ position: i + 1, bete_idx: [i], gloss_idx: [i % 4], is_marker: false, solo: false, note: null, composition: null, marker: null })),
    }
    const html = decode(renderToStaticMarkup(
      <VerseTranslation original="Sê a'a tatini a yii" literal="Comme nous laissons nos" ipa="Sɛ a'a tatɩnɩ yɩɩ" words={[one]} defaultScript="ipa" />,
    ))
    expect(html).toContain('tatini')          // the word view stays in Latin
    expect(html).toContain('ne correspond')    // and says why
  })
})
