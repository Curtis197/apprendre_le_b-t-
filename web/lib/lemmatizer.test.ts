// Run with: npx tsx web/lib/lemmatizer.test.ts
import assert from 'node:assert/strict'
import { lemmatize } from './lemmatizer.js'

const cases: [string, string][] = [
  // Irregular verbs
  ['sommes', 'être'],
  ['étaient', 'être'],
  ['avons', 'avoir'],
  ['avait', 'avoir'],
  ['vont', 'aller'],
  ['font', 'faire'],
  // -er verb inflections
  ['aimons', 'aimer'],
  ['aimait', 'aimer'],
  ['aimaient', 'aimer'],
  ['aimé', 'aimer'],
  ['aimée', 'aimer'],
  ['aimant', 'aimer'],
  // -ir verb inflections
  ['finissons', 'finir'],
  ['finissait', 'finir'],
  // Noun plurals
  ['chevaux', 'cheval'],
  ['enfants', 'enfant'],
  ['femmes', 'femme'],
  // Stopwords (unchanged)
  ['le', 'le'],
  ['et', 'et'],
  ['nous', 'nous'],
  // Already base form (unchanged)
  ['aimer', 'aimer'],
  ['père', 'père'],
  ['eau', 'eau'],
]

let passed = 0
for (const [input, expected] of cases) {
  const result = lemmatize(input)
  assert.strictEqual(result, expected, `lemmatize('${input}') → '${result}', expected '${expected}'`)
  passed++
}
console.log(`✓ ${passed}/${cases.length} tests passed`)
