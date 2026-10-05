'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_RECORDING_SECONDS, pickRecordingMimeType } from '@/lib/courses/pronunciation'

interface Props {
  disabled?: boolean
  sending?: boolean
  maxSeconds?: number
  startLabel?: string
  sendLabel?: string
  sendingLabel?: string
  /** Hide the send button: the caller reads the recording through onRecorded. */
  hideSend?: boolean
  onSend?: (blob: Blob) => void
  /** The recording when it stops, null when it is discarded or a new one starts. */
  onRecorded?: (blob: Blob | null) => void
  /** True while the microphone is recording. */
  onRecordingChange?: (recording: boolean) => void
}

export function PronunciationRecorder({
  disabled = false,
  sending = false,
  maxSeconds = MAX_RECORDING_SECONDS,
  startLabel = 'Enregistrer ma prononciation',
  sendLabel = 'Envoyer à l’enseignant',
  sendingLabel = 'Envoi…',
  hideSend = false,
  onSend,
  onRecorded,
  onRecordingChange,
}: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function cleanupStream() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    onRecordingChange?.(phase === 'recording')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    return () => {
      cleanupStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function start() {
    setError(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Votre navigateur ne permet pas l’enregistrement audio. Essayez Chrome, Firefox ou Safari récent.')
      return
    }
    const mimeType = pickRecordingMimeType(m => MediaRecorder.isTypeSupported(m))
    if (!mimeType) {
      setError('Aucun format d’enregistrement audio n’est pris en charge par votre navigateur.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const chunks: Blob[] = []
      onRecorded?.(null)
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        const recorded = new Blob(chunks, { type: mimeType })
        cleanupStream()
        setBlob(recorded)
        onRecorded?.(recorded)
        setPreviewUrl(URL.createObjectURL(recorded))
        setPhase('recorded')
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      setPhase('recording')
      timerRef.current = setInterval(() => {
        setSeconds(prev => {
          if (prev + 1 >= maxSeconds) recorderRef.current?.stop()
          return prev + 1
        })
      }, 1000)
    } catch {
      cleanupStream()
      setError('Accès au microphone refusé. Autorisez le micro dans votre navigateur puis réessayez.')
    }
  }

  function stop() {
    recorderRef.current?.stop()
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setBlob(null)
    onRecorded?.(null)
    setSeconds(0)
    setPhase('idle')
  }

  return (
    <div className="space-y-4">
      {phase === 'idle' && (
        <Button type="button" onClick={start} disabled={disabled}>
          <Mic className="w-4 h-4 mr-2" />
          {startLabel}
        </Button>
      )}

      {phase === 'recording' && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-destructive" role="status">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            Enregistrement… {seconds}s / {maxSeconds}s
          </span>
          <Button type="button" variant="outline" onClick={stop}>
            <Square className="w-4 h-4 mr-2" />
            Arrêter
          </Button>
        </div>
      )}

      {phase === 'recorded' && previewUrl && blob && (
        <div className="space-y-3">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex flex-wrap gap-3">
            {!hideSend && (
              <Button type="button" onClick={() => onSend?.(blob)} disabled={disabled || sending}>
                <Send className="w-4 h-4 mr-2" />
                {sending ? sendingLabel : sendLabel}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={reset} disabled={sending}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Recommencer
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
