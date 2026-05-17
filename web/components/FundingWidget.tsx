// web/components/FundingWidget.tsx
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'

const GOAL_CENTS = 5000

async function getMonthlyProgress(): Promise<{ raised: number; month: string }> {
  const supabase = await createClient()
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('contributions')
    .select('amount_cents')
    .eq('month', month)
  if (error || !data) return { raised: 0, month }
  const raised = data.reduce((sum, row) => sum + row.amount_cents, 0)
  return { raised, month }
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export async function FundingWidget() {
  let raised = 0
  let month = ''
  try {
    const result = await getMonthlyProgress()
    raised = result.raised
    month = result.month
  } catch {
    return null
  }

  const [year, monthNum] = month.split('-')
  const monthLabel = `${MONTH_NAMES_FR[parseInt(monthNum) - 1]} ${year}`
  const pct = Math.min(100, Math.round((raised / GOAL_CENTS) * 100))
  const raisedEur = (raised / 100).toFixed(0)
  const goalEur = (GOAL_CENTS / 100).toFixed(0)
  const reached = raised >= GOAL_CENTS

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-secondary" />
          <span className="text-sm font-semibold text-foreground">
            Financement du mois — {monthLabel}
          </span>
        </div>
        <Link
          href="/contribute"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Contribuer →
        </Link>
      </div>

      <div className="w-full bg-foreground/10 h-2.5 rounded-full overflow-hidden mb-2">
        <div
          className="bg-secondary h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {reached
          ? <span className="text-secondary font-semibold">Objectif atteint !</span>
          : <><span className="font-semibold text-foreground">{raisedEur}€</span> / {goalEur}€ ce mois-ci</>
        }
      </p>
    </div>
  )
}
