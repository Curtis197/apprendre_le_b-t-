// lib/community-mutations.ts — client-side write functions for forum and community texts
// All functions require an authenticated user (checked internally).
// Pass a SupabaseClient created with createClient() from supabase-browser.
import { SupabaseClient } from '@supabase/supabase-js'
import { isResourceRegion } from './regions'
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

// ── Community texts ────────────────────────────────────────────────────────

// ── Resources (community texts) ────────────────────────────────────────────
// A resource belongs to the contributor who published it: they create, edit and delete it,
// and anyone signed in can comment. RLS enforces ownership; these helpers add validation
// and French error messages.

const COMMENT_MAX_LENGTH = 2000

/** Cleans and validates the fields the contributor controls (null: valid). */
function checkResourceInput(input: CreateCommunityTextInput): { region: string | null; error: string | null } {
  const region = input.region?.trim() || null
  if (!input.title.trim() || !input.content_bete.trim()) {
    return { region, error: 'Le titre et le texte en bhété sont obligatoires.' }
  }
  if (region !== null && !isResourceRegion(region)) {
    return { region, error: 'Région invalide : choisissez une région dans la liste.' }
  }
  return { region, error: null }
}

function resourceColumns(input: CreateCommunityTextInput, region: string | null) {
  return {
    title:           input.title.trim(),
    type:            input.type,
    content_bete:    input.content_bete.trim(),
    content_literal: input.content_literal?.trim() || null,
    content_french:  input.content_french?.trim() || null,
    video_url:       input.video_url?.trim() || null,
    region,
  }
}

/** Publish a resource (song, story, poem, proverb …). It is visible immediately. */
export async function submitCommunityText(
  client: SupabaseClient,
  input: CreateCommunityTextInput,
): Promise<Result<{ id: string }>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour contribuer.' }

  const { region, error: invalid } = checkResourceInput(input)
  if (invalid) return { data: null, error: invalid }

  const displayName = input.author_name?.trim()
    || user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || null

  const { data, error } = await client
    .from('community_texts')
    .insert({ ...resourceColumns(input, region), author_name: displayName, created_by: user.id })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Edit a resource. Only its creator can; a blank author keeps the existing one. */
export async function updateCommunityText(
  client: SupabaseClient,
  id: string,
  input: CreateCommunityTextInput,
): Promise<Result<{ id: string }>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour modifier cette ressource.' }

  const { region, error: invalid } = checkResourceInput(input)
  if (invalid) return { data: null, error: invalid }

  const author = input.author_name?.trim()
  const { data, error } = await client
    .from('community_texts')
    .update({ ...resourceColumns(input, region), ...(author ? { author_name: author } : {}) })
    .eq('id', id)
    .eq('created_by', user.id)
    .select('id')
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'Ressource introuvable ou non modifiable.' }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Delete a resource (its creator, or an admin). Its comments are deleted with it. */
export async function deleteCommunityText(
  client: SupabaseClient,
  id: string,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour supprimer cette ressource.' }

  const { data, error } = await client.from('community_texts').delete().eq('id', id).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Suppression impossible.' }
  return { data: null, error: null }
}

// ── Resource comments ──────────────────────────────────────────────────────

function checkCommentBody(body: string): { text: string; error: string | null } {
  const text = body.trim()
  if (!text) return { text, error: 'Le commentaire est vide.' }
  if (text.length > COMMENT_MAX_LENGTH) {
    return { text, error: `Le commentaire ne peut pas dépasser ${COMMENT_MAX_LENGTH} caractères.` }
  }
  return { text, error: null }
}

/** Add a comment. The display name is set by the database from the author's profile. */
export async function createResourceComment(
  client: SupabaseClient,
  resourceId: string,
  body: string,
): Promise<Result<{ id: string }>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour commenter.' }

  const { text, error: invalid } = checkCommentBody(body)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('resource_comments')
    .insert({ resource_id: resourceId, user_id: user.id, body: text })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Edit your own comment's text. */
export async function updateResourceComment(
  client: SupabaseClient,
  id: string,
  body: string,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour modifier ce commentaire.' }

  const { text, error: invalid } = checkCommentBody(body)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('resource_comments')
    .update({ body: text })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Commentaire introuvable ou non modifiable.' }
  return { data: null, error: null }
}

/** Delete a comment (its author, or an admin). */
export async function deleteResourceComment(
  client: SupabaseClient,
  id: string,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour supprimer ce commentaire.' }

  const { data, error } = await client.from('resource_comments').delete().eq('id', id).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Suppression impossible.' }
  return { data: null, error: null }
}
