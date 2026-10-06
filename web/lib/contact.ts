export const CONTACT_LIMITS = { name: 100, email: 254, subject: 150, message: 5000 } as const

/** Messages accepted per visitor (hashed IP) per day. */
export const CONTACT_DAILY_LIMIT = 5

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ContactInput {
  name: string
  email: string
  subject: string
  message: string
}

export type ContactParse =
  | { ok: true; value: ContactInput }
  | { ok: false; error: string }

export function parseContact(raw: unknown): ContactParse {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = str(body.name)
  const email = str(body.email)
  const subject = str(body.subject)
  const message = str(body.message)

  if (!name || !email || !message) return { ok: false, error: 'Missing fields' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Invalid email' }
  if (
    name.length > CONTACT_LIMITS.name ||
    email.length > CONTACT_LIMITS.email ||
    subject.length > CONTACT_LIMITS.subject ||
    message.length > CONTACT_LIMITS.message
  ) {
    return { ok: false, error: 'Field too long' }
  }
  return { ok: true, value: { name, email, subject, message } }
}
