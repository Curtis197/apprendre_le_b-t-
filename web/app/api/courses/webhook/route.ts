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

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe n’est pas configuré sur le serveur.' }, { status: 500 })
  }
  if (!sig) {
    return NextResponse.json({ error: 'Signature Stripe manquante.' }, { status: 400 })
  }

  // Handle Stripe Webhooks
  {
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

      // Only fulfil paid sessions; an unpaid/async session must not unlock the course.
      if (courseId && userId && session.payment_status === 'paid') {
        // Enroll first: if anything fails we return 500 and Stripe retries the delivery.
        // Both writes are idempotent, so a retry after a partial success is harmless.
        const { error: enrollError } = await adminClient.from('enrollments').upsert(
          { user_id: userId, course_id: courseId },
          { onConflict: 'user_id,course_id' },
        )
        if (enrollError) {
          console.error('[course webhook] enrollment failed:', enrollError)
          return NextResponse.json({ error: 'Inscription impossible.' }, { status: 500 })
        }

        if (orderId) {
          const { error: orderError } = await adminClient
            .from('course_orders')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .eq('user_id', userId)
            .eq('course_id', courseId)
          if (orderError) {
            console.error('[course webhook] order update failed:', orderError)
            return NextResponse.json({ error: 'Mise à jour de la commande impossible.' }, { status: 500 })
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
