import 'server-only'
// lib/community.ts — server-side read functions for forum and community texts
import { SupabaseClient } from '@supabase/supabase-js'
import type {
  ForumThread,
  ForumPost,
  CommunityText,
  ForumCategory,
  ContentType,
} from './types'

// ── Forum ──────────────────────────────────────────────────────────────────

export async function getThreads(
  client: SupabaseClient,
  category?: ForumCategory | null,
  limit = 50,
): Promise<ForumThread[]> {
  let q = client
    .from('forum_threads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category) q = q.eq('category', category)

  const { data } = await q
  return (data ?? []) as ForumThread[]
}

export async function getThread(
  client: SupabaseClient,
  id: string,
): Promise<ForumThread | null> {
  const { data } = await client
    .from('forum_threads')
    .select('*')
    .eq('id', id)
    .single()
  return (data ?? null) as ForumThread | null
}

export async function getThreadPosts(
  client: SupabaseClient,
  threadId: string,
): Promise<ForumPost[]> {
  const { data } = await client
    .from('forum_posts')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  return (data ?? []) as ForumPost[]
}

// ── Community texts ────────────────────────────────────────────────────────

export async function getCommunityTexts(
  client: SupabaseClient,
  type?: ContentType | null,
  limit = 60,
): Promise<CommunityText[]> {
  let q = client
    .from('community_texts')
    .select('*')
    .eq('validated', true)
    .order('upvotes', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) q = q.eq('type', type)

  const { data } = await q
  return (data ?? []) as CommunityText[]
}

export async function getCommunityText(
  client: SupabaseClient,
  id: string,
): Promise<CommunityText | null> {
  const { data } = await client
    .from('community_texts')
    .select('*')
    .eq('id', id)
    .single()
  return (data ?? null) as CommunityText | null
}
