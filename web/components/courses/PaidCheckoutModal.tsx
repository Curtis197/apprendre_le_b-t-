'use client'
import { useState } from 'react'
import { CreditCard, Smartphone, ShieldCheck, AlertCircle } from 'lucide-react'
import { formatCoursePrice, type PaymentRail } from '@/lib/courses/payment'
import { Button } from '@/components/ui/button'

interface Props {
  courseId: string
  courseTitle: string
  priceCents: number
  currency?: string | null
  open: boolean
  onClose: () => void
}

export function PaidCheckoutModal({ courseId, courseTitle, priceCents, currency, open, onClose }: Props) {
  const [rail, setRail] = useState<PaymentRail>('stripe')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleCheckout() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/courses/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, paymentRail: rail }),
      })

      const data = await res.json()
      setLoading(false)

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Erreur lors du traitement du paiement.')
        return
      }

      window.location.href = data.url
    } catch {
      setLoading(false)
      setError('Erreur réseau lors de la redirection vers le paiement.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Accès payant</span>
            <h3 className="font-heading text-lg font-bold truncate">{courseTitle}</h3>
          </div>
          <span className="text-lg font-bold font-mono text-primary">{formatCoursePrice(priceCents, currency)}</span>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Choisissez votre moyen de paiement :</p>

          <button
            type="button"
            onClick={() => setRail('stripe')}
            className={`w-full p-4 rounded-xl border text-left flex items-center gap-3 transition-colors ${
              rail === 'stripe' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted'
            }`}
          >
            <CreditCard className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">Carte bancaire (Visa, Mastercard)</p>
              <p className="text-xs text-muted-foreground">Paiement sécurisé Stripe (Diaspora & International)</p>
            </div>
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full p-4 rounded-xl border border-border text-left flex items-center gap-3 opacity-60 cursor-not-allowed"
          >
            <Smartphone className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Mobile Money (Orange, MTN, Wave, Moov)</p>
              <p className="text-xs text-muted-foreground">Bientôt disponible — paiement local Côte d’Ivoire & Afrique de l’Ouest</p>
            </div>
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="button" onClick={handleCheckout} disabled={loading}>
            <ShieldCheck className="w-4 h-4 mr-2" />
            {loading ? 'Redirection…' : 'Procéder au paiement'}
          </Button>
        </div>
      </div>
    </div>
  )
}
