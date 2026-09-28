'use client'
import { useRef, useState, useEffect } from 'react'
import { Play, Pause, Maximize, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { formatVideoDuration } from '@/lib/courses/video'
import { Button } from '@/components/ui/button'

interface Props {
  playbackId: string
  signedToken?: string | null
  title?: string
  className?: string
}

const SPEEDS = [0.8, 1.0, 1.25, 1.5]

export function VideoPlayer({ playbackId, signedToken, title, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [isMuted, setIsMuted] = useState(false)

  const streamUrl = signedToken
    ? `https://stream.mux.com/${playbackId}.m3u8?token=${signedToken}`
    : `https://stream.mux.com/${playbackId}.m3u8`

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => setCurrentTime(video.currentTime)
    const updateDuration = () => setDuration(video.duration || 0)
    const onEnded = () => setIsPlaying(false)

    video.addEventListener('timeupdate', updateTime)
    video.addEventListener('loadedmetadata', updateDuration)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('timeupdate', updateTime)
      video.removeEventListener('loadedmetadata', updateDuration)
      video.removeEventListener('ended', onEnded)
    }
  }, [playbackId, signedToken])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    const nextSpeed = SPEEDS[nextIndex]
    setSpeedIndex(nextIndex)
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => null)
      } else {
        document.exitFullscreen().catch(() => null)
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative bg-black rounded-xl overflow-hidden border border-border group ${className}`}>
      <video
        ref={videoRef}
        src={streamUrl}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        className="w-full aspect-video object-contain cursor-pointer"
      />

      {/* Overlay controls */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 flex flex-col gap-2 transition-opacity duration-200 opacity-90 group-hover:opacity-100">
        {title && <p className="text-xs font-semibold text-white/90 truncate">{title}</p>}

        {/* Scrubber */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-white/80 w-12 text-right">
            {formatVideoDuration(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Progression vidéo"
            className="flex-1 accent-primary h-1.5 bg-white/20 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-white/80 w-12">
            {formatVideoDuration(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={togglePlay}
              className="text-white hover:bg-white/20 p-2 h-8 w-8"
              aria-label={isPlaying ? 'Mettre en pause' : 'Lire'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10)
              }}
              title="Reculer de 10 secondes"
              className="text-white/80 hover:text-white p-1.5 text-xs flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              10s
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSpeed}
              className="px-2 py-0.5 rounded text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {SPEEDS[speedIndex]}x
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              className="text-white/80 hover:text-white p-1.5"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-destructive" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Plein écran"
              className="text-white/80 hover:text-white p-1.5"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
