import { describe, expect, it } from 'vitest'
import { changedPositions, moveItem, nextPosition } from '../lib/courses/reorder'

const items = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 },
]

describe('moveItem', () => {
  it('moves an item down by swapping with its neighbour', () => {
    expect(moveItem(items, 'a', 1)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
      { id: 'c', position: 2 },
    ])
  })

  it('moves an item up', () => {
    expect(moveItem(items, 'c', -1).map(i => i.id)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the order unchanged at the edges and for unknown ids', () => {
    expect(moveItem(items, 'a', -1).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(moveItem(items, 'c', 1).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(moveItem(items, 'zzz', 1).map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('renumbers positions from zero, closing gaps', () => {
    const gappy = [
      { id: 'a', position: 0 },
      { id: 'b', position: 5 },
      { id: 'c', position: 9 },
    ]
    expect(moveItem(gappy, 'zzz', 1).map(i => i.position)).toEqual([0, 1, 2])
  })

  it('keeps extra properties and does not mutate the input', () => {
    const rich = [
      { id: 'a', position: 0, title: 'A' },
      { id: 'b', position: 1, title: 'B' },
    ]
    const moved = moveItem(rich, 'a', 1)
    expect(moved[1]).toEqual({ id: 'a', position: 1, title: 'A' })
    expect(rich[0]).toEqual({ id: 'a', position: 0, title: 'A' })
  })
})

describe('changedPositions', () => {
  it('returns only the items whose position changed', () => {
    const after = moveItem(items, 'a', 1)
    expect(changedPositions(items, after)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ])
  })

  it('returns nothing when no position changed', () => {
    expect(changedPositions(items, moveItem(items, 'a', -1))).toEqual([])
  })
})

describe('nextPosition', () => {
  it('returns one past the highest position, or 0 for an empty list', () => {
    expect(nextPosition([])).toBe(0)
    expect(nextPosition(items)).toBe(3)
    expect(nextPosition([{ position: 7 }, { position: 2 }])).toBe(8)
  })
})
