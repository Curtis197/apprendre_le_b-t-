// The IPA / African-orthography version of a resource text is linked to the Latin text by position: line n of
// one is line n of the other (the gutter numbers), and word i of an IPA line is word i of its Latin line.
// That only holds when both lines have the same number of words, so every verse gets a status.
import { nonEmptyLines, splitWords } from '@/lib/word-blocks'

export type IpaStatus = 'none' | 'ok' | 'words-differ' | 'line-missing'

export interface IpaVerse {
  /** 1-based number of the non-empty Latin line. */
  no: number
  status: IpaStatus
  /** The IPA line, when there is one (even if its words cannot be linked). */
  line: string | null
  /** The IPA words, only when they line up one to one with the Latin words. */
  words: string[] | null
  beteWords: number
  ipaWords: number
}

export function alignIpa(beteText: string, ipaText?: string | null): IpaVerse[] {
  const bete = nonEmptyLines(beteText)
  const used = Boolean(ipaText && ipaText.trim() !== '')
  const ipa = used ? nonEmptyLines(ipaText as string) : []
  return bete.map((b, i): IpaVerse => {
    const beteWords = splitWords(b).length
    const base = { no: i + 1, beteWords }
    if (!used) return { ...base, status: 'none', line: null, words: null, ipaWords: 0 }
    const line = ipa[i]
    if (line === undefined) return { ...base, status: 'line-missing', line: null, words: null, ipaWords: 0 }
    const words = splitWords(line)
    return words.length === beteWords
      ? { ...base, status: 'ok', line, words, ipaWords: words.length }
      : { ...base, status: 'words-differ', line, words: null, ipaWords: words.length }
  })
}

/** At least one verse has an IPA line: the reader then offers the Latin / API switch. */
export function hasIpa(verses: IpaVerse[]): boolean {
  return verses.some(v => v.status === 'ok' || v.status === 'words-differ')
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The hint under the form field. Never blocks: the contributor can publish anyway. */
export function describeIpa(verses: IpaVerse[], ipaLineCount: number): { ok: boolean; message: string } | null {
  if (!verses.some(v => v.status !== 'none')) return null
  const parts: string[] = []
  if (ipaLineCount !== verses.length) {
    parts.push(`Le texte API a ${plural(ipaLineCount, 'ligne', 'lignes')}, le texte latin en a ${verses.length}.`)
  }
  const differ = verses.filter(v => v.status === 'words-differ')
  for (const v of differ.slice(0, 3)) parts.push(`ligne ${v.no} : ${plural(v.beteWords, 'mot', 'mots')} en latin, ${v.ipaWords} en API.`)
  if (differ.length > 3) parts.push(`… et ${differ.length - 3} autre${differ.length - 3 > 1 ? 's' : ''} ligne${differ.length - 3 > 1 ? 's' : ''}.`)
  if (parts.length === 0) return { ok: true, message: 'Les mots API sont reliés à leurs mots latins, ligne par ligne.' }
  return { ok: false, message: parts.join(' ') + ' Les lignes qui ne correspondent pas restent affichées en latin mot à mot.' }
}
