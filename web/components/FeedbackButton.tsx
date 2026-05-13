'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { TranslationToken } from '@/lib/types'

interface Props {
  token: TranslationToken
}

export function FeedbackButton({ token }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const supabase = createClient()

  async function handleFlag() {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('user_feedback').insert({
      user_id: user?.id ?? null,
      type: 'reject',
      translator_phrase: `${token.french_word} → ${token.bete_phonetic}`,
    })
    setSubmitted(true)
  }

  if (submitted) return <p className="text-xs text-muted-foreground mt-1">Signalé ✓</p>

  return (
    <button
      onClick={handleFlag}
      className="text-xs text-red-400 hover:text-red-600 mt-1 block"
      title="Signaler une erreur"
      aria-label="Signaler une erreur de traduction"
    >
      ✗
    </button>
  )
}
