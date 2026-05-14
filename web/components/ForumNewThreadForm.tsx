'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const CATEGORIES = [
  { value: 'general',     label: 'Général' },
  { value: 'grammar',     label: 'Grammaire' },
  { value: 'lexicon',     label: 'Lexique' },
  { value: 'culture',     label: 'Culture' },
  { value: 'translation', label: 'Traduction' },
]

export function ForumNewThreadForm() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('general')
  const [authorName, setAuthorName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      if (!user) { setError('Connectez-vous pour poster.'); return }
      const displayName = authorName.trim()
        || user.user_metadata?.full_name
        || user.email?.split('@')[0]
        || 'Anonyme'
      const { data, error: err } = await supabaseRef.current
        .from('forum_threads')
        .insert({ title: title.trim(), body: body.trim(), category, author_name: displayName, created_by: user.id })
        .select('id')
        .single()
      if (err) throw err
      router.push(`/forum/${data.id}`)
    } catch {
      setError('Erreur lors de la publication. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
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
        onChange={e => setCategory(e.target.value)}
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
      <Input
        placeholder="Votre nom (optionnel)"
        value={authorName}
        onChange={e => setAuthorName(e.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSubmit}
        disabled={loading || !title.trim() || !body.trim()}
        className="w-full"
      >
        {loading ? 'Publication…' : 'Publier le sujet'}
      </Button>
    </div>
  )
}
