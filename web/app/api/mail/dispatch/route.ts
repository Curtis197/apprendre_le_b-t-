import { NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/site'
import { isAuthorizedCron, runDispatch } from '@/lib/mail/dispatcher'
import { createDispatcherDeps } from '@/lib/mail/dispatcher-deps'

export const dynamic = 'force-dynamic'

function intEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Called by pg_cron (see supabase/ops/mail-cron.sql) with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  try {
    const summary = await runDispatch(createDispatcherDeps(), {
      batchSize: intEnv('MAIL_BATCH_SIZE', 20),
      dailyLimit: intEnv('MAIL_DAILY_LIMIT', 90),
      baseUrl: SITE_URL,
    })
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[mail] dispatch failed:', err)
    return NextResponse.json({ error: 'Échec du traitement.' }, { status: 500 })
  }
}
