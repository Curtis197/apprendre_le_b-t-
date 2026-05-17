// web/components/NavLink.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Props {
  href: string
  children: React.ReactNode
  className?: string
}

export function NavLink({ href, children, className }: Props) {
  const pathname = usePathname()
  const hrefPath = href.split('#')[0]
  const isActive = pathname === hrefPath || (hrefPath !== '/' && pathname.startsWith(hrefPath))
  return (
    <Link
      href={href}
      className={cn(
        'text-sm transition-colors pb-1',
        isActive
          ? 'border-b-2 border-primary text-foreground font-semibold'
          : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
    </Link>
  )
}
