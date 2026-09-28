import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias from tsconfig.json.
    alias: { '@': path.resolve(fileURLToPath(new URL('.', import.meta.url))) },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    // RLS tests need a running local Supabase: run them with `npm run test:rls`.
    exclude: ['__tests__/rls/**', 'node_modules/**'],
  },
})
