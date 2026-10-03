import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/courses/assignment'
import { sendEmail } from '@/lib/mail/send'

export const dynamic = 'force-dynamic'

const CONTACT_INBOX = 'curtiscapre@gmail.com'

export async function POST(req: NextRequest) {
  const { name, email, subject, message } = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string' || !name || !email || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const subj = typeof subject === 'string' && subject ? subject : 'Sans sujet'
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

  const result = await sendEmail({
    to: CONTACT_INBOX,
    replyTo: oneLine(email),
    subject: `[Contact] ${oneLine(subj)} — de ${oneLine(name)}`,
    html: `<p><strong>De :</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Sujet :</strong> ${escapeHtml(subj)}</p><hr /><p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`,
    text: `De : ${name} (${email})\nSujet : ${subj}\n\n${message}`,
  })
  if (!result.ok) {
    console.error('[contact] failed:', result.error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
