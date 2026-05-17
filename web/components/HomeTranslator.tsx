'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, Copy, Mic, Sparkles } from 'lucide-react'
import type { TranslationResult } from '@/lib/types'

export function HomeTranslator() {
  const [input, setInput]       = useState('')
  const [output, setOutput]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  async function handleTranslate() {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })

      // Read quota headers even on error responses
      const limit     = res.headers.get('X-RateLimit-Limit')
      const rem       = res.headers.get('X-RateLimit-Remaining')
      if (rem !== null) setRemaining(Number(rem))

      if (res.status === 429) {
        const data = await res.json()
        setError(data.error ?? 'Quota journalier atteint.')
        return
      }
      if (!res.ok) throw new Error('Erreur de traduction. Veuillez réessayer.')

      const data: TranslationResult = await res.json()
      setOutput(data.tokens?.map(t => t.bete_word).join(' ') ?? '')

      // Cached responses don't include rate-limit headers — keep last known value
      if (rem === null && limit === null) {
        // cached hit — quota unchanged, don't update remaining
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de traduction.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="bg-muted rounded-full px-4 py-1.5 text-sm font-semibold">Français</span>
          <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          <span className="bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold">Bété</span>
        </div>
        {remaining !== null && (
          <span className={`text-xs font-medium ${remaining <= 2 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {remaining} traduction{remaining !== 1 ? 's' : ''} restante{remaining !== 1 ? 's' : ''} aujourd&apos;hui
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="relative">
          <textarea
            className="w-full h-40 bg-muted rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Entrez votre texte en français…"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-background border border-border hover:bg-muted transition-colors">
            <Mic className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="relative">
          <div className="w-full h-40 bg-muted rounded-lg p-4 text-sm overflow-auto">
            {output
              ? <span className="text-foreground">{output}</span>
              : <span className="text-muted-foreground">La traduction apparaîtra ici…</span>
            }
          </div>
          <button
            onClick={() => output && navigator.clipboard.writeText(output)}
            className="absolute bottom-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-background border border-border hover:bg-muted transition-colors"
            aria-label="Copier"
          >
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <button
        onClick={handleTranslate}
        disabled={loading || !input.trim() || remaining === 0}
        className="w-full h-12 bg-primary text-white rounded-lg font-heading font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Sparkles className="w-5 h-5" />
        )}
        {loading ? 'Traduction en cours…' : 'Traduire'}
      </button>
      {error && (
        <p className="text-sm text-destructive mt-2 text-center">{error}</p>
      )}
      <div className="mt-3 text-right">
        <Link href="/translator" className="text-xs text-muted-foreground hover:text-primary transition-colors">
          Ouvrir le traducteur complet →
        </Link>
      </div>
    </div>
  )
}
