'use client'
import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

interface Comment {
  id: string
  content: string
  author_name: string
  created_at: string
}

interface Props {
  targetTable: 'expressions' | 'grammar_rules'
  targetId: string
}

export function ContributionComments({ targetTable, targetId }: Props) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [sending, setSending] = useState(false)
  const supabaseRef = useRef(createClient())

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
      if (name) setAuthorName(name)
    })
  }, [])

  async function loadComments() {
    setLoading(true)
    const { data } = await supabaseRef.current
      .from('contribution_comments')
      .select('id, content, author_name, created_at')
      .eq('target_table', targetTable)
      .eq('target_id', targetId)
      .order('created_at', { ascending: true })
    setComments((data ?? []) as Comment[])
    setLoading(false)
  }

  function handleToggle() {
    if (!open) loadComments()
    setOpen(o => !o)
  }

  async function handleSend() {
    if (!text.trim() || !authorName.trim()) return
    const { data: { user } } = await supabaseRef.current.auth.getUser()
    if (!user) return
    setSending(true)
    const { error } = await supabaseRef.current.from('contribution_comments').insert({
      target_table: targetTable,
      target_id: targetId,
      content: text.trim(),
      author_name: authorName.trim(),
      created_by: user.id,
    })
    setSending(false)
    if (!error) {
      setText('')
      loadComments()
    }
  }

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        {open ? 'Masquer les commentaires' : `Commenter${comments.length > 0 ? ` (${comments.length})` : ''}`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && <p className="text-xs text-muted-foreground">Chargement…</p>}
          {comments.map(c => (
            <div key={c.id} className="bg-muted rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{c.author_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p className="text-sm">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">Aucun commentaire. Soyez le premier !</p>
          )}
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Votre nom"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ajouter un commentaire…"
                value={text}
                onChange={e => setText(e.target.value)}
                maxLength={500}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                className="flex-1 border border-input rounded-md px-3 py-1.5 text-sm bg-background"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim() || !authorName.trim()}
                className="flex items-center gap-1 bg-primary text-white rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
