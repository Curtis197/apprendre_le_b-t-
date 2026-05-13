'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'

interface VoteButtonsProps {
  table: 'lexicon' | 'grammar_rules' | 'expressions'
  id: string
  upvotes: number
}

export function VoteButtons({ table, id, upvotes: initialUpvotes }: VoteButtonsProps) {
  const [upvotes, setUpvotes] = useState(initialUpvotes)
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)
  const supabaseRef = useRef(createClient())

  async function vote(direction: 'up' | 'down') {
    if (voted === direction) return
    const prevCount = upvotes  // capture before optimistic update
    const delta = direction === 'up' ? 1 : -1
    const newCount = prevCount + delta
    setUpvotes(newCount)
    setVoted(direction)
    try {
      await supabaseRef.current
        .from(table)
        .update({ upvotes: newCount })
        .eq('id', id)
    } catch {
      // Rollback to pre-vote count
      setUpvotes(prevCount)
      setVoted(null)
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
