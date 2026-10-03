'use client'
import { FeedbackToken } from '@/lib/types'

interface Props {
  token: FeedbackToken
  active: boolean
  onToggle: () => void
}

// Opens the report panel for the word behind this token (see TranslatorOutput). A token that
// is not tied to a lexicon entry has nothing to report on.
export function FeedbackButton({ token, active, onToggle }: Props) {
  if (!token.lexicon_id) return null

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={active}
      className={`text-xs mt-1 block ${active ? 'text-red-600' : 'text-red-400 hover:text-red-600'}`}
      title="Signaler une erreur"
      aria-label="Signaler une erreur de traduction"
    >
      ✗
    </button>
  )
}
