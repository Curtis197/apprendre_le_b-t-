import { describe, expect, it } from 'vitest'
import { wordBlockingProblem } from '@/lib/contribution'

describe('wordBlockingProblem', () => {
  it('lets a word without an example through', () => {
    expect(wordBlockingProblem({ exampleBete: '', exampleFrench: '  ', recording: false })).toBeNull()
  })
  it('lets a complete example through', () => {
    expect(wordBlockingProblem({ exampleBete: 'Ɓa li', exampleFrench: 'Il mange', recording: false })).toBeNull()
  })
  it('stops half an example sentence', () => {
    expect(wordBlockingProblem({ exampleBete: 'Ɓa li', exampleFrench: '', recording: false })).toContain('laissez les deux champs vides')
  })
  it('stops while a recording is in progress, before anything else', () => {
    expect(wordBlockingProblem({ exampleBete: 'Ɓa li', exampleFrench: '', recording: true })).toContain('enregistrement')
  })
})
