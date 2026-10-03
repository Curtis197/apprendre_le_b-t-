'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type State = 'idle' | 'working' | 'unsubscribed' | 'resubscribed' | 'error'

export function UnsubscribeConfirm({ token, category, label }: { token: string; category: string; label: string }) {
  const [state, setState] = useState<State>('idle')

  async function change(subscribe: boolean) {
    setState('working')
    try {
      const res = await fetch(
        `/api/mail/unsubscribe?token=${encodeURIComponent(token)}&category=${encodeURIComponent(category)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribe }) },
      )
      setState(res.ok ? (subscribe ? 'resubscribed' : 'unsubscribed') : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Se désabonner</h1>
      <p className="text-muted-foreground">Catégorie : <strong>{label}</strong></p>

      {(state === 'idle' || state === 'working' || state === 'resubscribed') && (
        <>
          {state === 'resubscribed' && <p className="text-emerald-700">Vous êtes de nouveau abonné.</p>}
          <Button onClick={() => change(false)} disabled={state === 'working'}>
            Me désabonner
          </Button>
        </>
      )}

      {state === 'unsubscribed' && (
        <>
          <p>Vous ne recevrez plus ces e-mails.</p>
          <Button variant="outline" onClick={() => change(true)}>Me réabonner</Button>
        </>
      )}

      {state === 'error' && <p className="text-destructive">Une erreur est survenue. Réessayez plus tard.</p>}

      <p className="text-sm text-muted-foreground">
        Vous pouvez aussi gérer toutes vos préférences dans <Link className="underline" href="/notifications">vos notifications</Link>.
      </p>
    </div>
  )
}
