import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { entryDetailRows } from '@/lib/lexicon-details'
import { EntryDetails } from '@/components/lexicon/EntryDetails'

const word = {
  entry_kind: 'word' as const,
  dialect: 'eastern',
  pos: ['noun'],
  lemma: 'enfant',
  french_synonyms: ['petit', ' gamin ', ''],
  notes: 'S’emploie au pluriel.',
}

describe('entryDetailRows', () => {
  it('returns every field the contribution form collects, labelled like the form', () => {
    expect(entryDetailRows(word)).toEqual([
      { key: 'dialect', label: 'Dialecte', value: 'Bhété Oriental (Daloa)' },
      { key: 'category', label: 'Catégorie', value: 'Nom' },
      { key: 'lemma', label: 'Forme de base', value: 'enfant' },
      { key: 'synonyms', label: 'Synonymes', value: 'petit, gamin' },
      { key: 'notes', label: 'Notes d’usage', value: 'S’emploie au pluriel.' },
    ])
  })

  it('leaves out the fields that are empty', () => {
    expect(entryDetailRows({ entry_kind: 'word', dialect: 'western', pos: null, lemma: ' ', french_synonyms: [], notes: null }))
      .toEqual([{ key: 'dialect', label: 'Dialecte', value: 'Bhété Occidental (Guiberoua)' }])
    expect(entryDetailRows({})).toEqual([])
  })

  it('shows an unknown category tag as it is stored, and ignores an unknown dialect', () => {
    const rows = entryDetailRows({ entry_kind: 'word', dialect: 'martian', pos: ['xyz'] })
    expect(rows).toEqual([{ key: 'category', label: 'Catégorie', value: 'xyz' }])
  })

  it('shows a grammatical marker only with its dialect and notes', () => {
    const rows = entryDetailRows({ ...word, entry_kind: 'marker' })
    expect(rows.map(r => r.key)).toEqual(['dialect', 'notes'])
  })
})

describe('EntryDetails', () => {
  it('renders the rows as a definition list', () => {
    const html = renderToStaticMarkup(<EntryDetails entry={word} />)
    expect(html).toContain('<dl')
    expect(html).toContain('Dialecte')
    expect(html).toContain('Bhété Oriental (Daloa)')
    expect(html).toContain('petit, gamin')
    expect(html).toContain('Notes d’usage')
  })

  it('renders nothing when there is nothing to show', () => {
    expect(renderToStaticMarkup(<EntryDetails entry={{}} />)).toBe('')
  })
})
