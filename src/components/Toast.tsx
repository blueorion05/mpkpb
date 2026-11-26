import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function Toast({ message, tone = 'info', onDismiss, action }: {
  message: string
  tone?: 'success' | 'error' | 'info'
  onDismiss?: () => void
  action?: ReactNode
}) {
  const [dismissed, setDismissed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (dismissed || hovered || focused) return
    const timer = window.setTimeout(() => setDismissed(true), tone === 'error' ? 10_000 : 5_000)
    return () => window.clearTimeout(timer)
  }, [dismissed, hovered, focused, tone])

  useEffect(() => {
    if (dismissed) onDismiss?.()
  }, [dismissed, onDismiss])

  const region = document.getElementById('app-toasts')
  if (!region || dismissed) return null
  const Symbol = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info

  return createPortal(
    <div className={`app-toast toast-${tone}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}>
      <Symbol className="ui-icon" aria-hidden="true" />
      <span role={tone === 'error' ? 'alert' : 'status'}>{message}</span>
      {action}
      <button type="button" className="icon-button" aria-label="Isara ang notification" title="Isara"
        onClick={() => setDismissed(true)}><X className="ui-icon" aria-hidden="true" /></button>
    </div>,
    region,
  )
}
