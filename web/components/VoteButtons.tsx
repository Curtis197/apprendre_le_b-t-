'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
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
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => {
      setIsAuthed(!!data.user)
    })
  }, [])

  async function vote(direction: 'up' | 'down') {
    if (voted === direction || !isAuthed) return
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

  if (isAuthed === null) {
    return <div className="h-9 w-20" />
  }

  if (!isAuthed) {
    return (
      <Link
        href="/auth"
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
        title="Connectez-vous pour voter"
      >
        ▲ {upvotes}
      </Link>
    )
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
