import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { getCorrectionsToReview, getMyOpenCorrections } from '@/lib/corrections-mutations'
import { CorrectionList } from '@/components/CorrectionList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Corrections',
  robots: { index: false, follow: false },
}

export default async function CorrectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/corrections')

  const isAdmin = (await supabase.rpc('is_admin')).data === true
  const [toReview, mine] = await Promise.all([
    getCorrectionsToReview(supabase, user.id, isAdmin),
    getMyOpenCorrections(supabase, user.id),
  ])

  return (
    <main className="max-w-2xl mx-auto px-4 md:px-10 py-10 space-y-10">
      <section className="space-y-4">
        <h1 className="font-heading text-2xl font-bold">
          {isAdmin ? 'Corrections en attente' : 'Corrections à traiter'}
          {toReview.length > 0 ? ` (${toReview.length})` : ''}
        </h1>
        {toReview.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune correction en attente.</p>
        ) : (
          <CorrectionList corrections={toReview} userId={user.id} isAdmin={isAdmin} />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">
          Mes signalements{mine.length > 0 ? ` (${mine.length})` : ''}
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Vous n’avez aucun signalement en cours. Utilisez « Signaler une erreur » sur un mot, une ressource ou une règle.
          </p>
        ) : (
          <CorrectionList corrections={mine} userId={user.id} isAdmin={isAdmin} />
        )}
      </section>

      <p className="text-sm">
        <Link href="/profile" className="text-primary hover:underline">← Mon profil</Link>
      </p>
    </main>
  )
}
