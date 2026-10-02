import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ALREADY_REPORTED_MESSAGE,
  acceptCorrection,
  createCorrection,
  getCorrectionsToReview,
  getMyOpenCorrections,
  getOpenCorrections,
  rejectCorrection,
  withdrawCorrection,
} from '../../lib/corrections-mutations'
import { admin, createUser, makeAdmin, must, type TestUser } from './helpers'

// The functions the interface calls, against the real database with real signed-in clients.
describe('corrections through the app helpers', () => {
  let owner: TestUser
  let reporter: TestUser
  let boss: TestUser
  let resourceId: string

  beforeAll(async () => {
    ;[owner, reporter, boss] = await Promise.all([createUser('ch-owner'), createUser('ch-reporter'), createUser('ch-boss')])
    await makeAdmin(boss.id)
    resourceId = must(
      await admin
        .from('community_texts')
        .insert({ title: 'Chant', type: 'song', content_bete: 'vers un', content_french: 'fr un', created_by: owner.id })
        .select('id')
        .single(),
      'resource',
    ).id as string
  })

  afterAll(async () => {
    await admin.from('community_texts').delete().eq('id', resourceId)
  })

  it('reports, lists, then lets the author accept: the text is replaced', async () => {
    const created = await createCorrection(
      reporter.client,
      { targetType: 'resource', targetId: resourceId, field: 'content_bete', kind: 'spelling', message: 'Faute.', suggestion: 'vers un corrigé' },
      'vers un',
    )
    expect(created.error).toBeNull()

    const open = await getOpenCorrections(reporter.client, 'resource', resourceId)
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({ field: 'content_bete', original: 'vers un', suggestion: 'vers un corrigé', owner_id: owner.id })

    // it shows up where the author looks for work, and in the reporter's own list
    expect((await getCorrectionsToReview(owner.client, owner.id, false)).map(c => c.id)).toContain(open[0].id)
    expect((await getMyOpenCorrections(reporter.client, reporter.id)).map(c => c.id)).toContain(open[0].id)
    expect((await getCorrectionsToReview(reporter.client, reporter.id, false)).map(c => c.id)).not.toContain(open[0].id)

    expect((await acceptCorrection(owner.client, open[0].id)).error).toBeNull()
    const text = (await admin.from('community_texts').select('content_bete').eq('id', resourceId).single()).data
    expect(text?.content_bete).toBe('vers un corrigé')
    expect(await getOpenCorrections(reporter.client, 'resource', resourceId)).toEqual([])
  })

  it('shows the database’s French message when someone who may not accept tries', async () => {
    await createCorrection(
      reporter.client,
      { targetType: 'resource', targetId: resourceId, field: 'title', kind: 'other', suggestion: 'Autre titre' },
      'Chant',
    )
    const [c] = await getOpenCorrections(reporter.client, 'resource', resourceId)
    const res = await acceptCorrection(reporter.client, c.id)
    expect(res.error).toContain('auteur du contenu')

    // an admin can, and the author can reject
    expect((await rejectCorrection(owner.client, c.id)).error).toBeNull()
    expect((await acceptCorrection(boss.client, c.id)).error).toContain('déjà été traitée')
  })

  it('explains a second report on the same field, and a report on your own content', async () => {
    const input = { targetType: 'resource' as const, targetId: resourceId, field: 'content_french', kind: 'mistranslation' as const, message: 'Pas ça.' }
    expect((await createCorrection(reporter.client, input)).error).toBeNull()
    expect((await createCorrection(reporter.client, input)).error).toBe(ALREADY_REPORTED_MESSAGE)
    expect((await createCorrection(owner.client, input)).error).toContain('directement')
  })

  it('lets the reporter withdraw, and refuses to withdraw someone else’s report', async () => {
    const [c] = await getOpenCorrections(reporter.client, 'resource', resourceId)
    expect((await withdrawCorrection(owner.client, c.id)).error).toContain('impossible')
    expect((await withdrawCorrection(reporter.client, c.id)).error).toBeNull()
    expect(await getOpenCorrections(reporter.client, 'resource', resourceId)).toEqual([])
  })

  it('shows an admin every open correction, not only the ones on their own content', async () => {
    await createCorrection(reporter.client, { targetType: 'resource', targetId: resourceId, field: 'title', kind: 'other', message: 'Titre ?' })
    const forBoss = await getCorrectionsToReview(boss.client, boss.id, true)
    expect(forBoss.some(c => c.target_id === resourceId)).toBe(true)
    const forOwner = await getCorrectionsToReview(owner.client, owner.id, false)
    expect(forOwner.every(c => c.owner_id === owner.id)).toBe(true)
    await admin.from('corrections').delete().eq('target_id', resourceId)
  })
})
