import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/rls/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
