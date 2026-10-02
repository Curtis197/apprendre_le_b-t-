'use client'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { submitCommunityText, updateCommunityText } from '@/lib/community-mutations'
import { extractYouTubeId } from '@/lib/utils'
import { alignVerses, describeAlignment, describeGap, findFirstGap } from '@/lib/verses'
import { RESOURCE_REGIONS } from '@/lib/regions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberedTextarea } from '@/components/NumberedTextarea'
import type { CommunityText, ContentType } from '@/lib/types'

const TYPES: { value: ContentType; label: string }[] = [
  { value: 'song',    label: 'Chanson' },
  { value: 'story',   label: 'Conte' },
  { value: 'poem',    label: 'Poème' },
  { value: 'proverb', label: 'Proverbe' },
  { value: 'speech',  label: 'Discours' },
  { value: 'riddle',  label: 'Devinette' },
  { value: 'video',   label: 'Vidéo' },
  { value: 'other',   label: 'Autre' },
]

/** Publishes a new resource, or edits `resource` when given (its contributor only). */
export function ResourceSubmitForm({ resource }: { resource?: CommunityText }) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [title, setTitle]               = useState(resource?.title ?? '')
  const [type, setType]                 = useState<ContentType>(resource?.type ?? 'proverb')
  const [contentBete, setContentBete]   = useState(resource?.content_bete ?? '')
  const [contentLiteral, setContentLiteral] = useState(resource?.content_literal ?? '')
  const [contentFrench, setContentFrench] = useState(resource?.content_french ?? '')
  const [videoUrl, setVideoUrl]         = useState(resource?.video_url ?? '')
  const [authorName, setAuthorName]     = useState(resource?.author_name ?? '')
  const [region, setRegion]             = useState(resource?.region ?? '')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const alignmentHint = useMemo(() => {
    if (!contentBete.trim()) return null
    const hint = describeAlignment(alignVerses(contentBete, contentLiteral, contentFrench))
    if (!hint || hint.ok) return hint
    // Say where the fields stop lining up, using the same numbers as the gutters.
    const gap = findFirstGap(contentBete, contentLiteral, contentFrench)
    return gap ? { ...hint, message: `${hint.message} ${describeGap(gap)}` } : hint
  }, [contentBete, contentLiteral, contentFrench])

  const videoId = videoUrl.trim() ? extractYouTubeId(videoUrl.trim()) : null
  const videoInvalid = videoUrl.trim() !== '' && videoId === null

  async function handleSubmit() {
    if (!title.trim() || !contentBete.trim()) return
    if (videoInvalid) { setError('URL YouTube invalide.'); return }
    setLoading(true)
    setError(null)
    const input = {
      title, type, content_bete: contentBete,
      content_literal: contentLiteral || undefined,
      content_french: contentFrench || undefined,
      video_url: videoUrl.trim() || undefined,
      author_name: authorName || undefined,
      region: region || undefined,
    }
    const { data, error: err } = resource
      ? await updateCommunityText(supabaseRef.current, resource.id, input)
      : await submitCommunityText(supabaseRef.current, input)
    setLoading(false)
    if (err || !data) { setError(err ?? 'Une erreur est survenue.'); return }
    router.push(`/resources/${data.id}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Input placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} />
        <select
          value={type}
          onChange={e => setType(e.target.value as ContentType)}
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Video URL */}
      <div className="space-y-1.5">
        <Input
          placeholder="Lien YouTube (optionnel) — ex: https://youtu.be/dQw4w9WgXcQ"
          value={videoUrl}
          onChange={e => setVideoUrl(e.target.value)}
          className={videoInvalid ? 'border-destructive' : ''}
        />
        {videoInvalid && (
          <p className="text-xs text-destructive">URL YouTube non reconnue. Formats acceptés : youtube.com/watch?v=… ou youtu.be/…</p>
        )}
        {videoId && (
          <p className="text-xs text-emerald-600">✓ Vidéo reconnue (ID : {videoId})</p>
        )}
      </div>

      <div className="space-y-1.5">
        <NumberedTextarea
          aria-label="Texte en bhété"
          placeholder="Texte en bhété *"
          value={contentBete}
          onChange={setContentBete}
          rows={6}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Pour un texte long (chanson, poème, conte) : une ligne par vers, une ligne vide entre les couplets,
          et le même nombre de lignes dans chaque champ ci-dessous. Les numéros à gauche comptent les vers :
          le vers 3 du bhété doit correspondre au vers 3 de la traduction. Elle s&apos;affichera alors
          vers par vers, en face du texte.
        </p>
      </div>
      <div className="space-y-1.5">
        <NumberedTextarea
          aria-label="Mot à mot"
          placeholder="Mot à mot (optionnel)"
          value={contentLiteral}
          onChange={setContentLiteral}
          rows={3}
          className="italic"
        />
        <p className="text-xs text-muted-foreground">
          La traduction littérale, mot par mot, qui montre la structure du bhété.
        </p>
      </div>
      <NumberedTextarea
        aria-label="Traduction en français"
        placeholder="Traduction en français (optionnel)"
        value={contentFrench}
        onChange={setContentFrench}
        rows={4}
      />
      {alignmentHint && (
        <p
          role="status"
          className={`text-xs ${alignmentHint.ok ? 'text-emerald-600' : 'text-amber-700'}`}
        >
          {alignmentHint.message}
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Input placeholder="Auteur / source (optionnel)" value={authorName} onChange={e => setAuthorName(e.target.value)} />
        <select
          aria-label="Région"
          value={region}
          onChange={e => setRegion(e.target.value)}
          className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Région (optionnel)</option>
          {RESOURCE_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSubmit}
        disabled={loading || !title.trim() || !contentBete.trim() || videoInvalid}
        className="w-full"
      >
        {loading ? 'Envoi…' : resource ? 'Enregistrer' : 'Publier la ressource'}
      </Button>
    </div>
  )
}
