// web/app/grammar/page.tsx
import Link from 'next/link'
import { Music2, BookOpen, Layers, PenLine } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PatternDivider } from '@/components/PatternDivider'
import { createClient } from '@/lib/supabase-server'
import type { GrammarRule } from '@/lib/types'
import { DialectSelector } from '@/components/DialectSelector'

export const dynamic = 'force-dynamic'

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

      <div className="grid md:grid-cols-12 gap-6">

        {/* Card 1 — Full width: Tones */}
        <div className="md:col-span-12 bg-card border-l-4 border-primary rounded-xl p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Music2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-2xl text-primary font-bold">Les Tons</h2>
              <p className="text-xs text-muted-foreground">Système tonal et phonologie</p>
            </div>
          </div>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Le bhété est une langue à tons. Le ton (hauteur mélodique d&apos;une syllabe) est phonémique :
            il distingue des mots de forme identique. On distingue principalement le ton haut et le ton bas.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-muted rounded-lg p-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ton Haut</p>
              <p className="font-heading text-2xl text-primary font-bold">bá</p>
              <p className="text-sm italic text-muted-foreground mt-1">signifie &quot;père&quot;</p>
            </div>
            <div className="bg-muted rounded-lg p-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ton Bas</p>
              <p className="font-heading text-2xl text-secondary font-bold">bà</p>
              <p className="text-sm italic text-muted-foreground mt-1">signifie &quot;mère&quot;</p>
            </div>
          </div>
        </div>

        {/* Card 2 — Verb Structure */}
        <div className="md:col-span-7 bg-card border-t-4 border-secondary rounded-xl p-6">
          <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-secondary" />
            Structure Verbale
          </h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Les verbes bhété s&apos;organisent selon un système aspectuel distinguant l&apos;accompli de l&apos;inaccompli.
          </p>
          <ul className="space-y-2">
            {[
              { label: 'Perfectif', desc: 'Action achevée, résultat présent' },
              { label: 'Imperfectif', desc: 'Action en cours ou habituelle' },
              { label: 'Progressif', desc: "Action se déroulant au moment de l'énoncé" },
            ].map(item => (
              <li key={item.label} className="bg-secondary/10 rounded-lg p-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                <div>
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-sm text-muted-foreground"> — {item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 3 — Key Markers */}
        <div className="md:col-span-5 bg-accent/20 rounded-xl p-6">
          <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent-foreground" />
            Marqueurs Clés
          </h2>
          {[
            { key: 'Sujet', value: 'Préfixe verbal' },
            { key: 'Temps', value: 'Particule préverbale' },
            { key: 'Aspect', value: 'Suffixe ou ton' },
            { key: 'Négation', value: 'Encadrement verbal' },
          ].map((row, i, arr) => (
            <div
              key={row.key}
              className={`flex justify-between py-2.5 text-sm ${i < arr.length - 1 ? 'border-b border-border/50' : ''}`}
            >
              <span className="font-semibold">{row.key}</span>
              <span className="text-muted-foreground">{row.value}</span>
            </div>
          ))}
        </div>

      </div>

      {/* Community Grammar Rules */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
              <PenLine className="w-6 h-6 text-muted-foreground" />
              Règles de la Communauté
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Règles grammaticales validées par la communauté
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
