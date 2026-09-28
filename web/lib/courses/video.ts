import crypto from 'node:crypto'

export interface MediaAsset {
  id: string
  owner_id: string
  lesson_id: string
  mux_upload_id: string
  mux_asset_id: string | null
  mux_playback_id: string | null
  duration_seconds: number
  status: 'uploading' | 'processing' | 'ready' | 'errored'
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface VideoQuota {
  max_minutes: number
  used_seconds: number
  used_minutes: number
}

export interface MuxUploadResponse {
  id: string
  url: string
  status: string
}

export function hasAvailableVideoQuota(usedSeconds: number, maxMinutes: number, requestedSeconds = 0): boolean {
  const totalSeconds = usedSeconds + requestedSeconds
  const maxSeconds = maxMinutes * 60
  return totalSeconds < maxSeconds
}

export function formatVideoDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Verifies Mux webhook signature header: t=<timestamp>,v1=<signature> */
export async function verifyMuxWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false

  const parts = signatureHeader.split(',')
  const timestampPart = parts.find(p => p.startsWith('t='))
  const signaturePart = parts.find(p => p.startsWith('v1='))

  if (!timestampPart || !signaturePart) return false

  const timestamp = timestampPart.slice(2)
  const expectedSignature = signaturePart.slice(3)

  const payload = `${timestamp}.${rawBody}`
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  const a = Buffer.from(computedSignature)
  const b = Buffer.from(expectedSignature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Generates an RS256 JWT playback token for Mux signed playback. */
export function generateMuxPlaybackToken(
  playbackId: string,
  signingKeyId: string,
  privateKeyPemBase64: string,
  expiresInSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + expiresInSeconds

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: signingKeyId,
  }

  const payload = {
    sub: playbackId,
    aud: 'v',
    kid: signingKeyId,
    exp,
  }

  const base64UrlEncode = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  const tokenInput = `${encodedHeader}.${encodedPayload}`

  // Decode base64 PEM private key if needed
  let pem = privateKeyPemBase64
  if (!pem.includes('-----BEGIN')) {
    pem = Buffer.from(privateKeyPemBase64, 'base64').toString('utf8')
  }

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(tokenInput)
  const signature = signer.sign(pem, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${tokenInput}.${signature}`
}
