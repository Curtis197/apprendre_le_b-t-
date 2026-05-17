import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { validateDonationAmount } from '@/lib/donation'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const amount = body?.amount

  if (typeof amount !== 'number' || !validateDonationAmount(amount)) {
    return NextResponse.json(
      { error: 'Montant invalide. Choisissez entre 1€ et 500€.' },
      { status: 400 }
    )
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
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

  return NextResponse.json({ url: session.url })
}
