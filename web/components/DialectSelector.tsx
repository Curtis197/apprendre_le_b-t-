'use client'
import { DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { useDialect } from '@/context/DialectContext'

export function DialectSelector() {
  const { dialect, setDialect } = useDialect()
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
        Dialecte
      </span>
      <select
        value={dialect}
        onChange={e => setDialect(e.target.value as DialectKey)}
        className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label="Choisir un dialecte bété"
      >
        {DIALECT_KEYS.map(key => (
          <option key={key} value={key}>{DIALECTS[key].name}</option>
        ))}
      </select>
    </div>
  )
}
