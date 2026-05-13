'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { TranslationToken } from '@/lib/types'

interface Props {
  token: TranslationToken
}

export function FeedbackButton({ token }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const supabaseRef = useRef(createClient())

  async function handleFlag() {
    if (state !== 'idle') return
    setState('loading')
    try {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      const { error } = await supabaseRef.current.from('user_feedback').insert({
        user_id: user?.id ?? null,
        type: 'reject',
        translator_phrase: `${token.french_word} → ${token.bete_phonetic}`,
      })
      if (error) throw error
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') return <p className="text-xs text-muted-foreground mt-1">Signalé ✓</p>
  if (state === 'error') return <p className="text-xs text-red-500 mt-1">Erreur</p>

  return (
    <button
      onClick={handleFlag}
      disabled={state === 'loading'}
      className="text-xs text-red-400 hover:text-red-600 mt-1 block disabled:opacity-50"
      title="Signaler une erreur"
      aria-label="Signaler une erreur de traduction"
    >
      {state === 'loading' ? '…' : '✗'}
    </button>
  )
}
