'use client'
import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { numberLines } from '@/lib/verses'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  id?: string
  'aria-label'?: string
  /** Typography of the text itself (font family, italics…). Size and line height are fixed. */
  className?: string
}

/** Line height is shared by the gutter and the textarea: the numbers only line up if it is identical. */
const LINE_HEIGHT = '1.5rem'

/**
 * A textarea with a verse-number gutter. Non-empty lines are numbered 1, 2, 3… and blank
 * lines (stanza breaks) are left empty, so "verse 7" means the same thing in every field.
 *
 * Soft wrapping is off (`wrap="off"`): a wrapped line would take two rows and push every
 * following number out of place. Long lines scroll sideways instead.
 */
export function NumberedTextarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  id,
  'aria-label': ariaLabel,
  className,
}: Props) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const numbers = useMemo(() => numberLines(value), [value])

  return (
    <div className="flex items-stretch rounded-lg border border-input bg-background text-base md:text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="shrink-0 select-none overflow-hidden rounded-l-lg border-r border-input bg-muted/40 py-2 pl-2 pr-2 text-right font-mono text-xs text-muted-foreground"
        style={{ minWidth: '2.5rem' }}
      >
        {numbers.map((n, i) => (
          <div key={i} style={{ height: LINE_HEIGHT, lineHeight: LINE_HEIGHT }}>
            {n ?? ''}
          </div>
        ))}
        {/* Room for the textarea's horizontal scrollbar, so both scroll to the same end. */}
        <div style={{ height: '1rem' }} />
      </div>
      <textarea
        id={id}
        aria-label={ariaLabel}
        wrap="off"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onScroll={e => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
        }}
        className={cn(
          'min-w-0 flex-1 resize-y overflow-x-auto whitespace-pre bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground',
          className,
        )}
        style={{ lineHeight: LINE_HEIGHT }}
      />
    </div>
  )
}
