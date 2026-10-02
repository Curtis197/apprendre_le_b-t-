import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORRECTION_FIELDS,
  MESSAGE_MAX,
  SUGGESTION_MAX,
  canResolve,
  checkCorrectionInput,
  correctionFields,
  correctionHref,
  fieldLabel,
  isCorrectableField,
  isStale,
  kindLabel,
  type CorrectionInput,
} from '../lib/corrections'
import {
  ALREADY_REPORTED_MESSAGE,
  acceptCorrection,
  createCorrection,
  rejectCorrection,
  withdrawCorrection,
} from '../lib/corrections-mutations'

const base: CorrectionInput = {
  targetType: 'translation',
  targetId: 't1',
  field: 'french',
  kind: 'mistranslation',
  message: 'Ce n’est pas le bon sens.',
}

describe('the correctable fields', () => {
  it('match the database allow-list, entry for entry', () => {
    // correction_column() in the migration is the source of truth for what the database accepts
    const dir = path.resolve(__dirname, '../../supabase/migrations')
    const file = readdirSync(dir).find(f => f.endsWith('_corrections.sql'))
    expect(file, 'the corrections migration is missing').toBeTruthy()
    const sql = readFileSync(path.join(dir, file!), 'utf8')

    const inSql = [...sql.matchAll(/when '(\w+)\.(\w+)'\s+then array\['(\w+)',\s*'(\w+)'\]/g)].map(m => `${m[1]}.${m[2]}`)
    const inTs = Object.entries(CORRECTION_FIELDS).flatMap(([type, fields]) => fields.map(f => `${type}.${f.field}`))

    expect(inSql.length).toBeGreaterThan(10)
    expect([...inTs].sort()).toEqual([...inSql].sort())
  })

  it('give every field a French label, and know what is and is not correctable', () => {
    for (const type of Object.keys(CORRECTION_FIELDS) as (keyof typeof CORRECTION_FIELDS)[]) {
      for (const f of correctionFields(type)) expect(f.label.length).toBeGreaterThan(0)
    }
    expect(isCorrectableField('word', 'bete_word')).toBe(true)
    expect(isCorrectableField('word', 'created_by')).toBe(false)
    expect(isCorrectableField('word', 'upvotes')).toBe(false)
    expect(isCorrectableField('nonsense', 'title')).toBe(false)
    expect(fieldLabel('resource', 'content_french')).toBe('Traduction en français')
    expect(fieldLabel('resource', 'unknown')).toBe('unknown')
    expect(kindLabel('spelling')).toBe('Faute d’orthographe')
  })
})

describe('checkCorrectionInput', () => {
  it('accepts a message alone, a suggestion alone, or both, and trims them', () => {
    expect(checkCorrectionInput({ ...base, message: '  Faux.  ' }).error).toBeNull()
    expect(checkCorrectionInput({ ...base, message: '  Faux.  ' }).message).toBe('Faux.')
    expect(checkCorrectionInput({ ...base, message: '', suggestion: ' manger ' }).suggestion).toBe('manger')
    expect(checkCorrectionInput({ ...base, suggestion: 'manger' }).error).toBeNull()
  })

  it('needs something to say', () => {
    expect(checkCorrectionInput({ ...base, message: '   ', suggestion: '' }).error).toContain('Expliquez')
    expect(checkCorrectionInput({ ...base, message: null, suggestion: null }).error).toContain('Expliquez')
  })

  it('refuses a suggestion identical to the current text', () => {
    expect(checkCorrectionInput({ ...base, message: '', suggestion: ' manger ' }, 'manger').error).toContain('identique')
    expect(checkCorrectionInput({ ...base, message: '', suggestion: 'boire' }, 'manger').error).toBeNull()
  })

  it('refuses a field that cannot be reported and an unknown kind', () => {
    expect(checkCorrectionInput({ ...base, field: 'created_by' }).error).toContain('ne peut pas')
    expect(checkCorrectionInput({ ...base, kind: 'nope' as never }).error).toContain('type de problème')
  })

  it('caps the length of both texts', () => {
    expect(checkCorrectionInput({ ...base, message: 'x'.repeat(MESSAGE_MAX + 1) }).error).toContain(String(MESSAGE_MAX))
    expect(checkCorrectionInput({ ...base, message: '', suggestion: 'x'.repeat(SUGGESTION_MAX + 1) }).error).toContain(String(SUGGESTION_MAX))
    expect(checkCorrectionInput({ ...base, message: 'x'.repeat(MESSAGE_MAX) }).error).toBeNull()
  })
})

describe('isStale', () => {
  it('is true once the text differs from what was reported, and treats missing text as empty', () => {
    expect(isStale({ original: 'manger' }, 'manger')).toBe(false)
    expect(isStale({ original: 'manger' }, 'boire')).toBe(true)
    expect(isStale({ original: null }, '')).toBe(false)
    expect(isStale({ original: null }, undefined)).toBe(false)
    expect(isStale({ original: '' }, 'nouveau')).toBe(true)
  })
})

describe('canResolve', () => {
  const open = { status: 'open' as const, owner_id: 'owner' }

  it('lets the author and admins resolve an open correction', () => {
    expect(canResolve(open, 'owner', false)).toBe(true)
    expect(canResolve(open, 'someone', true)).toBe(true)
  })

  it('refuses everyone else, signed-out visitors and closed corrections', () => {
    expect(canResolve(open, 'someone', false)).toBe(false)
    expect(canResolve(open, null, false)).toBe(false)
    expect(canResolve(open, null, true)).toBe(false)
    expect(canResolve({ ...open, status: 'accepted' }, 'owner', true)).toBe(false)
  })

  it('leaves content with no author to admins only', () => {
    expect(canResolve({ status: 'open', owner_id: null }, 'owner', false)).toBe(false)
    expect(canResolve({ status: 'open', owner_id: null }, 'boss', true)).toBe(true)
  })
})

