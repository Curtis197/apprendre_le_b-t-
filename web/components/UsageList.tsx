'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import { findUsages, type UsageRow, type UsageSide } from '@/lib/usages'
import { UsageCard } from '@/components/UsageCard'

interface Props {
  initialRows: UsageRow[]
  total: number
  q: string
  side: UsageSide
  pageSize?: number
}

export function UsageList({ initialRows, total, q, side, pageSize = 20 }: Props) {
  const supabaseRef = useRef(createClient())
  const [rows, setRows] = useState(initialRows)
  const [count, setCount] = useState(total)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadMore() {
    setLoading(true)
    setError(null)
    const res = await findUsages(supabaseRef.current, { q, side, limit: pageSize, offset: rows.length })
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setRows(prev => [...prev, ...res.rows])
    setCount(res.total || count)
  }

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} sur {count} usage{count !== 1 ? 's' : ''}
      </p>
      <div className="space-y-3">
        {rows.map(row => <UsageCard key={row.line_id} row={row} side={side} />)}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.length < count && (
        <Button variant="outline" onClick={loadMore} disabled={loading}>
          {loading ? 'Chargement…' : 'Charger plus'}
        </Button>
      )}
    </div>
  )
}
