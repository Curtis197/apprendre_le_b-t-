import Link from 'next/link'
import { cn } from '@/lib/utils'

const STEPS = [
  { n: 1, label: 'Texte' },
  { n: 2, label: 'Relier les mots' },
] as const

/**
 * "Étape 1 · Texte" / "Étape 2 · Relier les mots", shared by the submit form, the edit form and the
 * linking page. The other step is a link once the resource exists (it is published as soon as step 1 is saved).
 */
export function ResourceSteps({ step, resourceId }: { step: 1 | 2; resourceId?: string }) {
  return (
    <nav aria-label="Étapes" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map(({ n, label }) => {
        const href = resourceId && n !== step ? `/resources/${resourceId}/${n === 1 ? 'edit' : 'relier'}` : null
        const cls = cn(
          'inline-flex items-center rounded-full border px-3 py-1',
          n === step ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border text-muted-foreground',
          href && 'hover:bg-muted',
        )
        const text = `Étape ${n} · ${label}`
        return href ? (
          <Link key={n} href={href} className={cls}>
            {text}
          </Link>
        ) : (
          <span key={n} className={cls} aria-current={n === step ? 'step' : undefined}>
            {text}
          </span>
        )
      })}
    </nav>
  )
}
