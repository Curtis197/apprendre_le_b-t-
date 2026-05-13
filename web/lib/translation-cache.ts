// lib/translation-cache.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { TranslationResult } from './types'
import { createHash } from 'crypto'

export function hashInput(input: string): string {
  return createHash('sha256').update(input.trim().toLowerCase()).digest('hex')
}

export async function getCached(
  client: SupabaseClient,
  input: string
): Promise<TranslationResult | null> {
  const hash = hashInput(input)
  const { data } = await client
    .from('translation_cache')
    .select('result')
    .eq('input_hash', hash)
    .maybeSingle()
  if (!data) return null
  return { ...(data.result as TranslationResult), cached: true }
}

export async function setCached(
  client: SupabaseClient,
  input: string,
  result: TranslationResult
): Promise<void> {
  const hash = hashInput(input)
  await client.from('translation_cache').upsert(
    { input_hash: hash, input_text: input.trim(), result },
    { onConflict: 'input_hash' }
  )
}
