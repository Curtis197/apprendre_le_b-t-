'use client'
import { cn } from '@/lib/utils'
import { blockKey, labelOf, type Pair, type Side } from '@/lib/word-blocks'
import { buildCells, EMPTY_META, type BlockMeta } from '@/lib/word-link-editor'

export interface Focus {
  side: Side
  head: number
}

interface Props {
  pairs: Pair[]
  bw: string[]
  gw: string[]
  meta: Record<string, BlockMeta>
  focus: Focus | null
  onFocus: (f: Focus) => void
}

/**
 * The pairs of a verse. Bété words stay in sentence order: a block whose words are apart appears
 * at each of its places, the first with the mot à mot, the others as dashed partner boxes.
 */
export function PairStrip({ pairs, bw, gw, meta, focus, onFocus }: Props) {
  const cells = buildCells(pairs, bw)
  const selected = (pair: Pair, side: Side) => {
    if (!focus || focus.side !== side) return false
    const u = side === 'b' ? pair.b : pair.g
    return !!u && u.idx.includes(focus.head)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {cells.map(cell => {
        const { pair, pairIndex: k } = cell
        const m = pair.b ? meta[blockKey(pair.b)] ?? EMPTY_META : EMPTY_META
        const current = selected(pair, 'b') || selected(pair, 'g')

        if (cell.run > 0) {
          return (
            <div
              key={cell.key}
              className={cn(
                'relative inline-flex min-w-[4rem] flex-col overflow-hidden rounded-md border border-dashed border-primary bg-primary/10',
                current && 'ring-2 ring-primary/40',
              )}
            >
              <span className="absolute left-1 top-0.5 text-[10px] tabular-nums text-muted-foreground">{k + 1}</span>
              <button
                type="button"
                data-word={cell.text}
                onClick={() => onFocus({ side: 'b', head: pair.b!.head })}
                className="px-3 pb-1 pt-4 text-center font-semibold"
              >
                {cell.text}
              </button>
              <span className="border-t border-border px-3 py-1 text-center text-xs text-muted-foreground">↔ {cell.runs[0]}</span>
            </div>
          )
        }

        const apart = cell.runs.length > 1
        return (
          <div
            key={cell.key}
            className={cn(
              'relative inline-flex min-w-[4rem] flex-col overflow-hidden rounded-md border bg-muted/40',
              (!pair.b || (!pair.g && !pair.solo)) && 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
              m.isMarker && 'border-violet-400',
              apart && 'border-primary',
              current && 'ring-2 ring-primary/40',
            )}
          >
            <span className="absolute left-1 top-0.5 text-[10px] tabular-nums text-muted-foreground">{k + 1}</span>
            {pair.b ? (
              <button
                type="button"
                data-word={cell.text}
                onClick={() => onFocus({ side: 'b', head: pair.b!.head })}
                className="px-3 pb-1 pt-4 text-center font-semibold"
              >
                {m.isMarker && <span aria-hidden="true" className="mr-1 text-violet-500">◆</span>}
                {cell.text}
                {apart && <span className="text-xs font-normal text-muted-foreground"> ↔ {cell.runs.slice(1).join(', ')}</span>}
              </button>
            ) : (
              <span className="px-3 pb-1 pt-4 text-center text-xs text-amber-700">aucun mot bhété</span>
            )}
            {pair.g ? (
              <button
                type="button"
                onClick={() => onFocus({ side: 'g', head: pair.g!.head })}
                className="border-t border-border px-3 py-1 text-center text-sm italic text-primary"
              >
                {labelOf(gw, pair.g.idx)}
              </button>
            ) : pair.solo ? (
              <span className="border-t border-border px-3 py-1 text-center text-xs text-muted-foreground">marqueur</span>
            ) : (
              <span className="border-t border-border px-3 py-1 text-center text-xs text-amber-700">sans équivalent</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
