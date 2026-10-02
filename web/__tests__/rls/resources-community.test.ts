import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, type TestUser } from './helpers'

describe('resources: contributor-owned CRUD and comments', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser

  const newText = (userId: string, extra: Record<string, unknown> = {}) => ({
    title: 'Chant du matin',
    type: 'song',
    content_bete: 'vers un\nvers deux',
    created_by: userId,
    ...extra,
  })

  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([
      createUser('res-alice'),
      createUser('res-bob'),
      createUser('res-boss'),
    ])
    await makeAdmin(boss.id)
  })

  describe('resources', () => {
    it('lets a signed-in user publish a resource, visible to everyone at once (no validation)', async () => {
      const row = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id, validated').single(),
        'alice creates',
      )
      expect(row.validated).toBe(true)

      const { data } = await anonClient().from('community_texts').select('id').eq('id', row.id)
      expect(data).toHaveLength(1)
    })

    it('refuses anonymous inserts and inserts in someone else’s name', async () => {
      const anon = await anonClient().from('community_texts').insert(newText(alice.id))
      expect(anon.error).not.toBeNull()

      const spoof = await bob.client.from('community_texts').insert(newText(alice.id))
      expect(spoof.error).not.toBeNull()
    })

    it('ignores a client-supplied score on insert', async () => {
      const row = must(
        await alice.client
          .from('community_texts')
          .insert(newText(alice.id, { upvotes: 99 }))
          .select('upvotes')
          .single(),
        'alice creates with upvotes',
      )
      expect(row.upvotes).toBe(0)
    })

    it('lets the creator edit their resource and records the edit time', async () => {
      const row = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id, updated_at').single(),
        'create',
      )
      await new Promise(r => setTimeout(r, 20))
      const res = await alice.client.from('community_texts').update({ title: 'Chant du soir' }).eq('id', row.id)
      expect(res.error).toBeNull()

      const { data } = await admin.from('community_texts').select('title, updated_at').eq('id', row.id).single()
      expect(data?.title).toBe('Chant du soir')
      expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(new Date(row.updated_at).getTime())
    })

    it('does not let an edit change the owner, the creation date or the score', async () => {
      const row = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id, created_at').single(),
        'create',
      )
      await alice.client
        .from('community_texts')
        .update({ created_by: bob.id, upvotes: 50, created_at: '2001-01-01T00:00:00Z', title: 'Renommé' })
        .eq('id', row.id)

      const { data } = await admin.from('community_texts').select('*').eq('id', row.id).single()
      expect(data?.title).toBe('Renommé')
      expect(data?.created_by).toBe(alice.id)
      expect(data?.upvotes).toBe(0)
      expect(data?.created_at).toBe(row.created_at)
    })

    it('does not let anyone else edit or delete it', async () => {
      const row = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id').single(),
        'create',
      )
      await bob.client.from('community_texts').update({ title: 'Piraté' }).eq('id', row.id)
      await bob.client.from('community_texts').delete().eq('id', row.id)
      await anonClient().from('community_texts').delete().eq('id', row.id)

      const { data } = await admin.from('community_texts').select('title').eq('id', row.id)
      expect(data).toEqual([{ title: 'Chant du matin' }])
    })

    it('lets the creator delete their resource, and an admin delete any', async () => {
      const mine = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id').single(),
        'create',
      )
      await alice.client.from('community_texts').delete().eq('id', mine.id)
      expect((await admin.from('community_texts').select('id').eq('id', mine.id)).data).toEqual([])

      const other = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id').single(),
        'create',
      )
      await boss.client.from('community_texts').delete().eq('id', other.id)
      expect((await admin.from('community_texts').select('id').eq('id', other.id)).data).toEqual([])
    })

    it('keeps voting working: the vote function may write the score the guard protects', async () => {
      const row = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id').single(),
        'create',
      )
      const { error } = await bob.client.rpc('vote', {
        p_table_name: 'community_texts',
        p_row_id: row.id,
        p_direction: 'up',
      })
      expect(error).toBeNull()
      const { data } = await admin.from('community_texts').select('upvotes').eq('id', row.id).single()
      expect(data?.upvotes).toBe(1)
    })

    it('only accepts regions from the closed list', async () => {
      const ok = await alice.client.from('community_texts').insert(newText(alice.id, { region: 'Gagnoa' }))
      expect(ok.error).toBeNull()
      const bad = await alice.client.from('community_texts').insert(newText(alice.id, { region: 'Issia' }))
      expect(bad.error).not.toBeNull()
    })
  })

  describe('comments', () => {
    let resourceId: string

    beforeAll(async () => {
      resourceId = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id').single(),
        'create resource for comments',
      ).id
    })

    const comment = (userId: string, extra: Record<string, unknown> = {}) => ({
      resource_id: resourceId,
      user_id: userId,
      body: 'Je propose une correction.',
      ...extra,
    })

    it('lets any signed-in user comment, and anyone read the comments', async () => {
      const row = must(
        await bob.client.from('resource_comments').insert(comment(bob.id)).select('id').single(),
        'bob comments',
      )
      const { data } = await anonClient().from('resource_comments').select('id').eq('id', row.id)
      expect(data).toHaveLength(1)
    })

    it('refuses anonymous comments and comments in someone else’s name', async () => {
      expect((await anonClient().from('resource_comments').insert(comment(bob.id))).error).not.toBeNull()
      expect((await alice.client.from('resource_comments').insert(comment(bob.id))).error).not.toBeNull()
    })

    it('takes the display name from the profile, not from the client', async () => {
      const { data: profile } = await admin.from('profiles').select('name').eq('id', bob.id).single()
      const row = must(
        await bob.client
          .from('resource_comments')
          .insert(comment(bob.id, { author_name: 'Quelqu’un d’autre' }))
          .select('author_name')
          .single(),
        'bob comments with fake name',
      )
      expect(row.author_name).toBe(profile!.name)
      expect(row.author_name).not.toBe('Quelqu’un d’autre')
    })

    it('rejects empty and over-long comments', async () => {
      expect((await bob.client.from('resource_comments').insert(comment(bob.id, { body: '   ' }))).error).not.toBeNull()
      expect(
        (await bob.client.from('resource_comments').insert(comment(bob.id, { body: 'x'.repeat(2001) }))).error,
      ).not.toBeNull()
    })

    it('lets the author edit the text but nothing else', async () => {
      const row = must(
        await bob.client.from('resource_comments').insert(comment(bob.id)).select('id, author_name').single(),
        'create',
      )
      await bob.client
        .from('resource_comments')
        .update({ body: 'Texte corrigé', user_id: alice.id, author_name: 'Faux nom' })
        .eq('id', row.id)

      const { data } = await admin.from('resource_comments').select('*').eq('id', row.id).single()
      expect(data?.body).toBe('Texte corrigé')
      expect(data?.user_id).toBe(bob.id)
      expect(data?.author_name).toBe(row.author_name)
    })

    it('does not let someone else edit or delete a comment', async () => {
      const row = must(
        await bob.client.from('resource_comments').insert(comment(bob.id)).select('id').single(),
        'create',
      )
      await alice.client.from('resource_comments').update({ body: 'Piraté' }).eq('id', row.id)
      await alice.client.from('resource_comments').delete().eq('id', row.id)
      const { data } = await admin.from('resource_comments').select('body').eq('id', row.id)
      expect(data).toEqual([{ body: 'Je propose une correction.' }])
    })

    it('lets the author delete their comment, and an admin delete any', async () => {
      const mine = must(
        await bob.client.from('resource_comments').insert(comment(bob.id)).select('id').single(),
        'create',
      )
      await bob.client.from('resource_comments').delete().eq('id', mine.id)
      expect((await admin.from('resource_comments').select('id').eq('id', mine.id)).data).toEqual([])

      const other = must(
        await bob.client.from('resource_comments').insert(comment(bob.id)).select('id').single(),
        'create',
      )
      await boss.client.from('resource_comments').delete().eq('id', other.id)
      expect((await admin.from('resource_comments').select('id').eq('id', other.id)).data).toEqual([])
    })

    it('removes a resource’s comments when the resource is deleted', async () => {
      const res = must(
        await alice.client.from('community_texts').insert(newText(alice.id)).select('id').single(),
        'create',
      )
      const c = must(
        await bob.client
          .from('resource_comments')
          .insert({ resource_id: res.id, user_id: bob.id, body: 'Bravo' })
          .select('id')
          .single(),
        'comment',
      )
      await alice.client.from('community_texts').delete().eq('id', res.id)
      expect((await admin.from('resource_comments').select('id').eq('id', c.id)).data).toEqual([])
    })
  })
})
