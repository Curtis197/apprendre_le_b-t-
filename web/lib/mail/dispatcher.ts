import { timingSafeEqual } from 'node:crypto'
import type { EmailCategory } from './categories'
import type { OutgoingEmail, SendResult } from './send'
import { renderTemplate } from './templates'

export const MAX_ATTEMPTS = 5

/** `attempts` is the value AFTER claim_email_batch incremented it (1 on the first try). */
export interface OutboxRow {
  id: string
  user_id: string
  category: EmailCategory
  template: string
  payload: Record<string, unknown>
  dedupe_key: string
  attempts: number
}

export interface PreferenceRecord {
  unsubscribe_token: string
  teacher_announcements: boolean
  weekly_progress: boolean
  course_activity: boolean
}

export type RowOutcome =
  | { status: 'sent'; sent_at: string }
  | { status: 'skipped'; last_error?: string }
  | { status: 'failed'; last_error?: string }
  | { status: 'pending'; last_error: string; send_after: string }

export interface DispatcherDeps {
  countSentSince(since: Date): Promise<number>
  claim(limit: number): Promise<OutboxRow[]>
  /** Must return an entry for every requested user (creating missing preference rows). */
  getPreferences(userIds: string[]): Promise<Map<string, PreferenceRecord>>
  getEmail(userId: string): Promise<string | null>
  send(email: OutgoingEmail): Promise<SendResult>
  finish(id: string, outcome: RowOutcome): Promise<void>
  now(): Date
}

export interface DispatchOptions {
  batchSize: number
  dailyLimit: number
  baseUrl: string
}

export interface DispatchSummary {
  sent: number
  skipped: number
  failed: number
  retried: number
}

export function retryDelayMs(attempts: number): number {
  return attempts * attempts * 5 * 60_000
}

export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function retryOrFail(row: OutboxRow, message: string, now: Date): RowOutcome {
  if (row.attempts >= MAX_ATTEMPTS) return { status: 'failed', last_error: message }
  return { status: 'pending', last_error: message, send_after: new Date(now.getTime() + retryDelayMs(row.attempts)).toISOString() }
}

async function processRow(row: OutboxRow, prefs: PreferenceRecord | undefined, deps: DispatcherDeps, opts: DispatchOptions): Promise<RowOutcome> {
  try {
    if (!prefs) return retryOrFail(row, 'préférences indisponibles', deps.now())
    if (prefs[row.category] === false) return { status: 'skipped', last_error: 'catégorie désactivée' }

    const to = await deps.getEmail(row.user_id)
    if (!to) return { status: 'skipped', last_error: 'aucune adresse e-mail' }

    const qs = `token=${encodeURIComponent(prefs.unsubscribe_token)}&category=${encodeURIComponent(row.category)}`
    const rendered = renderTemplate(row.template, row.payload, {
      baseUrl: opts.baseUrl,
      unsubscribeUrl: `${opts.baseUrl}/notifications/unsubscribe?${qs}`,
    })
    if (!rendered) return { status: 'failed', last_error: `modèle inconnu : ${row.template}` }

    const result = await deps.send({
      to,
      ...rendered,
      headers: {
        'List-Unsubscribe': `<${opts.baseUrl}/api/mail/unsubscribe?${qs}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
    if (result.ok) return { status: 'sent', sent_at: deps.now().toISOString() }
    return retryOrFail(row, result.error, deps.now())
  } catch (err) {
    return retryOrFail(row, err instanceof Error ? err.message : String(err), deps.now())
  }
}

export async function runDispatch(deps: DispatcherDeps, opts: DispatchOptions): Promise<DispatchSummary> {
  const summary: DispatchSummary = { sent: 0, skipped: 0, failed: 0, retried: 0 }
  const now = deps.now()
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const budget = opts.dailyLimit - (await deps.countSentSince(startOfDay))
  const limit = Math.min(opts.batchSize, budget)
  if (limit <= 0) return summary

  const rows = await deps.claim(limit)
  if (rows.length === 0) return summary

  const prefs = await deps.getPreferences([...new Set(rows.map((r) => r.user_id))])
  for (const row of rows) {
    const outcome = await processRow(row, prefs.get(row.user_id), deps, opts)
    try {
      await deps.finish(row.id, outcome)
    } catch (err) {
      // The row keeps its 10-minute lease and is retried afterwards (at-least-once delivery).
      console.error('[mail] could not record outcome for', row.id, err)
      continue
    }
    if (outcome.status === 'sent') summary.sent++
    else if (outcome.status === 'skipped') summary.skipped++
    else if (outcome.status === 'failed') summary.failed++
    else summary.retried++
  }
  return summary
}
