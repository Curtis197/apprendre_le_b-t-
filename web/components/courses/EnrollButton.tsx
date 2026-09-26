'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { enroll } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'
import { primaryLinkClass } from './styles'

interface Props {
  courseId: string
  slug: string
  isAuthed: boolean
  isOwner: boolean
  enrolled: boolean
  /** First unfinished lesson (or first lesson); null when the course has no lessons. */
  startHref: string | null
  percent: number
}

export function EnrollButton({ courseId, slug, isAuthed, isOwner, enrolled, startHref, percent }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
