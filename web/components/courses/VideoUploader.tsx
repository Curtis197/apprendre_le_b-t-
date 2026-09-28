'use client'
import { useState, useRef } from 'react'
import { Upload, Trash2, Video, RefreshCw, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { createVideoUploadUrl, deleteMediaAsset } from '@/lib/courses/mutations'
import type { MediaAsset, VideoQuota } from '@/lib/courses/video'
import { formatVideoDuration } from '@/lib/courses/video'
import { Button } from '@/components/ui/button'

interface Props {
  lessonId: string
  mediaAsset: MediaAsset | null
  videoQuota: VideoQuota
  disabled?: boolean
  onUpdated: () => void
}

export function VideoUploader({ lessonId, mediaAsset, videoQuota, disabled = false, onUpdated }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [supabase] = useState(() => createClient())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    console.log('[VideoUploader] 📁 File selected:', {
      name: file.name,
      sizeBytes: file.size,
      sizeMB: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      type: file.type,
      lessonId,
    })

    setUploading(true)
    setError(null)
    setProgress(5)

    // 1. Request direct upload URL from server via API route
    console.log('[VideoUploader] 📡 Requesting Mux direct upload URL from server for lesson:', lessonId)
    const apiRes = await fetch('/api/mux/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId }),
    })
    const res = await apiRes.json().catch(() => ({}))
    if (!apiRes.ok || !res.uploadUrl) {
      console.error('[VideoUploader] ❌ Server API failed to return Mux upload URL:', res.error)
      setUploading(false)
      setError(res.error ?? 'Erreur lors de la création du lien de versement.')
      return
    }

    console.log('[VideoUploader] ✅ Mux direct upload URL received:', {
      assetId: res.assetId,
      uploadUrl: res.uploadUrl.substring(0, 45) + '...',
    })

    // 2. Upload video file directly to Mux via XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', res.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 90) + 5
        setProgress(percent)
        console.log(`[VideoUploader] ⏳ Progress: ${percent}% (${event.loaded}/${event.total} bytes)`)
      }
    }

    xhr.onload = () => {
      setUploading(false)
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('[VideoUploader] 🎉 Video upload to Mux succeeded! HTTP Status:', xhr.status)
        onUpdated()
      } else {
        console.error('[VideoUploader] ❌ Mux direct upload failed with HTTP status:', xhr.status, xhr.responseText)
        setError(`Erreur lors du versement de la vidéo (statut HTTP ${xhr.status}).`)
      }
    }

    xhr.onerror = err => {
      console.error('[VideoUploader] ❌ Network error during Mux direct upload:', err)
      setUploading(false)
      setError('Erreur réseau lors du versement de la vidéo.')
    }

    console.log('[VideoUploader] 🚀 Starting direct PUT upload to Mux API...')
    xhr.send(file)
  }

  async function handleDelete() {
    if (!mediaAsset || !window.confirm('Supprimer cette vidéo ?')) return
    setUploading(true)
    setError(null)
    const res = await deleteMediaAsset(supabase, mediaAsset.id, mediaAsset.mux_asset_id)
    setUploading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onUpdated()
  }

  return (
    <div className="space-y-4">
      {/* Quota meter */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Quota vidéo enseignant :</span>
        <span className="font-mono font-semibold">
          {videoQuota.used_minutes} / {videoQuota.max_minutes} min utilisées
        </span>
      </div>

      {mediaAsset && mediaAsset.status === 'ready' && (
        <div className="border border-border rounded-xl p-4 bg-card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Video className="w-4 h-4 text-primary" />
              <span>Vidéo prête ({formatVideoDuration(mediaAsset.duration_seconds)})</span>
            </div>
            {!disabled && (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={uploading}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Supprimer
              </Button>
            )}
          </div>
        </div>
      )}

      {mediaAsset && mediaAsset.status === 'processing' && (
        <div className="border border-border rounded-xl p-5 bg-card text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Traitement de la vidéo en cours par Mux…
          </div>
          <p className="text-xs text-muted-foreground">
            Votre vidéo a été transmise. Elle sera lisible automatiquement dans quelques instants.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onUpdated}>
            Actualiser le statut
          </Button>
        </div>
      )}

      {mediaAsset && mediaAsset.status === 'errored' && (
        <div className="border border-destructive/40 bg-destructive/10 rounded-xl p-4 text-destructive space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="w-4 h-4" />
            Échec du traitement vidéo
          </div>
          <p className="text-xs">{mediaAsset.error_message ?? 'Format vidéo non supporté.'}</p>
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={handleDelete}>
              Réessayer le versement
            </Button>
          )}
        </div>
      )}

      {(!mediaAsset || mediaAsset.status === 'uploading') && (
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Sélectionnez une vidéo (MP4, MOV, 30 min max).
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            disabled={disabled || uploading}
          />

          {uploading ? (
            <div className="space-y-2 max-w-xs mx-auto">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs font-mono text-muted-foreground">Versement : {progress}%</p>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choisir un fichier vidéo
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
