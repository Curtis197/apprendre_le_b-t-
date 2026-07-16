// web/app/grammar/page.tsx
import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PatternDivider } from '@/components/PatternDivider'
import { createClient } from '@/lib/supabase-server'
import type { GrammarRule } from '@/lib/types'
import { DialectSelector } from '@/components/DialectSelector'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Grammaire bété',
  description: 'Règles de grammaire de la langue bété (bhété) : conjugaison, accords et structure des phrases, illustrées par des exemples français-bété.',
  alternates: { canonical: '/grammar' },
}

const CATEGORY_LABELS: Record<string, string> = {
  verb: 'Verbe',
  noun: 'Nom',
  tense: 'Temps',
  agreement: 'Accord',
  other: 'Autre',
}

export default async function GrammarPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('grammar_rules')
    .select('*')
    .eq('validated', true)
    .order('upvotes', { ascending: false })
    .limit(20)
  const rules: GrammarRule[] = (data ?? []) as GrammarRule[]

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Piliers Linguistiques"
        title="Architecture Grammaticale"
        subtitle="La langue bhété possède une structure tonale et aspectuelle unique qui reflète la richesse de la tradition orale ivoirienne."
      />

      <div className="mb-6">
        <DialectSelector />
      </div>

      {/* Community Grammar Rules */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
              <PenLine className="w-6 h-6 text-muted-foreground" />
              Règles de Grammaire
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Validées par la communauté
            </p>
          </div>
          <Link
            href="/contribute"
            className="text-sm text-primary font-semibold hover:underline shrink-0"
          >
            Contribuer →
          </Link>
        </div>

        {rules.length === 0 ? (
          <div className="bg-muted rounded-xl p-10 text-center">
            <p className="text-muted-foreground text-sm mb-3">
              Aucune règle validée pour l&apos;instant.
            </p>
            <Link
              href="/contribute"
              className="inline-flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <PenLine className="w-4 h-4" />
              Ajouter la première règle
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {rules.map(rule => (
              <div key={rule.id} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="bg-secondary/20 text-secondary text-xs font-semibold rounded-full px-3 py-1">
                    {CATEGORY_LABELS[rule.category] ?? rule.category}
                  </span>
                  {rule.upvotes > 0 && (
                    <span className="text-xs text-muted-foreground">▲ {rule.upvotes}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <span className="font-mono bg-muted rounded px-2 py-0.5">{rule.pattern_french}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono bg-primary/10 text-primary rounded px-2 py-0.5">{rule.pattern_bete}</span>
                </div>
                <p className="text-sm text-muted-foreground">{rule.description}</p>
                {(rule.example_french || rule.example_bete) && (
                  <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground space-y-0.5">
                    {rule.example_french && <p>FR: <em>{rule.example_french}</em></p>}
                    {rule.example_bete && <p>BT: <em>{rule.example_bete}</em></p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <PatternDivider />

      {/* CTA Banner */}
      <div className="bg-primary text-white rounded-xl p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="font-heading text-2xl font-bold mb-2">Prêt à pratiquer ?</h2>
            <p className="opacity-90 text-sm leading-relaxed max-w-lg">
              Mettez en pratique ces règles grammaticales en explorant le lexique ou en contribuant vos propres exemples.
            </p>
          </div>
          <Link
            href="/lexicon"
            className="shrink-0 bg-white text-primary font-semibold px-6 h-10 rounded-lg inline-flex items-center hover:bg-white/90 active:scale-95 transition-all"
          >
            Explorer le Lexique
          </Link>
        </div>
      </div>
    </div>
  )
}
