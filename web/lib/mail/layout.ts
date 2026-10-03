import { escapeHtml } from '@/lib/courses/assignment'

export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">${escapeHtml(label)}</a></p>`
}

export function renderLayout(opts: { bodyHtml: string; unsubscribeUrl?: string }): string {
  const footer = opts.unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#9ca3af;">Se désabonner de ces e-mails</a></p>`
    : ''
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5f0;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#7c3aed;padding:24px 32px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Parlons Bhété</p>
        </td></tr>
        <tr><td style="padding:32px;font-size:16px;line-height:1.6;color:#374151;">${opts.bodyHtml}</td></tr>
        <tr><td style="padding:20px 32px;background:#f9f5f0;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Parlons Bhété — Préserver la langue bhété, ensemble.</p>
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
