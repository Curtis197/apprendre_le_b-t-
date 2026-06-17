export type DialectKey = 'western' | 'northern' | 'eastern'

export const DIALECTS: Record<DialectKey, { name: string }> = {
  western:  { name: 'Bhété Occidental (Guiberoua)' },
  northern: { name: 'Bhété Septentrional (Gagnoa)' },
  eastern:  { name: 'Bhété Oriental (Daloa)' },
}

export const DIALECT_KEYS = Object.keys(DIALECTS) as DialectKey[]
export const DEFAULT_DIALECT: DialectKey = 'western'
