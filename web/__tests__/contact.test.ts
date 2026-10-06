import { describe, it, expect } from 'vitest'
import { parseContact, CONTACT_LIMITS } from '@/lib/contact'

const ok = { name: 'Awa', email: 'awa@example.com', subject: '', message: 'Bonjour' }

describe('parseContact', () => {
  it('accepts a valid message and trims fields', () => {
    const r = parseContact({ ...ok, name: '  Awa  ' })
    expect(r).toEqual({ ok: true, value: { ...ok } })
  })

  it('rejects non-objects and missing fields', () => {
    expect(parseContact(null).ok).toBe(false)
    expect(parseContact({ ...ok, name: '' }).ok).toBe(false)
    expect(parseContact({ ...ok, message: 42 }).ok).toBe(false)
  })

  it('rejects whitespace-only required fields', () => {
    expect(parseContact({ ...ok, message: '   \n ' }).ok).toBe(false)
  })

  it('rejects malformed emails', () => {
    expect(parseContact({ ...ok, email: 'x' }).ok).toBe(false)
    expect(parseContact({ ...ok, email: 'a b@c.d' }).ok).toBe(false)
  })

  it('rejects over-long fields', () => {
    expect(parseContact({ ...ok, message: 'a'.repeat(CONTACT_LIMITS.message + 1) }).ok).toBe(false)
    expect(parseContact({ ...ok, subject: 'a'.repeat(CONTACT_LIMITS.subject + 1) }).ok).toBe(false)
  })
})
