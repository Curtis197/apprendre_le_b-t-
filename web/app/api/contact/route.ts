import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/courses/assignment'
import { sendEmail } from '@/lib/mail/send'
import { parseContact, CONTACT_DAILY_LIMIT } from '@/lib/contact'
import { createServiceClient } from '@/lib/supabase-service'

export const dynamic = 'force-dynamic'

const CONTACT_INBOX = process.env.CONTACT_INBOX_EMAIL || 'curtiscapre@gmail.com'

/**
 * Counts this request against the visitor's daily quota (hashed IP, stored in
 * the generic translation_usage table under a `contact:` prefix).
 * Fails open: a database hiccup must not block a legitimate message.
 */
async function withinDailyQuota(req: NextRequest): Promise<boolean> {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    const identifier = 'contact:' + createHash('sha256').update(ip).digest('hex').slice(0, 16)
    const today = new Date().toISOString().slice(0, 10)
    const db = createServiceClient()

    const { data } = await db
      .from('translation_usage')
      .select('count')
      .eq('identifier', identifier)
      .eq('used_date', today)
      .maybeSingle()
    const current = (data as { count: number } | null)?.count ?? 0
    if (current >= CONTACT_DAILY_LIMIT) return false

    await db
      .from('translation_usage')
      .upsert({ identifier, used_date: today, count: current + 1 }, { onConflict: 'identifier,used_date' })
    return true
  } catch (err) {
    console.error('[contact] quota check failed:', err)
    return true
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}))

  // Honeypot: real visitors never see this field. Pretend success so bots don't adapt.
  if (raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).website === 'string'
      && (raw as Record<string, unknown>).website) {
    return NextResponse.json({ ok: true })
  }

  const parsed = parseContact(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { name, email, subject, message } = parsed.value

  if (!(await withinDailyQuota(req))) {
    return NextResponse.json({ error: 'Too many messages' }, { status: 429 })
  }

  const subj = subject || 'Sans sujet'
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

  const result = await sendEmail({
    to: CONTACT_INBOX,
    replyTo: oneLine(email),
    subject: `[Contact] ${oneLine(subj)} — de ${oneLine(name)}`,
    html: `<p><strong>De :</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Sujet :</strong> ${escapeHtml(subj)}</p><hr /><p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`,
    text: `De : ${name} (${email})\nSujet : ${subj}\n\n${message}`,
  })
  if (!result.ok) {
    // No message content or PII in logs: metadata only.
    console.error('[contact] failed:', result.error, { messageLength: message.length })
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
