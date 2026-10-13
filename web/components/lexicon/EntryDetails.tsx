import { entryDetailRows, type EntryDetailSource } from '@/lib/lexicon-details'

/** « Fiche » of an entry: dialect, category, base form, synonyms and usage notes (the rest is shown elsewhere on the page). */
export function EntryDetails({ entry }: { entry: EntryDetailSource }) {
  const rows = entryDetailRows(entry)
  if (rows.length === 0) return null
  return (
    <dl className="grid gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(r => (
        <div key={r.key} className="contents">
          <dt className="font-medium text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 whitespace-pre-line break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
