// web/app/forum/page.tsx
import Link from 'next/link'
import { MessageCircle, PlusCircle, Clock } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/lib/supabase-server'
import { getThreads } from '@/lib/community'
import type { ForumCategory } from '@/lib/types'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forum communautaire',
  description: 'Échangez autour de la langue et de la culture bété (bhété) : questions, traductions, grammaire et lexique.',
  alternates: { canonical: '/forum' },
}

const CATEGORIES = [
  { value: null,         label: 'Tous' },
  { value: 'general',   label: 'Général' },
  { value: 'grammar',   label: 'Grammaire' },
  { value: 'lexicon',   label: 'Lexique' },
  { value: 'culture',   label: 'Culture' },
  { value: 'translation', label: 'Traduction' },
]

const CATEGORY_COLORS: Record<string, string> = {
  general:     'bg-muted text-foreground',
  grammar:     'bg-secondary/20 text-secondary',
  lexicon:     'bg-primary/15 text-primary',
  culture:     'bg-amber-100 text-amber-700',
  translation: 'bg-emerald-100 text-emerald-700',
}

interface Props {
  searchParams: Promise<{ cat?: string }>
}

export default async function ForumPage({ searchParams }: Props) {
  const { cat } = await searchParams
  const supabase = await createClient()
  const category = (cat && cat !== 'all' ? cat : null) as ForumCategory | null
  const threads = await getThreads(supabase, category)
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthed = !!user

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Communauté"
        title="Forum de Discussion"
        subtitle="Partagez vos questions, corrections et observations sur la langue bhété."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        {/* Category filters */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => {
            const active = (cat ?? null) === c.value || (!cat && c.value === null)
            const href = c.value ? `/forum?cat=${c.value}` : '/forum'
            return (
              <Link
                key={String(c.value)}
                href={href}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {c.label}
              </Link>
            )
          })}
        </div>

        {isAuthed ? (
          <Link
            href="/forum/new"
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 h-9 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            Nouveau sujet
          </Link>
        ) : (
          <Link
            href="/auth?next=/forum/new"
            className="inline-flex items-center gap-2 border border-primary text-primary text-sm font-semibold px-4 h-9 rounded-lg hover:bg-primary/10 transition-colors shrink-0"
          >
            Connectez-vous pour poster
          </Link>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="bg-muted rounded-xl p-12 text-center">
          <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Aucun sujet pour l&apos;instant. Soyez le premier !</p>
          <Link
            href={isAuthed ? '/forum/new' : '/auth?next=/forum/new'}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            {isAuthed ? 'Créer un sujet' : 'Se connecter pour créer un sujet'}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(thread => (
            <Link
              key={thread.id}
              href={`/forum/${thread.id}`}
              className="block bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${CATEGORY_COLORS[thread.category] ?? 'bg-muted'}`}>
                      {CATEGORIES.find(c => c.value === thread.category)?.label ?? thread.category}
                    </span>
                    {thread.upvotes > 0 && (
                      <span className="text-xs text-muted-foreground">▲ {thread.upvotes}</span>
                    )}
                  </div>
                  <h2 className="font-heading font-semibold text-base group-hover:text-primary transition-colors truncate">
                    {thread.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{thread.body}</p>
                </div>
                <MessageCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span>{thread.author_name ?? 'Anonyme'}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(thread.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
