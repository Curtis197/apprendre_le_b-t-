'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'

type ContributionType = 'word' | 'expression' | 'grammar_rule'

export function ContributionForm() {
  const [type, setType] = useState<ContributionType>('word')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  // Word fields
  const [wordBetePhonetic, setWordBetePhonetic] = useState('')
  const [wordBeteIPA, setWordBeteIPA] = useState('')
  const [wordFrench, setWordFrench] = useState('')
  const [wordPos, setWordPos] = useState('noun')
  const [wordNotes, setWordNotes] = useState('')

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

  async function handleSubmit() {
    setLoading(true)
    setSubmitError(null)
    const { data: { user } } = await supabaseRef.current.auth.getUser()
    if (!user) {
      setLoading(false)
      alert('Connectez-vous pour contribuer.')
      return
    }
    try {
      let error
      if (type === 'word') {
        ({ error } = await supabaseRef.current.from('lexicon').insert({
          bete_phonetic: wordBetePhonetic,
          bete_word: wordBeteIPA || wordBetePhonetic,
          top_french: wordFrench,
          french_candidates: [{ word: wordFrench, prob: 1.0 }],
          probability: 1.0,
          pos: [wordPos],
          notes: wordNotes || null,
          created_by: user.id,
        }))
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
    } catch (e) {
      setSubmitError('Erreur lors de l\'envoi. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div className="p-4 border rounded text-center space-y-2">
      <p className="font-semibold">Contribution envoyée ✓</p>
      <p className="text-sm text-muted-foreground">Elle sera visible après validation par la communauté.</p>
      <Button variant="outline" onClick={() => setSubmitted(false)}>Ajouter une autre</Button>
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
          <Input
            placeholder="Mot en bété (forme phonétique latine) *"
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
            placeholder="Notes ou contexte d'usage (optionnel)"
            value={wordNotes}
            onChange={e => setWordNotes(e.target.value)}
            rows={2}
          />
        </div>
      ) : type === 'expression' ? (
        <div className="space-y-3">
          <Input
            placeholder="Phrase en bété (standard) *"
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
          <Input placeholder="Patron bété correspondant" value={patternBete} onChange={e => setPatternBete(e.target.value)} />
          <Textarea placeholder="Description de la règle" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <Input placeholder="Exemple français (optionnel)" value={exFr} onChange={e => setExFr(e.target.value)} />
          <Input placeholder="Exemple bété (optionnel)" value={exBete} onChange={e => setExBete(e.target.value)} />
        </div>
      )}

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button
        onClick={handleSubmit}
        disabled={loading || (
          type === 'word' ? !wordBetePhonetic || !wordFrench :
          type === 'expression' ? !frPhrase || !betePhrase :
          !patternFr || !patternBete || !description
        )}
      >
        {loading ? 'Envoi…' : 'Soumettre la contribution'}
      </Button>
    </div>
  )
}
