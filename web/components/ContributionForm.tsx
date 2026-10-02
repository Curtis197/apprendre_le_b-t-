'use client'
import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'
import { useContributeRefresh } from '@/context/ContributeRefreshContext'
import { useDialect } from '@/context/DialectContext'
import { DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import {
  buildExampleRow,
  buildWordClaimPayload,
  buildWordPayload,
  contributionErrorMessage,
  exampleState,
} from '@/lib/contribution'
import {
  addTranslation,
  DUPLICATE_TRANSLATION_MESSAGE,
} from '@/lib/lexicon-mutations'

type ContributionType = 'word' | 'expression' | 'grammar_rule'

interface ContributionFormProps {
  initialWord?: string
  initialType?: ContributionType
  initialId?: string
}

export function ContributionForm({ initialWord, initialType, initialId }: ContributionFormProps = {}) {
  const [type, setType] = useState<ContributionType>(initialType ?? 'word')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())
  const router = useRouter()
  const { bumpRefresh } = useContributeRefresh()
  // Same source of truth as the page-level DialectSelector, so the two never disagree.
  const { dialect, setDialect } = useDialect()

  // Word fields
  const [wordBetePhonetic, setWordBetePhonetic] = useState('')
  const [wordBeteIPA, setWordBeteIPA] = useState('')
  const [wordFrench, setWordFrench] = useState(initialWord ?? '')
  const [wordPos, setWordPos] = useState('noun')
  const [wordDescription, setWordDescription] = useState('')
  const [wordExBete, setWordExBete] = useState('')
  const [wordExFrench, setWordExFrench] = useState('')
  // The word saved but its example sentence did not (two separate writes).
  const [exampleSaveFailed, setExampleSaveFailed] = useState(false)

  // Grammar rule fields
  const [category, setCategory] = useState('verb')
  const [patternFr, setPatternFr] = useState('')
  const [patternBete, setPatternBete] = useState('')
  const [description, setDescription] = useState('')
  const [exFr, setExFr] = useState('')
  const [exBete, setExBete] = useState('')

  // Expression fields
  const [frPhrase, setFrPhrase] = useState('')
  const [frLiteral, setFrLiteral] = useState('')
  const [betePhrase, setBetePhrase] = useState('')
  const [betePhonetic, setBetePhonetic] = useState('')
  const [exprType, setExprType] = useState<'idiomatic' | 'fixed' | 'proverb'>('idiomatic')

  const exampleIncomplete = exampleState(wordExBete, wordExFrench) === 'incomplete'

  async function handleSubmit() {
    setLoading(true)
    setSubmitError(null)
    setExampleSaveFailed(false)
    const { data: { user } } = await supabaseRef.current.auth.getUser()
    if (!user) {
      setLoading(false)
      alert('Connectez-vous pour contribuer.')
      return
    }
    try {
      let error
      if (type === 'word') {
        const fields = {
          betePhonetic: wordBetePhonetic,
          beteIPA: wordBeteIPA,
          french: wordFrench,
          pos: wordPos,
          description: wordDescription,
          dialect,
          userId: user.id,
        }
        let lexiconId = initialId
        if (initialId) {
          const claimPayload = buildWordClaimPayload(fields)
          ;({ error } = await supabaseRef.current.from('lexicon').update(claimPayload).eq('id', initialId))
          if (!error) {
            const transRes = await addTranslation(supabaseRef.current, initialId, { french: wordFrench })
            if (transRes.error && transRes.error !== DUPLICATE_TRANSLATION_MESSAGE) {
              error = new Error(transRes.error)
            }
          }
        } else {
          const payload = buildWordPayload(fields)
          const res = await supabaseRef.current.from('lexicon').insert(payload).select('id').single()
          error = res.error
          lexiconId = res.data?.id
        }
        if (!error && lexiconId && exampleState(wordExBete, wordExFrench) === 'complete') {
          const { error: exampleError } = await supabaseRef.current
            .from('lexicon_examples')
            .insert(buildExampleRow(lexiconId, {
              bete: wordExBete, french: wordExFrench, dialect, userId: user.id,
            }))
          if (exampleError) setExampleSaveFailed(true)
        }
      } else if (type === 'grammar_rule') {
        ({ error } = await supabaseRef.current.from('grammar_rules').insert({
          category, pattern_french: patternFr, pattern_bete: patternBete,
          description, example_french: exFr || null, example_bete: exBete || null,
          created_by: user.id,
        }))
      } else {
        ({ error } = await supabaseRef.current.from('expressions').insert({
          french_phrase: frPhrase,
          french_literal: frLiteral.trim() || null,
          bete_phrase: betePhrase,
          bete_phonetic: betePhonetic,
          type: exprType,
          created_by: user.id,
        }))
      }
      if (error) throw error
      setSubmitted(true)
      bumpRefresh()
      router.refresh()
    } catch (e) {
      setSubmitError(contributionErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div className="p-4 border rounded text-center space-y-2">
      <p className="font-semibold">Contribution envoyée ✓</p>
      <p className="text-sm text-muted-foreground">Elle sera visible après validation par la communauté.</p>
      {exampleSaveFailed && (
        <p className="text-sm text-red-600">
          Le mot a bien été enregistré, mais la phrase d&apos;exemple n&apos;a pas pu l&apos;être.
        </p>
      )}
      <Button
        variant="outline"
        onClick={() => {
          // A stale sentence would attach itself to the next word.
          setWordExBete('')
          setWordExFrench('')
          setSubmitted(false)
        }}
      >
        Ajouter une autre
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['word', 'expression', 'grammar_rule'] as ContributionType[]).map(t => (
          <Button
            key={t}
            variant={type === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType(t)}
          >
            {t === 'word' ? 'Mot du lexique' : t === 'expression' ? 'Expression' : 'Règle grammaticale'}
          </Button>
        ))}
      </div>

      {type === 'word' ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="contribution-dialect"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              Dialecte de cette contribution
            </label>
            <select
              id="contribution-dialect"
              className="w-full border rounded px-3 py-2 text-sm"
              value={dialect}
              onChange={e => setDialect(e.target.value as DialectKey)}
            >
              {DIALECT_KEYS.map(key => (
                <option key={key} value={key}>{DIALECTS[key].name}</option>
              ))}
            </select>
          </div>
          <Input
            placeholder="Mot en bhété (forme phonétique latine) *"
            value={wordBetePhonetic}
            onChange={e => setWordBetePhonetic(e.target.value)}
          />
          <Input
            placeholder="Transcription IPA (optionnel — si vous connaissez)"
            value={wordBeteIPA}
            onChange={e => setWordBeteIPA(e.target.value)}
          />
          <Input
            placeholder="Traduction française *"
            value={wordFrench}
            onChange={e => setWordFrench(e.target.value)}
          />
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={wordPos}
            onChange={e => setWordPos(e.target.value)}
          >
            <option value="noun">Nom</option>
            <option value="verb">Verbe</option>
            <option value="adj">Adjectif</option>
            <option value="adv">Adverbe</option>
            <option value="pron">Pronom</option>
            <option value="prep">Préposition</option>
            <option value="other">Autre</option>
          </select>
          <Textarea
            placeholder="Description du mot ou contexte d'usage (optionnel)"
            value={wordDescription}
            onChange={e => setWordDescription(e.target.value)}
            rows={2}
          />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Phrase d&apos;exemple (optionnel)
            </p>
            <Input
              placeholder="Phrase en bhété utilisant ce mot"
              value={wordExBete}
              onChange={e => setWordExBete(e.target.value)}
            />
            <Input
              placeholder="Traduction française de la phrase"
              value={wordExFrench}
              onChange={e => setWordExFrench(e.target.value)}
            />
            {exampleIncomplete && (
              <p className="text-xs text-red-600">
                Renseignez la phrase et sa traduction, ou laissez les deux champs vides.
              </p>
            )}
          </div>
        </div>
      ) : type === 'expression' ? (
        <div className="space-y-3">
          <Input
            placeholder="Phrase en bhété (standard) *"
            value={betePhrase}
            onChange={e => setBetePhrase(e.target.value)}
          />
          <Input
            placeholder="Forme phonétique *"
            value={betePhonetic}
            onChange={e => setBetePhonetic(e.target.value)}
          />
          <Input
            placeholder="Traduction littérale mot par mot (ex : la pluie me bat)"
            value={frLiteral}
            onChange={e => setFrLiteral(e.target.value)}
          />
          <Input
            placeholder="Sens réel en français (ex : il pleut) *"
            value={frPhrase}
            onChange={e => setFrPhrase(e.target.value)}
          />
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={exprType}
            onChange={e => setExprType(e.target.value as typeof exprType)}
          >
            <option value="idiomatic">Idiomatique</option>
            <option value="fixed">Expression figée</option>
            <option value="proverb">Proverbe</option>
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="verb">Verbe</option>
            <option value="noun">Nom</option>
            <option value="tense">Temps</option>
            <option value="agreement">Accord</option>
            <option value="other">Autre</option>
          </select>
          <Input placeholder="Patron français (ex: verbe + é)" value={patternFr} onChange={e => setPatternFr(e.target.value)} />
          <Input placeholder="Patron bhété correspondant" value={patternBete} onChange={e => setPatternBete(e.target.value)} />
          <Textarea placeholder="Description de la règle" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <Input placeholder="Exemple français (optionnel)" value={exFr} onChange={e => setExFr(e.target.value)} />
          <Input placeholder="Exemple bhété (optionnel)" value={exBete} onChange={e => setExBete(e.target.value)} />
        </div>
      )}

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button
        onClick={handleSubmit}
        disabled={loading || (
          type === 'word' ? !wordBetePhonetic || !wordFrench || exampleIncomplete :
          type === 'expression' ? !frPhrase || !betePhrase || !betePhonetic :
          !patternFr || !patternBete || !description
        )}
      >
        {loading ? 'Envoi…' : 'Soumettre la contribution'}
      </Button>
    </div>
  )
}

function ContributionFormParamsReader() {
  const params = useSearchParams()
  const word = params.get('word') ?? undefined
  const rawType = params.get('type')
  const type: ContributionType | undefined =
    rawType === 'word' || rawType === 'expression' || rawType === 'grammar_rule'
      ? rawType
      : undefined
  const id = params.get('id') ?? undefined
  return <ContributionForm initialWord={word} initialType={type} initialId={id} />
}

export function ContributionFormWithParams() {
  return (
    <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-xl" />}>
      <ContributionFormParamsReader />
    </Suspense>
  )
}
