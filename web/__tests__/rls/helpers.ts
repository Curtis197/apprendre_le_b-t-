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

export interface Seed {
  course: { id: string; slug: string }
  section: { id: string }
  preview: { id: string }
  locked: { id: string }
}

/** Creates a course with one section and two text lessons (one preview, one locked) via the service role. */
export async function seedCourse(
  ownerId: string,
  overrides: { status?: string; access?: string } = {},
): Promise<Seed> {
  const course = must(
    await admin
      .from('courses')
      .insert({
        owner_id: ownerId,
        title: 'Cours de test',
        slug: `t-${uid()}`,
        status: 'published',
        ...overrides,
      })
      .select('id, slug')
      .single(),
    'seed course',
  )
  const section = must(
    await admin
      .from('course_sections')
      .insert({ course_id: course.id, title: 'Section 1', position: 0 })
      .select('id')
      .single(),
    'seed section',
  )
  const lessonBase = { section_id: section.id, course_id: course.id, kind: 'text' }
  const preview = must(
    await admin
      .from('lessons')
      .insert({ ...lessonBase, title: 'Aperçu', position: 0, is_preview: true })
      .select('id')
      .single(),
    'seed preview lesson',
  )
  const locked = must(
    await admin
      .from('lessons')
      .insert({ ...lessonBase, title: 'Verrouillée', position: 1, is_preview: false })
      .select('id')
      .single(),
    'seed locked lesson',
  )
  const contents = await admin.from('lesson_contents').upsert([
    { lesson_id: preview.id, body_md: 'contenu aperçu' },
    { lesson_id: locked.id, body_md: 'contenu verrouillé' },
  ])
  if (contents.error) throw new Error(`seed contents: ${contents.error.message}`)
  return { course, section, preview, locked }
}
