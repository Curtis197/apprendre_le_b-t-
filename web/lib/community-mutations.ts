// lib/community-mutations.ts — client-side write functions for forum and community texts
// All functions require an authenticated user (checked internally).
// Pass a SupabaseClient created with createClient() from supabase-browser.
import { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateThreadInput,
  CreatePostInput,
  CreateCommunityTextInput,
} from './types'

type Ok<T> = { data: T; error: null }
type Err  = { data: null; error: string }
type Result<T> = Ok<T> | Err

async function getAuthUser(client: SupabaseClient) {
  const { data: { user } } = await client.auth.getUser()
  return user
}

// ── Forum ──────────────────────────────────────────────────────────────────

/** Create a new forum thread. Returns the new thread id on success. */
export async function createThread(
  client: SupabaseClient,
  input: CreateThreadInput,
): Promise<Result<{ id: string }>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour poster.' }

  const displayName = input.author_name?.trim()
    || user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || 'Anonyme'

  const { data, error } = await client
    .from('forum_threads')
    .insert({
      title:       input.title.trim(),
      body:        input.body.trim(),
      category:    input.category,
      author_name: displayName,
      created_by:  user.id,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Add a reply to a thread. */
export async function createPost(
  client: SupabaseClient,
  input: CreatePostInput,
): Promise<Result<{ id: string }>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour répondre.' }

  const displayName = input.author_name?.trim()
    || user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || 'Anonyme'

  const { data, error } = await client
    .from('forum_posts')
    .insert({
      thread_id:   input.thread_id,
      content:     input.content.trim(),
      author_name: displayName,
      created_by:  user.id,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Increment the upvote count on a thread (one call = one vote). */
export async function upvoteThread(
  client: SupabaseClient,
  threadId: string,
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('increment_upvotes', {
    table_name: 'forum_threads',
    row_id: threadId,
  })
  return { error: error?.message ?? null }
}

/** Increment the upvote count on a post. */
export async function upvotePost(
  client: SupabaseClient,
  postId: string,
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('increment_upvotes', {
    table_name: 'forum_posts',
    row_id: postId,
  })
  return { error: error?.message ?? null }
}

// ── Community texts ────────────────────────────────────────────────────────

/** Submit a community text (song, story, poem, proverb …). Pending validation. */
export async function submitCommunityText(
  client: SupabaseClient,
  input: CreateCommunityTextInput,
): Promise<Result<{ id: string }>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour contribuer.' }

  const displayName = input.author_name?.trim()
    || user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || null

  const { data, error } = await client
    .from('community_texts')
    .insert({
      title:          input.title.trim(),
      type:           input.type,
      content_bete:   input.content_bete.trim(),
      content_french: input.content_french?.trim() || null,
      author_name:    displayName,
      region:         input.region?.trim() || null,
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Increment the upvote count on a community text. */
export async function upvoteCommunityText(
  client: SupabaseClient,
  textId: string,
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('increment_upvotes', {
    table_name: 'community_texts',
    row_id: textId,
  })
  return { error: error?.message ?? null }
}
