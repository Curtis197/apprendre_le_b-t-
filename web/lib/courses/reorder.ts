interface Positioned {
  id: string
  position: number
}

/** Moves one item a step up (-1) or down (1) and renumbers every position from zero. */
export function moveItem<T extends Positioned>(items: T[], id: string, direction: -1 | 1): T[] {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const from = sorted.findIndex(item => item.id === id)
  const to = from + direction
  if (from !== -1 && to >= 0 && to < sorted.length) {
    ;[sorted[from], sorted[to]] = [sorted[to], sorted[from]]
  }
  return sorted.map((item, index) => ({ ...item, position: index }))
}

/** The minimal set of position updates that turns `before` into `after`. */
export function changedPositions<T extends Positioned>(
  before: T[],
  after: T[],
): { id: string; position: number }[] {
  const previous = new Map(before.map(item => [item.id, item.position]))
  return after
    .filter(item => previous.get(item.id) !== item.position)
    .map(item => ({ id: item.id, position: item.position }))
}

export function nextPosition(items: { position: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map(item => item.position)) + 1
}
