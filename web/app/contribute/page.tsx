// web/app/contribute/page.tsx
export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { PenLine, ShieldCheck, CheckCircle2, Clock } from 'lucide-react'
import { ContributionFormWithParams } from '@/components/ContributionForm'
import { PendingContributions } from '@/components/PendingContributions'
import { createClient } from '@/lib/supabase-server'
import { DialectSelector } from '@/components/DialectSelector'
import { DonateForm } from '@/components/DonateForm'

const LEVELS = [
  { name: 'Débutant',      initial: 'D', min: 0,  next: 3  },
  { name: 'Intermédiaire', initial: 'I', min: 3,  next: 10 },
  { name: 'Avancé',        initial: 'A', min: 10, next: 25 },
  { name: 'Expert',        initial: 'E', min: 25, next: null },
]

export default async function ContributePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let validatedCount = 0
  let totalCount = 0
  let displayName = 'Contributeur'

  if (user) {
    const [gr, ex, ct] = await Promise.all([
      supabase.from('grammar_rules').select('validated').eq('created_by', user.id),
      supabase.from('expressions').select('validated').eq('created_by', user.id),
      supabase.from('community_texts').select('validated').eq('created_by', user.id),
    ])
    const all = [...(gr.data ?? []), ...(ex.data ?? []), ...(ct.data ?? [])]
    totalCount = all.length
    validatedCount = all.filter(c => c.validated).length
    displayName = (user.user_metadata?.full_name as string | undefined)
      ?? user.email?.split('@')[0]
      ?? 'Contributeur'
  }

  const level = [...LEVELS].reverse().find(l => validatedCount >= l.min) ?? LEVELS[0]
  const progress = level.next
    ? Math.min(100, ((validatedCount - level.min) / (level.next - level.min)) * 100)
    : 100
  const toNext = level.next ? level.next - validatedCount : 0

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">

      {/* Hero Header */}
      <div className="relative bg-primary text-white rounded-xl p-8 md:p-12 mb-8 overflow-hidden">
        <div className="pattern-bg absolute inset-0" aria-hidden="true" />
        <div className="relative z-10">
          <h1 className="font-heading text-4xl font-bold max-w-2xl mb-3">
            Contribuez au Patrimoine Bété
          </h1>
          <p className="text-lg opacity-90 max-w-xl leading-relaxed">
            Chaque mot que vous ajoutez renforce la préservation d&apos;une langue vivante.
            Les contributions avec 3 votes sont intégrées au traducteur.
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mb-6">
        <DialectSelector />
      </div>

      <div className="grid lg:grid-cols-12 gap-8 mb-10">

        {/* Contribution Form — col 8 */}
        <div className="lg:col-span-8">
          <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
            <h2 className="font-heading text-2xl text-primary flex items-center gap-2 mb-6">
              <PenLine className="w-6 h-6" />
              Ajouter une contribution
            </h2>
            <ContributionFormWithParams />
          </div>
        </div>

        {/* Guidelines Panel — col 4 */}
        <div className="lg:col-span-4 space-y-4">

          {/* Community Guidelines */}
          <div className="bg-muted rounded-xl p-6 border border-border">
            <h3 className="font-heading text-lg text-secondary flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5" />
              Directives communautaires
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Authenticité</p>
                  <p className="text-xs text-muted-foreground">Utilisez des mots issus d&apos;usage réel, pas de traductions littérales.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Phonétique précise</p>
                  <p className="text-xs text-muted-foreground">La transcription phonétique aide à la prononciation correcte.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Validation communautaire</p>
                  <p className="text-xs text-muted-foreground">3 votes positifs suffisent pour valider une contribution.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Contributor Level */}
          <div className="bg-accent/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-sm font-bold">Niveau Contributeur</h3>
              <span className="bg-accent/40 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                {level.name}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent/40 flex items-center justify-center font-heading font-bold text-sm">
                {level.initial}
              </div>
              <div>
                <p className="text-sm font-semibold">{user ? displayName : 'Contributeur'}</p>
                <p className="text-xs text-muted-foreground">
                  {validatedCount} contribution{validatedCount !== 1 ? 's' : ''} validée{validatedCount !== 1 ? 's' : ''}
                  {totalCount > validatedCount ? ` · ${totalCount - validatedCount} en attente` : ''}
                </p>
              </div>
            </div>
            <div className="w-full bg-foreground/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-secondary h-full rounded-full transition-all"
                style={{ width: `${Math.max(progress, 5)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {level.next
                ? `${toNext} contribution${toNext !== 1 ? 's' : ''} validée${toNext !== 1 ? 's' : ''} pour passer au niveau ${LEVELS[LEVELS.indexOf(level) + 1]?.name}`
                : 'Niveau maximum atteint — merci pour vos contributions !'}
            </p>
          </div>
        </div>
      </div>

      {/* Pending Contributions */}
      <div className="mb-10">
        <h2 className="font-heading text-2xl font-bold mb-2 flex items-center gap-2">
          <Clock className="w-6 h-6 text-muted-foreground" />
          En attente de validation
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Votez pour valider les contributions de la communauté.
        </p>
        <PendingContributions />
      </div>

      {/* Financial contribution */}
      <Suspense fallback={null}>
        <DonateForm />
      </Suspense>
    </div>
  )
}
