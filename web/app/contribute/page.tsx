export const dynamic = 'force-dynamic'

import { ContributionForm } from '@/components/ContributionForm'
import { PendingContributions } from '@/components/PendingContributions'
import { Separator } from '@/components/ui/separator'

export default function ContributePage() {
  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-10">
      <section>
        <h1 className="text-3xl font-bold mb-2">Contribuer</h1>
        <p className="text-muted-foreground mb-6">
          Ajoutez des expressions idiomatiques ou des règles grammaticales.
          Les contributions avec 3 votes ou plus sont activées dans le traducteur.
        </p>
        <ContributionForm />
      </section>
      <Separator />
      <section>
        <h2 className="text-xl font-bold mb-4">Contributions en attente de validation</h2>
        <PendingContributions />
      </section>
    </main>
  )
}
