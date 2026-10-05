import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

function sources(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap(name => {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name === '.next') return []
    if (statSync(path.join(root, rel)).isDirectory()) return sources(rel)
    return /\.(ts|tsx)$/.test(name) ? [rel] : []
  })
}

describe('voting UI is gone', () => {
  it('deleted the vote buttons and the pending list', () => {
    expect(existsSync(path.join(root, 'components/VoteButtons.tsx'))).toBe(false)
    expect(existsSync(path.join(root, 'components/PendingContributions.tsx'))).toBe(false)
  })

  it('has no import of them and no vote call outside the tests', () => {
    for (const f of [...sources('app'), ...sources('components'), ...sources('lib')]) {
      const src = read(f)
      expect(src, f).not.toMatch(/VoteButtons|PendingContributions/)
      expect(src, f).not.toMatch(/rpc\(\s*['"]vote['"]|increment_upvotes/)
    }
  })

  it('shows no vote count on the forum, grammar and resources pages', () => {
    for (const f of ['app/forum/page.tsx', 'app/forum/[id]/page.tsx', 'app/grammar/page.tsx', 'app/resources/page.tsx']) {
      expect(read(f), f).not.toContain('▲')
    }
    expect(read('app/forum/[id]/page.tsx')).not.toContain('LikeAction')
  })

  it('no longer orders by votes', () => {
    expect(read('app/grammar/page.tsx')).not.toMatch(/order\(\s*['"]upvotes['"]/)
    expect(read('lib/community.ts')).not.toMatch(/order\(\s*['"]upvotes['"]/)
  })

  it('tells contributors their contribution is available at once', () => {
    const page = read('app/contribute/page.tsx')
    expect(page).not.toMatch(/3 votes|Votez|En attente de validation|Validation communautaire/)
    expect(page).toContain('immédiatement disponibles')
    expect(page).not.toContain('Correction communautaire')
    expect(page).not.toMatch(/soutenez la préservation/)
    expect(read('components/ContributionForm.tsx')).not.toContain('après validation par la communauté')
  })
})
