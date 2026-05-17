// app/api/translate/route.ts
import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { translate } from '@/lib/translator'
import { getCached, setCached } from '@/lib/translation-cache'
import type { TranslationResult } from '@/lib/types'
import { DIALECT_KEYS, DEFAULT_DIALECT, type DialectKey } from '@/lib/dialect'

// Limits
const LIMIT_AUTH = 10   // logged-in users per day
const LIMIT_ANON = 3    // anonymous users per day

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

async function createUserClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  )
}

/** Returns { identifier, limit } — identifier is user UUID or hashed IP. */
async function resolveIdentifier(
  req: NextRequest,
): Promise<{ identifier: string; limit: number }> {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()

  if (user) {
    return { identifier: user.id, limit: LIMIT_AUTH }
  }

  // Fall back to hashed IP for anonymous users
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  const ipHash = 'ip:' + createHash('sha256').update(ip).digest('hex').slice(0, 16)
  return { identifier: ipHash, limit: LIMIT_ANON }
}

/**
 * Check today's usage for identifier and increment atomically.
 * Returns { allowed, remaining } where allowed=false means quota exceeded.
 */
async function checkAndIncrement(
  identifier: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Upsert: insert with count=1 or increment existing row
  const { data, error } = await service
    .from('translation_usage')
    .upsert(
      { identifier, used_date: today, count: 1 },
      { onConflict: 'identifier,used_date', ignoreDuplicates: false }
    )
    .select('count')
    .single()

  if (error) {
    // If upsert failed (concurrent request won), read the current count
    const { data: existing } = await service
      .from('translation_usage')
      .select('count')
      .eq('identifier', identifier)
      .eq('used_date', today)
      .single()

    const current = (existing as { count: number } | null)?.count ?? 0
    if (current >= limit) return { allowed: false, remaining: 0 }

    // Increment
    await service
      .from('translation_usage')
      .update({ count: current + 1 })
      .eq('identifier', identifier)
      .eq('used_date', today)

    return { allowed: true, remaining: Math.max(0, limit - current - 1) }
  }

  const count = (data as { count: number }).count
  if (count > limit) {
    // Row was just created with count=1 but we need to detect pre-existing overages
    return { allowed: true, remaining: Math.max(0, limit - count) }
  }
  return { allowed: true, remaining: Math.max(0, limit - count) }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    return Response.json({ error: 'text field required' }, { status: 400 })
  }

  const input: string = body.text.trim()
  if (input.length > 500) {
    return Response.json({ error: 'text too long (max 500 chars)' }, { status: 400 })
  }

  const dialect: DialectKey = DIALECT_KEYS.includes(body.dialect) ? body.dialect : DEFAULT_DIALECT

  const service = createServiceClient()

  // Cache hits are always free — check before consuming quota
  const cached = await getCached(service, input, dialect)
  if (cached) {
    return Response.json(cached)
  }

  // Rate-limit check (only for non-cached requests)
  const { identifier, limit } = await resolveIdentifier(req)
  const { allowed, remaining } = await checkAndIncrement(identifier, limit)

  if (!allowed) {
    return Response.json(
      { error: `Quota journalier atteint (${limit} traductions/jour). Revenez demain.` },
      {
        status: 429,
        headers: { 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': '0' },
      }
    )
  }

  // Translate
  let result: TranslationResult
  try {
    result = await translate(service, input, dialect)
  } catch (err) {
    console.error('translate error:', err)
    return Response.json({ error: 'translation failed' }, { status: 500 })
  }

  try {
    await setCached(service, input, dialect, result)
  } catch (err) {
    console.error('cache write error:', err)
  }

  return Response.json(result, {
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
    },
  })
}