describe('correctionHref', () => {
  it('links words, translations and resources to their page, the rest to their list', () => {
    expect(correctionHref({ target_type: 'translation', ref_id: 'w1' })).toBe('/lexicon/w1')
    expect(correctionHref({ target_type: 'word', ref_id: 'w1' })).toBe('/lexicon/w1')
    expect(correctionHref({ target_type: 'resource', ref_id: 'r1' })).toBe('/resources/r1')
    expect(correctionHref({ target_type: 'grammar_rule', ref_id: null })).toBe('/grammar')
    expect(correctionHref({ target_type: 'expression', ref_id: null })).toBe('/contribute')
    expect(correctionHref({ target_type: 'word', ref_id: null })).toBeNull()
  })
})

// A recording stand-in for the Supabase client.
interface Call { op: string; table?: string; payload?: unknown; filters: [string, unknown][]; rpc?: [string, unknown] }
type Reply = { data: unknown; error: { message: string; code?: string } | null }

function fakeClient(reply: Reply, user: { id: string } | null = { id: 'u1' }) {
  const calls: Call[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: 'rpc', rpc: [fn, args], filters: [] })
      return reply
    },
    from: (table: string) => {
      const call: Call = { op: 'select', table, filters: [] }
      calls.push(call)
      const api: Record<string, unknown> = {
        insert: (p: unknown) => { call.op = 'insert'; call.payload = p; return api },
        delete: () => { call.op = 'delete'; return api },
        eq: (c: string, v: unknown) => { call.filters.push([c, v]); return api },
        select: () => api,
        single: async () => reply,
        then: (resolve: (r: Reply) => unknown) => resolve(reply),
      }
      return api
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('createCorrection', () => {
  it('sends only what the client controls, as the signed-in user', async () => {
    const { client, calls } = fakeClient({ data: { id: 'c1' }, error: null })
    const res = await createCorrection(client, { ...base, suggestion: ' consommer ' }, 'manger')
    expect(res).toEqual({ data: { id: 'c1' }, error: null })
    expect(calls[0]).toMatchObject({ table: 'corrections', op: 'insert' })
    expect(calls[0].payload).toEqual({
      target_type: 'translation', target_id: 't1', field: 'french', kind: 'mistranslation',
      message: 'Ce n’est pas le bon sens.', suggestion: 'consommer', reporter_id: 'u1',
    })
  })

  it('needs a signed-in user and valid input, and does not query otherwise', async () => {
    const out = fakeClient({ data: { id: 'c1' }, error: null }, null)
    expect((await createCorrection(out.client, base)).error).toContain('Connectez-vous')
    const bad = fakeClient({ data: { id: 'c1' }, error: null })
    expect((await createCorrection(bad.client, { ...base, message: '' })).error).toContain('Expliquez')
    expect(out.calls).toHaveLength(0)
    expect(bad.calls).toHaveLength(0)
  })

  it('explains a duplicate report and passes other errors through', async () => {
    const dup = fakeClient({ data: null, error: { message: 'duplicate key', code: '23505' } })
    expect((await createCorrection(dup.client, base)).error).toBe(ALREADY_REPORTED_MESSAGE)
    const other = fakeClient({ data: null, error: { message: 'Vous pouvez modifier directement votre propre contenu.' } })
    expect((await createCorrection(other.client, base)).error).toContain('directement')
  })
})

describe('withdrawCorrection', () => {
  it('succeeds only when a row was removed', async () => {
    const ok = fakeClient({ data: [{ id: 'c1' }], error: null })
    expect(await withdrawCorrection(ok.client, 'c1')).toEqual({ data: null, error: null })
    expect(ok.calls[0]).toMatchObject({ table: 'corrections', op: 'delete', filters: [['id', 'c1']] })
    const none = fakeClient({ data: [], error: null })
    expect((await withdrawCorrection(none.client, 'c1')).error).toContain('impossible')
  })
})

describe('acceptCorrection and rejectCorrection', () => {
  it('call the database functions and show their French message on failure', async () => {
    const ok = fakeClient({ data: null, error: null })
    expect(await acceptCorrection(ok.client, 'c1')).toEqual({ data: null, error: null })
    expect(ok.calls[0].rpc).toEqual(['accept_correction', { p_id: 'c1' }])
    expect(await rejectCorrection(ok.client, 'c1')).toEqual({ data: null, error: null })
    expect(ok.calls[1].rpc).toEqual(['reject_correction', { p_id: 'c1' }])

    const refused = fakeClient({ data: null, error: { message: 'Le texte a changé depuis ce signalement : il faut le signaler à nouveau.' } })
    expect((await acceptCorrection(refused.client, 'c1')).error).toContain('a changé')
  })

  it('need a signed-in user', async () => {
    const out = fakeClient({ data: null, error: null }, null)
    expect((await acceptCorrection(out.client, 'c1')).error).toContain('Connectez-vous')
    expect((await rejectCorrection(out.client, 'c1')).error).toContain('Connectez-vous')
    expect(out.calls).toHaveLength(0)
  })
})
