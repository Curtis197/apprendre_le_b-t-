import Link from 'next/link'
import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OutlineSection } from '@/lib/courses/types'

interface Props {
  slug: string
  outline: OutlineSection[]
  currentLessonId?: string
  completedIds: string[]
  progressMap?: Record<string, { progress_percent: number; score: number | null }>
  /** True for enrolled learners and the owner; others may only open preview lessons. */
  hasFullAccess: boolean
}

export function LessonOutline({
  slug,
  outline,
  currentLessonId,
  completedIds,
  progressMap,
  hasFullAccess,
}: Props) {
  const done = new Set(completedIds)

  return (
    <nav aria-label="Plan du cours" className="space-y-5">
      {outline.map(section => (
        <div key={section.id}>
          <h3 className="font-heading font-semibold text-sm mb-2">{section.title}</h3>
          <ul className="space-y-1">
            {section.lessons.map(lesson => {
              const open = hasFullAccess || lesson.is_preview
              const progress = progressMap?.[lesson.id]
              const percent = progress?.progress_percent ?? (done.has(lesson.id) ? 100 : 0)
              const isDone = done.has(lesson.id) || percent >= 100
              const score = progress?.score

              const icon = isDone ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-secondary" />
              ) : !open ? (
                <Lock className="w-4 h-4 shrink-0 text-muted-foreground" />
              ) : percent > 0 ? (
                <div className="relative w-4 h-4 shrink-0 flex items-center justify-center" title={`${percent}% complété`}>
                  <svg className="w-4 h-4 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-muted stroke-current"
                      strokeWidth="4"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-primary stroke-current"
                      strokeDasharray={`${percent}, 100`}
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </div>
              ) : (
                <Circle className="w-4 h-4 shrink-0 text-muted-foreground" />
              )

              const row = (
                <>
                  {icon}
                  <span className="flex-1 truncate">{lesson.title}</span>
                  {!isDone && percent > 0 && (
                    <span className="text-[11px] font-mono font-medium text-primary shrink-0">{percent}%</span>
                  )}
                  {score !== null && score !== undefined && (
                    <span className="text-[11px] font-semibold text-secondary bg-secondary/10 px-1.5 py-0.5 rounded shrink-0">
                      {score}%
                    </span>
                  )}
                  {lesson.is_preview && !hasFullAccess && (
                    <span className="text-xs text-primary shrink-0">Aperçu</span>
                  )}
                </>
              )
              return (
                <li key={lesson.id}>
                  {open ? (
                    <Link
                      href={`/courses/${slug}/learn/${lesson.id}`}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors',
                        lesson.id === currentLessonId && 'bg-muted font-medium',
                      )}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
