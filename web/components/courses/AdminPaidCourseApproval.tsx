'use client'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { approvePaidCourse } from '@/lib/courses/mutations'
import { formatCoursePrice } from '@/lib/courses/payment'
import type { Course } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'

interface Props {
  initialCourses: Course[]
}

export function AdminPaidCourseApproval({ initialCourses }: Props) {
  const [supabase] = useState(() => createClient())
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleApprove(courseId: string) {
    setLoadingId(courseId)
    const res = await approvePaidCourse(supabase, courseId, true)
    setLoadingId(null)

    if (!res.error) {
      setCourses(prev => prev.filter(c => c.id !== courseId))
    }
  }

  return (
    <div className="space-y-4">
      {courses.length === 0 ? (
        <div className="p-10 border border-dashed border-border rounded-xl text-center text-muted-foreground">
          Aucun cours payant en attente d’approbation.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(course => (
            <div key={course.id} className="border border-border rounded-xl p-5 bg-card flex items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-base">{course.title}</h4>
                <p className="text-xs text-muted-foreground">
                  Prix : <strong className="font-mono">{formatCoursePrice(course.price_cents, course.currency)}</strong>
                </p>
              </div>
              <Button size="sm" onClick={() => handleApprove(course.id)} disabled={loadingId === course.id}>
                <Check className="w-4 h-4 mr-1" />
                Approuver la vente
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
