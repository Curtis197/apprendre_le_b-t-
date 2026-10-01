'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { deleteCommunityText } from '@/lib/community-mutations'

interface Props {
  id: string
  /** The contributor who published it. */
  canEdit: boolean
  /** The contributor, or an admin. */
  canDelete: boolean
}

export function ResourceOwnerActions({ id, canEdit, canDelete }: Props) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!window.confirm('Supprimer cette ressource et ses commentaires ? Cette action est définitive.')) return
    setDeleting(true)
    setError(null)
    const { error: err } = await deleteCommunityText(supabaseRef.current, id)
    if (err) {
      setDeleting(false)
      setError(err)
      return
    }
    router.push('/resources')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (
        <Link
          href={`/resources/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-8 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Modifier
        </Link>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 h-8 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleting ? 'Suppression…' : 'Supprimer'}
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
