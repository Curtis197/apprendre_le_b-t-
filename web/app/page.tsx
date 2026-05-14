// web/app/page.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, Copy, Mic, Sparkles, Users, Mic2 } from 'lucide-react'
import { PatternDivider } from '@/components/PatternDivider'
import type { TranslationResult } from '@/lib/types'

export default function HomePage() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleTranslate() {
    if (!input.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const data: TranslationResult = await res.json()
      setOutput(data.tokens?.map(t => t.bete_word).join(' ') ?? '')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10 space-y-10">

      {/* Translator Hero */}
      <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-muted rounded-full px-4 py-1.5 text-sm font-semibold">Français</span>
          <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          <span className="bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold">Bété</span>
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
          disabled={loading || !input.trim()}
          className="w-full h-12 bg-primary text-white rounded-lg font-heading font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          {loading ? 'Traduction en cours…' : 'Traduire'}
        </button>
      </div>

      {/* Bento Grid */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Word of Day */}
        <div className="bg-muted rounded-2xl p-8 border-l-4 border-primary">
          <span className="bg-secondary text-white text-xs rounded-full px-3 py-1 inline-block mb-4">
            Mot du Jour
          </span>
          <h2 className="font-heading text-3xl text-primary font-bold">Gbô</h2>
          <p className="text-sm italic text-muted-foreground mt-1">/ɡbò/</p>
          <div className="w-12 h-0.5 bg-border my-3" />
          <p className="italic text-foreground/80 text-sm">"La parole, la voix"</p>
          <Link href="/lexicon" className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
            En savoir plus →
          </Link>
        </div>

        {/* Cultural Card */}
        <div className="md:col-span-2 rounded-2xl overflow-hidden border border-border">
          <div className="grid md:grid-cols-2 h-full min-h-[280px]">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&q=80"
                alt="Culture bété de Côte d'Ivoire"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-8 flex flex-col justify-center bg-card">
              <h2 className="font-heading text-2xl font-bold mb-3">Patrimoine Vivant</h2>
              <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                La langue bété, parlée par plus de 3 millions de personnes en Côte d'Ivoire,
                est porteuse d'une tradition orale exceptionnelle.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="bg-muted rounded-full px-3 py-1 text-sm flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> 3M+ Locuteurs
                </span>
                <span className="bg-muted rounded-full px-3 py-1 text-sm flex items-center gap-1.5">
                  <Mic2 className="w-3.5 h-3.5" /> Riche Folklore
                </span>
              </div>
              <Link
                href="/lexicon"
                className="self-start border-2 border-secondary text-secondary hover:bg-secondary hover:text-white rounded-lg px-6 h-10 inline-flex items-center text-sm font-semibold transition-colors"
              >
                Explorer le Lexique
              </Link>
            </div>
          </div>
        </div>
      </div>

      <PatternDivider />
    </div>
  )
}
