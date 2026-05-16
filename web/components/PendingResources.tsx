'use client'
import { useEffect, useRef, useState } from 'react'
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { CommunityText } from '@/lib/types'

export function PendingResources() {
  const [pending, setPending] = useState<CommunityText[]>([])
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const client = supabaseRef.current
    client.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await client
        .from('community_texts')
        .select('*')
        .eq('created_by', user.id)
        .eq('validated', false)
        .order('created_at', { ascending: false })
        .limit(20)
      setPending((data ?? []) as CommunityText[])
      setLoading(false)
    })
  }, [])

  if (loading || pending.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
      <h2 className="font-heading font-semibold text-base flex items-center gap-2 mb-4 text-amber-900">
        <Clock className="w-4 h-4" />
        Vos soumissions en attente de validation ({pending.length})
      </h2>
      <div className="space-y-2">
        {pending.map(text => (
          <div
            key={text.id}
            className="flex items-center justify-between bg-white border border-amber-100 rounded-lg px-4 py-3 gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{text.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Soumis le {new Date(text.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2.5 py-1 shrink-0">
              <AlertCircle className="w-3 h-3" />
              En attente
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-700 mt-4 flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Vos ressources seront publiées dès validation par l&apos;équipe.
      </p>
    </div>
  )
}
