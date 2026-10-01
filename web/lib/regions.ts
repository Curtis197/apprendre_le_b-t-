// lib/regions.ts — the closed list of regions a resource can come from.
//
// These are the three Bhété dialect areas the app already models (see lib/dialect.ts, which
// spells it "Guiberoua"; existing data uses that spelling too), plus "Autre". The same list is enforced in the database: community_texts_region_check
// (supabase/migrations/20260930000004_community_texts_region_check.sql). Change both together.

export const RESOURCE_REGIONS = [
  { value: 'Guiberoua', label: 'Guiberoua' },
  { value: 'Gagnoa', label: 'Gagnoa' },
  { value: 'Daloa', label: 'Daloa' },
  { value: 'Autre', label: 'Autre / je ne sais pas' },
] as const

export type ResourceRegion = (typeof RESOURCE_REGIONS)[number]['value']

export function isResourceRegion(value: string): value is ResourceRegion {
  return RESOURCE_REGIONS.some(r => r.value === value)
}
