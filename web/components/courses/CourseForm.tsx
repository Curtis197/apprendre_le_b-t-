'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { createCourse, updateCourse } from '@/lib/courses/mutations'
import { DEFAULT_DIALECT, DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { LEVELS, LEVEL_LABELS } from '@/lib/courses/labels'
import type { Course, CourseAccess, CourseLevel } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { selectClass } from './styles'

interface Props {
  mode: 'create' | 'edit'
  course?: Course
  disabled?: boolean
}

export function CourseForm({ mode, course, disabled = false }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [title, setTitle] = useState(course?.title ?? '')
  const [summary, setSummary] = useState(course?.summary ?? '')
  const [dialect, setDialect] = useState<DialectKey>(course?.dialect ?? DEFAULT_DIALECT)
  const [level, setLevel] = useState<CourseLevel>(course?.level ?? 'beginner')
  const [access, setAccess] = useState<CourseAccess>(course?.access ?? 'free')
  const [priceEuros, setPriceEuros] = useState(course?.price_cents ? (course.price_cents / 100).toString() : '29')
  const [currency, setCurrency] = useState(course?.currency ?? 'eur')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    const priceCents = access === 'paid' ? Math.round(parseFloat(priceEuros || '0') * 100) : null
    const input = { title, summary, dialect, level, access, price_cents: priceCents, currency }

    if (mode === 'create') {
      const { data, error: err } = await createCourse(supabase, input)
      setLoading(false)
      if (err || !data) {
        setError(err ?? 'Erreur inattendue.')
        return
      }
      router.push(`/teach/${data.id}`)
      return
    }

    if (!course) return
    const { error: err } = await updateCourse(supabase, course.id, input)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="course-title">Titre du cours</label>
        <Input
          id="course-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex : Les salutations en bhété"
          maxLength={120}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="course-summary">Description</label>
        <Textarea
          id="course-summary"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Ce que les apprenants sauront faire à la fin du cours."
          maxLength={500}
          rows={4}
          disabled={disabled}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="course-dialect">Dialecte</label>
          <select
            id="course-dialect"
            value={dialect}
            onChange={e => setDialect(e.target.value as DialectKey)}
            className={selectClass}
            disabled={disabled}
          >
            {DIALECT_KEYS.map(key => (
              <option key={key} value={key}>{DIALECTS[key].name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="course-level">Niveau</label>
          <select
            id="course-level"
            value={level}
            onChange={e => setLevel(e.target.value as CourseLevel)}
            className={selectClass}
            disabled={disabled}
          >
            {LEVELS.map(key => (
              <option key={key} value={key}>{LEVEL_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="course-access">Accès au cours</label>
          <select
            id="course-access"
            value={access}
            onChange={e => setAccess(e.target.value as CourseAccess)}
            className={selectClass}
            disabled={disabled}
          >
            <option value="free">Gratuit</option>
            <option value="paid" disabled>Payant (Bientôt disponible)</option>
          </select>
          <p className="text-xs text-muted-foreground">La création de cours payants est temporairement indisponible (configuration Stripe en cours).</p>
        </div>

        {access === 'paid' && (
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="course-price">Prix ({currency.toUpperCase()})</label>
            <div className="flex gap-2">
              <Input
                id="course-price"
                type="number"
                step="0.01"
                min="1"
                value={priceEuros}
                onChange={e => setPriceEuros(e.target.value)}
                disabled={disabled}
                placeholder="29.00"
              />
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                disabled={disabled}
              >
                <option value="eur">EUR (€)</option>
                <option value="xof">XOF (FCFA)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {access === 'paid' && course && (
        <div className="text-xs p-3 rounded-lg bg-muted border border-border flex items-center justify-between">
          <span className="font-medium text-muted-foreground">Statut de commercialisation :</span>
          <span className={`font-semibold px-2 py-0.5 rounded ${course.paid_approved ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {course.paid_approved ? 'Vente approuvée ✓' : 'En attente d’approbation administrateur'}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!disabled && (
        <Button type="submit" size="lg" disabled={loading || title.trim().length < 3} className="w-full sm:w-auto">
          {loading ? 'Enregistrement…' : mode === 'create' ? 'Créer le cours' : saved ? 'Enregistré ✓' : 'Enregistrer'}
        </Button>
      )}
    </form>
  )
}
