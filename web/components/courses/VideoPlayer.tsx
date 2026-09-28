'use client'
import { useRef, useState, useEffect } from 'react'
import { Play, Pause, Maximize, RotateCcw, Volume2, VolumeX, AlertTriangle } from 'lucide-react'
import { formatVideoDuration } from '@/lib/courses/video'
import { Button } from '@/components/ui/button'

interface Props {
  playbackId: string
  signedToken?: string | null
  title?: string
  className?: string
}

const SPEEDS = [0.8, 1.0, 1.25, 1.5]

const MEDIA_ERROR_MAP: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED — Le chargement de la vidéo a été interrompu par l’utilisateur.',
  2: 'MEDIA_ERR_NETWORK — Une erreur réseau est survenue lors de la récupération de la vidéo.',
  3: 'MEDIA_ERR_DECODE — Une erreur s’est produite lors du décodage de la vidéo.',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED — Le flux vidéo ou le jeton de lecture Mux n’a pas pu être chargé.',
}

export function VideoPlayer({ playbackId, signedToken, title, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const streamUrl = signedToken
    ? `https://stream.mux.com/${playbackId}.m3u8?token=${signedToken}`
    : `https://stream.mux.com/${playbackId}.m3u8`

  useEffect(() => {
    console.log('[VideoPlayer] 🎥 Component initialized / updated:', {
      playbackId,
      hasSignedToken: Boolean(signedToken),
      signedTokenLength: signedToken?.length ?? 0,
      title: title ?? 'Untitled',
      streamUrl: streamUrl.replace(/token=([^&]+)/, 'token=[REDACTED]'),
    })
  }, [playbackId, signedToken, title, streamUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => setCurrentTime(video.currentTime)
    const updateDuration = () => {
      console.log('[VideoPlayer] 📊 Metadata loaded:', {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
      })
      setDuration(video.duration || 0)
    }

    const onPlay = () => {
      console.log('[VideoPlayer] ▶️ Playback started / resumed at:', video.currentTime.toFixed(2), 's')
      setIsPlaying(true)
      setPlaybackError(null)
    }

    const onPause = () => {
      console.log('[VideoPlayer] ⏸️ Playback paused at:', video.currentTime.toFixed(2), 's')
      setIsPlaying(false)
    }

    const onEnded = () => {
      console.log('[VideoPlayer] ✅ Video playback completed')
      setIsPlaying(false)
    }

    const onLoadStart = () => {
      console.log('[VideoPlayer] 🚀 Video loadstart event triggered for playbackId:', playbackId)
    }

    const onCanPlay = () => {
      console.log('[VideoPlayer] ✨ Video canplay event — ready state:', video.readyState)
    }

    const onWaiting = () => {
      console.warn('[VideoPlayer] ⏳ Video waiting / buffering at:', video.currentTime.toFixed(2), 's')
    }

    const onError = (e: Event) => {
      const mediaError = video.error
      const code = mediaError?.code ?? 0
      const errorMsg = mediaError?.message || MEDIA_ERROR_MAP[code] || 'Erreur de lecture vidéo inconnue.'

      console.error('[VideoPlayer] ❌ HTML5 Video Error Details:', {
        code,
        codeDescription: MEDIA_ERROR_MAP[code] ?? 'UNKNOWN_ERROR',
        message: mediaError?.message,
        nativeEvent: e,
        playbackId,
        hasSignedToken: Boolean(signedToken),
        streamUrl: streamUrl.replace(/token=([^&]+)/, 'token=[REDACTED]'),
      })

      setPlaybackError(`Erreur de lecture (${code}): ${errorMsg}`)
      setIsPlaying(false)
    }

    video.addEventListener('timeupdate', updateTime)
    video.addEventListener('loadedmetadata', updateDuration)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('loadstart', onLoadStart)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('timeupdate', updateTime)
      video.removeEventListener('loadedmetadata', updateDuration)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('loadstart', onLoadStart)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('error', onError)
    }
  }, [playbackId, signedToken, streamUrl])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      console.log('[VideoPlayer] 🖱️ User clicked play. Attempting video.play()...')
      video
        .play()
        .then(() => {
          console.log('[VideoPlayer] ✅ video.play() promise resolved cleanly')
        })
        .catch(err => {
          console.error('[VideoPlayer] ❌ video.play() rejected:', err)
          setPlaybackError(`Impossible de lancer la lecture : ${err.message}`)
          setIsPlaying(false)
        })
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    console.log('[VideoPlayer] ⏩ Seeking to:', time.toFixed(2), 's')
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    const nextSpeed = SPEEDS[nextIndex]
    console.log('[VideoPlayer] ⏩ Playback speed changed to:', nextSpeed, 'x')
    setSpeedIndex(nextIndex)
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted
      console.log('[VideoPlayer] 🔊 Audio muted toggled to:', nextMuted)
      videoRef.current.muted = nextMuted
      setIsMuted(nextMuted)
    }
  }

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        console.log('[VideoPlayer] 🖥️ Requesting fullscreen mode')
        containerRef.current.requestFullscreen().catch(err => {
          console.warn('[VideoPlayer] ⚠️ Fullscreen request failed:', err)
        })
      } else {
        console.log('[VideoPlayer] 🖥️ Exiting fullscreen mode')
        document.exitFullscreen().catch(() => null)
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative bg-black rounded-xl overflow-hidden border border-border group ${className}`}>
      {playbackError && (
        <div className="bg-destructive/20 border-b border-destructive/40 text-destructive-foreground px-4 py-2 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
          <span className="font-medium flex-1 truncate">{playbackError}</span>
        </div>
      )}

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
                if (videoRef.current) {
                  const newTime = Math.max(0, videoRef.current.currentTime - 10)
                  console.log('[VideoPlayer] ⏪ Jump back 10s to:', newTime.toFixed(2), 's')
                  videoRef.current.currentTime = newTime
                }
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
