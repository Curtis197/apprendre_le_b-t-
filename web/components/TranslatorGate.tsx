'use client'
import { useDialect } from '@/context/DialectContext'
import { dialectMeetsThreshold } from '@/lib/translator-threshold'
import type { TranslatorCounts } from '@/lib/translator-threshold'
import { TranslatorProgress } from './TranslatorProgress'
import { TranslatorInput } from './TranslatorInput'
import { DialectSelector } from './DialectSelector'

interface Props {
  counts: TranslatorCounts
}

export function TranslatorGate({ counts }: Props) {
  const { dialect } = useDialect()

  if (dialectMeetsThreshold(counts, dialect)) {
    return (
      <>
        <div className="mb-6"><DialectSelector /></div>
        <TranslatorInput />
      </>
    )
  }

  return (
    <>
      <p className="text-muted-foreground mb-6">
        Le traducteur s&apos;ouvrira pour ce dialecte quand la communauté aura traduit assez de mots.
        Aidez-nous à atteindre les seuils ci-dessous.
      </p>
      <div className="mb-6"><DialectSelector /></div>
      <TranslatorProgress counts={counts} />
    </>
  )
}
