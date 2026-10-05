import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

describe('funding UI hidden for the moment', () => {
  it('no longer mounts the donate form on the home and contribute pages', () => {
    for (const f of ['app/page.tsx', 'app/contribute/page.tsx']) {
      expect(read(f), f).not.toMatch(/DonateForm/)
    }
  })

  it('keeps the code and the Stripe routes so it can come back', () => {
    for (const f of [
      'components/DonateForm.tsx',
      'components/FundingWidget.tsx',
      'lib/donation.ts',
      'app/api/donate/checkout/route.ts',
      'app/api/donate/webhook/route.ts',
    ]) {
      expect(existsSync(path.join(root, f)), f).toBe(true)
    }
  })
})
