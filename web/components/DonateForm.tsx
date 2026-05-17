// web/components/DonateForm.tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'

const PRESETS = [
  { label: '2€', cents: 200 },
  { label: '5€', cents: 500 },
  { label: '10€', cents: 1000 },
]

export function DonateForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selected, setSelected] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showThanks, setShowThanks] = useState(false)

  useEffect(() => {
    if (searchParams.get('donated') === 'true') {
      setShowThanks(true)
      router.replace('/contribute', { scroll: false })
    }
  }, [searchParams, router])

  function getAmountCents(): number | null {
    if (custom) {
      const euros = parseFloat(custom.replace(',', '.'))
      if (isNaN(euros)) return null
      return Math.trunc(Math.round(euros * 100))
    }
    return selected
  }

  async function handleSubmit() {
    const amount = getAmountCents()
    if (!amount || amount < 200 || amount > 50000) {
      setError('Veuillez choisir un montant entre 2€ et 500€.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/donate/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Erreur inconnue')
      window.location.href = data.url
    } catch (e) {
      setError('Une erreur est survenue, veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
      {showThanks && (
        <div className="mb-6 flex items-start justify-between gap-4 bg-secondary/10 border border-secondary/30 rounded-lg px-4 py-3">
          <p className="text-sm text-secondary font-medium">
            Merci pour votre contribution ! Vous aidez à préserver la langue bété.
          </p>
          <button
            onClick={() => setShowThanks(false)}
            className="text-secondary/60 hover:text-secondary text-lg leading-none shrink-0"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}

      <h2 className="font-heading text-2xl text-primary flex items-center gap-2 mb-2">
        <Heart className="w-6 h-6" />
        Soutenir le projet
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        La plateforme est financée par des contributions volontaires. Chaque euro aide à couvrir
        l&apos;hébergement et les coûts API pour préserver la langue bété.
      </p>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-3 mb-4">
        {PRESETS.map(({ label, cents }) => (
          <button
            key={cents}
            onClick={() => { setSelected(cents); setCustom('') }}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              selected === cents && !custom
                ? 'bg-primary text-white border-primary'
                : 'bg-background border-border hover:border-primary hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm text-muted-foreground">Autre montant :</span>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            min="1"
            max="500"
            step="1"
            placeholder="Ex: 15"
            value={custom}
            onChange={e => { setCustom(e.target.value); setSelected(null) }}
            className="w-28 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || (!selected && !custom)}
        className="bg-primary text-white font-semibold px-6 py-3 rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirection...' : 'Soutenir le projet →'}
      </button>
    </div>
  )
}
