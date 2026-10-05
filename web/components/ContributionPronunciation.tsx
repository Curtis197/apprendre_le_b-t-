'use client'
import { useState } from 'react'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'
import { MAX_LEXICON_AUDIO_SECONDS } from '@/lib/lexicon-audio'

interface Props {
  /** The recording the contributor decided to keep, or null. */
  blob: Blob | null
  onChange: (blob: Blob | null) => void
  disabled?: boolean
}

/**
 * Optional recording of the word being contributed. Nothing is sent from here: the form keeps the
 * recording and uploads it once the entry exists (see ContributionForm).
 */
export function ContributionPronunciation({ blob, onChange, disabled = false }: Props) {
  // A new key resets the recorder (its own preview) after the contributor removes the recording.
  const [round, setRound] = useState(0)
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Prononciation (optionnel)
      </p>
      <PronunciationRecorder
        key={round}
        maxSeconds={MAX_LEXICON_AUDIO_SECONDS}
        startLabel="Enregistrer la prononciation"
        sendLabel="Garder cet enregistrement"
        disabled={disabled}
        onSend={onChange}
      />
      {blob && (
        <p className="flex flex-wrap items-center gap-3 text-xs text-primary" role="status">
          Enregistrement prêt : il sera publié avec le mot.
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              onChange(null)
              setRound(r => r + 1)
            }}
          >
            Retirer
          </button>
        </p>
      )}
    </div>
  )
}
