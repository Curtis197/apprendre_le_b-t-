import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, uid, type TestUser } from './helpers'

// Reports and proposed corrections on words, translations, expressions, grammar rules and resources.
describe('corrections', () => {
  let owner: TestUser
  let reporter: TestUser
  let stranger: TestUser
  let boss: TestUser

  const lexiconIds: string[] = []
  const expressionIds: string[] = []
  const ruleIds: string[] = []
  const resourceIds: string[] = []

  let wordId: string
  let translationId: string
  let ownerlessWordId: string
  let expressionId: string
  let ruleId: string
  let resourceId: string

  async function word(createdBy: string | null, extra: Record<string, unknown> = {}) {
    const id = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${uid()}`,
          bete_phonetic: `lat-${uid()}`,
          french_candidates: [],
          top_french: 'manger',
          probability: 1,
          description: 'Une description.',
          created_by: createdBy,
          ...extra,
        })
        .select('id')
        .single(),
      'word',
    ).id as string
    lexiconIds.push(id)
    return id
  }

  type Who = Pick<TestUser, 'client' | 'id'>

  // like the real client: it sends its own id; the guard and the RLS check decide what is kept
  const report = (who: Who, target_type: string, target_id: string, field: string, extra: Record<string, unknown> = {}) =>
    who.client
      .from('corrections')
      .insert({ target_type, target_id, field, reporter_id: who.id, ...extra })
      .select('*')
      .single()

  const mustReport = async (who: Who, t: string, id: string, f: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await report(who, t, id, f, extra)
    if (error) throw new Error(`report ${t}.${f}: ${error.message}`)
    return data as Record<string, unknown> & { id: string; owner_id: string | null; reporter_id: string; ref_id: string | null; label: string | null }
  }

  beforeAll(async () => {
    ;[owner, reporter, stranger, boss] = await Promise.all([
      createUser('co-owner'),
      createUser('co-reporter'),
      createUser('co-stranger'),
      createUser('co-boss'),
    ])
    await makeAdmin(boss.id)

    wordId = await word(owner.id)
    ownerlessWordId = await word(null)
    // adding a word seeds its first translation, authored by the word's author
    translationId = must(
      await admin.from('lexicon_translations').select('id').eq('lexicon_id', wordId).limit(1).single(),
      'seeded translation',
    ).id as string

    expressionId = must(
      await admin
        .from('expressions')
        .insert({ french_phrase: 'il pleut', bete_phrase: 'ɓa lɛ', bete_phonetic: 'ba le', type: 'idiomatic', created_by: owner.id })
        .select('id')
        .single(),
      'expression',
    ).id as string
    expressionIds.push(expressionId)

    ruleId = must(
      await admin
        .from('grammar_rules')
        .insert({
          category: 'verb', pattern_french: 'je mange', pattern_bete: 'a li', description: 'Le présent.',
          example_french: 'je mange du riz', example_bete: 'a li kpa', created_by: owner.id,
        })
        .select('id')
        .single(),
      'rule',
    ).id as string
    ruleIds.push(ruleId)

    resourceId = must(
      await admin
        .from('community_texts')
        .insert({ title: 'Chant', type: 'song', content_bete: 'vers un\nvers deux', content_french: 'fr un\nfr deux', created_by: owner.id })
        .select('id')
        .single(),
      'resource',
    ).id as string
    resourceIds.push(resourceId)
  })

  beforeEach(async () => {
    await admin.from('corrections').delete().in('reporter_id', [owner.id, reporter.id, stranger.id, boss.id])
  })

  afterAll(async () => {
    await admin.from('lexicon').delete().in('id', lexiconIds)
    await admin.from('expressions').delete().in('id', expressionIds)
    await admin.from('grammar_rules').delete().in('id', ruleIds)
    await admin.from('community_texts').delete().in('id', resourceIds)
  })

  describe('reporting', () => {
    it('lets a signed-in user flag a field, and fills in what the client must not choose', async () => {
      const c = await mustReport(reporter, 'word', wordId, 'bete_phonetic', {
        kind: 'spelling', message: 'Il manque un ton.', suggestion: 'ba-corrigé',
        status: 'accepted', owner_id: stranger.id, original: 'forged', resolved_by: stranger.id,
      })
      expect(c).toMatchObject({
        status: 'open', reporter_id: reporter.id, owner_id: owner.id, resolved_by: null, resolved_at: null,
        kind: 'spelling', ref_id: wordId, suggestion: 'ba-corrigé',
      })
      expect(c.original).toMatch(/^lat-/)
      expect(c.original).not.toBe('forged')
      expect(c.label).toMatch(/^lat-/)
      expect(c.reporter_name).toBeTruthy()
    })

    it('refuses anonymous reports', async () => {
      const anon = await report({ client: anonClient(), id: owner.id }, 'word', wordId, 'description', { message: 'Faux.' })
      expect(anon.error).not.toBeNull()
    })

    it('ignores a forged reporter: the report is recorded under the real caller', async () => {
      const { data, error } = await reporter.client
        .from('corrections')
        .insert({ target_type: 'word', target_id: wordId, field: 'bete_word', message: 'x', reporter_id: owner.id })
        .select('reporter_id, owner_id')
        .single()
      expect(error).toBeNull()
      expect(data?.reporter_id).toBe(reporter.id)
      expect(data?.reporter_id).not.toBe(owner.id)
    })

    it('refuses a field that is not on the allow-list, and content that does not exist', async () => {
      expect((await report(reporter, 'word', wordId, 'created_by', { message: 'x' })).error).not.toBeNull()
      expect((await report(reporter, 'word', wordId, 'upvotes', { message: 'x' })).error).not.toBeNull()
      expect((await report(reporter, 'nonsense', wordId, 'description', { message: 'x' })).error).not.toBeNull()
      const missing = await report(reporter, 'resource', '00000000-0000-0000-0000-000000000000', 'title', { message: 'x' })
      expect(missing.error).not.toBeNull()
    })

    it('needs a message or a suggestion, and the suggestion must differ from the text', async () => {
      expect((await report(reporter, 'resource', resourceId, 'title', {})).error).not.toBeNull()
      expect((await report(reporter, 'resource', resourceId, 'title', { message: '   ' })).error).not.toBeNull()
      const same = await report(reporter, 'resource', resourceId, 'title', { suggestion: 'Chant' })
      expect(same.error?.message).toContain('identique')
    })

    it('does not let someone report their own content', async () => {
      const own = await report(owner, 'resource', resourceId, 'title', { message: 'Coquille.' })
      expect(own.error?.message).toContain('directement')
    })

    it('allows one open report per person and field, but several fields and several people', async () => {
      await mustReport(reporter, 'resource', resourceId, 'content_french', { message: 'Pas le bon sens.' })
      const again = await report(reporter, 'resource', resourceId, 'content_french', { message: 'Encore.' })
      expect(again.error).not.toBeNull()

      expect((await report(reporter, 'resource', resourceId, 'title', { message: 'Titre.' })).error).toBeNull()
      expect((await report(stranger, 'resource', resourceId, 'content_french', { message: 'Moi aussi.' })).error).toBeNull()
    })

    it('can target every kind of content', async () => {
      const cases: [string, string, string][] = [
        ['translation', translationId, 'french'],
        ['expression', expressionId, 'french_phrase'],
        ['grammar_rule', ruleId, 'pattern_bete'],
        ['resource', resourceId, 'content_literal'],
      ]
      for (const [type, id, field] of cases) {
        const c = await mustReport(stranger, type, id, field, { message: `signalement ${type}` })
        expect(c.owner_id).toBe(owner.id)
        expect(c.label).toBeTruthy()
      }
    })

    it('links a translation to its word page, and an expression to no page', async () => {
      const t = await mustReport(boss, 'translation', translationId, 'context', { message: 'Contexte ?' })
      expect(t.ref_id).toBe(wordId)
      const e = await mustReport(boss, 'expression', expressionId, 'bete_phrase', { message: 'Orthographe ?' })
      expect(e.ref_id).toBeNull()
    })
  })

  describe('visibility and withdrawing', () => {
    it('is readable by everyone', async () => {
      const c = await mustReport(boss, 'grammar_rule', ruleId, 'description', { message: 'Visible.' })
      const { data } = await anonClient().from('corrections').select('id, message').eq('id', c.id)
      expect(data).toHaveLength(1)
    })

    it('lets the reporter withdraw an open report, but nobody else', async () => {
      const c = await mustReport(boss, 'grammar_rule', ruleId, 'example_french', { message: 'À retirer.' })
      await stranger.client.from('corrections').delete().eq('id', c.id)
      await anonClient().from('corrections').delete().eq('id', c.id)
      expect((await admin.from('corrections').select('id').eq('id', c.id)).data).toHaveLength(1)

      await boss.client.from('corrections').delete().eq('id', c.id)
      expect((await admin.from('corrections').select('id').eq('id', c.id)).data).toEqual([])
    })

    it('lets an admin remove any report', async () => {
      const c = await mustReport(stranger, 'grammar_rule', ruleId, 'example_bete', { message: 'Spam.' })
      await boss.client.from('corrections').delete().eq('id', c.id)
      expect((await admin.from('corrections').select('id').eq('id', c.id)).data).toEqual([])
    })

    it('does not let a client edit a report directly (no UPDATE policy)', async () => {
      const c = await mustReport(reporter, 'expression', expressionId, 'french_literal', { message: 'x' })
      await reporter.client.from('corrections').update({ status: 'accepted', suggestion: 'piraté' }).eq('id', c.id)
      const { data } = await admin.from('corrections').select('status, suggestion').eq('id', c.id).single()
      expect(data).toMatchObject({ status: 'open', suggestion: null })
    })
  })

  describe('accepting', () => {
    const valueOf = async (table: string, id: string, column: string) =>
      (must(await admin.from(table).select(column).eq('id', id).single(), 'value') as unknown as Record<string, string | null>)[column]

    it('lets the author accept: the suggestion replaces the field and the report is closed', async () => {
      const c = await mustReport(reporter, 'resource', resourceId, 'content_bete', { suggestion: 'vers un corrigé\nvers deux' })
      const res = await owner.client.rpc('accept_correction', { p_id: c.id })
      expect(res.error).toBeNull()

      expect(await valueOf('community_texts', resourceId, 'content_bete')).toBe('vers un corrigé\nvers deux')
      const { data } = await admin.from('corrections').select('status, resolved_by, resolved_at').eq('id', c.id).single()
      expect(data).toMatchObject({ status: 'accepted', resolved_by: owner.id })
      expect(data?.resolved_at).toBeTruthy()
    })

    it('applies to every kind of content', async () => {
      const t = await mustReport(reporter, 'translation', translationId, 'french', { suggestion: 'consommer' })
      expect((await owner.client.rpc('accept_correction', { p_id: t.id })).error).toBeNull()
      expect(await valueOf('lexicon_translations', translationId, 'french')).toBe('consommer')
      // the translator's primary translation follows (top_french is kept in step by its trigger)
      expect(await valueOf('lexicon', wordId, 'top_french')).toBe('consommer')

      const e = await mustReport(reporter, 'expression', expressionId, 'bete_phrase', { suggestion: 'ɓa lɛ ko' })
      expect((await owner.client.rpc('accept_correction', { p_id: e.id })).error).toBeNull()
      expect(await valueOf('expressions', expressionId, 'bete_phrase')).toBe('ɓa lɛ ko')

      const r = await mustReport(reporter, 'grammar_rule', ruleId, 'pattern_bete', { suggestion: 'a li ko' })
      expect((await owner.client.rpc('accept_correction', { p_id: r.id })).error).toBeNull()
      expect(await valueOf('grammar_rules', ruleId, 'pattern_bete')).toBe('a li ko')

      const w = await mustReport(reporter, 'word', wordId, 'bete_word', { suggestion: 'ipa-corrigé' })
      expect((await owner.client.rpc('accept_correction', { p_id: w.id })).error).toBeNull()
      expect(await valueOf('lexicon', wordId, 'bete_word')).toBe('ipa-corrigé')
    })

    it('lets an admin accept a correction on anyone’s content', async () => {
      const c = await mustReport(reporter, 'resource', resourceId, 'content_french', { suggestion: 'fr un corrigé\nfr deux' })
      expect((await boss.client.rpc('accept_correction', { p_id: c.id })).error).toBeNull()
      expect(await valueOf('community_texts', resourceId, 'content_french')).toBe('fr un corrigé\nfr deux')
    })

    it('refuses everyone else, anonymous callers included, and changes nothing', async () => {
      const c = await mustReport(reporter, 'resource', resourceId, 'title', { suggestion: 'Titre piraté' })
      expect((await stranger.client.rpc('accept_correction', { p_id: c.id })).error?.code).toBe('42501')
      expect((await reporter.client.rpc('accept_correction', { p_id: c.id })).error?.code).toBe('42501')
      expect((await anonClient().rpc('accept_correction', { p_id: c.id })).error).not.toBeNull()

      expect(await valueOf('community_texts', resourceId, 'title')).toBe('Chant')
      expect((await admin.from('corrections').select('status').eq('id', c.id).single()).data?.status).toBe('open')
    })

    it('only an admin can accept a correction on content with no known author', async () => {
      const c = await mustReport(reporter, 'word', ownerlessWordId, 'description', { suggestion: 'Nouvelle description.' })
      expect(c.owner_id).toBeNull()
      expect((await owner.client.rpc('accept_correction', { p_id: c.id })).error?.code).toBe('42501')
      expect((await boss.client.rpc('accept_correction', { p_id: c.id })).error).toBeNull()
      expect(await valueOf('lexicon', ownerlessWordId, 'description')).toBe('Nouvelle description.')
    })

    it('refuses a correction that proposes nothing, and one that is already closed', async () => {
      const flag = await mustReport(reporter, 'expression', expressionId, 'bete_phonetic', { message: 'Je doute.' })
      expect((await owner.client.rpc('accept_correction', { p_id: flag.id })).error?.message).toContain('ne propose pas')

      const c = await mustReport(reporter, 'expression', expressionId, 'french_phrase', { suggestion: 'il pleut fort' })
      expect((await owner.client.rpc('accept_correction', { p_id: c.id })).error).toBeNull()
      expect((await owner.client.rpc('accept_correction', { p_id: c.id })).error?.message).toContain('déjà été traitée')
    })

    it('refuses a stale correction: the text changed since the report', async () => {
      const c = await mustReport(reporter, 'grammar_rule', ruleId, 'example_french', { suggestion: 'je mange du manioc' })
      await admin.from('grammar_rules').update({ example_french: 'je mange du poisson' }).eq('id', ruleId)

      const res = await owner.client.rpc('accept_correction', { p_id: c.id })
      expect(res.error?.message).toContain('a changé')
      expect(await valueOf('grammar_rules', ruleId, 'example_french')).toBe('je mange du poisson')
      expect((await admin.from('corrections').select('status').eq('id', c.id).single()).data?.status).toBe('open')
    })

    it('does not leave the field half-changed when the update is refused by the database', async () => {
      // a second translation with the same French would break the word's uniqueness rule
      const other = must(
        await admin.from('lexicon_translations').insert({ lexicon_id: wordId, french: 'avaler', created_by: owner.id }).select('id').single(),
        'second translation',
      ).id as string
      const c = await mustReport(reporter, 'translation', other, 'french', { suggestion: 'consommer' })
      const res = await owner.client.rpc('accept_correction', { p_id: c.id })
      expect(res.error).not.toBeNull()
      expect(await valueOf('lexicon_translations', other, 'french')).toBe('avaler')
      expect((await admin.from('corrections').select('status').eq('id', c.id).single()).data?.status).toBe('open')
    })
  })

  describe('rejecting', () => {
    it('lets the author or an admin reject, and nobody else', async () => {
      const a = await mustReport(reporter, 'resource', resourceId, 'content_literal', { message: 'Pas clair.' })
      expect((await stranger.client.rpc('reject_correction', { p_id: a.id })).error?.code).toBe('42501')
      expect((await reporter.client.rpc('reject_correction', { p_id: a.id })).error?.code).toBe('42501')
      expect((await owner.client.rpc('reject_correction', { p_id: a.id })).error).toBeNull()
      expect((await admin.from('corrections').select('status, resolved_by').eq('id', a.id).single()).data).toMatchObject({
        status: 'rejected', resolved_by: owner.id,
      })

      const b = await mustReport(stranger, 'resource', resourceId, 'content_literal', { message: 'Encore.' })
      expect((await boss.client.rpc('reject_correction', { p_id: b.id })).error).toBeNull()
      expect((await owner.client.rpc('reject_correction', { p_id: b.id })).error?.message).toContain('déjà été traitée')
    })

    it('does not change the content', async () => {
      const before = (await admin.from('community_texts').select('content_literal').eq('id', resourceId).single()).data
      const c = await mustReport(reporter, 'resource', resourceId, 'content_literal', { suggestion: 'littéral piraté' })
      await owner.client.rpc('reject_correction', { p_id: c.id })
      expect((await admin.from('community_texts').select('content_literal').eq('id', resourceId).single()).data).toEqual(before)
    })

    it('frees the slot: the reporter can report the same field again after a rejection', async () => {
      const c = await mustReport(reporter, 'expression', expressionId, 'bete_phonetic', { message: 'Deuxième avis.' })
      await owner.client.rpc('reject_correction', { p_id: c.id })
      expect((await report(reporter, 'expression', expressionId, 'bete_phonetic', { message: 'Troisième avis.' })).error).toBeNull()
    })
  })

  describe('lifecycle', () => {
    it('removes the reports about content that is deleted', async () => {
      const id = await word(owner.id)
      const w = await mustReport(reporter, 'word', id, 'description', { message: 'À supprimer.' })
      const t = (await admin.from('lexicon_translations').select('id').eq('lexicon_id', id).limit(1).single()).data!.id as string
      const tr = await mustReport(reporter, 'translation', t, 'french', { message: 'Idem.' })

      await admin.from('lexicon').delete().eq('id', id)
      const { data } = await admin.from('corrections').select('id').in('id', [w.id, tr.id])
      expect(data).toEqual([])
    })
  })
})
