import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { getPendingPaidCoursesForAdmin, isAdmin } from '@/lib/courses/queries'
import { AdminPaidCourseApproval } from '@/components/courses/AdminPaidCourseApproval'

export const dynamic = 'force-dynamic'

export default async function AdminCoursesPage() {
  const supabase = await createClient()
  const admin = await isAdmin(supabase)
  if (!admin) redirect('/courses')

  const pendingPaid = await getPendingPaidCoursesForAdmin(supabase)

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-6">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour à la gestion des cours
      </Link>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" />
          Approbation des cours payants
        </h1>
        <p className="text-sm text-muted-foreground">
          Validez la commercialisation des cours payants soumis par les enseignants.
        </p>
      </div>

      <AdminPaidCourseApproval initialCourses={pendingPaid} />
    </div>
  )
}
