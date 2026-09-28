import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[Mux Direct Upload API] 🎬 Received request to create video upload URL')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[Mux Direct Upload API] ❌ Unauthenticated user request')
    return NextResponse.json({ error: 'Connectez-vous pour verser une vidéo.' }, { status: 401 })
  }

  const { lessonId } = (await request.json().catch(() => ({}))) as { lessonId?: string }
  if (!lessonId) {
    console.error('[Mux Direct Upload API] ❌ Missing lessonId in request body')
    return NextResponse.json({ error: 'Identifiant de leçon manquant.' }, { status: 400 })
  }

  const muxTokenId = process.env.MUX_TOKEN_ID
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET || process.env.MUX_SECRET_ID

  console.log('[Mux Direct Upload API] 🔑 Checking Mux credentials availability:', {
    hasMuxTokenId: Boolean(muxTokenId),
    hasMuxTokenSecret: Boolean(muxTokenSecret),
    tokenIdLength: muxTokenId?.length ?? 0,
    userId: user.id,
    lessonId,
  })

  if (!muxTokenId || !muxTokenSecret) {
    console.error('[Mux Direct Upload API] ❌ Missing Mux environment variables MUX_TOKEN_ID or MUX_TOKEN_SECRET')
    return NextResponse.json({ error: 'Le service Mux n’est pas configuré sur le serveur.' }, { status: 500 })
  }

  const authHeader = `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`
  console.log('[Mux Direct Upload API] 🌐 Sending POST request to Mux API (https://api.mux.com/video/v1/uploads)...')

  const response = await fetch('https://api.mux.com/video/v1/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      new_asset_settings: {
        playback_policy: ['signed'],
      },
      cors_origin: '*',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('[Mux Direct Upload API] ❌ Mux API returned HTTP error:', response.status, response.statusText, errorText)
    return NextResponse.json({ error: 'Erreur lors de la création du lien de versement Mux.' }, { status: 502 })
  }

  const json = await response.json()
  const uploadData = json.data as { id: string; url: string }

  console.log('[Mux Direct Upload API] ✅ Mux Upload Created Successfully:', {
    uploadId: uploadData.id,
    urlPreview: uploadData.url.substring(0, 45) + '...',
  })

  // Delete previous uploading assets for this lesson
  console.log('[Mux Direct Upload API] 🧹 Cleaning up old uploading assets for lesson:', lessonId)
  await supabase.from('media_assets').delete().eq('lesson_id', lessonId).eq('status', 'uploading')

  console.log('[Mux Direct Upload API] 💾 Inserting media_assets row into Supabase database...')
  const { data: assetRow, error: dbError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: user.id,
      lesson_id: lessonId,
      mux_upload_id: uploadData.id,
      status: 'uploading',
    })
    .select('id')
    .single()

  if (dbError || !assetRow) {
    console.error('[Mux Direct Upload API] ❌ Supabase DB insertion failed:', dbError)
    return NextResponse.json({ error: dbError?.message ?? 'Erreur lors de l’enregistrement de la vidéo.' }, { status: 500 })
  }

  console.log('[Mux Direct Upload API] 🎉 Media Asset Row Created in DB:', assetRow.id)
  return NextResponse.json({ uploadUrl: uploadData.url, assetId: assetRow.id })
}
