import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, isAuthorizedCron, retryDelayMs, runDispatch, type DispatcherDeps, type OutboxRow, type PreferenceRecord, type RowOutcome } from '@/lib/mail/dispatcher'

const NOW = new Date('2026-10-05T07:00:00Z')
const opts = { batchSize: 20, dailyLimit: 90, baseUrl: 'https://apprendre-le-bhete.com' }

function row(over: Partial<OutboxRow> = {}): OutboxRow {
  return { id: 'r1', user_id: 'u1', category: 'course_activity', template: 'submission_received', payload: { lesson_title: 'L', course_title: 'C', course_slug: 's' }, dedupe_key: 'k1', attempts: 1, ...over }
}

const prefs = (over: Partial<PreferenceRecord> = {}): PreferenceRecord => ({
  unsubscribe_token: '11111111-1111-4111-8111-111111111111',
  teacher_announcements: true,
  weekly_progress: true,
  course_activity: true,
  ...over,
})

function makeDeps(rows: OutboxRow[], over: Partial<DispatcherDeps> = {}) {
  const finished: Array<[string, RowOutcome]> = []
  const deps: DispatcherDeps = {
    countSentSince: vi.fn().mockResolvedValue(0),
    claim: vi.fn().mockResolvedValue(rows),
    getPreferences: vi.fn().mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, prefs()]))),
    getEmail: vi.fn().mockResolvedValue('a@b.c'),
    send: vi.fn().mockResolvedValue({ ok: true, id: 'resend-1' }),
    finish: vi.fn().mockImplementation(async (id: string, outcome: RowOutcome) => { finished.push([id, outcome]) }),
    now: () => NOW,
    ...over,
  }
  return { deps, finished }
}

describe('retryDelayMs', () => {
  it('grows quadratically in 5-minute units', () => {
    expect(retryDelayMs(1)).toBe(5 * 60_000)
    expect(retryDelayMs(2)).toBe(20 * 60_000)
    expect(retryDelayMs(3)).toBe(45 * 60_000)
  })
})

describe('isAuthorizedCron', () => {
  it('rejects when no secret is configured, when the header is missing, and when it is wrong', () => {
    expect(isAuthorizedCron('Bearer x', undefined)).toBe(false)
    expect(isAuthorizedCron('Bearer x', '')).toBe(false)
    expect(isAuthorizedCron(null, 'x')).toBe(false)
    expect(isAuthorizedCron('Bearer y', 'x')).toBe(false)
  })
  it('accepts the exact bearer token', () => {
    expect(isAuthorizedCron('Bearer s3cret', 's3cret')).toBe(true)
  })
})

describe('runDispatch', () => {
  it('sends a due row with unsubscribe headers and marks it sent', async () => {
    const { deps, finished } = makeDeps([row()])
    const summary = await runDispatch(deps, opts)
    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 0, retried: 0 })
    const sent = (deps.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(sent.to).toBe('a@b.c')
    expect(sent.headers['List-Unsubscribe']).toContain('/api/mail/unsubscribe?token=11111111-1111-4111-8111-111111111111&category=course_activity')
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(finished).toEqual([['r1', { status: 'sent', sent_at: NOW.toISOString() }]])
  })

  it('skips without sending when the category is switched off', async () => {
    const { deps, finished } = makeDeps([row()], {
      getPreferences: vi.fn().mockResolvedValue(new Map([['u1', prefs({ course_activity: false })]])),
    })
    const summary = await runDispatch(deps, opts)
    expect(summary.skipped).toBe(1)
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.getEmail).not.toHaveBeenCalled()
    expect(finished[0][1].status).toBe('skipped')
  })

  it('skips when the user has no email address', async () => {
    const { deps } = makeDeps([row()], { getEmail: vi.fn().mockResolvedValue(null) })
    expect((await runDispatch(deps, opts)).skipped).toBe(1)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('fails permanently on an unknown template without sending', async () => {
    const { deps, finished } = makeDeps([row({ template: 'nope' })])
    expect((await runDispatch(deps, opts)).failed).toBe(1)
    expect(deps.send).not.toHaveBeenCalled()
    expect(finished[0][1]).toMatchObject({ status: 'failed' })
  })

  it('reschedules with backoff when sending fails', async () => {
    const { deps, finished } = makeDeps([row({ attempts: 2 })], { send: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }) })
    expect((await runDispatch(deps, opts)).retried).toBe(1)
    expect(finished[0][1]).toEqual({ status: 'pending', last_error: 'boom', send_after: new Date(NOW.getTime() + 20 * 60_000).toISOString() })
  })

  it('gives up after MAX_ATTEMPTS', async () => {
    const { deps, finished } = makeDeps([row({ attempts: MAX_ATTEMPTS })], { send: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }) })
    expect((await runDispatch(deps, opts)).failed).toBe(1)
    expect(finished[0][1]).toEqual({ status: 'failed', last_error: 'boom' })
  })

  it('treats a throwing dependency as a retryable failure and keeps going', async () => {
    const { deps, finished } = makeDeps([row({ id: 'a' }), row({ id: 'b', dedupe_key: 'k2' })], {
      getEmail: vi.fn().mockRejectedValueOnce(new Error('auth down')).mockResolvedValue('a@b.c'),
    })
    const summary = await runDispatch(deps, opts)
    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 0, retried: 1 })
    expect(finished.map(([id]) => id)).toEqual(['a', 'b'])
  })

  it('claims nothing once the daily limit is reached', async () => {
    const { deps } = makeDeps([row()], { countSentSince: vi.fn().mockResolvedValue(90) })
    expect(await runDispatch(deps, opts)).toEqual({ sent: 0, skipped: 0, failed: 0, retried: 0 })
    expect(deps.claim).not.toHaveBeenCalled()
  })

  it('claims at most the remaining daily budget', async () => {
    const { deps } = makeDeps([], { countSentSince: vi.fn().mockResolvedValue(85) })
    await runDispatch(deps, opts)
    expect(deps.claim).toHaveBeenCalledWith(5)
  })
})
