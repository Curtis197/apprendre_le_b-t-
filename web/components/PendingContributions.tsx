'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VoteButtons } from './VoteButtons'
import { createClient } from '@/lib/supabase-browser'
import { GrammarRule, Expression } from '@/lib/types'
import { ContributionComments } from './ContributionComments'

export function PendingContributions() {
  const [rules, setRules] = useState<GrammarRule[]>([])
  const [expressions, setExpressions] = useState<Expression[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const client = supabaseRef.current
    Promise.all([
      client.from('grammar_rules').select('*').eq('validated', false)
        .order('created_at', { ascending: false }).limit(10),
      client.from('expressions').select('*').eq('validated', false)
        .order('created_at', { ascending: false }).limit(10),
    ]).then(([rulesRes, exprsRes]) => {
      if (rulesRes.error || exprsRes.error) {
        setError('Impossible de charger les contributions.')
      } else {
        setRules((rulesRes.data ?? []) as GrammarRule[])
        setExpressions((exprsRes.data ?? []) as Expression[])
      }
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-6">
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
                      <Badge variant="outline">{ex.type}</Badge>
                      <VoteButtons table="expressions" id={ex.id} upvotes={ex.upvotes} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="font-bold">{ex.bete_phrase}</p>
                  <p className="text-sm font-mono text-muted-foreground">[{ex.bete_phonetic}]</p>
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
                      <Badge variant="outline">{rule.category}</Badge>
                      <VoteButtons table="grammar_rules" id={rule.id} upvotes={rule.upvotes} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">FR:</span> {rule.pattern_french}</p>
                  <p><span className="text-muted-foreground">Bété:</span> {rule.pattern_bete}</p>
                  <ContributionComments targetTable="grammar_rules" targetId={rule.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {rules.length === 0 && expressions.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune contribution en attente.</p>
      )}
    </div>
  )
}
