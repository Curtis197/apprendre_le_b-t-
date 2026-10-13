import { DIALECTS, type DialectKey } from '@/lib/dialect'
import { ENTRY_CATEGORIES } from '@/lib/lexicon-links'

export interface EntryDetailRow {
  key: 'dialect' | 'category' | 'lemma' | 'synonyms' | 'notes'
  label: string
  value: string
}

/** The fields of a lexicon entry that the contribution form collects and the entry header does not show. */
export interface EntryDetailSource {
  entry_kind?: 'word' | 'marker'
  dialect?: string | null
  pos?: string[] | null
  lemma?: string | null
  french_synonyms?: string[] | null
  notes?: string | null
}

/**
 * The rows of the « fiche » block of an entry page, labelled like the contribution form.
 * Empty fields are left out. A grammatical marker has no category, base form or synonyms in the form,
 * so it only gets its dialect and notes.
 */
export function entryDetailRows(e: EntryDetailSource): EntryDetailRow[] {
  const rows: EntryDetailRow[] = []
  const isMarker = e.entry_kind === 'marker'

  const dialect = e.dialect && e.dialect in DIALECTS ? DIALECTS[e.dialect as DialectKey].name : ''
  if (dialect) rows.push({ key: 'dialect', label: 'Dialecte', value: dialect })

  const tag = e.pos?.[0]?.trim()
  if (tag && !isMarker) {
    rows.push({ key: 'category', label: 'Catégorie', value: ENTRY_CATEGORIES.find(c => c.value === tag)?.label ?? tag })
  }

  const lemma = e.lemma?.trim()
  if (lemma && !isMarker) rows.push({ key: 'lemma', label: 'Forme de base', value: lemma })

  const synonyms = (e.french_synonyms ?? []).map(s => s.trim()).filter(Boolean)
  if (synonyms.length > 0 && !isMarker) rows.push({ key: 'synonyms', label: 'Synonymes', value: synonyms.join(', ') })

  const notes = e.notes?.trim()
  if (notes) rows.push({ key: 'notes', label: 'Notes d’usage', value: notes })

  return rows
}
