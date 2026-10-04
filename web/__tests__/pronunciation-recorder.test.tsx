import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'

describe('PronunciationRecorder (initial state)', () => {
  it('keeps the course wording by default', () => {
    const html = renderToStaticMarkup(<PronunciationRecorder onSend={() => {}} />)
    expect(html).toContain('Enregistrer ma prononciation')
  })
  it('takes the start label from the caller', () => {
    const html = renderToStaticMarkup(<PronunciationRecorder onSend={() => {}} startLabel="Enregistrer la prononciation" />)
    expect(html).toContain('Enregistrer la prononciation')
    expect(html).not.toContain('ma prononciation')
  })
  it('can be disabled', () => {
    expect(renderToStaticMarkup(<PronunciationRecorder onSend={() => {}} disabled />)).toContain('disabled')
  })
})
