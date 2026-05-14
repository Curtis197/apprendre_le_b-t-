'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { createPost } from '@/lib/community-mutations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

export function ForumReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [content, setContent]       = useState('')
  const [authorName, setAuthorName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit() {
    if (!content.trim()) return
    setLoading(true)
    setError(null)
    const { error: err } = await createPost(supabaseRef.current, {
      thread_id: threadId, content, author_name: authorName,
    })
    setLoading(false)
    if (err) { setError(err); return }
    setContent('')
    router.refresh()
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
      <Input
        placeholder="Votre nom (optionnel)"
        value={authorName}
        onChange={e => setAuthorName(e.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={loading || !content.trim()}>
        {loading ? 'Envoi…' : 'Répondre'}
      </Button>
    </div>
  )
}
