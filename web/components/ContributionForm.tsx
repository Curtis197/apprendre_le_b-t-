'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'

type ContributionType = 'grammar_rule' | 'expression'

export function ContributionForm() {
  const [type, setType] = useState<ContributionType>('expression')
  const [submitted, setSubmitted] = useState(false)
  const supabase = createClient()

  // Grammar rule fields
  const [category, setCategory] = useState('verb')
  const [patternFr, setPatternFr] = useState('')
  const [patternBete, setPatternBete] = useState('')
  const [description, setDescription] = useState('')
  const [exFr, setExFr] = useState('')
  const [exBete, setExBete] = useState('')

  // Expression fields
  const [frPhrase, setFrPhrase] = useState('')
  const [betePhrase, setBetePhrase] = useState('')
  const [betePhonetic, setBetePhonetic] = useState('')
  const [exprType, setExprType] = useState<'idiomatic' | 'fixed' | 'proverb'>('idiomatic')

  async function handleSubmit() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('Connectez-vous pour contribuer.'); return }

    if (type === 'grammar_rule') {
      await supabase.from('grammar_rules').insert({
        category, pattern_french: patternFr, pattern_bete: patternBete,
        description, example_french: exFr || null, example_bete: exBete || null,
        created_by: user.id,
      })
    } else {
      await supabase.from('expressions').insert({
        french_phrase: frPhrase, bete_phrase: betePhrase,
        bete_phonetic: betePhonetic, type: exprType,
        created_by: user.id,
      })
    }
    setSubmitted(true)
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
      <div className="flex gap-2">
        {(['expression', 'grammar_rule'] as ContributionType[]).map(t => (
          <Button
            key={t}
            variant={type === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType(t)}
          >
            {t === 'expression' ? 'Expression' : 'Règle grammaticale'}
          </Button>
        ))}
      </div>

      {type === 'expression' ? (
        <div className="space-y-3">
          <Input placeholder="Phrase en français" value={frPhrase} onChange={e => setFrPhrase(e.target.value)} />
          <Input placeholder="Équivalent en bété (standard)" value={betePhrase} onChange={e => setBetePhrase(e.target.value)} />
          <Input placeholder="Forme phonétique" value={betePhonetic} onChange={e => setBetePhonetic(e.target.value)} />
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
            {['verb', 'noun', 'tense', 'agreement', 'other'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Input placeholder="Patron français (ex: verbe + é)" value={patternFr} onChange={e => setPatternFr(e.target.value)} />
          <Input placeholder="Patron bété correspondant" value={patternBete} onChange={e => setPatternBete(e.target.value)} />
          <Textarea placeholder="Description de la règle" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <Input placeholder="Exemple français (optionnel)" value={exFr} onChange={e => setExFr(e.target.value)} />
          <Input placeholder="Exemple bété (optionnel)" value={exBete} onChange={e => setExBete(e.target.value)} />
        </div>
      )}

      <Button onClick={handleSubmit} disabled={type === 'expression' ? !frPhrase || !betePhrase : !patternFr || !description}>
        Soumettre la contribution
      </Button>
    </div>
  )
}
