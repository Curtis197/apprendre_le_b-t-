import { describe, expect, it } from 'vitest'
import { admin, anonClient, createUser } from './helpers'

describe('local Supabase smoke test', () => {
  it('creates a confirmed user whose profile row is auto-created', async () => {
    const user = await createUser('smoke')
    const { data, error } = await admin.from('profiles').select('id').eq('id', user.id).single()
    expect(error).toBeNull()
    expect(data?.id).toBe(user.id)
  })

  it('lets the signed-in user read their own profile through RLS', async () => {
    const user = await createUser('smoke')
    const { data } = await user.client.from('profiles').select('id').eq('id', user.id)
    expect(data).toHaveLength(1)
  })

  it('hides private profiles from anonymous clients', async () => {
    const user = await createUser('smoke')
    const { data } = await anonClient().from('profiles').select('id').eq('id', user.id)
    expect(data).toEqual([])
  })
})
