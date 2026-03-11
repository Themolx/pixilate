import { useState, useEffect, useRef, useCallback } from 'react'
import { getFrameUrl, listFrames, uploadFrame } from './supabase'

export default function App() {
  const [session, setSession] = useState<string | null>(null)
  const [sessionInput, setSessionInput] = useState('')

  if (!session) {
    return (
      <div className="session-picker">
        <h1>PIXILATE</h1>
        <p>Collaborative stop-motion animation.<br />Join a session or create a new one.</p>
        <input
          value={sessionInput}
          onChange={e => setSessionInput(e.target.value)}
          placeholder="Session name"
          autoFocus
        />
        <button
          onClick={() => {
            const name = sessionInput.trim() || `session-${Date.now()}`
            setSession(name)
          }}
        >
          Join Session
        </button>
      </div>
    )
  }

  return <CameraView session={session} onBack={() => setSession(null)} />
}

function CameraView({ session, onBack }: { session: string; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [framePaths, setFramePaths] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [onionOpacity, setOnionOpacity] = useState(0.3)
  const [showPlayback, setShowPlayback] = useState(false)
  const [playbackIdx, setPlaybackIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  // Load existing frames
  const loadFrames = useCallback(async () => {
    const paths = await listFrames(session)
    setFramePaths(paths)
    setLoading(false)
  }, [session])

  // Start camera
  useEffect(() => {
    let mounted = true
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream
          streamRef.current = stream
        }
      } catch (err) {
        console.error('Camera error:', err)
      }
    }
    startCamera()
    loadFrames()

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [loadFrames])

  // Poll for new frames every 5s
  useEffect(() => {
    const interval = setInterval(loadFrames, 5000)
    return () => clearInterval(interval)
  }, [loadFrames])

  // Draw onion skin
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || framePaths.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get last 3 frames for onion skinning
    const onionPaths = framePaths.slice(-3)
    const images: HTMLImageElement[] = []
    let loaded = 0

    onionPaths.forEach((path, i) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        loaded++
        images[i] = img
        if (loaded === onionPaths.length) {
          drawOnion(ctx, canvas, images, onionOpacity)
        }
      }
      img.onerror = () => {
        loaded++
        if (loaded === onionPaths.length) {
          drawOnion(ctx, canvas, images.filter(Boolean), onionOpacity)
        }
      }
      img.src = getFrameUrl(path)
    })
  }, [framePaths, onionOpacity])

  function drawOnion(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    images: HTMLImageElement[],
    opacity: number
  ) {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    images.forEach((img, i) => {
      const layerOpacity = opacity * ((i + 1) / images.length)
      ctx.globalAlpha = layerOpacity
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = (canvas.width - w) / 2
      const y = (canvas.height - h) / 2
      ctx.drawImage(img, x, y, w, h)
    })
    ctx.globalAlpha = 1
  }

  // Capture frame
  async function captureFrame() {
    const video = videoRef.current
    if (!video || capturing) return

    setCapturing(true)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = video.videoWidth
    tempCanvas.height = video.videoHeight
    const ctx = tempCanvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)

    const blob = await new Promise<Blob>((resolve) => {
      tempCanvas.toBlob(b => resolve(b!), 'image/jpeg', 0.85)
    })

    const nextNumber = framePaths.length + 1
    const path = await uploadFrame(session, nextNumber, blob)

    if (path) {
      await loadFrames()
    }
    setCapturing(false)
  }

  // Playback
  useEffect(() => {
    if (!playing || !showPlayback || framePaths.length === 0) return
    const interval = setInterval(() => {
      setPlaybackIdx(prev => {
        const next = prev + 1
        if (next >= framePaths.length) {
          setPlaying(false)
          return 0
        }
        return next
      })
    }, 150)
    return () => clearInterval(interval)
  }, [playing, showPlayback, framePaths.length])

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (showPlayback && framePaths.length > 0) {
    return (
      <div className="playback-overlay">
        <img
          src={getFrameUrl(framePaths[playbackIdx])}
          alt={`Frame ${playbackIdx + 1}`}
          crossOrigin="anonymous"
        />
        <div className="playback-controls">
          <button onClick={() => {
            if (playing) { setPlaying(false) } else { setPlaybackIdx(0); setPlaying(true) }
          }}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <span>{playbackIdx + 1} / {framePaths.length}</span>
          <button onClick={() => { setPlaying(false); setShowPlayback(false) }}>
            ✕ Close
          </button>
        </div>
        <div className="timeline">
          {framePaths.map((p, i) => (
            <img
              key={p}
              src={getFrameUrl(p)}
              className={`timeline-thumb ${i === playbackIdx ? 'current' : ''}`}
              onClick={() => { setPlaying(false); setPlaybackIdx(i) }}
              crossOrigin="anonymous"
              alt=""
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="viewport">
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} className="onion-layer" />

        <div className="frame-count">
          {framePaths.length} frames • {session}
        </div>

        <div className="onion-control">
          <span>Onion: {Math.round(onionOpacity * 100)}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={onionOpacity * 100}
            onChange={e => setOnionOpacity(Number(e.target.value) / 100)}
          />
        </div>
      </div>

      <div className="controls">
        <button className="side-btn" onClick={onBack} title="Back">
          ←
        </button>
        <button
          className="capture-btn"
          onClick={captureFrame}
          disabled={capturing}
          title="Capture"
        />
        <button
          className="side-btn"
          onClick={() => { setPlaybackIdx(0); setShowPlayback(true) }}
          disabled={framePaths.length === 0}
          title="Play"
        >
          ▶
        </button>
      </div>

      {framePaths.length > 0 && (
        <div className="timeline">
          {framePaths.map((p, i) => (
            <img
              key={p}
              src={getFrameUrl(p)}
              className={`timeline-thumb ${i === framePaths.length - 1 ? 'current' : ''}`}
              crossOrigin="anonymous"
              alt=""
            />
          ))}
        </div>
      )}
    </div>
  )
}
