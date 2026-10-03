import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail, senderAddress } from '@/lib/mail/send'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('senderAddress', () => {
  it('uses RESEND_FROM_EMAIL when set', () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'Test <t@apprendre-le-bhete.com>')
    expect(senderAddress()).toBe('Test <t@apprendre-le-bhete.com>')
  })
  it('falls back to the verified-domain address', () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    expect(senderAddress()).toBe('Apprendre le bhété <notif@apprendre-le-bhete.com>')
  })
})

describe('sendEmail', () => {
  const email = { to: 'a@b.c', subject: 'S', html: '<p>x</p>', text: 'x' }

  it('returns the Resend id on success and forwards from/to/headers', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    const send = vi.fn().mockResolvedValue({ data: { id: 'abc' }, error: null })
    const res = await sendEmail({ ...email, headers: { 'List-Unsubscribe': '<u>' } }, { emails: { send } })
    expect(res).toEqual({ ok: true, id: 'abc' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'Apprendre le bhété <notif@apprendre-le-bhete.com>', to: 'a@b.c', headers: { 'List-Unsubscribe': '<u>' } }))
  })

  it('returns ok:false with the Resend message on an API error', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    expect(await sendEmail(email, { emails: { send } })).toEqual({ ok: false, error: 'domain not verified' })
  })

  it('returns ok:false instead of throwing when the client throws', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'))
    expect(await sendEmail(email, { emails: { send } })).toEqual({ ok: false, error: 'network down' })
  })

  it('returns ok:false when there is no API key and no injected sender', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const res = await sendEmail(email)
    expect(res.ok).toBe(false)
  })
})
