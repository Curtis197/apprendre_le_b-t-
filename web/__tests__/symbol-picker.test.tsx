import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SymbolPicker } from '@/components/SymbolPicker'
import { NumberedTextarea } from '@/components/NumberedTextarea'

describe('SymbolPicker', () => {
  it('starts closed: a toggle only, no symbols yet', () => {
    const html = renderToStaticMarkup(<SymbolPicker target={{ current: null }} dialect="western" />)
    expect(html).toContain('Symboles')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('ɛ</button>')
    expect(html).not.toContain('/alphabet')
  })
})

describe('NumberedTextarea textareaRef', () => {
  it('still renders with a ref attached to the inner textarea', () => {
    const html = renderToStaticMarkup(
      <NumberedTextarea value={'a\nb'} onChange={() => {}} textareaRef={{ current: null }} />,
    )
    expect(html).toContain('<textarea')
  })
})
