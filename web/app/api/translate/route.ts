// app/api/translate/route.ts
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { translate } from '@/lib/translator'
import { getCached, setCached } from '@/lib/translation-cache'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
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

  const client = createServiceClient()

  // Check cache first
  const cached = await getCached(client, input)
  if (cached) {
    return Response.json(cached)
  }

  // Translate
  const result = await translate(client, input)

  // Store in cache
  await setCached(client, input, result)

  return Response.json(result)
}
