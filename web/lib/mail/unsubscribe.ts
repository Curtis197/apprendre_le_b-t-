import type { SupabaseClient } from '@supabase/supabase-js'
import { isEmailCategory } from './categories'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PreferenceChange = { ok: true } | { ok: false; status: 400 | 404 | 500; error: string }

/** Flips one category for the user who owns `token`. Needs a service-role client. */
export async function applyPreferenceChange(
  client: SupabaseClient,
  token: string | null,
  category: string | null,
  subscribe: boolean,
): Promise<PreferenceChange> {
  if (!token || !UUID_RE.test(token) || !isEmailCategory(category)) {
    return { ok: false, status: 400, error: 'Lien invalide.' }
  }
  const { data, error } = await client
    .from('email_preferences')
    .update({ [category]: subscribe, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .select('user_id')
  if (error) return { ok: false, status: 500, error: 'Erreur serveur.' }
  if (!data || data.length === 0) return { ok: false, status: 404, error: 'Lien introuvable.' }
  return { ok: true }
}
