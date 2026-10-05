import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownField } from '@/components/MarkdownField'
import { LessonMarkdown } from '@/components/LessonMarkdown'

const field = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <MarkdownField id="rule" value={'Un **verbe** change.\n\n- un\n- deux'} onChange={() => {}} {...over} />,
  )

describe('MarkdownField', () => {
  it('opens on the write tab with the raw text in a monospace box and the tabs', () => {
    const html = field()
    expect(html).toContain('<textarea')
    expect(html).toContain('font-mono')
    expect(html).toContain('Écrire')
    expect(html).toContain('Aperçu')
    expect(html).toContain('**verbe**')
    expect(html).not.toContain('<strong')
  })

  it('shows the formatted text on the preview tab and no textarea', () => {
    const html = field({ initialTab: 'preview' })
    expect(html).not.toContain('<textarea')
    expect(html).toContain('<strong')
    expect(html).toContain('<li>un</li>')
  })

  it('says there is nothing to preview for an empty text', () => {
    expect(field({ value: '  ', initialTab: 'preview' })).toContain('Rien à afficher')
  })

  it('escapes raw HTML in the preview', () => {
    const html = field({ value: '<script>alert(1)</script>', initialTab: 'preview' })
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('lists the syntax in a help line and limits the length', () => {
    const html = field({ maxLength: 5000 })
    expect(html).toContain('**gras**')
    expect(html).toContain(':::gloss')
    expect(html).toContain('maxLength="5000"')
  })

  it('passes the placeholder and id to the textarea', () => {
    const html = field({ placeholder: 'Décrivez la règle' })
    expect(html).toContain('placeholder="Décrivez la règle"')
    expect(html).toContain('id="rule"')
  })
})

describe('a plain-text rule description rendered as Markdown', () => {
  it('keeps its text and its line breaks', () => {
    const html = renderToStaticMarkup(<LessonMarkdown source={'Le verbe se place après le sujet.\nIl ne change pas.'} />)
    expect(html).toContain('Le verbe se place après le sujet.')
    expect(html).toContain('<br')
    expect(html).toContain('Il ne change pas.')
  })
})
