import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.resolve(__dirname, '../../supabase/migrations')
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()

// The migrations from the course-review hardening on are meant to be re-runnable (the SQL editor is
// how they reach production), so a policy must be dropped before it is created. Older files predate that.
const REPEATABLE_FROM = '20260930000000'

describe('migration files', () => {
  it('each version is used once (the Supabase CLI refuses duplicates)', () => {
    const versions = files.map(f => f.split('_')[0])
    const duplicated = versions.filter((v, i) => versions.indexOf(v) !== i)
    expect(duplicated).toEqual([])
  })

  it('every policy created since the hardening migration is dropped first', () => {
    const unguarded: string[] = []
    for (const file of files.filter(f => f >= REPEATABLE_FROM)) {
      const sql = readFileSync(path.join(dir, file), 'utf8')
      for (const m of sql.matchAll(/^create policy\s+("[^"]+"|\w+)\s+on\s+([\w.]+)/gim)) {
        const guard = new RegExp(String.raw`drop policy if exists\s+${m[1]}\s+on\s+${m[2].replace('.', String.raw`\.`)}`, 'i')
        if (!guard.test(sql.slice(0, m.index))) unguarded.push(`${file}: ${m[1]} on ${m[2]}`)
      }
    }
    expect(unguarded).toEqual([])
  })
})
