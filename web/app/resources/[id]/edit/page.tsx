import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { getCommunityText } from '@/lib/community'
import { ResourceSubmitForm } from '@/components/ResourceSubmitForm'

export const metadata: Metadata = {
  title: 'Modifier la ressource',
  robots: { index: false, follow: false },
}

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/resources/${id}/edit`)

  const text = await getCommunityText(supabase, id)
  // Only the contributor edits a resource: anyone else gets the same 404 as a missing one.
  if (!text || text.created_by !== user.id) notFound()

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 py-10">
      <Link
        href={`/resources/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour à la ressource
      </Link>

      <h1 className="font-heading text-3xl font-bold mb-8">Modifier la ressource</h1>

      <ResourceSubmitForm resource={text} />
    </div>
  )
}
