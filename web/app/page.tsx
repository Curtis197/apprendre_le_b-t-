// web/app/page.tsx
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { PenLine, BookOpen, Languages, GraduationCap, Library } from 'lucide-react'
import { PatternDivider } from '@/components/PatternDivider'
import { ContributionFormWithParams } from '@/components/ContributionForm'
import { DonateForm } from '@/components/DonateForm'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'

const HERO_TITLE = 'Construisons ensemble la première plateforme pour apprendre le bhété'
const HERO_TEXT =
  'Le bhété est une langue vivante de Côte d’Ivoire, mais il n’existe presque aucun outil pour l’apprendre. Ce site est en train d’être construit, et il a besoin de celles et ceux qui parlent la langue.'

const BUILDING = [
  {
    icon: BookOpen,
    title: 'Lexique',
    status: 'En construction',
    text: 'Un dictionnaire bhété ↔ français, enrichi mot après mot par la communauté.',
  },
  {
    icon: Languages,
    title: 'Traducteur',
    status: 'Prévu',
    text: 'Traduire du français vers le bhété, de plus en plus précis à mesure que le lexique grandit.',
  },
  {
    icon: GraduationCap,
    title: 'Cours',
    status: 'En préparation',
    text: 'Des parcours par niveau et par dialecte, créés par des locuteurs et des enseignants.',
  },
  {
    icon: Library,
    title: 'Ressources',
    status: 'En préparation',
    text: 'Chants, contes, proverbes et vidéos, pour apprendre aussi par la culture.',
  },
]

const STEPS = [
  'Créez un compte gratuit.',
  'Traduisez un mot ou proposez une ressource.',
  'Si vous le souhaitez, créez un cours.',
]

export default function HomePage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      alternateName: 'Apprendre le bété',
      url: SITE_URL,
      inLanguage: 'fr',
      description: SITE_DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10 space-y-10">
      <JsonLd data={jsonLd} />

      {/* Hero: Patrimoine Vivant */}
      <div className="rounded-2xl overflow-hidden border border-border">

        {/* ── MOBILE: stacked (image then text) ───────────────────── */}
        <div className="md:hidden">
          <div className="relative w-full aspect-[3/4]">
            <Image
              src="/hero-mobile-image.jpg"
              alt="Patrimoine vivant — Culture bhété de Côte d'Ivoire"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
          <div className="bg-primary text-primary-foreground px-5 py-7">
            <span className="inline-block text-xs font-semibold rounded-full bg-white/15 px-3 py-1 mb-3">
              Projet communautaire · En construction
            </span>
            <h1 className="font-heading text-3xl font-bold mb-3 leading-tight">
              {HERO_TITLE}
            </h1>
            <p className="text-primary-foreground/85 text-sm mb-5 leading-relaxed">
              {HERO_TEXT}
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/auth"
                className="bg-white text-primary font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-white/90 transition-colors"
              >
                Devenir contributeur
              </Link>
              <Link
                href="#projet"
                className="border border-primary-foreground/40 text-primary-foreground font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-primary-foreground/10 transition-colors"
              >
                Comprendre le projet
              </Link>
            </div>
          </div>
        </div>

        {/* ── DESKTOP: image with overlay ─────────────────────────── */}
        <div className="hidden md:block relative min-h-[360px]">
          <Image
            src="/patrimoine-vivant.jpg"
            alt="Patrimoine vivant — Culture bhété de Côte d'Ivoire"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          <div className="relative z-10 p-12 flex flex-col justify-end h-full min-h-[360px]">
            <span className="self-start text-xs font-semibold rounded-full bg-white/20 text-white px-3 py-1 mb-4">
              Projet communautaire · En construction
            </span>
            <h1 className="font-heading text-5xl font-bold text-white mb-3 max-w-2xl leading-tight">
              {HERO_TITLE}
            </h1>
            <p className="text-white/80 text-lg mb-6 max-w-xl leading-relaxed">
              {HERO_TEXT}
            </p>
            <div className="flex gap-3">
              <Link
                href="/auth"
                className="bg-white text-primary font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-white/90 transition-colors"
              >
                Devenir contributeur
              </Link>
              <Link
                href="#projet"
                className="border border-white/60 text-white font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-white/10 transition-colors"
              >
                Comprendre le projet
              </Link>
            </div>
          </div>
        </div>

      </div>

      {/* Where we are + what we build */}
      <section id="projet" className="scroll-mt-24 space-y-8">
        <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm">
          <h2 className="font-heading text-2xl text-primary mb-3">Où en sommes-nous ?</h2>
          <p className="text-foreground/80 leading-relaxed max-w-3xl">
            Le site n’est pas encore prêt à enseigner : il n’y a pas encore de cours ni de dictionnaire complet.
            Chaque mot, chaque leçon et chaque ressource sera apporté par des locuteurs comme vous.
            Revenez bientôt, ou aidez-nous à l’ouvrir plus vite.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-4">Ce que nous construisons</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {BUILDING.map(({ icon: Icon, title, status, text }) => (
              <div key={title} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <Icon className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                    {status}
                  </span>
                </div>
                <h3 className="font-heading text-lg font-bold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-2xl mb-4">Comment participer</h2>
          <ol className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3 bg-muted/50 rounded-xl p-4">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Contribution Form */}
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
        <h2 className="font-heading text-2xl text-primary flex items-center gap-2 mb-2">
          <PenLine className="w-6 h-6" />
          Vous parlez bhété ? Apportez votre premier mot.
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Proposez une traduction, une expression ou une règle de grammaire. Chaque contribution compte.
        </p>
        <ContributionFormWithParams />
      </div>

      <PatternDivider />

      {/* Financial contribution */}
      <Suspense fallback={null}>
        <DonateForm />
      </Suspense>
    </div>
  )
}
