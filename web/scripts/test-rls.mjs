// Runs the RLS suite against the local Supabase stack.
// Usage (from web/): npm run test:rls [-- <vitest filter>]
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shell = process.platform === 'win32'

let status
try {
  status = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell,
  })
} catch {
  status = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: path.resolve(repoRoot, '..', 'traduction bété'),
    encoding: 'utf8',
    shell,
  })
}

const env = { ...process.env }
for (const line of status.split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
  if (match) env[match[1]] = match[2]
}

const result = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.rls.config.ts', ...process.argv.slice(2)],
  { cwd: path.join(repoRoot, 'web'), env, stdio: 'inherit', shell },
)
process.exit(result.status ?? 1)
