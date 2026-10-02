import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendSubmissionReviewedEmail } from '@/lib/courses/assignment-email'

export const dynamic = 'force-dynamic'

const RECENT_REVIEW_MS = 5 * 60 * 1000

/** Emails the learner after a teacher reviews their submission. Reviewer-only, once per review. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })

  const { submissionId } = (await request.json().catch(() => ({}))) as { submissionId?: string }
  if (!submissionId) return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400 })

  // Read through the caller's RLS: only the learner, the course owner and admins see the row.
  const { data: sub } = await supabase
    .from('submissions')
    .select('user_id, status, grade, teacher_feedback, reviewed_at, lessons(title, courses(title, owner_id))')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub || !['reviewed', 'validated', 'needs_retry'].includes(sub.status)) {
    return NextResponse.json({ error: 'Devoir introuvable.' }, { status: 404 })
  }

  const lesson = sub.lessons as unknown as { title?: string; courses?: { title?: string; owner_id?: string } } | null
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (lesson?.courses?.owner_id !== user.id && isAdmin !== true) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  }

  // Replays of an old review must not re-send emails.
  const reviewedAt = sub.reviewed_at ? Date.parse(sub.reviewed_at) : 0
  if (Date.now() - reviewedAt > RECENT_REVIEW_MS) {
    return NextResponse.json({ sent: false })
  }

  const { data: learner } = await createServiceClient().auth.admin.getUserById(sub.user_id)
  const email = learner?.user?.email
  if (!email) return NextResponse.json({ sent: false })

  const feedback =
    sub.teacher_feedback ||
    (sub.status === 'validated'
      ? 'Votre prononciation a été validée.'
      : sub.status === 'needs_retry'
      ? 'Veuillez réenregistrer votre prononciation.'
      : 'Votre devoir a été évalué.')

  await sendSubmissionReviewedEmail({
    learnerEmail: email,
    courseTitle: lesson?.courses?.title ?? 'Cours',
    lessonTitle: lesson?.title ?? 'Devoir',
    feedback,
    grade: sub.grade,
  })
  return NextResponse.json({ sent: true })
}
