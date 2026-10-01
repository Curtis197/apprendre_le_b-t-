import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
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

  // Mobile money has no gateway integration yet: never create an order that can't be paid.
  if (paymentRail !== 'stripe') {
    return NextResponse.json({ error: 'Le paiement Mobile Money sera bientôt disponible.' }, { status: 501 })
  }

  const { data: alreadyEnrolled } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle()
  if (alreadyEnrolled) {
    return NextResponse.json({ error: 'Vous êtes déjà inscrit à ce cours.' }, { status: 409 })
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
    // Users have no UPDATE policy on course_orders, so this uses the service role.
    const { error: refError } = await createServiceClient()
      .from('course_orders')
      .update({ gateway_ref: session.id, updated_at: new Date().toISOString() })
      .eq('id', order.id)
    if (refError) console.error('[checkout] could not store gateway_ref:', refError)

    return NextResponse.json({ url: session.url })
  }
}
