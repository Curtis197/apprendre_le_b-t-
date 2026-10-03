import { escapeHtml } from '@/lib/courses/assignment'
import { emailButton, renderLayout } from './layout'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface RenderContext {
  baseUrl: string
  unsubscribeUrl: string
}

type Payload = Record<string, unknown>

const str = (p: Payload, key: string, fallback = ''): string => (typeof p[key] === 'string' ? (p[key] as string) : fallback)
const num = (p: Payload, key: string): number | null => (typeof p[key] === 'number' && Number.isFinite(p[key]) ? (p[key] as number) : null)
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim()
const plural = (n: number, one: string, many: string): string => (n > 1 ? many : one)
const courseUrl = (ctx: RenderContext, slug: string): string => `${ctx.baseUrl}/courses/${encodeURIComponent(slug)}`

function p(html: string): string {
  return `<p style="margin:0 0 16px;">${html}</p>`
}

function build(ctx: RenderContext, subject: string, bodyHtml: string, textLines: string[]): RenderedEmail {
  return {
    subject: oneLine(subject),
    html: renderLayout({ bodyHtml, unsubscribeUrl: ctx.unsubscribeUrl }),
    text: [...textLines, '', `Se désabonner : ${ctx.unsubscribeUrl}`].join('\n'),
  }
}

const RENDERERS: Record<string, (payload: Payload, ctx: RenderContext) => RenderedEmail> = {
  new_course(payload, ctx) {
    const title = str(payload, 'course_title', 'Nouveau cours')
    const summary = str(payload, 'summary')
    const url = courseUrl(ctx, str(payload, 'course_slug'))
    return build(
      ctx,
      `Nouveau cours : ${title}`,
      p('Un enseignant dont vous suivez un cours vient de publier un nouveau cours.') +
        `<h2 style="margin:0 0 8px;color:#1a1a2e;">${escapeHtml(title)}</h2>` +
        (summary ? p(escapeHtml(summary)) : '') +
        emailButton(url, 'Découvrir le cours'),
      ['Un enseignant dont vous suivez un cours vient de publier un nouveau cours.', title, summary, url].filter(Boolean),
    )
  },

  submission_received(payload, ctx) {
    const lesson = str(payload, 'lesson_title', 'Devoir')
    const course = str(payload, 'course_title', 'Cours')
    const url = `${ctx.baseUrl}/teach/reviews`
    return build(
      ctx,
      `Nouveau devoir à corriger — ${lesson}`,
      p(`Un apprenant a rendu le devoir de la leçon <strong>${escapeHtml(lesson)}</strong> du cours <strong>${escapeHtml(course)}</strong>.`) +
        emailButton(url, 'Corriger les devoirs'),
      [`Un apprenant a rendu le devoir de la leçon « ${lesson} » du cours « ${course} ».`, url],
    )
  },

  submission_reviewed(payload, ctx) {
    const lesson = str(payload, 'lesson_title', 'Devoir')
    const course = str(payload, 'course_title', 'Cours')
    const feedback = str(payload, 'feedback')
    const grade = num(payload, 'grade')
    const url = courseUrl(ctx, str(payload, 'course_slug'))
    const gradeHtml = grade !== null ? p(`<strong>Note :</strong> ${grade} / 100`) : ''
    // Pronunciation decisions arrive with outcome 'validated' or 'needs_retry'; everything else is a graded assignment.
    const outcome = str(payload, 'outcome')
    const wording =
      outcome === 'validated'
        ? {
            subject: `Prononciation validée — ${lesson}`,
            html: `Votre enseignant a validé votre prononciation pour la leçon <strong>${escapeHtml(lesson)}</strong> du cours <strong>${escapeHtml(course)}</strong>.`,
            text: `Votre enseignant a validé votre prononciation pour la leçon « ${lesson} » (cours « ${course} »).`,
          }
        : outcome === 'needs_retry'
          ? {
              subject: `Prononciation à refaire — ${lesson}`,
              html: `Votre enseignant vous demande de réenregistrer votre prononciation pour la leçon <strong>${escapeHtml(lesson)}</strong> du cours <strong>${escapeHtml(course)}</strong>.`,
              text: `Votre enseignant vous demande de réenregistrer votre prononciation pour la leçon « ${lesson} » (cours « ${course} »).`,
            }
          : {
              subject: `Votre devoir a été corrigé — ${lesson}`,
              html: `Votre enseignant a publié une correction pour votre devoir de la leçon <strong>${escapeHtml(lesson)}</strong> du cours <strong>${escapeHtml(course)}</strong>.`,
              text: `Votre enseignant a corrigé votre devoir de la leçon « ${lesson} » (cours « ${course} »).`,
            }
    return build(
      ctx,
      wording.subject,
      p(wording.html) +
        gradeHtml +
        `<div style="background:#f4f4f5;border-left:4px solid #7c3aed;padding:12px 16px;margin:16px 0;"><p style="margin:0;font-weight:bold;">Commentaire de l’enseignant :</p><p style="margin:8px 0 0;white-space:pre-wrap;">${escapeHtml(feedback)}</p></div>` +
        emailButton(url, 'Voir mes devoirs'),
      [
        wording.text,
        ...(grade !== null ? [`Note : ${grade} / 100`] : []),
        `Commentaire : ${feedback}`,
        url,
      ],
    )
  },

  weekly_progress(payload, ctx) {
    const completed = num(payload, 'lessons_completed') ?? 0
    const rawCourses = Array.isArray(payload.courses) ? (payload.courses as unknown[]) : []
    const courses = rawCourses.flatMap((c) => {
      if (typeof c !== 'object' || c === null) return []
      const row = c as Payload
      return [{
        title: str(row, 'title', 'Cours'),
        slug: str(row, 'slug'),
        week: num(row, 'completed_this_week') ?? 0,
        done: num(row, 'completed_total') ?? 0,
        total: num(row, 'total_lessons') ?? 0,
      }]
    })
    const items = courses
      .map((c) => `<li style="margin:0 0 8px;"><a href="${escapeHtml(courseUrl(ctx, c.slug))}" style="color:#7c3aed;">${escapeHtml(c.title)}</a> — ${c.week} ${plural(c.week, 'leçon terminée', 'leçons terminées')} cette semaine (${c.done} / ${c.total})</li>`)
      .join('')
    return build(
      ctx,
      'Votre progression de la semaine',
      p(`Bravo ! Cette semaine, vous avez terminé <strong>${completed}</strong> ${plural(completed, 'leçon', 'leçons')}.`) +
        (items ? `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>` : '') +
        emailButton(`${ctx.baseUrl}/courses`, 'Continuer à apprendre'),
      [
        `Cette semaine, vous avez terminé ${completed} ${plural(completed, 'leçon', 'leçons')}.`,
        ...courses.map((c) => `- ${c.title} : ${c.week} cette semaine (${c.done} / ${c.total})`),
        `${ctx.baseUrl}/courses`,
      ],
    )
  },
}

