import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { name, email, subject, message } = await req.json()
  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await resend.emails.send({
    from: 'Parlons Bhété <onboarding@resend.dev>',
    to: 'curtiscapre@gmail.com',
    replyTo: email,
    subject: `[Contact] ${subject || 'Sans sujet'} — de ${name}`,
    html: `
      <p><strong>De :</strong> ${name} (${email})</p>
      <p><strong>Sujet :</strong> ${subject || '—'}</p>
      <hr />
      <p>${message.replace(/\n/g, '<br />')}</p>
    `,
  })

  if (error) return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
