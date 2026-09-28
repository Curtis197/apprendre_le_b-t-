import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMuxWebhookSignature } from '@/lib/courses/video'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('mux-signature')
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET

  if (webhookSecret) {
    const isValid = await verifyMuxWebhookSignature(rawBody, signatureHeader, webhookSecret)
    if (!isValid) {
      return NextResponse.json({ error: 'Signature webhook Mux invalide.' }, { status: 401 })
    }
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Payload JSON invalide.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuration Supabase incomplète.' }, { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Handle Mux webhook events
  switch (event.type) {
    case 'video.upload.asset_created': {
      const uploadId = event.data.id as string
      const assetId = event.data.asset_id as string

      if (uploadId && assetId) {
        await adminClient
          .from('media_assets')
          .update({
            mux_asset_id: assetId,
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('mux_upload_id', uploadId)
      }
      break
    }

    case 'video.asset.ready': {
      const assetId = event.data.id as string
      const playbackIds = (event.data.playback_ids ?? []) as { id: string; policy: string }[]
      const duration = Number(event.data.duration ?? 0)
      const primaryPlayback = playbackIds.find(p => p.policy === 'signed') ?? playbackIds[0]

      if (assetId && primaryPlayback) {
        await adminClient
          .from('media_assets')
          .update({
            mux_playback_id: primaryPlayback.id,
            duration_seconds: Math.round(duration),
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('mux_asset_id', assetId)
      }
      break
    }

    case 'video.asset.errored': {
      const assetId = event.data.id as string
      const errors = (event.data.errors ?? {}) as { messages?: string[] }
      const message = errors.messages?.[0] ?? 'Erreur de traitement de la vidéo par Mux.'

      if (assetId) {
        await adminClient
          .from('media_assets')
          .update({
            status: 'errored',
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq('mux_asset_id', assetId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
