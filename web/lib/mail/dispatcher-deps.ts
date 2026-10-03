import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-service'
import type { DispatcherDeps, OutboxRow, PreferenceRecord, RowOutcome } from './dispatcher'
import { sendEmail } from './send'

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

export function createDispatcherDeps(client: SupabaseClient = createServiceClient()): DispatcherDeps {
  return {
    async countSentSince(since) {
      const { count, error } = await client
        .from('email_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', since.toISOString())
      if (error) throw new Error(error.message)
      return count ?? 0
    },

    async claim(limit) {
      return (must(await client.rpc('claim_email_batch', { p_limit: limit })) ?? []) as OutboxRow[]
    },

    async getPreferences(userIds) {
      must(await client.from('email_preferences').upsert(userIds.map((user_id) => ({ user_id })), { onConflict: 'user_id', ignoreDuplicates: true }))
      const rows = must(
        await client
          .from('email_preferences')
          .select('user_id, unsubscribe_token, teacher_announcements, weekly_progress, course_activity')
          .in('user_id', userIds),
      ) as Array<PreferenceRecord & { user_id: string }>
      return new Map(rows.map((r) => [r.user_id, r]))
    },

    async getEmail(userId) {
      const { data } = await client.auth.admin.getUserById(userId)
      return data?.user?.email ?? null
    },

    send: (email) => sendEmail(email),

    async finish(id, outcome: RowOutcome) {
      must(
        await client
          .from('email_outbox')
          .update({
            status: outcome.status,
            last_error: 'last_error' in outcome ? (outcome.last_error ?? null) : null,
            ...(outcome.status === 'sent' ? { sent_at: outcome.sent_at } : {}),
            ...(outcome.status === 'pending' ? { send_after: outcome.send_after } : {}),
          })
          .eq('id', id),
      )
    },

    now: () => new Date(),
  }
}
