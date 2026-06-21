// web/app/forum/[id]/page.tsx
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Clock, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { getThread, getThreadPosts } from '@/lib/community'
import { ForumReplyForm } from '@/components/ForumReplyForm'

export const dynamic = 'force-dynamic'

// Cached so generateMetadata and the page share a single thread query per request.
const getThreadCached = cache(async (id: string) => {
  const supabase = await createClient()
  return getThread(supabase, id)
})

const CATEGORY_LABELS: Record<string, string> = {
  general:     'Général',
  grammar:     'Grammaire',
  lexicon:     'Lexique',
  culture:     'Culture',
  translation: 'Traduction',
}

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const t = await getThreadCached(id)
  if (!t) return { title: 'Discussion introuvable', robots: { index: false } }

  const description =
    t.body?.trim().replace(/\s+/g, ' ').slice(0, 160) ||
    `Discussion ${CATEGORY_LABELS[t.category] ?? ''} sur le forum de la langue bété.`

  return {
    title: t.title,
    description,
    alternates: { canonical: `/forum/${id}` },
    openGraph: { title: t.title, description, type: 'article', url: `/forum/${id}` },
  }
}

export default async function ThreadPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [t, replies] = await Promise.all([
    getThreadCached(id),
    getThreadPosts(supabase, id),
  ])

  const { data: { user } } = await supabase.auth.getUser()
  const isAuthed = !!user

  if (!t) notFound()

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour au forum
      </Link>

      {/* Thread */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="bg-primary/15 text-primary text-xs font-semibold rounded-full px-2.5 py-0.5">
            {CATEGORY_LABELS[t.category] ?? t.category}
          </span>
          {t.upvotes > 0 && (
            <span className="text-xs text-muted-foreground">▲ {t.upvotes}</span>
          )}
        </div>
        <h1 className="font-heading text-2xl font-bold mb-4">{t.title}</h1>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.body}</p>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
          <span>{t.author_name ?? 'Anonyme'}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Replies */}
      <div className="mb-6">
        <h2 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          {replies.length} réponse{replies.length !== 1 ? 's' : ''}
        </h2>

        {replies.length > 0 && (
          <div className="space-y-4">
            {replies.map((post, i) => (
              <div key={post.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {(post.author_name ?? 'A').charAt(0).toUpperCase()}
                  </div>
                  {i < replies.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{post.author_name ?? 'Anonyme'}</span>
                    <span>·</span>
                    <span>
                      {new Date(post.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {post.upvotes > 0 && (
                      <>
                        <span>·</span>
                        <span>▲ {post.upvotes}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply form */}
      <ForumReplyForm threadId={id} isAuthed={isAuthed} />
    </div>
  )
}
