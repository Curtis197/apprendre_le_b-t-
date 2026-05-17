import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildContributionRow } from '@/lib/donation'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-04-22.dahlia' as any,
  })
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session

  let row
  try {
    row = buildContributionRow(session)
  } catch (err) {
    console.error('Failed to build contribution row:', err)
    return NextResponse.json({ error: 'Invalid session data' }, { status: 422 })
  }

  const { error } = await supabaseAdmin
    .from('contributions')
    .upsert(row, { onConflict: 'stripe_session_id', ignoreDuplicates: true })

  if (error) {
    console.error('Webhook DB error:', error)
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
