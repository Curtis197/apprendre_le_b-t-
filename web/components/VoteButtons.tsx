'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'

type VoteableTable = 'lexicon' | 'grammar_rules' | 'expressions'
  | 'forum_threads' | 'forum_posts' | 'community_texts'

interface VoteButtonsProps {
  table: VoteableTable
  id: string
  upvotes: number
}

export function VoteButtons({ table, id, upvotes: initialUpvotes }: VoteButtonsProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes)
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)
  const supabaseRef = useRef(createClient())

  async function vote(direction: 'up' | 'down') {
    if (voted === direction) return
    // If switching vote direction, delta is ±2; first vote is ±1
    const delta = direction === 'up'
      ? (voted === 'down' ? 2 : 1)
      : (voted === 'up' ? -2 : -1)

    setUpvotes(v => Math.max(0, v + delta))
    setVoted(direction)

    const { data, error } = await supabaseRef.current
      .rpc('increment_upvotes', { table_name: table, row_id: id, delta })

    if (error) {
      setUpvotes(initialUpvotes)
      setVoted(null)
    } else if (typeof data === 'number') {
      setUpvotes(data)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={voted === 'up' ? 'default' : 'outline'}
        size="sm"
        aria-label="Voter pour"
        onClick={() => vote('up')}
      >
        ▲ {upvotes}
      </Button>
      <Button
        variant={voted === 'down' ? 'default' : 'outline'}
        size="sm"
        aria-label="Voter contre"
        onClick={() => vote('down')}
      >
        ▼
      </Button>
    </div>
  )
}
