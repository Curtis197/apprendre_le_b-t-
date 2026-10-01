import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RESOURCE_REGIONS, isResourceRegion } from '../lib/regions'
import { DIALECTS } from '../lib/dialect'
import { submitCommunityText } from '../lib/community-mutations'

describe('isResourceRegion', () => {
  it('accepts every listed region and nothing else', () => {
    for (const r of RESOURCE_REGIONS) expect(isResourceRegion(r.value)).toBe(true)
    expect(isResourceRegion('Issia')).toBe(false)
    expect(isResourceRegion('gagnoa')).toBe(false) // exact match: the database check is case-sensitive too
    expect(isResourceRegion('')).toBe(false)
  })
})

describe('RESOURCE_REGIONS and the dialects', () => {
  it('lists the area of every dialect, spelled as lib/dialect.ts spells it', () => {
    for (const { name } of Object.values(DIALECTS)) {
      const area = /\(([^)]+)\)/.exec(name)?.[1]
      expect(area, `no area in "${name}"`).toBeTruthy()
      expect(isResourceRegion(area!), `"${area}" is missing from RESOURCE_REGIONS`).toBe(true)
    }
  })
})

describe('submitCommunityText region', () => {
  function fakeClient() {
    const inserted: Record<string, unknown>[] = []
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } }) },
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return { select: () => ({ single: async () => ({ data: { id: 'r1' }, error: null }) }) }
        },
      }),
    } as unknown as SupabaseClient
    return { client, inserted }
  }
  const base = { title: 'Chant', type: 'song' as const, content_bete: 'texte' }

  it('rejects a region outside the list before touching the database', async () => {
    const { client, inserted } = fakeClient()
    const res = await submitCommunityText(client, { ...base, region: 'Issia' })
    expect(res.error).toContain('Région invalide')
    expect(inserted).toHaveLength(0)
  })

  it('saves a listed region, and null when none is chosen', async () => {
    const withRegion = fakeClient()
    await submitCommunityText(withRegion.client, { ...base, region: 'Gagnoa' })
    expect(withRegion.inserted[0].region).toBe('Gagnoa')

    const without = fakeClient()
    await submitCommunityText(without.client, { ...base, region: '  ' })
    expect(without.inserted[0].region).toBeNull()
  })
})
