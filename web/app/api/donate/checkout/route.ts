import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { validateDonationAmount } from '@/lib/donation'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-04-22.dahlia' as any,
  })
  const body = await req.json().catch(() => null)
  const amount = body?.amount

  if (typeof amount !== 'number' || !validateDonationAmount(amount)) {
    return NextResponse.json(
      { error: 'Montant invalide. Choisissez entre 1€ et 500€.' },
      { status: 400 }
    )
  }

  const origin =
    req.headers.get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amount,
            product_data: {
              name: 'Soutien à Parlons Bété',
              description: 'Contribution au financement de la plateforme linguistique bété.',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/contribute?donated=true`,
      cancel_url: `${origin}/contribute`,
    })
  } catch (err) {
    console.error('Stripe checkout session creation failed:', err)
    return NextResponse.json({ error: 'Payment service unavailable.' }, { status: 502 })
  }

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 })
  }

  return NextResponse.json({ url: session.url })
}
