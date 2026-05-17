// lib/lemmatizer.ts

const IRREGULARS: Record<string, string> = {
  // être
  suis: 'être', es: 'être', est: 'être', sommes: 'être', êtes: 'être', sont: 'être',
  étais: 'être', était: 'être', étions: 'être', étiez: 'être', étaient: 'être',
  serai: 'être', seras: 'être', sera: 'être', serons: 'être', serez: 'être', seront: 'être',
  été: 'être',
  // avoir
  ai: 'avoir', as: 'avoir', avons: 'avoir', avez: 'avoir', ont: 'avoir',
  avais: 'avoir', avait: 'avoir', avions: 'avoir', aviez: 'avoir', avaient: 'avoir',
  aurai: 'avoir', auras: 'avoir', aura: 'avoir', aurons: 'avoir', aurez: 'avoir', auront: 'avoir',
  eu: 'avoir',
  // aller
  vais: 'aller', vas: 'aller', va: 'aller', allons: 'aller', allez: 'aller', vont: 'aller',
  allais: 'aller', allait: 'aller', allaient: 'aller',
  irai: 'aller', iras: 'aller', ira: 'aller', irons: 'aller', irez: 'aller', iront: 'aller',
  // faire
  fais: 'faire', fait: 'faire', faisons: 'faire', faites: 'faire', font: 'faire',
  faisais: 'faire', faisait: 'faire', faisaient: 'faire',
  ferai: 'faire', feras: 'faire', fera: 'faire', ferons: 'faire', ferez: 'faire', feront: 'faire',
  // pouvoir
  peux: 'pouvoir', peut: 'pouvoir', pouvons: 'pouvoir', pouvez: 'pouvoir', peuvent: 'pouvoir',
  pouvais: 'pouvoir', pouvait: 'pouvoir', pouvaient: 'pouvoir',
  // vouloir
  veux: 'vouloir', veut: 'vouloir', voulons: 'vouloir', voulez: 'vouloir', veulent: 'vouloir',
  voulais: 'vouloir', voulait: 'vouloir', voulaient: 'vouloir',
  // venir
  viens: 'venir', vient: 'venir', venons: 'venir', venez: 'venir', viennent: 'venir',
  venais: 'venir', venait: 'venir', venaient: 'venir',
  // voir
  vois: 'voir', voit: 'voir', voyons: 'voir', voyez: 'voir', voient: 'voir',
  voyais: 'voir', voyait: 'voir', voyaient: 'voir',
  // irregular plurals
  chevaux: 'cheval', journaux: 'journal', travaux: 'travail', yeux: 'œil',
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'de',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'si', 'que', 'qui', 'dont', 'où',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
  'me', 'te', 'se', 'lui', 'y', 'en', 'ce', 'cet', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'nos', 'vos', 'leur', 'leurs',
  'pas', 'plus', 'très', 'bien', 'tout', 'aussi', 'même', 'ne',
])

// [suffix, replacement, minStemLength] — longest first
const RULES: [string, string, number][] = [
  ['issaient', 'ir', 3],
  ['issions',  'ir', 3],
  ['issons',   'ir', 3],
  ['issiez',   'ir', 3],
  ['issait',   'ir', 3],
  ['issant',   'ir', 3],
  ['issez',    'ir', 3],
  ['issent',   'ir', 3],
  ['aient',    'er', 3],
  ['eront',    'er', 3],
  ['erons',    'er', 3],
  ['erez',     'er', 3],
  ['ées',      'er', 3],
  ['ée',       'er', 3],
  ['ant',      'er', 3],
  ['ait',      'er', 3],
  ['ons',      'er', 3],
  ['és',       'er', 3],
  ['é',        'er', 3],
  ['ez',       'er', 3],
  ['es',       'e',  4],
  ['s',        '',   4],
]

export function lemmatize(word: string): string {
  const w = word.toLowerCase().replace(/[.,!?;:«»"''']/g, '').trim()
  if (!w || w.length <= 2) return w
  if (STOPWORDS.has(w)) return w
  if (w in IRREGULARS) return IRREGULARS[w]

  for (const [suffix, replacement, minStem] of RULES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= minStem) {
      return w.slice(0, w.length - suffix.length) + replacement
    }
  }

  return w
}
