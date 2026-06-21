import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase-public'
import { SITE_URL } from '@/lib/site'
import { cleanBeteForm } from '@/lib/lexicon'

// Regenerate at most once a day (ISR); the cookie-free client keeps this cacheable.
export const revalidate = 86400

type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

const STATIC_ROUTES: { path: string; changeFrequency: ChangeFreq; priority: number }[] = [
  { path: '',            changeFrequency: 'daily',   priority: 1.0 },
  { path: '/lexicon',    changeFrequency: 'daily',   priority: 0.9 },
  { path: '/translator', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/grammar',    changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/forum',      changeFrequency: 'daily',   priority: 0.7 },
  { path: '/resources',  changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/contribute', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact',    changeFrequency: 'yearly',  priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  try {
    const supabase = createPublicClient()
    const [lex, threads] = await Promise.all([
      supabase.from('lexicon').select('id, bete_word, bete_phonetic').limit(50000),
      supabase.from('forum_threads').select('id, created_at').limit(50000),
    ])

    // Only list entries that actually have a translation (skip "_pending_" stubs).
    const lexEntries: MetadataRoute.Sitemap = (lex.data ?? [])
      .filter((row) => cleanBeteForm(row.bete_phonetic) || cleanBeteForm(row.bete_word))
      .map((row) => ({
        url: `${SITE_URL}/lexicon/${row.id}`,
        changeFrequency: 'monthly',
        priority: 0.6,
      }))

    const threadEntries: MetadataRoute.Sitemap = (threads.data ?? []).map((row) => ({
      url: `${SITE_URL}/forum/${row.id}`,
      lastModified: row.created_at ? new Date(row.created_at as string) : now,
      changeFrequency: 'weekly',
      priority: 0.5,
    }))

    return [...staticEntries, ...lexEntries, ...threadEntries]
  } catch {
    // If the DB is unreachable at build/revalidate time, still ship static routes.
    return staticEntries
  }
}
