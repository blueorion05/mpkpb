import { useEffect, useState } from 'react'

export default function OfflineStatus({ showReady }: { showReady: boolean }) {
  const [waiting, setWaiting] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let active = true
    let cleanup = () => {}
    const refresh = () => {
      if (active) setOfflineReady(Boolean(navigator.serviceWorker.controller))
    }
    navigator.serviceWorker.addEventListener('controllerchange', refresh)
    refresh()
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then((registration) => {
      if (!active) return
      const workers = new Set<ServiceWorker>()
      const inspect = () => {
        setWaiting(Boolean(registration.waiting))
        const worker = registration.installing
        if (worker && !workers.has(worker)) {
          workers.add(worker)
          worker.addEventListener('statechange', inspect)
        }
      }
      inspect()
      registration.addEventListener('updatefound', inspect)
      cleanup = () => {
        registration.removeEventListener('updatefound', inspect)
        for (const worker of workers) worker.removeEventListener('statechange', inspect)
      }
    }).catch(() => { if (active) setError(true) })
    return () => {
      active = false
      cleanup()
      navigator.serviceWorker.removeEventListener('controllerchange', refresh)
    }
  }, [])

  if (waiting) return <p className="geng-note" role="status">An app update is ready. Finish your changes, close all MPKPB? tabs and app windows, then reopen.</p>
  if (error) return <p className="geng-note" role="status">Offline setup failed. Reopen the app while online to try again.</p>
  return offlineReady && showReady ? <p className="geng-note" role="status">Offline access is ready on this device.</p> : null
}
