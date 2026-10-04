import { describe, expect, it } from 'vitest'
import { postSaveDestination, verseStatus } from '../lib/word-link-editor'

describe('verseStatus (colour code of a verse tab)', () => {
  it('is "todo" when nothing was ever saved for the verse', () => {
    expect(verseStatus({ dirty: false, hasSaved: false, stale: false })).toBe('todo')
  })

  it('is "saved" when the verse is linked and saved with no unsaved change', () => {
    expect(verseStatus({ dirty: false, hasSaved: true, stale: false })).toBe('saved')
  })

  it('is "modified" as soon as the verse has unsaved changes, whatever it was before', () => {
    expect(verseStatus({ dirty: true, hasSaved: false, stale: false })).toBe('modified')
    expect(verseStatus({ dirty: true, hasSaved: true, stale: false })).toBe('modified')
    expect(verseStatus({ dirty: true, hasSaved: false, stale: true })).toBe('modified')
  })

  it('is "stale" (à revoir) when the saved links no longer match the text and nothing was redone', () => {
    expect(verseStatus({ dirty: false, hasSaved: false, stale: true })).toBe('stale')
  })

  it('a stale verse that has no saved links of its own never shows as saved', () => {
    expect(verseStatus({ dirty: false, hasSaved: true, stale: true })).toBe('stale')
  })
})

describe('postSaveDestination (where the form goes after saving the text)', () => {
  const ready = { bete: 'a b\nc d', literal: 'x y\nz w' }

  it('"view" always goes to the resource', () => {
    expect(postSaveDestination('r1', ready.bete, ready.literal, 'view')).toBe('/resources/r1')
  })

  it('"link" always goes to the linking page, which explains what to fix when the text is not ready', () => {
    expect(postSaveDestination('r1', ready.bete, ready.literal, 'link')).toBe('/resources/r1/relier')
    expect(postSaveDestination('r1', 'a b', null, 'link')).toBe('/resources/r1/relier')
  })

  it('"link-if-ready" goes to step 2 when the mot à mot lines up with the text', () => {
    expect(postSaveDestination('r1', ready.bete, ready.literal, 'link-if-ready')).toBe('/resources/r1/relier')
  })

  it('"link-if-ready" skips step 2 when there is no mot à mot or the line counts differ', () => {
    expect(postSaveDestination('r1', 'a b', null, 'link-if-ready')).toBe('/resources/r1')
    expect(postSaveDestination('r1', 'a b', '   ', 'link-if-ready')).toBe('/resources/r1')
    expect(postSaveDestination('r1', 'a\nb\nc', 'x\ny', 'link-if-ready')).toBe('/resources/r1')
  })
})
