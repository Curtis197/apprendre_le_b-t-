import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Layers, PlayCircle } from 'lucide-react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { getCommunityText, getResourceComments } from '@/lib/community'
import { extractYouTubeId } from '@/lib/utils'
import { SITE_URL } from '@/lib/site'
import {
  RESOURCE_TYPES,
  RESOURCE_TYPE_COLORS,
  buildResourceDescription,
  resourceTypeSingular,
} from '@/lib/resources'
import { VerseTranslation } from '@/components/VerseTranslation'
import { JsonLd } from '@/components/JsonLd'
import { ResourceComments } from '@/components/ResourceComments'
import { ResourceOwnerActions } from '@/components/ResourceOwnerActions'
import { CorrectionBox } from '@/components/CorrectionBox'

// Cached so generateMetadata and the page share a single DB query per request.
const getText = cache(async (id: string) => {
  const supabase = await createClient()
  return getCommunityText(supabase, id)
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const text = await getText(id)
  if (!text) return { title: 'Ressource introuvable', robots: { index: false } }

  const title = `${text.title} — ${resourceTypeSingular(text.type)} bhété`
  const description = buildResourceDescription(text)
  return {
    title,
    description,
    alternates: { canonical: `/resources/${id}` },
    openGraph: { title, description, type: 'article', url: `/resources/${id}` },
  }
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const text = await getText(id)
  if (!text) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [comments, isAdmin] = await Promise.all([
    getResourceComments(supabase, id),
    user ? supabase.rpc('is_admin').then(r => r.data === true) : Promise.resolve(false),
  ])
  const isOwner = user !== null && text.created_by === user.id

  const typeInfo = RESOURCE_TYPES.find(t => t.value === text.type)
  const Icon = typeInfo?.icon ?? Layers
  const videoId = text.video_url ? extractYouTubeId(text.video_url) : null
  const url = `${SITE_URL}/resources/${id}`
  const typeHref = typeInfo?.value ? `/resources?type=${typeInfo.value}` : '/resources'

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: text.title,
      url,
      description: buildResourceDescription(text),
      dateCreated: text.created_at,
      ...(text.author_name && { author: { '@type': 'Person', name: text.author_name } }),
      ...(text.region && { locationCreated: { '@type': 'Place', name: text.region } }),
      isPartOf: { '@type': 'CollectionPage', name: 'Ressources communautaires', url: `${SITE_URL}/resources` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Ressources', item: `${SITE_URL}/resources` },
        { '@type': 'ListItem', position: 3, name: text.title, item: url },
      ],
    },
  ]

  const meta = [
    text.author_name,
    text.region,
    new Date(text.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
  ].filter(Boolean)

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-10 py-10 space-y-6">
      <JsonLd data={jsonLd} />

      <Link
        href="/resources"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour aux ressources
      </Link>

      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Link
            href={typeHref}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-0.5 ${RESOURCE_TYPE_COLORS[text.type] ?? RESOURCE_TYPE_COLORS.other}`}
          >
            <Icon className="w-3 h-3" />
            {resourceTypeSingular(text.type)}
          </Link>
          {videoId && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">
              <PlayCircle className="w-3 h-3" />
              Vidéo
            </span>
          )}
        </div>
        <h1 className="font-heading text-3xl font-bold">{text.title}</h1>
        <p className="text-sm text-muted-foreground">{meta.join(' · ')}</p>
        {(isOwner || isAdmin) && (
          <ResourceOwnerActions id={id} canEdit={isOwner} canDelete={isOwner || isAdmin} />
        )}
      </header>

      {videoId && (
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title={text.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      )}

      <VerseTranslation
        original={text.content_bete}
        literal={text.content_literal}
        french={text.content_french}
      />

      <CorrectionBox
        targetType="resource"
        targetId={id}
        ownerId={text.created_by}
        fields={[
          { field: 'title', current: text.title },
          { field: 'content_bete', current: text.content_bete },
          { field: 'content_literal', current: text.content_literal },
          { field: 'content_french', current: text.content_french },
        ]}
      />

      <ResourceComments
        resourceId={id}
        comments={comments}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
      />

      <p className="text-sm text-muted-foreground">
        <Link href={typeHref} className="text-primary underline underline-offset-2">
          Voir d&apos;autres {typeInfo?.value ? typeInfo.label.toLowerCase() : 'ressources'}
        </Link>
      </p>
    </main>
  )
}
