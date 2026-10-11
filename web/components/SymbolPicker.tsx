'use client'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import Link from 'next/link'
import type { DialectKey } from '@/lib/dialect'
import { insertAtSelection, insertionRange } from '@/lib/phonetic'
import { trayRows } from '@/lib/phonetic-alphabet'

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * Writes `glyph` at the field's cursor. The value is set through the native setter and an `input`
 * event is dispatched so the form's own React `onChange` runs: callers keep their state untouched.
 * Returns false when the field's maxLength would be exceeded.
 */
function applyInsert(el: Field, glyph: string, atEnd: boolean): boolean {
  const { start, end } = insertionRange(el.value, el.selectionStart, el.selectionEnd, !atEnd)
  const result = insertAtSelection(el.value, start, end, glyph, el.maxLength > 0 ? el.maxLength : 0)
  if (!result) return false
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, result.value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  el.setSelectionRange(result.caret, result.caret)
  return true
}

interface Props {
  /** The input or textarea the symbols are written into. */
  target: RefObject<Field | null>
  dialect: DialectKey
  className?: string
}

export function SymbolPicker({ target, dialect, className }: Props) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const trayId = useId()
  const rows = trayRows(dialect)
  // A field never focused reports a selection at 0: the first symbol must go at the end instead.
  const everFocused = useRef(false)

  useEffect(() => {
    const el = target.current
    if (!el) return
    if (document.activeElement === el) everFocused.current = true
    const onFocus = () => { everFocused.current = true }
    el.addEventListener('focus', onFocus)
    return () => el.removeEventListener('focus', onFocus)
  }, [target])

  function insert(glyph: string) {
    const el = target.current
    if (!el) return
    setFull(!applyInsert(el, glyph, !everFocused.current))
  }

  return (
    <div className={className}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(o => !o)
            setFull(false)
          }}
          aria-expanded={open}
          aria-controls={trayId}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <span className="phonetic text-sm font-semibold text-primary" aria-hidden="true">ɛ</span>
          Symboles
        </button>
      </div>
      {open && (
        <div id={trayId} className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
          {rows.map(row => (
            <div key={row.title} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{row.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {row.glyphs.map(g => (
                  <button
                    key={g}
                    type="button"
                    // keep the field focused and its selection intact while the symbol is tapped
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => insert(g)}
                    aria-label={`Insérer ${g}`}
                    className="phonetic min-h-10 min-w-10 rounded-md border border-border bg-card px-2 text-lg font-semibold hover:bg-muted"
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {full && <p role="alert" className="text-xs text-destructive">Limite de caractères atteinte pour ce champ.</p>}
          <Link href="/alphabet" target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium text-primary hover:underline">
            Tout l’alphabet →
          </Link>
        </div>
      )}
    </div>
  )
}


