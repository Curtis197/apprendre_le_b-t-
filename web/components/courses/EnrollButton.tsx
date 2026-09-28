'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { enroll } from '@/lib/courses/mutations'
import { formatCoursePrice } from '@/lib/courses/payment'
import { PaidCheckoutModal } from '@/components/courses/PaidCheckoutModal'
import { Button } from '@/components/ui/button'
import { primaryLinkClass } from './styles'

interface Props {
  courseId: string
  slug: string
  courseTitle?: string
  access?: 'free' | 'paid'
  priceCents?: number | null
  currency?: string
  paidApproved?: boolean
  isAuthed: boolean
  isOwner: boolean
  enrolled: boolean
  /** First unfinished lesson (or first lesson); null when the course has no lessons. */
  startHref: string | null
  percent: number
}

export function EnrollButton({
  courseId,
  slug,
  courseTitle = 'Cours',
  access = 'free',
  priceCents,
  currency = 'eur',
  paidApproved = false,
  isAuthed,
  isOwner,
  enrolled,
  startHref,
  percent,
}: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  if (!startHref) {
    return <p className="text-sm text-muted-foreground">Ce cours n’a pas encore de leçon.</p>
  }
  const target = startHref

  if (enrolled || isOwner) {
    return (
      <Link href={target} className={primaryLinkClass}>
        {enrolled && percent > 0 ? `Continuer (${percent} %)` : 'Commencer le cours'}
      </Link>
    )
  }

  if (!isAuthed) {
    return (
      <Link href={`/auth?next=${encodeURIComponent(`/courses/${slug}`)}`} className={primaryLinkClass}>
        Se connecter pour suivre ce cours
      </Link>
    )
  }

  // Handle Paid Course
  if (access === 'paid') {
    if (!paidApproved) {
      return (
        <div className="space-y-1">
          <Button size="lg" disabled className="opacity-75">
            Achat bientôt disponible
          </Button>
          <p className="text-xs text-muted-foreground">En cours d’approbation par l’administration.</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <Button size="lg" onClick={() => setModalOpen(true)}>
          Acheter ce cours ({formatCoursePrice(priceCents, currency)})
        </Button>
        <PaidCheckoutModal
          courseId={courseId}
          courseTitle={courseTitle}
          priceCents={priceCents ?? 0}
          currency={currency}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      </div>
    )
  }

  async function handleEnroll() {
    setLoading(true)
    setError(null)
    const { error: err } = await enroll(supabase, courseId)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    router.push(target)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={handleEnroll} disabled={loading}>
        {loading ? 'Inscription…' : 'S’inscrire gratuitement'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
