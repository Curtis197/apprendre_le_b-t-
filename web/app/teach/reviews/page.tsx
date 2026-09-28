import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { getPendingReviewsForTeacher } from '@/lib/courses/queries'
import { ReviewQueue } from '@/components/courses/ReviewQueue'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth?next=/teach/reviews')

  const items = await getPendingReviewsForTeacher(supabase, user.id)

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-6">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour au tableau de bord enseignant
      </Link>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-primary" />
          Correction des devoirs
        </h1>
        <p className="text-sm text-muted-foreground">
          Consultez et corrigez les travaux remis par les apprenants inscrits à vos cours.
        </p>
      </div>

      <ReviewQueue initialItems={items} />
    </div>
  )
}
