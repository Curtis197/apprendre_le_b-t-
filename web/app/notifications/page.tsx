import type { Metadata } from 'next'
import { NotificationPreferences } from '@/components/NotificationPreferences'

export const metadata: Metadata = {
  title: 'Mes notifications',
  robots: { index: false, follow: false },
}

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold">Mes notifications par e-mail</h1>
      <p className="mt-2 text-muted-foreground">Choisissez les e-mails que vous souhaitez recevoir. Les e-mails liés à votre compte (bienvenue, sécurité) sont toujours envoyés.</p>
      <NotificationPreferences />
    </main>
  )
}
