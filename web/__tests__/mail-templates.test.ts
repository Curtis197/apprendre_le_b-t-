import { describe, expect, it } from 'vitest'
import { renderTemplate, renderWelcomeEmail } from '@/lib/mail/templates'

const ctx = { baseUrl: 'https://apprendre-le-bhete.com', unsubscribeUrl: 'https://apprendre-le-bhete.com/notifications/unsubscribe?token=t&category=course_activity' }

describe('renderTemplate', () => {
  it('returns null for an unknown template', () => {
    expect(renderTemplate('nope', {}, ctx)).toBeNull()
  })

  it('renders new_course with a course link, an unsubscribe link and a text part', () => {
    const out = renderTemplate('new_course', { course_title: 'Le bhété pour débutants', course_slug: 'bhete-debutants', summary: 'Un début.' }, ctx)!
    expect(out.subject).toBe('Nouveau cours : Le bhété pour débutants')
    expect(out.html).toContain('<meta charset="utf-8"')
    expect(out.html).toContain('https://apprendre-le-bhete.com/courses/bhete-debutants')
    expect(out.html).toContain('notifications/unsubscribe')
    expect(out.text).toContain('https://apprendre-le-bhete.com/courses/bhete-debutants')
    expect(out.text).toContain('notifications/unsubscribe')
  })

  it('escapes hostile teacher text and keeps CR/LF out of the subject', () => {
    const out = renderTemplate(
      'submission_reviewed',
      { lesson_title: 'Leçon\r\nBcc: evil@x.com', course_title: '<b>C</b>', course_slug: 's', feedback: '<script>alert(1)</script> "x" & y', grade: 80 },
      ctx,
    )!
    expect(out.subject).not.toMatch(/[\r\n]/)
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.html).not.toContain('<b>C</b>')
    expect(out.html).toContain('80 / 100')
  })

  it('omits the grade line when there is no grade', () => {
    const out = renderTemplate('submission_reviewed', { lesson_title: 'L', course_title: 'C', course_slug: 's', feedback: 'Bien', grade: null }, ctx)!
    expect(out.html).not.toContain('/ 100')
  })

  it('words pronunciation decisions differently from a graded assignment', () => {
    const base = { lesson_title: 'Salutations', course_title: 'Bhété 1', course_slug: 's', feedback: 'Bien <b>dit</b>', grade: null }
    const ok = renderTemplate('submission_reviewed', { ...base, outcome: 'validated' }, ctx)!
    expect(ok.subject).toBe('Prononciation validée — Salutations')
    expect(ok.html).toContain('validé votre prononciation')
    expect(ok.html).toContain('Bien &lt;b&gt;dit&lt;/b&gt;')
    const retry = renderTemplate('submission_reviewed', { ...base, outcome: 'needs_retry' }, ctx)!
    expect(retry.subject).toBe('Prononciation à refaire — Salutations')
    expect(retry.text).toContain('réenregistrer')
    const graded = renderTemplate('submission_reviewed', { ...base, outcome: 'reviewed' }, ctx)!
    expect(graded.subject).toBe('Votre devoir a été corrigé — Salutations')
    const legacy = renderTemplate('submission_reviewed', base, ctx)!
    expect(legacy.subject).toBe('Votre devoir a été corrigé — Salutations')
  })

  it('links the teacher to the review queue for submission_received', () => {
    const out = renderTemplate('submission_received', { lesson_title: 'L', course_title: 'C', course_slug: 's' }, ctx)!
    expect(out.html).toContain('https://apprendre-le-bhete.com/teach/reviews')
  })

  it('renders weekly_progress with per-course lines and tolerates a malformed courses payload', () => {
    const ok = renderTemplate('weekly_progress', { lessons_completed: 3, courses: [{ title: 'Cours A', slug: 'a', completed_this_week: 3, completed_total: 5, total_lessons: 10 }] }, ctx)!
    expect(ok.html).toContain('Cours A')
    expect(ok.html).toContain('5 / 10')
    const bad = renderTemplate('weekly_progress', { lessons_completed: 1, courses: 'oops' }, ctx)!
    expect(bad.subject).toContain('semaine')
  })

  it('renders the welcome email without an unsubscribe footer and escapes the name', () => {
    const out = renderWelcomeEmail({ name: '<i>Awa</i>', baseUrl: ctx.baseUrl })
    expect(out.html).toContain('&lt;i&gt;Awa&lt;/i&gt;')
    expect(out.html).not.toContain('unsubscribe')
  })
})
