'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const [voted, setVoted] = useState<'up' | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const pathname = usePathname()
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const sb = supabaseRef.current
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setIsAuthed(false); return }
      const { data: existing } = await sb
        .from('user_votes')
        .select('direction')
        .eq('table_name', table)
        .eq('row_id', id)
        .maybeSingle()
      setVoted(existing?.direction === 'up' ? 'up' : null)
      setIsAuthed(true)
    })
  }, [table, id])

  async function handleVote() {
    if (!isAuthed) return

    const direction = 'up'
    const prevVoted = voted
    const prevUpvotes = upvotes
    const delta = voted === 'up' ? -1 : 1

    // Optimistic update
    setUpvotes(v => Math.max(0, v + delta))
    setVoted(voted === 'up' ? null : 'up')

    const { data, error } = await supabaseRef.current
      .rpc('vote', { p_table_name: table, p_row_id: id, p_direction: direction })

    if (error || !data) {
      setUpvotes(prevUpvotes)
      setVoted(prevVoted)
    } else {
      setUpvotes(data.upvotes)
      setVoted(data.direction ?? null)
    }
  }

  if (isAuthed === null) {
    return <div className="h-9 w-20" />
  }

  if (!isAuthed) {
    return (
      <Link
        href={'/auth?next=' + pathname}
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
        title="Connectez-vous pour voter"
      >
        ▲ {upvotes}
      </Link>
    )
  }

  return (
    <Button
      variant={voted === 'up' ? 'default' : 'outline'}
      size="sm"
      aria-label="Voter pour"
      onClick={handleVote}
    >
      ▲ {upvotes}
    </Button>
  )
}
