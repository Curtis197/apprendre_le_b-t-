import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NumberedTextarea } from '../components/NumberedTextarea'

const render = (value: string) =>
  renderToStaticMarkup(<NumberedTextarea value={value} onChange={() => {}} aria-label="Texte" />)

/** Text of each gutter row, in order. */
function gutterRows(html: string): string[] {
  const gutter = /<div aria-hidden="true"[^>]*>([\s\S]*?)<div style="height:1rem"><\/div><\/div>/.exec(html)?.[1] ?? ''
  return [...gutter.matchAll(/<div style="[^"]*">([^<]*)<\/div>/g)].map(m => m[1])
}

describe('NumberedTextarea', () => {
  it('numbers verses and leaves stanza breaks unnumbered', () => {
    expect(gutterRows(render('a\nb\n\nc'))).toEqual(['1', '2', '', '3'])
  })

  it('shows one empty row for an empty field', () => {
    expect(gutterRows(render(''))).toEqual([''])
  })

  it('hides the gutter from assistive technology and turns soft-wrapping off', () => {
    const html = render('a')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('wrap="off"')
    expect(html).toContain('aria-label="Texte"')
  })

  it('uses the same line height for the numbers and the text', () => {
    const html = render('a\nb')
    const heights = new Set([...html.matchAll(/line-height:([^;"]+)/g)].map(m => m[1]))
    expect([...heights]).toEqual(['1.5rem'])
  })
})
