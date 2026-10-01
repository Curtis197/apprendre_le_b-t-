export interface Submission {
  id: string
  lesson_id: string
  user_id: string
  answer_text: string | null
  audio_path: string | null
  status: 'submitted' | 'reviewed'
  teacher_feedback: string | null
  grade: number | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface PendingReviewItem {
  submission: Submission
  lesson: { id: string; title: string; course_id: string }
  course: { id: string; title: string; slug: string }
  learner: { id: string; email: string | null; full_name?: string }
}

export function formatGradeDisplay(grade?: number | null): string {
  if (grade === null || grade === undefined) return 'Non noté'
  return `${grade} / 100`
}

export function formatSubmissionStatusLabel(status: 'submitted' | 'reviewed'): string {
  if (status === 'reviewed') return 'Évalué'
  return 'En attente de correction'
}

/** Teacher-controlled text goes into email HTML: escape it so it cannot inject markup or links. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
