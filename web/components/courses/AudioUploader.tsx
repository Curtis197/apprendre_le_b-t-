'use client'
import { useState, useRef } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { uploadLessonAudio, deleteLessonAudio } from '@/lib/courses/mutations'
import { AudioPlayer } from './AudioPlayer'
import { Button } from '@/components/ui/button'

interface Props {
  courseOwnerId: string
  lessonId: string
  audioPath: string | null
  signedAudioUrl: string | null
  disabled?: boolean
  onUpdated: () => void
}

export function AudioUploader({ courseOwnerId, lessonId, audioPath, signedAudioUrl, disabled = false, onUpdated }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [supabase] = useState(() => createClient())
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    const result = await uploadLessonAudio(supabase, courseOwnerId, lessonId, file)
    setUploading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onUpdated()
  }

  async function handleDelete() {
    if (!audioPath || !window.confirm('Supprimer cet enregistrement audio ?')) return

    setUploading(true)
    setError(null)
    const result = await deleteLessonAudio(supabase, lessonId, audioPath)
    setUploading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onUpdated()
  }

  return (
    <div className="space-y-4">
      {signedAudioUrl ? (
        <div className="space-y-3">
          <AudioPlayer src={signedAudioUrl} title="Audio de la leçon" />
          {!disabled && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={uploading}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Supprimer l’audio
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Ajoutez un enregistrement pour cette leçon (format MP3 ou M4A, 10 Mo max).
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
            className="hidden"
            disabled={disabled || uploading}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Téléversement…' : 'Choisir un fichier audio'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
