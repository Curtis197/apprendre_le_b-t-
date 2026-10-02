// web/lib/lexicon-mutations.ts — client-side writes for lexicon translations and descriptions.
// RLS enforces ownership; these helpers add validation and French error messages.
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkDescription, checkTranslationInput } from './lexicon'

type Result<T> = { data: T; error: null } | { data: null; error: string }

export const DUPLICATE_TRANSLATION_MESSAGE = 'Cette traduction existe déjà pour ce mot.'

/** Postgres unique violation: the same French word + context already exists on this word. */
export function isDuplicateTranslation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

async function authUser(client: SupabaseClient) {
  const { data: { user } } = await client.auth.getUser()
  return user
}

export async function addTranslation(
  client: SupabaseClient,
  lexiconId: string,
  input: { french: string; context?: string | null },
): Promise<Result<{ id: string }>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour ajouter une traduction.' }
  const { french, context, error: invalid } = checkTranslationInput(input)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('lexicon_translations')
    .insert({ lexicon_id: lexiconId, french, context, created_by: user.id })
    .select('id')
    .single()
  if (isDuplicateTranslation(error)) return { data: null, error: DUPLICATE_TRANSLATION_MESSAGE }
  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Edit your own translation. */
export async function updateTranslation(
  client: SupabaseClient,
  id: string,
  input: { french: string; context?: string | null },
): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour modifier cette traduction.' }
  const { french, context, error: invalid } = checkTranslationInput(input)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('lexicon_translations')
    .update({ french, context })
    .eq('id', id)
    .eq('created_by', user.id)
    .select('id')
  if (isDuplicateTranslation(error)) return { data: null, error: DUPLICATE_TRANSLATION_MESSAGE }
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Traduction introuvable ou non modifiable.' }
  return { data: null, error: null }
}

/** Delete a translation (its author, or an admin). */
export async function deleteTranslation(client: SupabaseClient, id: string): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour supprimer cette traduction.' }
  const { data, error } = await client.from('lexicon_translations').delete().eq('id', id).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Suppression impossible.' }
  return { data: null, error: null }
}

/** Set (or clear, with a blank text) the shared description of a word. */
export async function updateDescription(
  client: SupabaseClient,
  lexiconId: string,
  text: string,
): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour modifier la description.' }
  const { description, error: invalid } = checkDescription(text)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client.from('lexicon').update({ description }).eq('id', lexiconId).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Mot introuvable.' }
  return { data: null, error: null }
}
