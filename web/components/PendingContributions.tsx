'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VoteButtons } from './VoteButtons'
import { createClient } from '@/lib/supabase-browser'
import { GrammarRule, Expression } from '@/lib/types'
import { ContributionComments } from './ContributionComments'
import { CorrectionBox } from './CorrectionBox'
import { useContributeRefresh } from '@/context/ContributeRefreshContext'
import { useDialect } from '@/context/DialectContext'

type LexiconWord = {
  id: string
  bete_phonetic: string
  bete_word: string
  top_french: string
  pos: string[] | null
  description: string | null
  notes: string | null
  created_by: string | null
}

const POS_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  pron: 'Pron.', prep: 'Prép.', part: 'Particule', other: 'Autre',
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
  // Only lexicon words carry a dialect; rules and expressions are not filtered.
  const { dialect } = useDialect()

  useEffect(() => {
    let cancelled = false
    const client = supabaseRef.current
    Promise.all([
      client.from('grammar_rules').select('*').eq('validated', false)
        .order('created_at', { ascending: false }).limit(10),
      client.from('expressions').select('*').eq('validated', false)
        .order('created_at', { ascending: false }).limit(10),
      client.from('lexicon').select('id,bete_phonetic,bete_word,top_french,pos,description,notes,created_by')
        .eq('validated', false).not('created_by', 'is', null).eq('dialect', dialect)
        .eq('entry_kind', 'word')
        .order('created_at', { ascending: false }).limit(10),
    ]).then(([rulesRes, exprsRes, wordsRes]) => {
      if (cancelled) return  // a newer dialect/refresh superseded this request
      if (rulesRes.error || exprsRes.error || wordsRes.error) {
        setError('Impossible de charger les contributions.')
      } else {
        setRules((rulesRes.data ?? []) as GrammarRule[])
        setExpressions((exprsRes.data ?? []) as Expression[])
        setWords((wordsRes.data ?? []) as LexiconWord[])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [refreshKey, dialect])

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
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p className="font-bold">{word.bete_phonetic}</p>
                  {word.bete_word !== word.bete_phonetic && (
                    <p className="font-mono text-muted-foreground">[{word.bete_word}]</p>
                  )}
                  {(word.description || word.notes) && (
                    <p className="text-muted-foreground">{word.description || word.notes}</p>
                  )}
                  <CorrectionBox
                    targetType="word"
                    targetId={word.id}
                    ownerId={word.created_by}
                    fields={[
                      { field: 'bete_phonetic', current: word.bete_phonetic },
                      { field: 'bete_word', current: word.bete_word },
                      { field: 'description', current: word.description },
                    ]}
                  />
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
                  <CorrectionBox
                    targetType="expression"
                    targetId={ex.id}
                    ownerId={ex.created_by}
                    fields={[
                      { field: 'bete_phrase', current: ex.bete_phrase },
                      { field: 'bete_phonetic', current: ex.bete_phonetic },
                      { field: 'french_phrase', current: ex.french_phrase },
                      { field: 'french_literal', current: ex.french_literal },
                    ]}
                  />
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
                  <CorrectionBox
                    targetType="grammar_rule"
                    targetId={rule.id}
                    ownerId={rule.created_by}
                    fields={[
                      { field: 'pattern_french', current: rule.pattern_french },
                      { field: 'pattern_bete', current: rule.pattern_bete },
                      { field: 'description', current: rule.description },
                      { field: 'example_bete', current: rule.example_bete },
                      { field: 'example_french', current: rule.example_french },
                    ]}
                  />
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
