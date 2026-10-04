// web/__tests__/rls/resource-word-links-pilot.test.ts
// Automated pilot of the whole feature: the real editor functions build the drafts of the five
// Notre Père verses, each verse is saved through save_resource_verse, then read back like a reader would.
import { beforeAll, describe, expect, it } from 'vitest'
import { getResourceWords, saveVerse } from '../../lib/word-blocks-data'
import { readerTokens, splitWords, type Unit } from '../../lib/word-blocks'
import { attachUnits, derive, editWords, initDraft, toSave, type VerseDraft } from '../../lib/word-link-editor'
import { admin, anonClient, createUser, must, type TestUser } from './helpers'

const BETE = [
  'A diba Lago ô wu mä ghèhi-wu nikpa wuo ni ghlimani na ngli',
  "Na'a komanon ni ghle glô sê wa zoua mä ghéhi-wu sê en yibhää gba wa kä sibhä mää dudu wu zumen",
  'Nya anyi ziê a lilê',
  "Sê a'a tatini a bhia a'a nyinyo li gbô yii Yaya tatini sibha a'a nyinyo li a gbô yi",
  'Téa anyi yi-tatini a ni ti nyinyo li men bhlini maa sè anyi Sataa a mentenon ngli diba na yizé en men kämaniè enmen tèemen enmen ghliyè kwadrekwadrenon Amen',
]
const LIT = [
  'Notre Père Dieu qui est là-bas au ciel les gens tous que élève ton nom',
  'Ton commandement que arrive terre comme ils font là-bas au ciel comme tu veux ordonne ils vont aussi ici en bas faire',
  "Donne nous aujourd'hui de nourriture",
  'Comme nous laissons nos amis leur mauvaise chose problème pardon laisse aussi nos mauvaise chose nos problème',
  'Ne nous laisse nous ne pas mauvaise chose dedans tomber mais enlève nous Satan son envoyé bouche père toi seul toi commande toi puissant toi grand éternellement Amen',
]
const FR = [
  'Notre Père qui es aux cieux, que ton nom soit sanctifié',
  'Que ton règne vienne, que ta volonté soit faite sur la terre comme au ciel',
  'Donne-nous aujourd’hui notre pain de ce jour',
  'Pardonne-nous nos offenses comme nous pardonnons aussi à ceux qui nous ont offensés',
  'Ne nous soumets pas à la tentation, mais délivre-nous du mal. Amen',
]

const unitAt = (d: VerseDraft, first: number): Unit => derive(d).bu.find(u => u.idx[0] === first)!

/** The drafts as the contributor would leave them in the editor. */
function buildDrafts(): VerseDraft[] {
  const drafts = BETE.map((b, i) => initDraft(i + 1, b, LIT[i], undefined, {}))
  // verse 4: the two particles attached to the word they belong to
  drafts[3] = attachUnits(attachUnits(drafts[3], 'b', 9, 2), 'b', 18, 11)
  // verse 5: "en men" attached then corrected into the single word "enmen"
  const attached = attachUnits(drafts[4], 'b', 21, 20)
  const res = editWords(attached, 'b', unitAt(attached, 20), ['enmen'])
  if (!('draft' in res)) throw new Error(res.error)
  drafts[4] = res.draft
  return drafts
}

describe('resource word links: Notre Père pilot', () => {
  let owner: TestUser
  let other: TestUser
  let id: string

  beforeAll(async () => {
    ;[owner, other] = await Promise.all([createUser('wlp-owner'), createUser('wlp-other')])
    id = must(
      await admin
        .from('community_texts')
        .insert({
          title: 'Notre Père', type: 'song',
          content_bete: BETE.join('\n'), content_literal: LIT.join('\n'), content_french: FR.join('\n'),
          created_by: owner.id,
        })
        .select('id')
        .single(),
      'seed resource',
    ).id as string
  })

  it('saves the five verses as the contributor', async () => {
    const drafts = buildDrafts()
    for (const d of drafts) {
      expect(derive(d).balanced, `verse ${d.verseNo} balanced`).toBe(true)
      const p = toSave(d)
      const res = await saveVerse(owner.client, {
        resourceId: id, verseNo: d.verseNo, baseBete: d.baseBete, baseLiteral: d.baseLiteral,
        beteLine: p.beteLine, literalLine: p.literalLine, blocks: p.blocks,
      })
      expect(res.error, `verse ${d.verseNo} save`).toBeNull()
    }
  })

  it('reads the verses back for an anonymous reader, in the original word order, with the linked particles', async () => {
    const verses = await getResourceWords(anonClient(), id)
    expect(verses).toHaveLength(5)
    expect(verses.every(v => !v.stale)).toBe(true)

    const v4 = verses.find(v => v.verse_no === 4)!
    const tokens = readerTokens(v4)
    expect(tokens.map(t => t.t)).toEqual(splitWords(BETE[3]))
    const tatini = tokens.find(t => t.t === 'tatini')!
    const yii = tokens.find(t => t.t === 'yii')!
    expect(tokens.indexOf(tatini)).toBeLessThan(tokens.indexOf(yii))
    expect(yii.bid).toBe(tatini.bid)
    expect(tatini.gloss).toBe('laissons')

    const v5 = verses.find(v => v.verse_no === 5)!
    expect(v5.bete_line).toContain('enmen')
    expect(v5.bete_line).not.toContain('en men')

    const text = must(await admin.from('community_texts').select('content_bete').eq('id', id).single(), 'text')
    const lines = (text.content_bete as string).split('\n')
    expect(lines.slice(0, 4)).toEqual(BETE.slice(0, 4))
    expect(lines[4]).toBe(BETE[4].replace('en men', 'enmen'))
  })

  it('refuses a save from anyone but the contributor', async () => {
    const d = buildDrafts()[0]
    const p = toSave(d)
    const res = await saveVerse(other.client, {
      resourceId: id, verseNo: 1, baseBete: d.baseBete, baseLiteral: d.baseLiteral,
      beteLine: p.beteLine, literalLine: p.literalLine, blocks: p.blocks,
    })
    // saveVerse maps the database code to a French message; check the raw rpc for the code itself
    expect(res.error).not.toBeNull()
    const raw = await other.client.rpc('save_resource_verse', {
      p_resource: id, p_verse: 1, p_base_bete: d.baseBete, p_base_literal: d.baseLiteral,
      p_bete_line: null, p_literal_line: null, p_blocks: p.blocks,
    })
    expect(raw.error?.message).toContain('not_owner')
  })

  it('makes only the edited verse stale when the resource text changes afterwards', async () => {
    const edited = LIT[0] + ' encore'
    const lits = [...LIT]
    lits[0] = edited
    const { error } = await admin.from('community_texts').update({ content_literal: lits.join('\n') }).eq('id', id)
    expect(error).toBeNull()
    const verses = await getResourceWords(anonClient(), id)
    expect(verses.map(v => [v.verse_no, v.stale])).toEqual([[1, true], [2, false], [3, false], [4, false], [5, false]])
    expect(verses.find(v => v.verse_no === 1)!.blocks).toEqual([])
    expect(verses.filter(v => !v.stale).every(v => v.blocks.length > 0)).toBe(true)
  })
})
