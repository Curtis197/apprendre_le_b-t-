'use client'
import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { createPost } from '@/lib/community-mutations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

export function ForumReplyForm({ threadId, isAuthed }: { threadId: string; isAuthed: boolean }) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [content, setContent]       = useState('')
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
    if (!content.trim() || !authorName.trim()) return
    setLoading(true)
    setError(null)
    const { error: err } = await createPost(supabaseRef.current, {
      thread_id: threadId, content, author_name: authorName.trim(),
    })
    setLoading(false)
    if (err) { setError(err); return }
    setContent('')
    router.refresh()
  }

  if (!isAuthed) {
    return (
      <div className="bg-muted rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Connectez-vous pour participer à la discussion.
        </p>
        <a
          href={`/auth?next=/forum/${threadId}`}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Se connecter
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3 bg-muted/40 rounded-xl p-5 border border-border">
      <h3 className="font-heading font-semibold text-sm">Votre réponse</h3>
      <Textarea
        placeholder="Partagez votre point de vue, une correction ou une observation…"
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={4}
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
        disabled={loading || !content.trim() || !authorName.trim()}
      >
        {loading ? 'Envoi…' : 'Répondre'}
      </Button>
    </div>
  )
}
