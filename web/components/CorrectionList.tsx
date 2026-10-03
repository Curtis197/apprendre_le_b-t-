'use client'
import { useRouter } from 'next/navigation'
import type { Correction } from '@/lib/corrections'
import { CorrectionItem } from '@/components/CorrectionItem'

interface Props {
  corrections: Correction[]
  userId: string
  isAdmin: boolean
}

/** A list of corrections about several pieces of content, each with its target and its actions. */
export function CorrectionList({ corrections, userId, isAdmin }: Props) {
  const router = useRouter()
  return (
    <ul className="space-y-3">
      {corrections.map(c => (
        <CorrectionItem
          key={c.id}
          correction={c}
          userId={userId}
          isAdmin={isAdmin}
          showTarget
          onChanged={() => router.refresh()}
        />
      ))}
    </ul>
  )
}
