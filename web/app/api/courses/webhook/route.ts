import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const stripeKey = process.env.STRIPE_SECRET_KEY

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuration Supabase incomplète.' }, { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Handle Stripe Webhooks
  if (stripeKey && webhookSecret && sig) {
    const stripe = new Stripe(stripeKey)
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signature invalide'
      return NextResponse.json({ error: `Erreur webhook Stripe: ${message}` }, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.order_id
      const courseId = session.metadata?.course_id
      const userId = session.metadata?.user_id || session.client_reference_id

      if (courseId && userId) {
        // 1. Update order status to completed
        if (orderId) {
          await adminClient
            .from('course_orders')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', orderId)
        }

        // 2. Insert enrollment (converges on exact same enrollments table from Phase 1)
        await adminClient.from('enrollments').upsert(
          {
            user_id: userId,
            course_id: courseId,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,course_id' },
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
