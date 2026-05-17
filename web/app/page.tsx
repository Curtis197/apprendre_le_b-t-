// web/app/page.tsx
import Link from 'next/link'
import Image from 'next/image'
import { Users, Mic2 } from 'lucide-react'
import { PatternDivider } from '@/components/PatternDivider'
import { HomeTranslator } from '@/components/HomeTranslator'
import { FundingWidget } from '@/components/FundingWidget'
import { createClient } from '@/lib/supabase-server'
import type { LexiconEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function getWordsOfDay(): Promise<LexiconEntry[]> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('lexicon')
    .select('*', { count: 'exact', head: true })
  if (!count) return []

  const dayIndex = Math.floor(Date.now() / 86400000) % count
  const indices = [
    dayIndex % count,
    (dayIndex + Math.floor(count / 3)) % count,
    (dayIndex + Math.floor((2 * count) / 3)) % count,
  ]

  const results = await Promise.all(
    indices.map(i =>
      supabase
        .from('lexicon')
        .select('*')
        .order('created_at')
        .range(i, i)
        .maybeSingle()
        .then(r => r.data as LexiconEntry | null)
    )
  )
  return results.filter((w): w is LexiconEntry => w !== null)
}

export default async function HomePage() {
  const words = await getWordsOfDay()

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10 space-y-10">

      {/* Hero: Patrimoine Vivant */}
      <div className="relative rounded-2xl overflow-hidden border border-border min-h-[360px]">
        <Image
          src="/patrimoine-vivant.jpg"
          alt="Patrimoine vivant — Culture bété de Côte d'Ivoire"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        <div className="relative z-10 p-8 md:p-12 flex flex-col justify-end h-full min-h-[360px]">
          <span className="bg-secondary text-white text-xs font-semibold rounded-full px-3 py-1 self-start mb-4">
            Patrimoine Vivant
          </span>
          <h1 className="font-heading text-3xl md:text-5xl font-bold text-white mb-3 max-w-2xl leading-tight">
            La langue bété,<br />une culture à préserver
          </h1>
          <p className="text-white/80 text-base md:text-lg mb-6 max-w-xl leading-relaxed">
            Parlée par plus de 3 millions de personnes en Côte d&apos;Ivoire, la langue bété
            est porteuse d&apos;une tradition orale exceptionnelle.
          </p>
          <div className="flex flex-wrap gap-3 mb-6">
            <span className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm text-white flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> 3M+ Locuteurs
            </span>
            <span className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-sm text-white flex items-center gap-1.5">
              <Mic2 className="w-3.5 h-3.5" /> Riche Folklore
            </span>
          </div>
          <div className="flex gap-3">
            <Link
              href="/lexicon"
              className="bg-white text-primary font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-white/90 transition-colors"
            >
              Explorer le Lexique
            </Link>
            <Link
              href="/resources"
              className="border border-white/60 text-white font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-white/10 transition-colors"
            >
              Voir les Ressources
            </Link>
          </div>
        </div>
      </div>

      {/* Translator */}
      <HomeTranslator />

      {/* Monthly funding */}
      <FundingWidget />

      {/* 3 Words of the Day */}
      {words.length > 0 && (
        <div className="grid md:grid-cols-3 gap-6">
          {words.map((wotd, i) => (
            <div key={wotd.id} className={`rounded-2xl p-6 border-l-4 ${i === 0 ? 'bg-primary/10 border-primary' : i === 1 ? 'bg-secondary/10 border-secondary' : 'bg-accent/20 border-accent-foreground/30'}`}>
              <span className={`text-xs font-semibold rounded-full px-3 py-1 inline-block mb-4 ${i === 0 ? 'bg-secondary text-white' : i === 1 ? 'bg-primary text-white' : 'bg-foreground/10 text-foreground'}`}>
                {i === 0 ? 'Mot du Jour' : i === 1 ? 'Mot du Jour #2' : 'Mot du Jour #3'}
              </span>
              <h2 className={`font-heading text-3xl font-bold mb-1 ${i === 0 ? 'text-primary' : i === 1 ? 'text-secondary' : 'text-foreground'}`}>
                {wotd.bete_word}
              </h2>
              <p className="text-sm italic text-muted-foreground mt-1">[{wotd.bete_phonetic}]</p>
              <div className="w-12 h-0.5 bg-border my-3" />
              <p className="italic text-foreground/80 text-sm">{wotd.top_french}</p>
              <Link href={`/lexicon/${wotd.id}`} className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
                En savoir plus →
              </Link>
            </div>
          ))}
        </div>
      )}

      <PatternDivider />
    </div>
  )
}
