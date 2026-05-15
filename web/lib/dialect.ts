export type DialectKey = 'western' | 'northern' | 'eastern'

export const DIALECTS: Record<DialectKey, { name: string }> = {
  western:  { name: 'Bété Occidental (Guiberoua)' },
  northern: { name: 'Bété Septentrional (Gagnoa)' },
  eastern:  { name: 'Bété Oriental (Daloa)' },
}

export const DIALECT_KEYS = Object.keys(DIALECTS) as DialectKey[]
export const DEFAULT_DIALECT: DialectKey = 'western'
