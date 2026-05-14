// web/components/PageHeader.tsx
import { cn } from '@/lib/utils'

interface Props {
  badge?: string
  title: string
  subtitle?: string
  className?: string
}

export function PageHeader({ badge, title, subtitle, className }: Props) {
  return (
    <div className={cn('relative mb-10 rounded-xl overflow-hidden', className)}>
      <div className="pattern-bg absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 py-12 px-4">
        {badge && (
          <span className="inline-block bg-secondary text-white text-xs font-semibold rounded-full px-3 py-1 mb-4">
            {badge}
          </span>
        )}
        <h1 className="font-heading text-4xl md:text-5xl font-bold mb-3">{title}</h1>
        {subtitle && (
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
