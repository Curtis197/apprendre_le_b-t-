'use client'
import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { TranslatorOutput } from './TranslatorOutput'
import { TranslationResult } from '@/lib/types'
import { useDialect } from '@/context/DialectContext'

export function TranslatorInput() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { dialect } = useDialect()

  async function handleTranslate() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dialect }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de traduction')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        placeholder="Entrez du texte en français…"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        maxLength={500}
        className="text-base resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{text.length}/500</span>
        <Button onClick={handleTranslate} disabled={loading || !text.trim()}>
          {loading ? 'Traduction…' : 'Traduire en Bété'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <TranslatorOutput result={result} />}
    </div>
  )
}
