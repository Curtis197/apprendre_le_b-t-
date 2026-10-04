import { LEARNER_STATUS_LABELS, LEARNER_STATUS_STYLES } from '@/lib/courses/labels'
import type { LearnerStatus } from '@/lib/courses/stats'

export function LearnerStatusBadge({ status }: { status: LearnerStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEARNER_STATUS_STYLES[status]}`}>
      {LEARNER_STATUS_LABELS[status]}
    </span>
  )
}

export function formatActivity(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—'
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Aujourd’hui'
  if (days === 1) return 'Hier'
  return `Il y a ${days} jours`
}
