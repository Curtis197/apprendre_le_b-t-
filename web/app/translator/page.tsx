export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { getTranslatorCounts } from '@/lib/translator-threshold'
import { TranslatorGate } from '@/components/TranslatorGate'

export default async function TranslatorPage() {
  const supabase = await createClient()
  const counts = await getTranslatorCounts(supabase)
  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-2">Traducteur Français → Bhété</h1>
      <TranslatorGate counts={counts} />
    </main>
  )
}
