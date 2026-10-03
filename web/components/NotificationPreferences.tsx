'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { CATEGORY_LABELS, EMAIL_CATEGORIES, type EmailCategory } from '@/lib/mail/categories'

type Prefs = Record<EmailCategory, boolean>
const DEFAULTS: Prefs = { teacher_announcements: true, weekly_progress: true, course_activity: true }

export function NotificationPreferences() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: auth } = await supabase.auth.getUser()
      if (cancelled) return
      if (!auth.user) {
        setLoading(false)
        return
      }
      setUserId(auth.user.id)
      const { data } = await supabase
        .from('email_preferences')
        .select('teacher_announcements, weekly_progress, course_activity')
        .eq('user_id', auth.user.id)
        .maybeSingle()
      if (!cancelled && data) setPrefs(data as Prefs)
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function toggle(category: EmailCategory, value: boolean) {
    if (!userId) return
    const previous = prefs
    setPrefs({ ...prefs, [category]: value })
    setError(null)
    const { error: saveError } = await supabase
      .from('email_preferences')
      .upsert({ user_id: userId, [category]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (saveError) {
      setPrefs(previous)
      setError('Impossible d’enregistrer. Réessayez.')
    }
  }

  if (loading) return <p className="mt-8 text-muted-foreground">Chargement…</p>
  if (!userId) {
    return (
      <p className="mt-8">
        <Link className="underline" href="/auth">Connectez-vous</Link> pour gérer vos notifications.
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-4">
      {EMAIL_CATEGORIES.map((category) => (
        <label key={category} className="flex items-center gap-3 rounded-lg border p-4">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={prefs[category]}
            onChange={(e) => void toggle(category, e.target.checked)}
          />
          <span>{CATEGORY_LABELS[category]}</span>
        </label>
      ))}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  )
}
