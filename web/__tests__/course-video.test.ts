import { describe, expect, it } from 'vitest'
import {
  hasAvailableVideoQuota,
  verifyMuxWebhookSignature,
  formatVideoDuration,
} from '../lib/courses/video'

describe('video quota check', () => {
  it('allows upload when within max minutes limit', () => {
    // 10 minutes used out of 30 max
    expect(hasAvailableVideoQuota(600, 30)).toBe(true)
  })

  it('blocks upload when quota is exceeded', () => {
    // 30 minutes used out of 30 max
    expect(hasAvailableVideoQuota(1800, 30)).toBe(false)
    expect(hasAvailableVideoQuota(1801, 30)).toBe(false)
  })
})

describe('formatVideoDuration', () => {
  it('formats video duration into hh:mm:ss or mm:ss', () => {
    expect(formatVideoDuration(45)).toBe('0:45')
    expect(formatVideoDuration(125)).toBe('2:05')
    expect(formatVideoDuration(3665)).toBe('1:01:05')
  })
})

describe('verifyMuxWebhookSignature', () => {
  it('verifies valid HMAC-SHA256 signature header', async () => {
    const rawBody = '{"type":"video.asset.ready"}'
    const secret = 'super_secret_webhook_key'
    const timestamp = Math.floor(Date.now() / 1000)

    // Compute expected signature
    const crypto = await import('node:crypto')
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')

    const header = `t=${timestamp},v1=${signature}`

    const isValid = await verifyMuxWebhookSignature(rawBody, header, secret)
    expect(isValid).toBe(true)
  })

  it('rejects invalid signature header', async () => {
    const rawBody = '{"type":"video.asset.ready"}'
    const secret = 'super_secret_webhook_key'
    const header = 't=12345,v1=invalid_hash'

    const isValid = await verifyMuxWebhookSignature(rawBody, header, secret)
    expect(isValid).toBe(false)
  })
})
