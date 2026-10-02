import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

/** On the profile: a link to the corrections waiting for you, shown only when there are some. */
export async function ProfileCorrections() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const isAdmin = (await supabase.rpc('is_admin')).data === true
  let query = supabase.from('corrections').select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (!isAdmin) query = query.eq('owner_id', user.id)
  const { count } = await query
  if (!count) return null

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 pb-6">
      <Link
        href="/corrections"
        className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors"
      >
        <span className="font-heading font-bold text-base">
          {isAdmin ? 'Corrections en attente' : 'Corrections à traiter'}
        </span>
        <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5">{count}</span>
      </Link>
    </div>
  )
}
