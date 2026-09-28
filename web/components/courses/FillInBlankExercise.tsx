'use client'
import { useState } from 'react'
import { CheckCircle2, XCircle, HelpCircle, RefreshCw, Award, Sparkles } from 'lucide-react'
import { parseFillInBlankText, evaluateFillInBlankAnswers, type BlankToken } from '@/lib/courses/fill-in-blank'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import { setLessonCompleted } from '@/lib/courses/mutations'

interface Props {
  lessonId: string
  bodyMd: string
  isAuthed: boolean
  onComplete?: () => void
}

export function FillInBlankExercise({ lessonId, bodyMd, isAuthed, onComplete }: Props) {
  const [supabase] = useState(() => createClient())
  const [parsed] = useState(() => parseFillInBlankText(bodyMd))
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [activeBlankId, setActiveBlankId] = useState<string | null>(null)
  const [evaluated, setEvaluated] = useState<ReturnType<typeof evaluateFillInBlankAnswers> | null>(null)
  const [mode, setMode] = useState<'inline' | 'wordbank'>('inline')
  const [showHint, setShowHint] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  if (parsed.blanks.length === 0) {
    return (
      <div className="p-6 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
        Ce texte à trous ne contient aucune variable `[[...]]` définie.
      </div>
    )
  }

  function handleInputChange(blankId: string, value: string) {
    setUserAnswers(prev => ({ ...prev, [blankId]: value }))
    if (evaluated) setEvaluated(null) // Reset evaluation on edit
  }

  function handleWordBankSelect(word: string) {
    if (!activeBlankId) {
      // Find first empty blank
      const firstEmpty = parsed.blanks.find(b => !userAnswers[b.id])
      if (firstEmpty) {
        handleInputChange(firstEmpty.id, word)
      }
      return
    }
    handleInputChange(activeBlankId, word)
  }

  async function handleCheckAnswers() {
    const evalResult = evaluateFillInBlankAnswers(parsed.blanks, userAnswers)
    setEvaluated(evalResult)

    if (evalResult.scorePercent >= 80 && isAuthed) {
      setSubmitting(true)
      await setLessonCompleted(supabase, lessonId, true)
      setSubmitting(false)
      if (onComplete) onComplete()
    }
  }

  function handleReset() {
    setUserAnswers({})
    setEvaluated(null)
    setActiveBlankId(null)
  }

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="font-heading font-bold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Texte à trous
          </h3>
          <p className="text-xs text-muted-foreground">
            Remplissez les {parsed.blanks.length} emplacement{parsed.blanks.length > 1 ? 's' : ''} manquants dans le texte.
          </p>
        </div>

        {/* Mode switcher */}
        <div className="flex items-center bg-muted p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('inline')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === 'inline' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Saisie directe
          </button>
          <button
            type="button"
            onClick={() => setMode('wordbank')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === 'wordbank' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Banque de mots
          </button>
        </div>
      </div>

      {/* Main Paragraph Text with Interactive Blanks */}
      <div className="text-base md:text-lg leading-relaxed text-foreground space-y-4">
        <p className="inline-block">
          {parsed.tokens.map((token, index) => {
            if (token.type === 'text') {
              return <span key={index}>{token.content}</span>
            }

            const blank = token as BlankToken
            const value = userAnswers[blank.id] ?? ''
            const isCorrect = evaluated?.results[blank.id]
            const isEvaluated = evaluated !== null

            return (
              <span key={blank.id} className="inline-flex items-center gap-1 mx-1 my-0.5 align-middle">
                {blank.options && blank.options.length > 0 ? (
                  <select
                    value={value}
                    onChange={e => handleInputChange(blank.id, e.target.value)}
                    onFocus={() => setActiveBlankId(blank.id)}
                    disabled={isEvaluated && isCorrect}
                    className={`h-9 px-3 rounded-lg border text-sm font-medium transition-all ${
                      isEvaluated
                        ? isCorrect
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-destructive bg-destructive/10 text-destructive'
                        : activeBlankId === blank.id
                        ? 'border-primary ring-2 ring-primary/20 bg-background'
                        : 'border-input bg-background hover:border-primary/50'
                    }`}
                  >
                    <option value="">-- Sélectionner --</option>
                    {blank.options.map((opt, i) => (
                      <option key={i} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={value}
                    onChange={e => handleInputChange(blank.id, e.target.value)}
                    onFocus={() => setActiveBlankId(blank.id)}
                    placeholder="…"
                    disabled={isEvaluated && isCorrect}
                    className={`h-9 px-3 rounded-lg border text-sm font-medium w-28 md:w-36 transition-all outline-none ${
                      isEvaluated
                        ? isCorrect
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'border-destructive bg-destructive/10 text-destructive'
                        : activeBlankId === blank.id
                        ? 'border-primary ring-2 ring-primary/20 bg-background'
                        : 'border-input bg-background hover:border-primary/50'
                    }`}
                  />
                )}

                {/* Validation status icons */}
                {isEvaluated && (
                  <span>
                    {isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive inline" />
                    )}
                  </span>
                )}

                {/* Hint toggle icon */}
                {blank.hint && (
                  <button
                    type="button"
                    onClick={() => setShowHint(prev => ({ ...prev, [blank.id]: !prev[blank.id] }))}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="Afficher un indice"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                )}

                {/* Tooltip hint banner */}
                {blank.hint && showHint[blank.id] && (
                  <span className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-600 px-2 py-0.5 rounded">
                    Indice : {blank.hint}
                  </span>
                )}
              </span>
            )
          })}
        </p>
      </div>

      {/* Word Bank Chips (when in Word Bank mode) */}
      {mode === 'wordbank' && parsed.allWordBankOptions.length > 0 && (
        <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Banque de mots (cliquez sur un mot pour remplir l&apos;emplacement sélectionné) :
          </p>
          <div className="flex flex-wrap gap-2">
            {parsed.allWordBankOptions.map((word, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleWordBankSelect(word)}
                className="px-3 py-1.5 rounded-lg bg-background border border-border hover:border-primary hover:text-primary text-sm font-medium transition-colors shadow-sm active:scale-95"
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Evaluation Results Banner */}
      {evaluated && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
            evaluated.scorePercent >= 80
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold text-sm">
                Score : {evaluated.correctCount} / {evaluated.totalCount} ({evaluated.scorePercent} %)
              </p>
              <p className="text-xs opacity-90">
                {evaluated.scorePercent >= 80
                  ? 'Félicitations ! Vous avez validé cet exercice.'
                  : 'Corrigez les erreurs surignées en rouge et réessayez.'}
              </p>
            </div>
          </div>
          {evaluated.scorePercent < 100 && (
            <Button type="button" variant="outline" size="sm" onClick={handleReset} className="shrink-0 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </Button>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {evaluated && (
          <Button type="button" variant="ghost" onClick={handleReset}>
            Effacer tout
          </Button>
        )}
        <Button
          type="button"
          onClick={handleCheckAnswers}
          disabled={submitting || Object.keys(userAnswers).length === 0}
          className="gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          {submitting ? 'Validation…' : 'Vérifier mes réponses'}
        </Button>
      </div>
    </div>
  )
}
