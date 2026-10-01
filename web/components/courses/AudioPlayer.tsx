'use client'
import { useRef, useState, useEffect } from 'react'
import { Play, Pause, RotateCcw, Volume2, VolumeX, CheckCircle2 } from 'lucide-react'
import { formatAudioDuration } from '@/lib/courses/audio'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import { saveLessonProgress } from '@/lib/courses/mutations'

interface Props {
  src: string
  title?: string
  className?: string
  lessonId?: string
  initialProgressPercent?: number
  onProgress?: (percent: number, completed: boolean) => void
}

const SPEEDS = [0.8, 1.0, 1.2]

export function AudioPlayer({
  src,
  title,
  className = '',
  lessonId,
  initialProgressPercent = 0,
  onProgress,
}: Props) {
  const [supabase] = useState(() => createClient())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1) // Default 1.0x
  const [isMuted, setIsMuted] = useState(false)
  const [progressPercent, setProgressPercent] = useState(initialProgressPercent)

  const maxPercentRef = useRef(initialProgressPercent)
  const lastSyncedRef = useRef(initialProgressPercent)
  const hasSeekedInitialRef = useRef(false)
  // The playback effect must not re-subscribe on every render, so it reads the latest values through refs.
  const initialPercentRef = useRef(initialProgressPercent)
  const syncRef = useRef<(percent: number, completed: boolean) => Promise<void>>(async () => {})

  const syncProgress = async (percent: number, completed: boolean) => {
    if (!lessonId) return
    if (Math.abs(percent - lastSyncedRef.current) < 5 && !completed) return
    lastSyncedRef.current = percent
    setProgressPercent(percent)
    await saveLessonProgress(supabase, lessonId, {
      progressPercent: percent,
      completed,
    })
    onProgress?.(percent, completed)
  }

  useEffect(() => {
    syncRef.current = syncProgress
    initialPercentRef.current = initialProgressPercent
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => {
      const current = audio.currentTime
      setCurrentTime(current)
      if (audio.duration > 0) {
        const pct = Math.min(100, Math.round((current / audio.duration) * 100))
        if (pct > maxPercentRef.current) {
          maxPercentRef.current = pct
          setProgressPercent(pct)
        }
        const isCompleted = maxPercentRef.current >= 90
        syncRef.current(isCompleted ? 100 : maxPercentRef.current, isCompleted)
      }
    }

    const updateDuration = () => {
      const dur = audio.duration || 0
      setDuration(dur)
      if (
        !hasSeekedInitialRef.current &&
        initialPercentRef.current > 0 &&
        initialPercentRef.current < 90 &&
        dur > 0
      ) {
        hasSeekedInitialRef.current = true
        audio.currentTime = (initialPercentRef.current / 100) * dur
        setCurrentTime(audio.currentTime)
      }
    }

    const onEnded = () => {
      setIsPlaying(false)
      maxPercentRef.current = 100
      setProgressPercent(100)
      syncRef.current(100, true)
    }

    const onPause = () => {
      setIsPlaying(false)
      const isCompleted = maxPercentRef.current >= 90
      syncRef.current(isCompleted ? 100 : maxPercentRef.current, isCompleted)
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
    }
  }, [src, lessonId])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    const nextSpeed = SPEEDS[nextIndex]
    setSpeedIndex(nextIndex)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const rewind = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5)
    }
  }

  return (
    <div className={`bg-card border border-border rounded-xl p-4 flex flex-col gap-3 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        {title && (
          <div className="flex items-center gap-2 truncate">
            <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">{title}</span>
          </div>
        )}
        {progressPercent > 0 && (
          <span
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              progressPercent >= 100 ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'
            }`}
          >
            {progressPercent >= 100 ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                Écouté à 100%
              </>
            ) : (
              `Écouté à ${progressPercent}%`
            )}
          </span>
        )}
      </div>

      {/* Progress slider */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-10 text-right">
          {formatAudioDuration(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Progression audio"
          className="flex-1 accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
        />
        <span className="text-xs font-mono text-muted-foreground w-10">
          {formatAudioDuration(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={togglePlay}
            className="w-10 h-10 p-0 rounded-full"
            aria-label={isPlaying ? 'Mettre en pause' : 'Lire'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>

          <button
            type="button"
            onClick={rewind}
            title="Reculer de 5 secondes"
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSpeed}
            className="px-2 py-1 rounded text-xs font-semibold border border-border hover:bg-muted transition-colors"
            title="Changer la vitesse de lecture"
          >
            {SPEEDS[speedIndex]}x
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-destructive" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
