import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { email, name } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const displayName = name || 'Contributeur'

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#7c3aed;padding:36px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Parlons Bhété</p>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">Plateforme linguistique</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e;">Bienvenue, ${displayName} !</h1>
            <p style="margin:0 0 20px;font-size:16px;color:#555;line-height:1.6;">
              Votre compte a été créé avec succès sur <strong>Parlons Bhété</strong>.
              Vous faites maintenant partie d'une communauté dédiée à la préservation
              et à la valorisation de la langue bhété.
            </p>
            <p style="margin:0 0 24px;font-size:16px;color:#555;line-height:1.6;">
              Voici ce que vous pouvez faire :
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="padding:12px;background:#f5f3ff;border-radius:10px;margin-bottom:10px;display:block;">
                  <strong style="color:#7c3aed;">📖 Explorer le Lexique</strong>
                  <p style="margin:4px 0 0;font-size:14px;color:#666;">Découvrez les mots et expressions en bhété avec leur traduction française.</p>
                </td>
              </tr>
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="padding:12px;background:#f0fdf4;border-radius:10px;display:block;">
                  <strong style="color:#16a34a;">✍️ Contribuer</strong>
                  <p style="margin:4px 0 0;font-size:14px;color:#666;">Ajoutez des mots, expressions et règles grammaticales pour enrichir la plateforme.</p>
                </td>
              </tr>
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="padding:12px;background:#fff7ed;border-radius:10px;display:block;">
                  <strong style="color:#ea580c;">💬 Rejoindre le Forum</strong>
                  <p style="margin:4px 0 0;font-size:14px;color:#666;">Discutez avec d'autres passionnés de la langue et de la culture bhété.</p>
                </td>
              </tr>
            </table>
            <div style="text-align:center;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://parlons-bete.vercel.app'}"
                 style="display:inline-block;background:#7c3aed;color:#fff;font-weight:600;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
                Accéder à la plateforme
              </a>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;background:#f9f5f0;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Parlons Bhété — Préserver la langue bhété, ensemble.<br />
              Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim()

  const { error } = await resend.emails.send({
    from: 'Parlons Bhété <onboarding@resend.dev>',
    to: email,
    subject: `Bienvenue sur Parlons Bhété, ${displayName} !`,
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    return NextResponse.json({ error: 'Email sending failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
