import { Resend } from 'resend'

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  headers?: Record<string, string>
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

/** The slice of the Resend client we use, so tests can inject a fake. */
export interface Sender {
  emails: {
    send(payload: Record<string, unknown>): Promise<{ data: { id: string } | null; error: { message: string } | null }>
  }
}

export function senderAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'Parlons Bhété <notif@apprendre-le-bhete.com>'
}

export async function sendEmail(email: OutgoingEmail, sender?: Sender): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const client = sender ?? (apiKey ? (new Resend(apiKey) as unknown as Sender) : null)
  if (!client) return { ok: false, error: 'RESEND_API_KEY manquante' }
  try {
    const { data, error } = await client.emails.send({
      from: senderAddress(),
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      ...(email.headers ? { headers: email.headers } : {}),
    })
    if (error || !data) return { ok: false, error: error?.message ?? 'Réponse Resend vide' }
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
