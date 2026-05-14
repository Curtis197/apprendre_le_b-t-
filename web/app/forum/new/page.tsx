// web/app/forum/new/page.tsx
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ForumNewThreadForm } from '@/components/ForumNewThreadForm'

export default function NewThreadPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 py-10">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour au forum
      </Link>

      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold mb-2">Nouveau sujet</h1>
        <p className="text-muted-foreground text-sm">
          Posez une question, partagez une observation ou lancez une discussion sur la langue bété.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <ForumNewThreadForm />
      </div>
    </div>
  )
}
