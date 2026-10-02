// web/lib/corrections-mutations.ts — client-side reads and writes for corrections.
// RLS and the database functions enforce who may do what; these helpers add validation and French errors.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkCorrectionInput,
  type Correction,
  type CorrectionInput,
  type CorrectionTargetType,
} from './corrections'

type Result<T> = { data: T; error: null } | { data: null; error: string }

async function authUser(client: SupabaseClient) {
  const { data: { user } } = await client.auth.getUser()
  return user
}

/** A unique violation: this person already has an open report on this field. */
export const ALREADY_REPORTED_MESSAGE = 'Vous avez déjà signalé ce champ. Retirez votre signalement pour en faire un nouveau.'

/** Report a field and, optionally, propose its replacement. `current` is the field's text now. */
export async function createCorrection(
  client: SupabaseClient,
  input: CorrectionInput,
  current?: string | null,
): Promise<Result<{ id: string }>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour signaler une erreur.' }

  const { message, suggestion, error: invalid } = checkCorrectionInput(input, current)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('corrections')
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      field: input.field,
      kind: input.kind,
      message,
      suggestion,
      reporter_id: user.id,
    })
    .select('id')
    .single()

  if (error?.code === '23505') return { data: null, error: ALREADY_REPORTED_MESSAGE }
  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Take back your own open report (an admin can remove any). */
export async function withdrawCorrection(client: SupabaseClient, id: string): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour retirer ce signalement.' }
  const { data, error } = await client.from('corrections').delete().eq('id', id).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Retrait impossible.' }
  return { data: null, error: null }
}

/** Accept a correction: its text replaces the field. Only the content's author or an admin. */
export async function acceptCorrection(client: SupabaseClient, id: string): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour traiter cette correction.' }
  const { error } = await client.rpc('accept_correction', { p_id: id })
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

/** Reject a correction. Only the content's author or an admin. */
export async function rejectCorrection(client: SupabaseClient, id: string): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour traiter cette correction.' }
  const { error } = await client.rpc('reject_correction', { p_id: id })
  if (error) return { data: null, error: error.message }
  return { data: null, error: null }
}

/** Open corrections on one piece of content, oldest first. */
export async function getOpenCorrections(
  client: SupabaseClient,
  targetType: CorrectionTargetType,
  targetId: string,
): Promise<Correction[]> {
  const { data } = await client
    .from('corrections')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  return (data ?? []) as Correction[]
}

/** Open corrections waiting for you: on your content, or on all content for an admin. */
export async function getCorrectionsToReview(
  client: SupabaseClient,
  userId: string,
  isAdmin: boolean,
): Promise<Correction[]> {
  let query = client.from('corrections').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(200)
  if (!isAdmin) query = query.eq('owner_id', userId)
  const { data } = await query
  return (data ?? []) as Correction[]
}

/** The reports you sent that are still open. */
export async function getMyOpenCorrections(client: SupabaseClient, userId: string): Promise<Correction[]> {
  const { data } = await client
    .from('corrections')
    .select('*')
    .eq('reporter_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as Correction[]
}
