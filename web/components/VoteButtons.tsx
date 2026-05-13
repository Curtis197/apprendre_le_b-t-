'use client'
import { useState } from 'react'
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
  const supabase = createClient()

  async function vote(direction: 'up' | 'down') {
    if (voted === direction) return
    const delta = direction === 'up' ? 1 : -1
    setUpvotes(v => v + delta)
    setVoted(direction)
    await supabase
      .from(table)
      .update({ upvotes: upvotes + delta })
      .eq('id', id)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={voted === 'up' ? 'default' : 'outline'}
        size="sm"
        onClick={() => vote('up')}
      >
        ▲ {upvotes}
      </Button>
      <Button
        variant={voted === 'down' ? 'default' : 'outline'}
        size="sm"
        onClick={() => vote('down')}
      >
        ▼
      </Button>
    </div>
  )
}
