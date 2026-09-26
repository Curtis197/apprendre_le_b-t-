import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { DIALECTS } from '@/lib/dialect'
import { LEVEL_LABELS } from '@/lib/courses/labels'
import type { Course } from '@/lib/courses/types'

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary transition-colors"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5">
          <GraduationCap className="w-3 h-3" />
          {LEVEL_LABELS[course.level]}
        </span>
        <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5">
          {DIALECTS[course.dialect].name}
        </span>
        <span className="rounded-full bg-secondary/10 text-secondary px-2.5 py-0.5">
          {course.access === 'free' ? 'Gratuit' : 'Payant'}
        </span>
      </div>
      <h2 className="font-heading font-semibold text-base group-hover:text-primary transition-colors">
        {course.title}
      </h2>
      {course.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{course.summary}</p>
      )}
    </Link>
  )
}
