import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, safeHref } from '../lib/courses/markdown'

const text = (value: string) => ({ type: 'text', value })

describe('safeHref', () => {
  it('accepts http(s), mailto and site-relative links', () => {
    expect(safeHref('https://example.com/a?b=1')).toEqual({ href: 'https://example.com/a?b=1', external: true })
    expect(safeHref('http://example.com')).toEqual({ href: 'http://example.com', external: true })
    expect(safeHref('mailto:a@b.com')).toEqual({ href: 'mailto:a@b.com', external: true })
    expect(safeHref('/lexicon/abc')).toEqual({ href: '/lexicon/abc', external: false })
  })

  it('rejects everything else', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,x')).toBeNull()
    expect(safeHref('ftp://example.com')).toBeNull()
    expect(safeHref('//evil.example.com')).toBeNull()
    expect(safeHref('https://a b')).toBeNull()
    expect(safeHref('')).toBeNull()
  })
})

describe('parseInline', () => {
  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      text('a '),
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('c')] },
      text(' '),
      { type: 'code', value: 'd' },
    ])
  })

  it('parses safe links', () => {
    expect(parseInline('[x](https://a.com/p)')).toEqual([
      { type: 'link', href: 'https://a.com/p', external: true, children: [text('x')] },
    ])
  })

  it('drops the link but keeps the text when the URL is unsafe', () => {
    const nodes = parseInline('[x](javascript:alert(1))')
    expect(nodes.some(n => n.type === 'link')).toBe(false)
    expect(JSON.stringify(nodes)).not.toContain('javascript')
  })

  it('keeps an unpaired asterisk as plain text', () => {
    expect(parseInline('la forme *kpa')).toEqual([text('la forme *kpa')])
  })
})

describe('parseMarkdown', () => {
  it('returns no blocks for empty input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n  \n')).toEqual([])
  })

  it('maps # to h2, ## to h3 and ### to h4, and ignores deeper levels', () => {
    expect(parseMarkdown('# A')[0]).toEqual({ type: 'heading', level: 2, children: [text('A')] })
    expect(parseMarkdown('## A')[0]).toMatchObject({ level: 3 })
    expect(parseMarkdown('### A')[0]).toMatchObject({ level: 4 })
    expect(parseMarkdown('#### A')[0]).toEqual({ type: 'paragraph', lines: [[text('#### A')]] })
  })

  it('splits paragraphs on blank lines and keeps single newlines as lines', () => {
    expect(parseMarkdown('a\nb\n\nc')).toEqual([
      { type: 'paragraph', lines: [[text('a')], [text('b')]] },
      { type: 'paragraph', lines: [[text('c')]] },
    ])
  })

  it('parses unordered and ordered lists', () => {
    expect(parseMarkdown('- a\n- b')).toEqual([
      { type: 'list', ordered: false, items: [[text('a')], [text('b')]] },
    ])
    expect(parseMarkdown('1. a\n2) b')).toEqual([
      { type: 'list', ordered: true, items: [[text('a')], [text('b')]] },
    ])
  })

  it('parses quotes and rules', () => {
    expect(parseMarkdown('> a\n> b')).toEqual([{ type: 'quote', lines: [[text('a')], [text('b')]] }])
    expect(parseMarkdown('---')).toEqual([{ type: 'rule' }])
  })

  it('ends a paragraph when another block starts', () => {
    const blocks = parseMarkdown('intro\n- item')
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'list'])
  })

  it('does not mistake a bold opener for a list item', () => {
    expect(parseMarkdown('**gras** au début')[0].type).toBe('paragraph')
  })
})
