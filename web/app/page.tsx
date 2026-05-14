// web/app/page.tsx
import Link from 'next/link'
import { Users, Mic2, BookOpen } from 'lucide-react'
import { PatternDivider } from '@/components/PatternDivider'
import { HomeTranslator } from '@/components/HomeTranslator'
import { createClient } from '@/lib/supabase-server'
import type { LexiconEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function getWordOfDay(): Promise<LexiconEntry | null> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('lexicon')
    .select('*', { count: 'exact', head: true })
  if (!count) return null
  const dayIndex = Math.floor(Date.now() / 86400000) % count
  const { data } = await supabase
    .from('lexicon')
    .select('*')
    .order('created_at')
    .range(dayIndex, dayIndex)
    .maybeSingle()
  return data as LexiconEntry | null
}

export default async function HomePage() {
  const wotd = await getWordOfDay()

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10 space-y-10">
      <HomeTranslator />

      <div className="grid md:grid-cols-3 gap-6">
        {/* Word of Day */}
        <div className="bg-muted rounded-2xl p-8 border-l-4 border-primary">
          <span className="bg-secondary text-white text-xs rounded-full px-3 py-1 inline-block mb-4">
            Mot du Jour
          </span>
          {wotd ? (
            <>
              <h2 className="font-heading text-3xl text-primary font-bold">{wotd.bete_word}</h2>
              <p className="text-sm italic text-muted-foreground mt-1">[{wotd.bete_phonetic}]</p>
              <div className="w-12 h-0.5 bg-border my-3" />
              <p className="italic text-foreground/80 text-sm">{wotd.top_french}</p>
              <Link href={`/lexicon/${wotd.id}`} className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
                En savoir plus →
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-heading text-3xl text-primary font-bold">Gbô</h2>
              <p className="text-sm italic text-muted-foreground mt-1">/ɡbò/</p>
              <div className="w-12 h-0.5 bg-border my-3" />
              <p className="italic text-foreground/80 text-sm">"La parole, la voix"</p>
              <Link href="/lexicon" className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
                En savoir plus →
              </Link>
            </>
          )}
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
                La langue bété, parlée par plus de 3 millions de personnes en Côte d&apos;Ivoire,
                est porteuse d&apos;une tradition orale exceptionnelle.
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
