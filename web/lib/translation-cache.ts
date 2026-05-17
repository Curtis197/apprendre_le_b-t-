import 'server-only'
// lib/translation-cache.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { TranslationResult } from './types'
import { createHash } from 'crypto'

export function hashInput(input: string, dialect: string): string {
  return createHash('sha256').update(`${dialect}:${input.trim().toLowerCase()}`).digest('hex')
}

export async function getCached(
  client: SupabaseClient,
  input: string,
  dialect: string
): Promise<TranslationResult | null> {
  const hash = hashInput(input, dialect)
  const { data } = await client
    .from('translation_cache')
    .select('result')
    .eq('input_hash', hash)
    .maybeSingle()
  if (!data) return null
  const result = data.result
  // Basic shape validation before trusting cached data
  if (!result || typeof result !== 'object' || typeof result.sentence !== 'string') {
    return null
  }
  return { ...(result as TranslationResult), cached: true }
}

export async function setCached(
  client: SupabaseClient,
  input: string,
  dialect: string,
  result: TranslationResult
): Promise<void> {
  const hash = hashInput(input, dialect)
  await client.from('translation_cache').upsert(
    { input_hash: hash, input_text: input.trim(), result },
    { onConflict: 'input_hash' }
  )
}
