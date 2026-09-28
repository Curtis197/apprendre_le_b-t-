import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMuxWebhookSignature } from '@/lib/courses/video'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[Mux Webhook] 🔔 Incoming webhook request received')
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('mux-signature')
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET || process.env.MUX_WEBHOOK_SIGNING_SECRET

  if (webhookSecret) {
    const isValid = await verifyMuxWebhookSignature(rawBody, signatureHeader, webhookSecret)
    if (!isValid) {
      console.error('[Mux Webhook] ❌ Invalid Mux webhook signature')
      return NextResponse.json({ error: 'Signature webhook Mux invalide.' }, { status: 401 })
    }
    console.log('[Mux Webhook] ✅ Signature verified successfully')
  } else {
    console.warn('[Mux Webhook] ⚠️ Webhook secret not configured - signature verification skipped')
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch (err) {
    console.error('[Mux Webhook] ❌ Failed to parse webhook JSON body:', err)
    return NextResponse.json({ error: 'Payload JSON invalide.' }, { status: 400 })
  }

  console.log(`[Mux Webhook] 📥 Event received: "${event.type}"`, {
    id: event.data.id,
    status: event.data.status,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[Mux Webhook] ❌ Missing Supabase URL or Service Role Key')
    return NextResponse.json({ error: 'Configuration Supabase incomplète.' }, { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Handle Mux webhook events
  switch (event.type) {
    case 'video.upload.asset_created': {
      const uploadId = event.data.id as string
      const assetId = event.data.asset_id as string

      console.log('[Mux Webhook] ⚙️ Processing "video.upload.asset_created":', { uploadId, assetId })

      if (uploadId && assetId) {
        const { error: updateErr } = await adminClient
          .from('media_assets')
          .update({
            mux_asset_id: assetId,
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('mux_upload_id', uploadId)

        if (updateErr) {
          console.error('[Mux Webhook] ❌ Error updating media_assets status to "processing":', updateErr)
        } else {
          console.log('[Mux Webhook] ✅ Updated media_assets status to "processing" for uploadId:', uploadId)
        }
      }
      break
    }

    case 'video.asset.ready': {
      const assetId = event.data.id as string
      const playbackIds = (event.data.playback_ids ?? []) as { id: string; policy: string }[]
      const duration = Number(event.data.duration ?? 0)
      const primaryPlayback = playbackIds.find(p => p.policy === 'signed') ?? playbackIds[0]

      console.log('[Mux Webhook] 🎬 Processing "video.asset.ready":', {
        assetId,
        playbackId: primaryPlayback?.id,
        durationSeconds: Math.round(duration),
      })

      if (assetId && primaryPlayback) {
        const { error: updateErr } = await adminClient
          .from('media_assets')
          .update({
            mux_playback_id: primaryPlayback.id,
            duration_seconds: Math.round(duration),
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('mux_asset_id', assetId)

        if (updateErr) {
          console.error('[Mux Webhook] ❌ Error updating media_assets status to "ready":', updateErr)
        } else {
          console.log('[Mux Webhook] 🎉 Updated media_assets status to "ready" for assetId:', assetId)
        }
      }
      break
    }

    case 'video.asset.errored': {
      const assetId = event.data.id as string
      const errors = (event.data.errors ?? {}) as { messages?: string[] }
      const message = errors.messages?.[0] ?? 'Erreur de traitement de la vidéo par Mux.'

      console.error('[Mux Webhook] 🚨 Processing "video.asset.errored":', { assetId, errorMessage: message })

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

    default: {
      console.log(`[Mux Webhook] ℹ️ Unhandled event type "${event.type}" (safely ignored)`)
      break
    }
  }

  return NextResponse.json({ received: true })
}
