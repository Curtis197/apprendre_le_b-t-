import Link from 'next/link'
import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OutlineSection } from '@/lib/courses/types'

interface Props {
  slug: string
  outline: OutlineSection[]
  currentLessonId?: string
  completedIds: string[]
  /** True for enrolled learners and the owner; others may only open preview lessons. */
  hasFullAccess: boolean
}

export function LessonOutline({ slug, outline, currentLessonId, completedIds, hasFullAccess }: Props) {
  const done = new Set(completedIds)

  return (
    <nav aria-label="Plan du cours" className="space-y-5">
      {outline.map(section => (
        <div key={section.id}>
          <h3 className="font-heading font-semibold text-sm mb-2">{section.title}</h3>
          <ul className="space-y-1">
            {section.lessons.map(lesson => {
              const open = hasFullAccess || lesson.is_preview
              const isDone = done.has(lesson.id)
              const Icon = isDone ? CheckCircle2 : open ? Circle : Lock
              const row = (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0', isDone ? 'text-secondary' : 'text-muted-foreground')} />
                  <span className="flex-1">{lesson.title}</span>
                  {lesson.is_preview && !hasFullAccess && <span className="text-xs text-primary">Aperçu</span>}
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
