import 'server-only'
import { Resend } from 'resend'
import { escapeHtml } from './assignment'

interface Props {
  learnerEmail: string
  courseTitle: string
  lessonTitle: string
  feedback: string
  grade?: number | null
}

export async function sendSubmissionReviewedEmail({
  learnerEmail,
  courseTitle,
  lessonTitle,
  feedback,
  grade,
}: Props): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !learnerEmail) return

  const resend = new Resend(apiKey)
  const gradeText = grade !== null && grade !== undefined ? `<p><strong>Note :</strong> ${Number(grade)} / 100</p>` : ''

  try {
    await resend.emails.send({
      from: 'Plateforme Bété <notif@apprendrelebete.com>',
      to: learnerEmail,
      subject: `Votre devoir a été corrigé — ${lessonTitle.replace(/[\r\n]+/g, ' ')}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Votre devoir a été corrigé</h2>
          <p>Bonjour,</p>
          <p>Votre enseignant a publié une correction pour votre devoir de la leçon <strong>${escapeHtml(lessonTitle)}</strong> du cours <strong>${escapeHtml(courseTitle)}</strong>.</p>
          ${gradeText}
          <div style="background-color: #f4f4f5; border-left: 4px solid #2563eb; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; font-weight: bold;">Commentaire de l’enseignant :</p>
            <p style="margin: 8px 0 0 0; white-space: pre-wrap;">${escapeHtml(feedback)}</p>
          </div>
          <p>Connectez-vous à la plateforme pour consulter tous vos devoirs et continuer votre apprentissage.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[assignment-email] Resend send failed:', err)
  }
}
