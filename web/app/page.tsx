import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function HomePage() {
  return (
    <main className="max-w-2xl mx-auto py-20 px-4 text-center space-y-6">
      <h1 className="text-4xl font-bold">Langue Bété</h1>
      <p className="text-muted-foreground text-lg max-w-md mx-auto">
        Plateforme collaborative pour documenter, préserver et apprendre la langue bété
        de Côte d'Ivoire.
      </p>
      <div className="flex gap-4 justify-center flex-wrap">
        <Link href="/translator" className={cn(buttonVariants({ size: 'lg' }))}>
          Traduire du français
        </Link>
        <Link href="/lexicon" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}>
          Explorer le lexique
        </Link>
        <Link href="/contribute" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}>
          Contribuer
        </Link>
      </div>
    </main>
  )
}
