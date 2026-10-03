// Manual end-to-end check of the mailing pipeline against the LOCAL stack.
// Needs: `supabase start`, `npm run dev` (port 3000), RESEND_API_KEY + CRON_SECRET in web/.env.local.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const to = process.argv[2]
if (!to) throw new Error('Usage: node scripts/mail-live-check.mjs <email>')

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(webDir, '..')

const status = execFileSync('supabase', ['status', '-o', 'env'], { cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32' })
const sb = {}
for (const line of status.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
  if (m) sb[m[1]] = m[2]
}
const envFile = readFileSync(path.join(webDir, '.env.local'), 'utf8')
const cronSecret = /^CRON_SECRET=(.+)$/m.exec(envFile)?.[1]?.trim()
if (!cronSecret) throw new Error('CRON_SECRET missing from web/.env.local')

const admin = createClient(sb.API_URL, sb.SERVICE_ROLE_KEY ?? sb.SECRET_KEY, { auth: { persistSession: false } })

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
let user = list.users.find((u) => u.email === to)
if (!user) {
  const created = await admin.auth.admin.createUser({ email: to, email_confirm: true })
  if (created.error) throw created.error
  user = created.data.user
}

const dedupe = `live-check:${Date.now()}`
const { error } = await admin.from('email_outbox').insert({
  user_id: user.id,
  category: 'weekly_progress',
  template: 'weekly_progress',
  payload: { lessons_completed: 2, courses: [{ title: 'Cours de test', slug: 'test', completed_this_week: 2, completed_total: 2, total_lessons: 6 }] },
  dedupe_key: dedupe,
})
if (error) throw error

const res = await fetch('http://localhost:3000/api/mail/dispatch', { method: 'POST', headers: { Authorization: `Bearer ${cronSecret}` } })
console.log('dispatch →', res.status, await res.json())

const { data: row } = await admin.from('email_outbox').select('status, attempts, last_error').eq('dedupe_key', dedupe).single()
console.log('outbox row →', row)
