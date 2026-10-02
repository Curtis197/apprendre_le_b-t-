// web/__tests__/rls/lexicon-translations.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, uid, type TestUser } from './helpers'

async function seedWord(extra: Record<string, unknown> = {}) {
  const tag = uid()
  return must(
    await admin
      .from('lexicon')
      .insert({
        bete_word: `ɓa-${tag}`,
        bete_phonetic: `ba-${tag}`,
        french_candidates: [],
        top_french: `manger-${tag}`,
        probability: 1,
        pos: ['verb'],
        ...extra,
      })
      .select('id, top_french')
      .single(),
    'seed word',
  )
}

const tr = (lexiconId: string, userId: string, extra: Record<string, unknown> = {}) => ({
  lexicon_id: lexiconId,
  created_by: userId,
  french: 'se nourrir',
  ...extra,
})

const topFrench = async (id: string) =>
  (await admin.from('lexicon').select('top_french').eq('id', id).single()).data?.top_french

describe('lexicon: translations, description, guard', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser

  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([
      createUser('lex-alice'),
      createUser('lex-bob'),
      createUser('lex-boss'),
    ])
    await makeAdmin(boss.id)
  })

  describe('translations', () => {
    it('gives every new word a first translation copied from top_french', async () => {
      const w = await seedWord()
      const { data } = await admin.from('lexicon_translations').select('french, position').eq('lexicon_id', w.id)
      expect(data).toEqual([{ french: w.top_french, position: 0 }])
    })

    it('lets a signed-in user add a translation with a context, readable by everyone', async () => {
      const w = await seedWord()
      const row = must(
        await alice.client
          .from('lexicon_translations')
          .insert(tr(w.id, alice.id, { context: 'au sens de : se nourrir' }))
          .select('id, position, author_name, context')
          .single(),
        'alice adds',
      )
      expect(row.position).toBe(1)
      expect(row.context).toBe('au sens de : se nourrir')
      const { data: profile } = await admin.from('profiles').select('name').eq('id', alice.id).single()
      expect(row.author_name).toBe(profile!.name)

      const { data } = await anonClient().from('lexicon_translations').select('id').eq('id', row.id)
      expect(data).toHaveLength(1)
    })

    it('ignores a client-supplied position and author name', async () => {
      const w = await seedWord()
      const row = must(
        await alice.client
          .from('lexicon_translations')
          .insert(tr(w.id, alice.id, { position: 99, author_name: 'Faux nom' }))
          .select('position, author_name')
          .single(),
        'alice adds',
      )
      expect(row.position).toBe(1)
      expect(row.author_name).not.toBe('Faux nom')
    })

    it('refuses anonymous inserts and inserts in someone else’s name', async () => {
      const w = await seedWord()
      expect((await anonClient().from('lexicon_translations').insert(tr(w.id, alice.id))).error).not.toBeNull()
      expect((await bob.client.from('lexicon_translations').insert(tr(w.id, alice.id))).error).not.toBeNull()
    })

    it('rejects blank and over-long text', async () => {
      const w = await seedWord()
      const ins = (extra: Record<string, unknown>) =>
        alice.client.from('lexicon_translations').insert(tr(w.id, alice.id, extra))
      expect((await ins({ french: '   ' })).error).not.toBeNull()
      expect((await ins({ french: 'x'.repeat(201) })).error).not.toBeNull()
      expect((await ins({ context: 'x'.repeat(301) })).error).not.toBeNull()
    })

    it('rejects a duplicate that differs only by case or spacing, but allows the same word in another context', async () => {
      const w = await seedWord()
      must(await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id, { french: 'Voyager' })).select('id').single(), 'first')
      const dup = await bob.client.from('lexicon_translations').insert(tr(w.id, bob.id, { french: '  voyager ' }))
      expect(dup.error?.code).toBe('23505')
      const other = await bob.client
        .from('lexicon_translations')
        .insert(tr(w.id, bob.id, { french: 'voyager', context: 'en parlant d’un bateau' }))
      expect(other.error).toBeNull()
    })

    it('lets the author edit text and context but nothing else', async () => {
      const w = await seedWord()
      const other = await seedWord()
      const row = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id)).select('id, author_name, created_at').single(),
        'create',
      )
      await alice.client
        .from('lexicon_translations')
        .update({
          french: 'dévorer',
          context: 'familier',
          lexicon_id: other.id,
          created_by: bob.id,
          position: 7,
          author_name: 'Faux nom',
        })
        .eq('id', row.id)
      const { data } = await admin.from('lexicon_translations').select('*').eq('id', row.id).single()
      expect(data?.french).toBe('dévorer')
      expect(data?.context).toBe('familier')
      expect(data?.lexicon_id).toBe(w.id)
      expect(data?.created_by).toBe(alice.id)
      expect(data?.position).toBe(1)
      expect(data?.author_name).toBe(row.author_name)
      expect(data?.created_at).toBe(row.created_at)
    })

    it('does not let someone else edit or delete it; the author and an admin can delete', async () => {
      const w = await seedWord()
      const mine = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id)).select('id').single(),
        'create',
      )
      await bob.client.from('lexicon_translations').update({ french: 'piraté' }).eq('id', mine.id)
      await bob.client.from('lexicon_translations').delete().eq('id', mine.id)
      await anonClient().from('lexicon_translations').delete().eq('id', mine.id)
      expect((await admin.from('lexicon_translations').select('french').eq('id', mine.id)).data).toEqual([
        { french: 'se nourrir' },
      ])

      await alice.client.from('lexicon_translations').delete().eq('id', mine.id)
      expect((await admin.from('lexicon_translations').select('id').eq('id', mine.id)).data).toEqual([])

      const other = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id, { french: 'autre' })).select('id').single(),
        'create',
      )
      await boss.client.from('lexicon_translations').delete().eq('id', other.id)
      expect((await admin.from('lexicon_translations').select('id').eq('id', other.id)).data).toEqual([])
    })

    it('keeps top_french on the primary translation, and never blanks it', async () => {
      const w = await seedWord()
      const added = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id)).select('id').single(),
        'add',
      )
      expect(await topFrench(w.id)).toBe(w.top_french)

      // admin removes the seeded primary → alice's translation becomes primary
      await boss.client.from('lexicon_translations').delete().eq('lexicon_id', w.id).eq('position', 0)
      expect(await topFrench(w.id)).toBe('se nourrir')

      // removing the last translation leaves top_french alone (the translator reads it)
      await alice.client.from('lexicon_translations').delete().eq('id', added.id)
      expect(await topFrench(w.id)).toBe('se nourrir')
    })

    it('removes translations when the word is deleted', async () => {
      const w = await seedWord()
      await admin.from('lexicon').delete().eq('id', w.id)
      expect((await admin.from('lexicon_translations').select('id').eq('lexicon_id', w.id)).data).toEqual([])
    })
  })

  describe('lexicon update guard', () => {
    it('lets a signed-in user write the description and records the edit time', async () => {
      const w = await seedWord()
      const before = (await admin.from('lexicon').select('updated_at').eq('id', w.id).single()).data!.updated_at
      await new Promise(r => setTimeout(r, 20))
      const res = await alice.client.from('lexicon').update({ description: 'Prendre un repas.' }).eq('id', w.id)
      expect(res.error).toBeNull()
      const { data } = await admin.from('lexicon').select('description, updated_at').eq('id', w.id).single()
      expect(data?.description).toBe('Prendre un repas.')
      expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime())
    })

    it('refuses an over-long description and anonymous edits', async () => {
      const w = await seedWord()
      expect((await alice.client.from('lexicon').update({ description: 'x'.repeat(2001) }).eq('id', w.id)).error).not.toBeNull()
      await anonClient().from('lexicon').update({ description: 'piraté' }).eq('id', w.id)
      expect((await admin.from('lexicon').select('description').eq('id', w.id).single()).data?.description).toBeNull()
    })

    it('does not let a client change the Bété forms, the primary French, the score or validation of a translated word', async () => {
      const w = await seedWord()
      await alice.client
        .from('lexicon')
        .update({ bete_phonetic: 'piraté', bete_word: 'piraté', top_french: 'piraté', upvotes: 50, validated: true, description: 'ok' })
        .eq('id', w.id)
      const { data } = await admin.from('lexicon').select('*').eq('id', w.id).single()
      expect(data?.description).toBe('ok')
      expect(data?.bete_phonetic).toMatch(/^ba-/)
      expect(data?.bete_word).toMatch(/^ɓa-/)
      expect(data?.top_french).toBe(w.top_french)
      expect(data?.upvotes).toBe(0)
      expect(data?.validated).toBe(false)
    })

    it('claims a placeholder: a signed-in user can fill in the Bété forms of an untranslated word', async () => {
      const tag = uid()
      const ph = must(
        await admin
          .from('lexicon')
          .insert({
            bete_word: `_pending_${tag}`,
            bete_phonetic: '',
            french_candidates: [],
            top_french: `chien-${tag}`,
            probability: 1,
          })
          .select('id')
          .single(),
        'seed placeholder',
      )
      const res = await alice.client
        .from('lexicon')
        .update({
          bete_phonetic: 'ɓɔ',
          bete_word: `ɓɔ-${tag}`,
          pos: ['noun'],
          description: 'Animal domestique',
          top_french: 'piraté',
          created_by: bob.id,
          upvotes: 9,
          validated: true,
        })
        .eq('id', ph.id)
      expect(res.error).toBeNull()
      const { data } = await admin.from('lexicon').select('*').eq('id', ph.id).single()
      expect(data?.bete_phonetic).toBe('ɓɔ')
      expect(data?.bete_word).toBe(`ɓɔ-${tag}`)
      expect(data?.description).toBe('Animal domestique')
      expect(data?.top_french).toBe(`chien-${tag}`)
      expect(data?.created_by).toBe(alice.id)
      expect(data?.source).toBe('contributed')
      expect(data?.upvotes).toBe(0)
      expect(data?.validated).toBe(false)

      // once translated, the forms are frozen again
      await bob.client.from('lexicon').update({ bete_phonetic: 'piraté' }).eq('id', ph.id)
      expect((await admin.from('lexicon').select('bete_phonetic').eq('id', ph.id).single()).data?.bete_phonetic).toBe('ɓɔ')
    })

    it('keeps voting working: the vote function may write the score the guard protects', async () => {
      const w = await seedWord()
      const { error } = await bob.client.rpc('vote', { p_table_name: 'lexicon', p_row_id: w.id, p_direction: 'up' })
      expect(error).toBeNull()
      expect((await admin.from('lexicon').select('upvotes').eq('id', w.id).single()).data?.upvotes).toBe(1)
    })
  })
})
