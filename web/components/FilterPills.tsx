'use client'

import { cn } from '@/lib/utils'

interface Props {
  options: string[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function FilterPills({ options, value, onChange, className }: Props) {
  return (
    <div className={cn('flex overflow-x-auto gap-2 pb-2', className)}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-full px-4 py-2 text-sm whitespace-nowrap border transition-colors shrink-0',
            value === opt
              ? 'bg-primary text-white border-primary'
              : 'bg-muted border-transparent hover:border-primary'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
