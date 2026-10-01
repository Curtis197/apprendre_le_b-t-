import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { hasAvailableVideoQuota } from '@/lib/courses/video'
import { getVideoQuota } from '@/lib/courses/queries'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour verser une vidéo.' }, { status: 401 })
  }

  const { lessonId } = (await request.json().catch(() => ({}))) as { lessonId?: string }
  if (!lessonId) {
    return NextResponse.json({ error: 'Identifiant de leçon manquant.' }, { status: 400 })
  }

  // Only the course owner may upload, and only while the course is not suspended.
  // Checked before anything is created on Mux, so strangers cannot mint uploads.
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, courses!inner(owner_id, status)')
    .eq('id', lessonId)
    .maybeSingle()
  const course = (lesson as { courses?: { owner_id: string; status: string } | null } | null)?.courses
  if (!lesson || !course || course.owner_id !== user.id || course.status === 'suspended') {
    return NextResponse.json({ error: 'Leçon introuvable ou accès refusé.' }, { status: 403 })
  }

  const quota = await getVideoQuota(supabase, user.id)
  if (!hasAvailableVideoQuota(Number(quota.used_seconds), quota.max_minutes)) {
    return NextResponse.json(
      { error: `Quota vidéo atteint (${quota.max_minutes} minutes). Contactez un administrateur pour l’augmenter.` },
      { status: 403 },
    )
  }

  const muxTokenId = process.env.MUX_TOKEN_ID
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET || process.env.MUX_SECRET_ID
  if (!muxTokenId || !muxTokenSecret) {
    console.error('[Mux Direct Upload API] Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET')
    return NextResponse.json({ error: 'Le service Mux n’est pas configuré sur le serveur.' }, { status: 500 })
  }

  const authHeader = `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`
  const origin = request.headers.get('origin') ?? new URL(request.url).origin

  const response = await fetch('https://api.mux.com/video/v1/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({
      new_asset_settings: { playback_policy: ['signed'] },
      cors_origin: origin,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('[Mux Direct Upload API] Mux returned', response.status, errorText)
    return NextResponse.json({ error: 'Erreur lors de la création du lien de versement Mux.' }, { status: 502 })
  }

  const json = await response.json()
  const uploadData = json.data as { id: string; url: string }

  // Replace any earlier unfinished upload for this lesson.
  await supabase.from('media_assets').delete().eq('lesson_id', lessonId).eq('status', 'uploading')

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
    console.error('[Mux Direct Upload API] media_assets insert failed:', dbError)
    // Do not leave an orphaned, unreferenced upload URL alive on Mux.
    await fetch(`https://api.mux.com/video/v1/uploads/${uploadData.id}/cancel`, {
      method: 'PUT',
      headers: { Authorization: authHeader },
    }).catch(() => null)
    return NextResponse.json({ error: dbError?.message ?? 'Erreur lors de l’enregistrement de la vidéo.' }, { status: 500 })
  }

  return NextResponse.json({ uploadUrl: uploadData.url, assetId: assetRow.id })
}
