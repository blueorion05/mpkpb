import Toast from './Toast'
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

  if (waiting) return <Toast key="Ready na ang update. Tap" tone="info" message="Ready na ang update. Tapusin muna ang ginagawa mo, isara lahat ng MPKPB? tabs at windows, tapos buksan ulit." />
  if (error) return <Toast key="Hindi na-set up ang offl" tone="error" message="Hindi na-set up ang offline access. Buksan ulit ang app habang online." />
  return offlineReady && showReady ? <Toast key="Ready na kahit offline a" tone="info" message="Ready na kahit offline ang device." /> : null
}
