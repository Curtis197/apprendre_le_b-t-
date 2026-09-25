import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

function need(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(`Missing ${names[0]}. Run the suite with: npm run test:rls`)
}

const URL_ = need('API_URL')
const ANON_KEY = need('ANON_KEY', 'PUBLISHABLE_KEY')
const SERVICE_KEY = need('SERVICE_ROLE_KEY', 'SECRET_KEY')

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** Service-role client: bypasses RLS. Use only for fixtures and verification. */
export const admin: SupabaseClient = createClient(URL_, SERVICE_KEY, options)

export function anonClient(): SupabaseClient {
  return createClient(URL_, ANON_KEY, options)
}

export const uid = () => randomUUID().slice(0, 8)

export function must<T>(
  res: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (res.error || res.data === null) {
    throw new Error(`${what}: ${res.error?.message ?? 'no data returned'}`)
  }
  return res.data
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${uid()}@test.local`
  const password = 'test-password-123'
  const client = createClient(URL_, ANON_KEY, options)
  // signUp rather than admin.createUser: Supabase CLI 2.75's local GoTrue rejects the
  // HS256 service-role key on /auth/v1/admin/* ("signing method HS256 is invalid").
  // supabase/config.toml has enable_confirmations = false, so signUp confirms the user
  // and returns a live session for the client.
  const signedUp = await client.auth.signUp({ email, password })
  if (signedUp.error || !signedUp.data.user || !signedUp.data.session) {
    throw new Error(`createUser: ${signedUp.error?.message ?? 'no user or session returned'}`)
  }
  return { id: signedUp.data.user.id, email, client }
}

export async function makeAdmin(userId: string): Promise<void> {
  const { error } = await admin.from('user_roles').insert({ user_id: userId, role: 'admin' })
  if (error) throw new Error(`makeAdmin: ${error.message}`)
}