export function renderTemplate(name: string, payload: Payload, ctx: RenderContext): RenderedEmail | null {
  const render = RENDERERS[name]
  return render ? render(payload, ctx) : null
}

/** Transactional (no unsubscribe footer): sent right after signup. */
export function renderWelcomeEmail(opts: { name: string; baseUrl: string }): RenderedEmail {
  const name = opts.name.replace(/[\r\n]+/g, ' ').trim() || 'Contributeur'
  const bodyHtml =
    `<h1 style="margin:0 0 16px;font-size:24px;color:#1a1a2e;">Bienvenue, ${escapeHtml(name)} !</h1>` +
    p('Votre compte a été créé sur <strong>Apprendre le bhété</strong>. Vous faites maintenant partie d’une communauté dédiée à la préservation et à la valorisation de la langue bhété.') +
    p('Vous pouvez explorer le lexique, contribuer des mots et des expressions, suivre des cours et rejoindre le forum.') +
    emailButton(opts.baseUrl, 'Accéder à la plateforme') +
    p('<span style="font-size:13px;color:#6b7280;">Si vous n’êtes pas à l’origine de cette inscription, ignorez cet e-mail.</span>')
  return {
    subject: `Bienvenue sur Apprendre le bhété, ${name} !`,
    html: renderLayout({ bodyHtml }),
    text: [`Bienvenue, ${name} !`, 'Votre compte a été créé sur Apprendre le bhété.', opts.baseUrl].join('\n'),
  }
}
