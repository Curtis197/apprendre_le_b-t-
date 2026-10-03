export const EMAIL_CATEGORIES = ['teacher_announcements', 'weekly_progress', 'course_activity'] as const
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  teacher_announcements: 'Nouveaux cours de mes enseignants',
  weekly_progress: 'Mon bilan de la semaine',
  course_activity: 'Devoirs rendus et corrigés',
}

export function isEmailCategory(value: unknown): value is EmailCategory {
  return typeof value === 'string' && (EMAIL_CATEGORIES as readonly string[]).includes(value)
}
