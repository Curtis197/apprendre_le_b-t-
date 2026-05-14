// web/components/PatternDivider.tsx
import { Layers } from 'lucide-react'

export function PatternDivider() {
  return (
    <div className="flex items-center gap-4 my-12">
      <div className="flex-1 h-px bg-border" />
      <Layers className="w-5 h-5 text-muted-foreground shrink-0" />
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
