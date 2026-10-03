import type { Metadata } from 'next'
import { UnsubscribeConfirm } from '@/components/UnsubscribeConfirm'
import { CATEGORY_LABELS, isEmailCategory } from '@/lib/mail/categories'

export const metadata: Metadata = {
  title: 'Se désabonner',
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; category?: string }>
}) {
  const { token, category } = await searchParams
  if (!token || !isEmailCategory(category)) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-bold">Lien invalide</h1>
        <p className="mt-2 text-muted-foreground">Ce lien de désabonnement est incomplet ou a expiré.</p>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <UnsubscribeConfirm token={token} category={category} label={CATEGORY_LABELS[category]} />
    </main>
  )
}
