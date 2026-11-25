import { useEffect, useRef } from 'react'
import idleUrl from '../assets/geng-idle.webp'
import atlasUrl from '../assets/geng-frames.webp'
import { mascotFrame, mascotIdleMs, MASCOT_PLAY_MS, MASCOT_RETURN_MS } from '../domain/mascot'

const width = 256
const height = 253

export default function Mascot({ animated = false, className = '' }: { animated?: boolean; className?: string }) {
  const host = useRef<HTMLSpanElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const surface = canvas.current
    const element = host.current
    if (!animated || !surface || !element || !('IntersectionObserver' in window)) return
    const context = surface.getContext('2d')
    if (!context) return

    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let image: HTMLImageElement | undefined
    let requested = false
    let disposed = false
    let inView = false
    let timer: number | undefined
    let repaint = 0
    let startedAt: number | undefined
    let elapsed = 0
    let drawnFrame = -1

    function draw(index: number, blend = 0) {
      if (!context || !surface || !image || (drawnFrame === index && !blend)) return
      context.clearRect(0, 0, width, height)
      context.globalAlpha = 1 - blend
      context.drawImage(image, index % 3 * width, Math.floor(index / 3) * height, width, height, 0, 0, width, height)
      if (blend) {
        context.globalCompositeOperation = 'lighter'
        context.globalAlpha = blend
        context.drawImage(image, 0, 0, width, height, 0, 0, width, height)
        context.globalCompositeOperation = 'source-over'
      }
      context.globalAlpha = 1
      drawnFrame = blend ? -1 : index
      surface.dataset.frame = String(index)
    }

    const permitted = () => inView && !document.hidden && !motion.matches

    function tick(now: number) {
      if (startedAt === undefined) return
      const progress = elapsed + now - startedAt
      if (progress >= MASCOT_PLAY_MS + MASCOT_RETURN_MS) {
        startedAt = undefined
        elapsed = 0
        draw(0)
        sync()
        return
      }
      const frame = mascotFrame(progress)
      draw(frame.index, frame.blend)
      repaint = requestAnimationFrame(tick)
    }

    function begin() {
      timer = undefined
      if (!permitted()) return
      startedAt = performance.now()
      repaint = requestAnimationFrame(tick)
    }

    function stop() {
      window.clearTimeout(timer)
      timer = undefined
      cancelAnimationFrame(repaint)
      if (startedAt !== undefined) {
        elapsed += performance.now() - startedAt
        startedAt = undefined
      }
    }

    function sync() {
      if (disposed || !surface) return
      if (!permitted()) {
        stop()
        if (motion.matches) {
          elapsed = 0
          draw(0)
          surface.hidden = true
        }
        return
      }
      if (!image) {
        if (requested) return
        requested = true
        const atlas = new Image()
        atlas.src = atlasUrl
        void atlas.decode().then(() => {
          if (disposed) return
          image = atlas
          sync()
        }).catch(() => { /* The static pose remains available. */ })
        return
      }
      if (surface.hidden) {
        draw(0)
        surface.hidden = false
      }
      if (startedAt !== undefined || timer !== undefined) return
      if (elapsed) begin()
      else timer = window.setTimeout(begin, mascotIdleMs())
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      sync()
    }, { threshold: 0.01 })
    observer.observe(element)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    return () => {
      disposed = true
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
    }
  }, [animated])

  return <span ref={host} className={`mascot ${className}`} aria-hidden="true">
    <img src={idleUrl} width={width} height={height} alt="" draggable={false} />
    {animated && <canvas ref={canvas} width={width} height={height} hidden />}
  </span>
}
