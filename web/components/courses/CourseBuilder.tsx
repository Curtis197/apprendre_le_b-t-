'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import {
  addLesson,
  addSection,
  applyPositions,
  deleteLesson,
  deleteSection,
  renameSection,
  updateLesson,
} from '@/lib/courses/mutations'
import { changedPositions, moveItem, nextPosition } from '@/lib/courses/reorder'
import type { Course, OutlineSection } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  course: Course
  outline: OutlineSection[]
  readOnly: boolean
}

type Outcome = { error: string | null }

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  )
}

export function CourseBuilder({ course, outline, readOnly }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSection, setNewSection] = useState('')
  const [newLessons, setNewLessons] = useState<Record<string, string>>({})

  async function run(action: () => Promise<Outcome>) {
    setBusy(true)
    setError(null)
    const { error: err } = await action()
    setBusy(false)
    if (err) {
      setError(err)
      return false
    }
    router.refresh()
    return true
  }

  function moveSection(id: string, direction: -1 | 1) {
    const changes = changedPositions(outline, moveItem(outline, id, direction))
    if (changes.length > 0) run(() => applyPositions(supabase, 'course_sections', changes))
  }

  function moveLesson(section: OutlineSection, id: string, direction: -1 | 1) {
    const changes = changedPositions(section.lessons, moveItem(section.lessons, id, direction))
    if (changes.length > 0) run(() => applyPositions(supabase, 'lessons', changes))
  }

  async function handleAddSection(e: React.FormEvent) {
    e.preventDefault()
    const title = newSection.trim()
    if (!title) return
    const ok = await run(() => addSection(supabase, course.id, title, nextPosition(outline)))
    if (ok) setNewSection('')
  }

  async function handleAddLesson(e: React.FormEvent, section: OutlineSection) {
    e.preventDefault()
    const title = (newLessons[section.id] ?? '').trim()
    if (!title) return
    setBusy(true)
    setError(null)
    const result = await addLesson(supabase, {
      courseId: course.id,
      sectionId: section.id,
      title,
      position: nextPosition(section.lessons),
    })
    setBusy(false)
    if (result.error || !result.data) {
      setError(result.error ?? 'Erreur inattendue.')
      return
    }
    router.push(`/teach/${course.id}/lessons/${result.data.id}`)
  }

  return (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-lg">Plan du cours</h2>

      {outline.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune section pour l’instant. Ajoutez-en une pour commencer (par exemple « Introduction »).
        </p>
      )}

      {outline.map(section => (
        <section key={section.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              key={section.title}
              defaultValue={section.title}
              disabled={readOnly || busy}
              aria-label="Titre de la section"
              className="font-heading font-semibold"
              onBlur={e => {
                const value = e.target.value.trim()
                if (value && value !== section.title) run(() => renameSection(supabase, section.id, value))
              }}
            />
            {!readOnly && (
              <>
                <IconButton label="Monter la section" disabled={busy} onClick={() => moveSection(section.id, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </IconButton>
                <IconButton label="Descendre la section" disabled={busy} onClick={() => moveSection(section.id, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </IconButton>
                <IconButton
                  label="Supprimer la section"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Supprimer cette section et toutes ses leçons ?')) {
                      run(() => deleteSection(supabase, section.id))
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </>
            )}
          </div>

          <ul className="space-y-2">
            {section.lessons.map(lesson => (
              <li
                key={lesson.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">{lesson.title}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={lesson.is_preview}
                    disabled={readOnly || busy}
                    onChange={e => run(() => updateLesson(supabase, lesson.id, { is_preview: e.target.checked }))}
                  />
                  Aperçu
                </label>
                {!readOnly && (
                  <>
                    <IconButton label="Monter la leçon" disabled={busy} onClick={() => moveLesson(section, lesson.id, -1)}>
                      <ArrowUp className="w-4 h-4" />
                    </IconButton>
                    <IconButton label="Descendre la leçon" disabled={busy} onClick={() => moveLesson(section, lesson.id, 1)}>
                      <ArrowDown className="w-4 h-4" />
                    </IconButton>
                    <Link
                      href={`/teach/${course.id}/lessons/${lesson.id}`}
                      aria-label="Modifier la leçon"
                      title="Modifier la leçon"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <IconButton
                      label="Supprimer la leçon"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Supprimer cette leçon ?')) run(() => deleteLesson(supabase, lesson.id))
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>

          {!readOnly && (
            <form onSubmit={e => handleAddLesson(e, section)} className="flex gap-2">
              <Input
                value={newLessons[section.id] ?? ''}
                onChange={e => setNewLessons(prev => ({ ...prev, [section.id]: e.target.value }))}
                placeholder="Titre de la nouvelle leçon"
                maxLength={120}
                disabled={busy}
              />
              <Button type="submit" variant="outline" disabled={busy || !(newLessons[section.id] ?? '').trim()}>
                <Plus className="w-4 h-4" />
                Leçon
              </Button>
            </form>
          )}
        </section>
      ))}

      {!readOnly && (
        <form onSubmit={handleAddSection} className="flex gap-2">
          <Input
            value={newSection}
            onChange={e => setNewSection(e.target.value)}
            placeholder="Titre de la nouvelle section"
            maxLength={120}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !newSection.trim()}>
            <Plus className="w-4 h-4" />
            Section
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
