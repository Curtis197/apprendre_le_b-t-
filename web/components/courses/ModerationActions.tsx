'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { resolveReport, restoreCourse, suspendCourse } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'

type Outcome = { error: string | null }

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<Outcome>) {
    setBusy(true)
    setError(null)
    const { error: err } = await action()
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    router.refresh()
  }
  return { busy, error, run }
}

export function ReportActions({
  reportId,
  courseId,
  canSuspend,
}: {
  reportId: string
  courseId: string
  canSuspend: boolean
}) {
  const [supabase] = useState(() => createClient())
  const { busy, error, run } = useAction()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canSuspend && (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Suspendre ce cours ? Il disparaîtra du catalogue et de l’accès des apprenants.')) {
                run(() => suspendCourse(supabase, courseId))
              }
            }}
          >
            Suspendre le cours
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => resolveReport(supabase, reportId))}>
          Ignorer le signalement
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function RestoreButton({ courseId }: { courseId: string }) {
  const [supabase] = useState(() => createClient())
  const { busy, error, run } = useAction()

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => restoreCourse(supabase, courseId))}>
        Rétablir en brouillon
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
