// A deliberately small Markdown subset for lesson text. It produces an AST that
// React renders as elements, so user input is never injected as HTML.
// Unsupported on purpose: images, tables, raw HTML, nested lists.

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; external: boolean; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; children: Inline[] }
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; lines: Inline[][] }
  | { type: 'rule' }
  | {
      type: 'gloss'
      original: string
      literal?: string
      translation?: string
      title?: string
    }

/** Only http(s), mailto and site-relative URLs may become links. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const url = raw.trim()
  if (/^https?:\/\/\S+$/i.test(url)) return { href: url, external: true }
  if (/^mailto:\S+$/i.test(url)) return { href: url, external: true }
  if (url.startsWith('/') && !url.startsWith('//') && !/\s/.test(url)) {
    return { href: url, external: false }
  }
  return null
}

const INLINE_PATTERN = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push({ type: 'text', value: text.slice(cursor, start) })
    if (match[1] !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(match[1]) })
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'em', children: parseInline(match[2]) })
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'code', value: match[3] })
    } else {
      const target = safeHref(match[5])
      if (target) {
        nodes.push({ type: 'link', ...target, children: parseInline(match[4]) })
      } else {
        // Unsafe URL: keep the visible text, drop the link.
        nodes.push({ type: 'text', value: match[4] })
      }
    }
    cursor = start + match[0].length
  }
  if (cursor < text.length) nodes.push({ type: 'text', value: text.slice(cursor) })
  return nodes
}

const HEADING = /^(#{1,3})\s+(.+?)\s*$/
const RULE = /^(-{3,}|\*{3,})\s*$/
const UNORDERED = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const GLOSS_START = /^:::gloss(?:\s+(.*))?$/

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    UNORDERED.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    GLOSS_START.test(line.trim())
  )
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const collect = (pattern: RegExp): Inline[][] => {
    const items: Inline[][] = []
    while (i < lines.length) {
      const match = pattern.exec(lines[i])
      if (!match) break
      items.push(parseInline(match[1]))
      i++
    }
    return items
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }

    const glossMatch = GLOSS_START.exec(line.trim())
    // An opener with no closing ::: is plain text: it must not swallow the rest of the lesson.
    const glossIsClosed = glossMatch !== null && lines.slice(i + 1).some(l => l.trim() === ':::')
    if (glossMatch && glossIsClosed) {
      i++
      const rawTitle = glossMatch[1]?.trim() || undefined
      let original = ''
      let literal: string | undefined
      let translation: string | undefined
      let title = rawTitle
      const contentLines: string[] = []

      while (i < lines.length && lines[i].trim() !== ':::') {
        // Blank lines are ignored so they can't shift the positional original/literal/translation.
        if (lines[i].trim() !== '') contentLines.push(lines[i].trim())
        i++
      }
      i++ // consume closing ::: (its presence was checked above)

      const hasKeys = contentLines.some(l =>
        /^(bete|original|literal|mot_a_mot|mot-a-mot|fr|sens|translation|title):\s*/i.test(l),
      )
      if (hasKeys) {
        for (const cl of contentLines) {
          const match = /^([a-z_-]+):\s*(.*)$/i.exec(cl)
          if (!match) continue
          const key = match[1].toLowerCase()
          const val = match[2].trim()
          if (key === 'bete' || key === 'original') original = val
          else if (key === 'literal' || key === 'mot_a_mot' || key === 'mot-a-mot') literal = val
          else if (key === 'fr' || key === 'sens' || key === 'translation') translation = val
          else if (key === 'title') title = val
        }
      } else {
        original = contentLines[0] || ''
        literal = contentLines[1] || undefined
        translation = contentLines[2] || undefined
      }

      blocks.push({
        type: 'gloss',
        original,
        literal,
        translation,
        title,
      })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1].length + 1) as 2 | 3 | 4,
        children: parseInline(heading[2]),
      })
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (UNORDERED.test(line)) {
      blocks.push({ type: 'list', ordered: false, items: collect(UNORDERED) })
      continue
    }
    if (ORDERED.test(line)) {
      blocks.push({ type: 'list', ordered: true, items: collect(ORDERED) })
      continue
    }
    if (QUOTE.test(line)) {
      blocks.push({ type: 'quote', lines: collect(QUOTE) })
      continue
    }

    // The first line is always consumed: an unclosed :::gloss opener reaches here and must not stall the loop.
    const paragraph: Inline[][] = [parseInline(line.trim())]
    i++
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) {
      paragraph.push(parseInline(lines[i].trim()))
      i++
    }
    blocks.push({ type: 'paragraph', lines: paragraph })
  }

  return blocks
}
