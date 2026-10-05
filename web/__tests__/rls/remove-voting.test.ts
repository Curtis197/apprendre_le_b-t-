// web/__tests__/rls/remove-voting.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, uid, type TestUser } from './helpers'

const ZERO = '00000000-0000-0000-0000-000000000000'

const newExpression = (by: string, over: Record<string, unknown> = {}) => ({
  french_phrase: `bon courage ${uid()}`, bete_phrase: 'abc', bete_phonetic: 'abc', type: 'fixed', created_by: by, ...over,
})
const newRule = (by: string, over: Record<string, unknown> = {}) => ({
  category: 'verb', pattern_french: `je ${uid()}`, pattern_bete: 'mi', description: 'Une règle.', created_by: by, ...over,
})

describe('voting removed', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('rv-alice'), createUser('rv-bob')])
  })

  it('has no vote or increment function left (PostgREST: not found)', async () => {
    const vote = await alice.client.rpc('vote', { p_table_name: 'expressions', p_row_id: ZERO, p_direction: 'up' })
    expect(vote.error?.code).toBe('PGRST202')
    const inc = await alice.client.rpc('increment_upvotes', { table_name: 'expressions', row_id: ZERO, delta: 1 })
    expect(inc.error?.code).toBe('PGRST202')
  })

  it('validates a new expression and a new grammar rule by default', async () => {
    const e = must(await alice.client.from('expressions').insert(newExpression(alice.id)).select('validated').single(), 'expression')
    expect(e.validated).toBe(true)
    const r = must(await alice.client.from('grammar_rules').insert(newRule(alice.id)).select('validated').single(), 'rule')
    expect(r.validated).toBe(true)
  })

  it('no longer flips `validated` when the score reaches 3', async () => {
    const e = must(await admin.from('expressions').insert(newExpression(alice.id, { validated: false })).select('id').single(), 'expression')
    await admin.from('expressions').update({ upvotes: 5 }).eq('id', e.id)
    expect(must(await admin.from('expressions').select('validated').eq('id', e.id).single(), 'row').validated).toBe(false)
    const r = must(await admin.from('grammar_rules').insert(newRule(alice.id, { validated: false })).select('id').single(), 'rule')
    await admin.from('grammar_rules').update({ upvotes: 5 }).eq('id', r.id)
    expect(must(await admin.from('grammar_rules').select('validated').eq('id', r.id).single(), 'row').validated).toBe(false)
  })

  it('lets nobody but the service role update an expression or a grammar rule', async () => {
    const e = must(await alice.client.from('expressions').insert(newExpression(alice.id)).select('id, french_phrase').single(), 'expression')
    await bob.client.from('expressions').update({ french_phrase: 'piraté' }).eq('id', e.id)
    await alice.client.from('expressions').update({ french_phrase: 'piraté' }).eq('id', e.id)
    expect(must(await admin.from('expressions').select('french_phrase').eq('id', e.id).single(), 'row').french_phrase).toBe(e.french_phrase)
    const r = must(await alice.client.from('grammar_rules').insert(newRule(alice.id)).select('id, description').single(), 'rule')
    await bob.client.from('grammar_rules').update({ description: 'piraté' }).eq('id', r.id)
    expect(must(await admin.from('grammar_rules').select('description').eq('id', r.id).single(), 'row').description).toBe(r.description)
  })

  it('keeps inserting under one’s own name only', async () => {
    expect((await bob.client.from('expressions').insert(newExpression(alice.id))).error).not.toBeNull()
    expect((await bob.client.from('grammar_rules').insert(newRule(alice.id))).error).not.toBeNull()
  })

  it('keeps the votes table and the lexicon description editing', async () => {
    expect((await admin.from('user_votes').select('user_id').limit(1)).error).toBeNull()
    const w = must(
      await admin.from('lexicon').insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'x', probability: 1, created_by: alice.id }).select('id').single(),
      'word',
    )
    await bob.client.from('lexicon').update({ description: 'Une définition.' }).eq('id', w.id)
    expect(must(await admin.from('lexicon').select('description').eq('id', w.id).single(), 'row').description).toBe('Une définition.')
  })
})
