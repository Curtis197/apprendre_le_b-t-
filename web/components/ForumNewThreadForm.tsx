'use client'
import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { createThread } from '@/lib/community-mutations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ForumCategory } from '@/lib/types'

const CATEGORIES: { value: ForumCategory; label: string }[] = [
  { value: 'general',     label: 'Général' },
  { value: 'grammar',     label: 'Grammaire' },
  { value: 'lexicon',     label: 'Lexique' },
  { value: 'culture',     label: 'Culture' },
  { value: 'translation', label: 'Traduction' },
]

export function ForumNewThreadForm() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [title, setTitle]           = useState('')
  const [body, setBody]             = useState('')
  const [category, setCategory]     = useState<ForumCategory>('general')
  const [authorName, setAuthorName] = useState('')
  const [nameFromProfile, setNameFromProfile] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabaseRef.current
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()
      const name = profile?.name
        || (user.user_metadata?.full_name as string | undefined)
        || user.email?.split('@')[0]
        || ''
      if (name) { setAuthorName(name); setNameFromProfile(true) }
    })
  }, [])

  async function handleSubmit() {
    if (!title.trim() || !body.trim() || !authorName.trim()) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await createThread(supabaseRef.current, {
      title, body, category, author_name: authorName.trim(),
    })
    setLoading(false)
    if (err || !data) { setError(err ?? 'Erreur inattendue.'); return }
    router.push(`/forum/${data.id}`)
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Titre du sujet"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="text-base font-semibold"
      />
      <select
        value={category}
        onChange={e => setCategory(e.target.value as ForumCategory)}
        className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
      >
        {CATEGORIES.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      <Textarea
        placeholder="Décrivez votre sujet, posez votre question ou partagez vos observations…"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={6}
      />
      <div className="space-y-1">
        <Input
          placeholder="Votre nom"
          value={authorName}
          onChange={e => { setAuthorName(e.target.value); setNameFromProfile(false) }}
          required
        />
        {nameFromProfile && (
          <p className="text-xs text-muted-foreground">Nom récupéré depuis votre profil</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSubmit}
        disabled={loading || !title.trim() || !body.trim() || !authorName.trim()}
        className="w-full"
      >
        {loading ? 'Publication…' : 'Publier le sujet'}
      </Button>
    </div>
  )
}
