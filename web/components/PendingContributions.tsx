'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VoteButtons } from './VoteButtons'
import { createClient } from '@/lib/supabase-browser'
import { GrammarRule, Expression } from '@/lib/types'
import { ContributionComments } from './ContributionComments'
import { useContributeRefresh } from '@/context/ContributeRefreshContext'

type LexiconWord = {
  id: string
  bete_phonetic: string
  bete_word: string
  top_french: string
  pos: string[] | null
  notes: string | null
  upvotes: number
}

const POS_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  pron: 'Pron.', prep: 'Prép.', other: 'Autre',
}

const EXPRESSION_TYPE_LABELS: Record<string, string> = {
  idiomatic: 'Idiomatique', fixed: 'Expression figée', proverb: 'Proverbe',
}

const CATEGORY_LABELS: Record<string, string> = {
  verb: 'Verbe', noun: 'Nom', tense: 'Temps', agreement: 'Accord', other: 'Autre',
}

export function PendingContributions() {
  const [rules, setRules] = useState<GrammarRule[]>([])
  const [expressions, setExpressions] = useState<Expression[]>([])
  const [words, setWords] = useState<LexiconWord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())
  const { refreshKey } = useContributeRefresh()

  useEffect(() => {
    const client = supabaseRef.current
    Promise.all([
      client.from('grammar_rules').select('*').eq('validated', false)
        .order('created_at', { ascending: false }).limit(10),
      client.from('expressions').select('*').eq('validated', false)
        .order('created_at', { ascending: false }).limit(10),
      client.from('lexicon').select('id,bete_phonetic,bete_word,top_french,pos,notes,upvotes')
        .eq('validated', false).not('created_by', 'is', null)
        .order('created_at', { ascending: false }).limit(10),
    ]).then(([rulesRes, exprsRes, wordsRes]) => {
      if (rulesRes.error || exprsRes.error || wordsRes.error) {
        setError('Impossible de charger les contributions.')
      } else {
        setRules((rulesRes.data ?? []) as GrammarRule[])
        setExpressions((exprsRes.data ?? []) as Expression[])
        setWords((wordsRes.data ?? []) as LexiconWord[])
      }
      setLoading(false)
    })
  }, [refreshKey])

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-6">
      {words.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Mots du lexique en attente</h2>
          <div className="space-y-3">
            {words.map(word => (
              <Card key={word.id}>
                <CardHeader className="pb-1">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{word.top_french}</CardTitle>
                    <div className="flex items-center gap-2">
                      {word.pos?.[0] && <Badge variant="outline">{POS_LABELS[word.pos[0]] ?? word.pos[0]}</Badge>}
                      <VoteButtons table="lexicon" id={word.id} upvotes={word.upvotes} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p className="font-bold">{word.bete_phonetic}</p>
                  {word.bete_word !== word.bete_phonetic && (
                    <p className="font-mono text-muted-foreground">[{word.bete_word}]</p>
                  )}
                  {word.notes && <p className="text-muted-foreground">{word.notes}</p>}
                  <ContributionComments targetTable="lexicon" targetId={word.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {expressions.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Expressions en attente</h2>
          <div className="space-y-3">
            {expressions.map(ex => (
              <Card key={ex.id}>
                <CardHeader className="pb-1">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{ex.french_phrase}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{EXPRESSION_TYPE_LABELS[ex.type] ?? ex.type}</Badge>
                      <VoteButtons table="expressions" id={ex.id} upvotes={ex.upvotes} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="font-bold">{ex.bete_phrase}</p>
                  <p className="text-sm font-mono text-muted-foreground">[{ex.bete_phonetic}]</p>
                  {ex.french_literal && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Mot à mot :</span> {ex.french_literal}
                    </p>
                  )}
                  <ContributionComments targetTable="expressions" targetId={ex.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {rules.length > 0 && (
        <section>
          <h2 className="font-semibold text-lg mb-3">Règles grammaticales en attente</h2>
          <div className="space-y-3">
            {rules.map(rule => (
              <Card key={rule.id}>
                <CardHeader className="pb-1">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{rule.description}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{CATEGORY_LABELS[rule.category] ?? rule.category}</Badge>
                      <VoteButtons table="grammar_rules" id={rule.id} upvotes={rule.upvotes} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">FR:</span> {rule.pattern_french}</p>
                  <p><span className="text-muted-foreground">Bhété:</span> {rule.pattern_bete}</p>
                  <ContributionComments targetTable="grammar_rules" targetId={rule.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {rules.length === 0 && expressions.length === 0 && words.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune contribution en attente.</p>
      )}
    </div>
  )
}
