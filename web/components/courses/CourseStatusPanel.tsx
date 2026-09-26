'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { deleteCourse, setCourseStatus } from '@/lib/courses/mutations'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import type { Course } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'

interface Props {
  course: Course
  /** Why the course cannot be published yet (from publishBlocker), or null. */
  blocker: string | null
}

export function CourseStatusPanel({ course, blocker }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function changeStatus(status: 'draft' | 'published' | 'archived') {
    setBusy(true)
    setError(null)
    const { error: err } = await setCourseStatus(supabase, course.id, status)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer définitivement ce brouillon ?')) return
    setBusy(true)
    setError(null)
    const { error: err } = await deleteCourse(supabase, course.id)
    if (err) {
      setBusy(false)
      setError(err)
      return
    }
    router.push('/teach')
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-heading font-bold text-base">Publication</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[course.status]}`}>
          {STATUS_LABELS[course.status]}
        </span>
      </div>

      {course.status === 'suspended' && (
        <p className="text-sm text-destructive">
          Ce cours a été suspendu par un administrateur. Il n’est plus modifiable ni visible. Contactez l’équipe pour
          en savoir plus.
        </p>
      )}

      {(course.status === 'draft' || course.status === 'archived') && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {course.status === 'draft'
              ? 'Ce cours est un brouillon : seul vous pouvez le voir.'
              : 'Ce cours est archivé : il n’apparaît plus dans le catalogue, mais les apprenants inscrits y gardent accès.'}
          </p>
          {blocker && <p className="text-sm text-destructive">{blocker}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || blocker !== null} onClick={() => changeStatus('published')}>
              Publier le cours
            </Button>
            {course.status === 'draft' && (
              <Button variant="destructive" disabled={busy} onClick={handleDelete}>
                Supprimer le brouillon
              </Button>
            )}
          </div>
        </div>
      )}

      {course.status === 'published' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Ce cours est visible par tous dans le catalogue.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => changeStatus('draft')}>
              Repasser en brouillon
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => changeStatus('archived')}>
              Archiver
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
