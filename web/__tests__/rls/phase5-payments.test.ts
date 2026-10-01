import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 5 paid courses & orders RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let orderId: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p5-teacher'),
      createUser('p5-learner'),
      createUser('p5-outsider'),
      createUser('p5-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Set course as paid
    await admin.from('courses').update({ access: 'paid', price_cents: 2900, currency: 'eur' }).eq('id', seed.course.id)

    // Seed a pending order with the service role: users may only insert orders for an
    // already-approved course at the exact price, and never with a gateway_ref (see
    // course-review-hardening.test.ts for those rules).
    const order = must(
      await admin.from('course_orders').insert({
        user_id: learner.id,
        course_id: seed.course.id,
        amount_cents: 2900,
        currency: 'eur',
        payment_rail: 'stripe',
        gateway_ref: `cs_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        status: 'pending',
      }).select('id').single(),
      'create course order',
    )
    orderId = order.id
  })

  describe('paid_approved & course_orders RLS', () => {
    it('allows admin to approve paid course sale', async () => {
      const res = await boss.client
        .from('courses')
        .update({ paid_approved: true })
        .eq('id', seed.course.id)

      expect(res.error).toBeNull()

      const { data } = await learner.client.from('courses').select('paid_approved').eq('id', seed.course.id).single()
      expect(data?.paid_approved).toBe(true)
    })

    it('allows learner to read their own course order', async () => {
      const { data, error } = await learner.client
        .from('course_orders')
        .select('amount_cents, payment_rail, status')
        .eq('id', orderId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].amount_cents).toBe(2900)
    })

    it('denies outsider from reading learner course order', async () => {
      const { data } = await outsider.client
        .from('course_orders')
        .select('id')
        .eq('id', orderId)

      expect(data).toEqual([])
    })

    it('denies regular user from updating course order status directly', async () => {
      await learner.client
        .from('course_orders')
        .update({ status: 'completed' })
        .eq('id', orderId)

      // RLS denies update because status update requires admin or service role
      const { data } = await admin.from('course_orders').select('status').eq('id', orderId).single()
      expect(data?.status).toBe('pending')
    })
  })
})
