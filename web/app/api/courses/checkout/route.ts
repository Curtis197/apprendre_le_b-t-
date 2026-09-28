import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase-server'
import { createPendingCourseOrder } from '@/lib/courses/mutations'
import type { PaymentRail } from '@/lib/courses/payment'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour continuer.' }, { status: 401 })
  }

  const { courseId, paymentRail } = (await request.json().catch(() => ({}))) as {
    courseId?: string
    paymentRail?: PaymentRail
  }

  if (!courseId || !paymentRail) {
    return NextResponse.json({ error: 'Paramètres manquants.' }, { status: 400 })
  }

  const orderRes = await createPendingCourseOrder(supabase, courseId, paymentRail)
  if (orderRes.error || !orderRes.data) {
    return NextResponse.json({ error: orderRes.error }, { status: 400 })
  }

  const order = orderRes.data

  // Handle Stripe Card rail
  if (paymentRail === 'stripe') {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe n’est pas configuré sur le serveur.' }, { status: 500 })
    }

    const stripe = new Stripe(stripeKey)
    const { data: course } = await supabase.from('courses').select('title, slug').eq('id', courseId).single()

    const origin = request.headers.get('origin') || 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: user.id,
      metadata: {
        order_id: order.id,
        course_id: courseId,
        user_id: user.id,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency,
            unit_amount: order.amount_cents,
            product_data: {
              name: course?.title || 'Cours Bété',
            },
          },
        },
      ],
      success_url: `${origin}/courses/${course?.slug || ''}?payment=success`,
      cancel_url: `${origin}/courses/${course?.slug || ''}?payment=cancelled`,
    })

    // Update order gateway_ref with Stripe session ID
    await supabase.from('course_orders').update({ gateway_ref: session.id }).eq('id', order.id)

    return NextResponse.json({ url: session.url })
  }

  // Mobile Money rail return (redirects to Mobile Money payment page/confirmation)
  const { data: course } = await supabase.from('courses').select('slug').eq('id', courseId).single()
  return NextResponse.json({
    url: `/courses/${course?.slug || ''}?payment=pending_mobile_money&orderId=${order.id}`,
  })
}
