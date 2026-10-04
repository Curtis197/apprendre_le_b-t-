// web/__tests__/rls/resource-word-links-pilot.test.ts
// Automated pilot of the whole feature: the real editor functions build the drafts of the five
// Notre Père verses, each verse is saved through save_resource_verse, then read back like a reader would.
import { beforeAll, describe, expect, it } from 'vitest'
import { getResourceWords, saveVerse } from '../../lib/word-blocks-data'
import { readerTokens, splitWords, type Unit } from '../../lib/word-blocks'
import { attachUnits, derive, editWords, initDraft, setLink, toSave, type VerseDraft } from '../../lib/word-link-editor'
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
  const drafts = BETE.map((b, i) => initDraft(i + 1, b, LIT[i], undefined))
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

  it('links words to lexicon entries, adds a spelling, and links a marker in another resource', async () => {
    // 1. Create owner's lexicon entries
    const cGhehi = await owner.client.rpc('create_lexicon_entry', {
      p_spelling: 'ghèhi-wu', p_ipa: null, p_dialect: 'western', p_kind: 'word', p_pos: ['noun'],
      p_description: null, p_notes: null, p_synonyms: null, p_lemma: null,
      p_senses: [{ french: 'ciel', context: null }, { french: 'haut', context: null }],
      p_example: null,
    })
    expect(cGhehi.error).toBeNull()
    const ghehiId = (cGhehi.data as { id: string }).id
    const ghehiSenses = (cGhehi.data as { entry: { senses: { id: string; french: string }[] } }).entry.senses
    const cielSenseId = ghehiSenses.find(s => s.french === 'ciel')!.id

    const cWu = await owner.client.rpc('create_lexicon_entry', {
      p_spelling: 'wu', p_ipa: null, p_dialect: 'western', p_kind: 'word', p_pos: ['verb'],
      p_description: null, p_notes: null, p_synonyms: null, p_lemma: null,
      p_senses: [{ french: 'est', context: null }, { french: 'lieu', context: null }],
      p_example: null,
    })
    expect(cWu.error).toBeNull()
    const wuId = (cWu.data as { id: string }).id
    const wuSenses = (cWu.data as { entry: { senses: { id: string; french: string }[] } }).entry.senses
    const estSenseId = wuSenses.find(s => s.french === 'est')!.id

    // 2. Save verse 1 again with those blocks carrying lexicon_id and translation_id
    let d1 = buildDrafts()[0]
    // In verse 1: "wu" is index 4, "ghèhi-wu" is index 6
    d1 = setLink(d1, '4', wuId, estSenseId)
    d1 = setLink(d1, '6', ghehiId, cielSenseId)

    const p1 = toSave(d1)
    const saveRes = await saveVerse(owner.client, {
      resourceId: id, verseNo: 1, baseBete: d1.baseBete, baseLiteral: d1.baseLiteral,
      beteLine: p1.beteLine, literalLine: p1.literalLine, blocks: p1.blocks,
    })
    expect(saveRes.error).toBeNull()

    // 3. Add spelling ghéhi-wu
    const spRes = await owner.client.rpc('add_lexicon_spelling', {
      p_lexicon_id: ghehiId, p_spelling: 'ghéhi-wu',
    })
    if (spRes.error) {
      expect(spRes.error.message).toContain('spelling_exists')
    } else {
      expect(spRes.error).toBeNull()
    }

    // 4. Assert anonymously: find_lexicon_candidates returns exact / near
    const exactCand = await anonClient().rpc('find_lexicon_candidates', {
      p_text: 'ghéhi-wu', p_dialect: null, p_kind: null, p_limit: 25,
    })
    expect(exactCand.error).toBeNull()
    const exactRows = exactCand.data as { match_kind: string; entry: { id: string } }[]
    expect(exactRows.some(r => r.entry.id === ghehiId && r.match_kind === 'exact')).toBe(true)

    const nearCand = await anonClient().rpc('find_lexicon_candidates', {
      p_text: 'rhéhi-wu', p_dialect: null, p_kind: null, p_limit: 25,
    })
    expect(nearCand.error).toBeNull()
    const nearRows = nearCand.data as { match_kind: string; entry: { id: string } }[]
    expect(nearRows.some(r => r.entry.id === ghehiId && r.match_kind === 'near')).toBe(true)

    // get_resource_words returns for the ghèhi-wu block lex.spellings containing ghéhi-wu and lex.sense_id equal to cielSenseId
    const anonVerses = await getResourceWords(anonClient(), id)
    const v1 = anonVerses.find(v => v.verse_no === 1)!
    const bGhehi = v1.blocks.find(b => b.bete_idx.includes(6))!
    expect(bGhehi.lex).not.toBeNull()
    expect(bGhehi.lex!.id).toBe(ghehiId)
    expect(bGhehi.lex!.senseId).toBe(cielSenseId)
    expect(bGhehi.lex!.spellings).toContain('ghéhi-wu')

    // 5. Flag ye as a marker in a second resource
    const res2 = must(
      await admin
        .from('community_texts')
        .insert({
          title: 'Second resource', type: 'story',
          content_bete: 'en ye yi', content_literal: 'je venir',
          created_by: owner.id,
        })
        .select('id')
        .single(),
      'resource 2',
    ).id as string

    const cMarker = await owner.client.rpc('create_lexicon_entry', {
      p_spelling: 'ye', p_ipa: null, p_dialect: 'western', p_kind: 'marker', p_pos: null,
      p_description: null, p_notes: null, p_synonyms: null, p_lemma: null,
      p_senses: [], p_example: null,
    })
    expect(cMarker.error).toBeNull()
    const markerId = (cMarker.data as { id: string }).id

    // save verse with is_marker: true, solo: true, lexicon_id
    const saveM = await owner.client.rpc('save_resource_verse', {
      p_resource: res2, p_verse: 1, p_base_bete: 'en ye yi', p_base_literal: 'je venir',
      p_bete_line: null, p_literal_line: null,
      p_blocks: [
        { bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false },
        { bete_idx: [1], gloss_idx: [], is_marker: true, solo: true, lexicon_id: markerId },
        { bete_idx: [2], gloss_idx: [1], is_marker: false, solo: false },
      ],
    })
    expect(saveM.error).toBeNull()

    // call set_marker_meaning as 'other' user (first fill is open to anyone)
    const setM = await other.client.rpc('set_marker_meaning', {
      p_lexicon_id: markerId, p_type: 'temps', p_meaning: 'futur', p_french: 'aller + verbe',
    })
    expect(setM.error).toBeNull()

    // read back anonymously
    const v2Words = await getResourceWords(anonClient(), res2)
    const mBlock = v2Words[0].blocks.find(b => b.is_marker)!
    expect(mBlock.marker).toEqual({ type: 'temps', meaning: 'futur', french: 'aller + verbe' })
    expect(mBlock.lex?.kind).toBe('marker')
  })

  it('reads the verses back for an anonymous reader, in the original word order, with the linked particles', async () => {
    const verses = await getResourceWords(anonClient(), id)
    expect(verses).toHaveLength(5)
    expect(verses.every(v => !v.stale)).toBe(true)
    const totalBlocks = verses.reduce((sum, v) => sum + v.blocks.length, 0)
    expect(totalBlocks).toBe(84)

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
