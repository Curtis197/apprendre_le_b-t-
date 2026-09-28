import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LessonMarkdown } from '../components/LessonMarkdown'

const html = (source: string) => renderToStaticMarkup(<LessonMarkdown source={source} />)

describe('LessonMarkdown', () => {
  it('escapes raw HTML instead of rendering it', () => {
    const out = html('<script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;script&gt;')
  })

  it('escapes HTML inside link text and drops javascript: links', () => {
    expect(html('[<b>x</b>](https://a.com)')).toContain('&lt;b&gt;')
    const out = html('[x](javascript:alert(1))')
    expect(out).not.toContain('href')
    expect(out).not.toContain('javascript:')
  })

  it('opens external links safely in a new tab', () => {
    const out = html('[a](https://example.com)')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="nofollow ugc noopener noreferrer"')
  })

  it('keeps internal links in the same tab', () => {
    const out = html('[a](/lexicon)')
    expect(out).toContain('href="/lexicon"')
    expect(out).not.toContain('target=')
  })

  it('never renders images', () => {
    expect(html('![alt](https://example.com/x.png)')).not.toContain('<img')
  })

  it('renders headings one level down so the lesson title stays the only h1', () => {
    const out = html('# Titre')
    expect(out).toContain('<h2')
    expect(out).not.toContain('<h1')
  })

  it('renders lists, quotes and emphasis', () => {
    const out = html('- un\n- deux\n\n> cité\n\n**gras** et *italique*')
    expect(out).toContain('<ul')
    expect(out).toContain('<li>un</li>')
    expect(out).toContain('<blockquote')
    expect(out).toContain('<strong>gras</strong>')
    expect(out).toContain('<em>italique</em>')
  })
})
