// web/app/resources/page.tsx
import Link from 'next/link'
import { Music, BookOpen, Feather, Quote, Mic, HelpCircle, Layers, PlusCircle, PlayCircle, Video, GraduationCap } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/lib/supabase-server'
import { getCommunityTexts } from '@/lib/community'
import { extractYouTubeId } from '@/lib/utils'
import type { ContentType, CommunityText } from '@/lib/types'
import { PendingResources } from '@/components/PendingResources'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ressources pour apprendre le bété',
  description: 'Chants, contes, proverbes, vidéos et cours pour apprendre et préserver la langue bété (bhété) de Côte d’Ivoire.',
  alternates: { canonical: '/resources' },
}

const TYPES = [
  { value: null,      label: 'Tous',       icon: Layers },
  { value: 'song',    label: 'Chansons',   icon: Music },
  { value: 'story',   label: 'Contes',     icon: BookOpen },
  { value: 'poem',    label: 'Poèmes',     icon: Feather },
  { value: 'proverb', label: 'Proverbes',  icon: Quote },
  { value: 'speech',  label: 'Discours',   icon: Mic },
  { value: 'riddle',  label: 'Devinettes', icon: HelpCircle },
  { value: 'video',   label: 'Vidéos',     icon: Video },
  { value: 'course',  label: 'Cours',      icon: GraduationCap },
]

const TYPE_COLORS: Record<string, string> = {
  song:    'bg-pink-100 text-pink-700',
  story:   'bg-amber-100 text-amber-700',
  poem:    'bg-violet-100 text-violet-700',
  proverb: 'bg-emerald-100 text-emerald-700',
  speech:  'bg-blue-100 text-blue-700',
  riddle:  'bg-orange-100 text-orange-700',
  video:   'bg-red-100 text-red-700',
  course:  'bg-teal-100 text-teal-700',
  other:   'bg-muted text-muted-foreground',
}

function ResourceCard({ text }: { text: CommunityText }) {
  const typeInfo = TYPES.find(t => t.value === text.type)
  const Icon = typeInfo?.icon ?? Layers
  const videoId = text.video_url ? extractYouTubeId(text.video_url) : null
  const hasVideo = videoId !== null

  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden flex flex-col ${hasVideo ? 'md:col-span-2 xl:col-span-2' : ''}`}>
      {hasVideo && (
        <div className="relative w-full aspect-video bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title={text.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-0.5 ${TYPE_COLORS[text.type] ?? TYPE_COLORS.other}`}>
              <Icon className="w-3 h-3" />
              {typeInfo?.label ?? text.type}
            </span>
            {hasVideo && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">
                <PlayCircle className="w-3 h-3" />
                Vidéo
              </span>
            )}
          </div>
          {text.upvotes > 0 && (
            <span className="text-xs text-muted-foreground">▲ {text.upvotes}</span>
          )}
        </div>

        <h2 className="font-heading font-semibold text-base mb-2">{text.title}</h2>

        <div className={`flex-1 ${hasVideo ? 'grid md:grid-cols-2 gap-4' : ''}`}>
          <p className="font-mono text-sm text-primary leading-relaxed whitespace-pre-wrap line-clamp-6">
            {text.content_bete}
          </p>
          {text.content_french && (
            <p className={`text-sm text-muted-foreground italic leading-relaxed line-clamp-6 ${!hasVideo ? 'mt-3 pt-3 border-t border-border/50' : ''}`}>
              {text.content_french}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
          {text.author_name && <span>{text.author_name}</span>}
          {text.author_name && text.region && <span>·</span>}
          {text.region && <span>{text.region}</span>}
          {(text.author_name || text.region) && <span>·</span>}
          <span>{new Date(text.created_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  searchParams: Promise<{ type?: string }>
}

export default async function ResourcesPage({ searchParams }: Props) {
  const { type } = await searchParams
  const supabase = await createClient()
  const contentType = (type && type !== 'all' ? type : null) as ContentType | null
  const texts = await getCommunityTexts(supabase, contentType)

  const activeType = TYPES.find(t => t.value === (type ?? null)) ?? TYPES[0]

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Patrimoine Culturel"
        title="Ressources Communautaires"
        subtitle="Chansons, contes, poèmes, vidéos et cours partagés par la communauté bhété."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {TYPES.map(t => {
            const active = (type ?? null) === t.value || (!type && t.value === null)
            const href = t.value ? `/resources?type=${t.value}` : '/resources'
            const Icon = t.icon
            return (
              <Link
                key={String(t.value)}
                href={href}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  active ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </Link>
            )
          })}
        </div>
        <Link
          href="/resources/new"
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 h-9 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          Soumettre
        </Link>
      </div>

      {texts.length === 0 ? (
        <div className="bg-muted rounded-xl p-12 text-center">
          <activeType.icon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            Aucune ressource validée pour l&apos;instant. Soyez le premier à contribuer !
          </p>
          <Link
            href="/resources/new"
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Soumettre une ressource
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {texts.map(text => (
            <ResourceCard key={text.id} text={text} />
          ))}
        </div>
      )}

      {/* Pending submissions queue */}
      <div className="mt-10">
        <PendingResources />
      </div>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
        <strong>Note :</strong> Les ressources soumises sont visibles ici après validation par l&apos;équipe.
        Vous pouvez soumettre vos textes et vidéos via le bouton &quot;Soumettre&quot; ci-dessus.
      </div>
    </div>
  )
}
