import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CourseForm } from '@/components/courses/CourseForm'
import { createClient } from '@/lib/supabase-server'

export default async function NewCoursePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/teach/new')

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 py-10">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Mes cours
      </Link>
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold mb-2">Nouveau cours</h1>
        <p className="text-muted-foreground text-sm">
          Commencez par les informations générales. Vous ajouterez sections et leçons à l’étape suivante.
        </p>
      </div>
      <div className="bg-card border border-border rounded-xl p-6">
        <CourseForm mode="create" />
      </div>
    </div>
  )
}
