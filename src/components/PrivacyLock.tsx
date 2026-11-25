import { reloadLocalSession } from '../localSession'
import { useEffect, useState, type ReactNode } from 'react'
import { getPreference, savePreference } from '../db/database'

const pinKey = 'privacyPin'
const idleMs = 5 * 60 * 1000

async function hashPin(pin: string, salt: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bytes = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 600_000,
  }, key, 256)
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function matchesPin(pin: string, saved: string) {
  const [salt, hash] = saved.split(':')
  return await hashPin(pin, salt) === hash
}

export function PrivacyGate({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<string>()
  const [locked, setLocked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void getPreference(pinKey).then((value) => {
      if (!active) return
      setSaved(value ?? '')
      setLocked(Boolean(value))
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Privacy settings could not be read.')
    })
    return () => { active = false }
  }, [attempt])

  useEffect(() => {
    if (locked || !saved) return
    let timer: number
    function restart() {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setLocked(true), idleMs)
    }
    restart()
    const events = ['pointerdown', 'keydown', 'input'] as const
    for (const event of events) window.addEventListener(event, restart)
    return () => {
      window.clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, restart)
    }
  }, [locked, saved])

  if (saved === undefined) return (
    <main className="privacy-gate">
      {error ? <><p role="alert">{error}</p><button onClick={() => { setError(''); setAttempt(attempt + 1) }}>Subukan ulit</button></> : <p role="status">Binabasa ang PIN settings…</p>}
    </main>
  )
  if (!locked) return children

  return (
    <main className="privacy-gate">
      <h1>Naka-lock ang MPKPB?</h1>
      <form className="wallet-form" onSubmit={async (event) => {
        event.preventDefault()
        const pin = String(new FormData(event.currentTarget).get('pin'))
        setBusy(true)
        setError('')
        try {
          if (await matchesPin(pin, saved)) setLocked(false)
          else setError('Hindi tugma ang PIN.')
        } catch {
          setError('The privacy PIN could not be verified.')
        } finally {
          setBusy(false)
        }
      }}>
        <PinField name="pin" label="PIN" />
        <button className="button button-primary" disabled={busy}>Buksan</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  )
}

function PinField({ name, label }: { name: string; label: string }) {
  return <label className="field">{label}<input name={name} type="password" inputMode="numeric"
    autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required /></label>
}

export function PrivacySettings() {
  const [enabled, setEnabled] = useState<boolean>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getPreference(pinKey).then((value) => setEnabled(Boolean(value))).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Privacy settings could not be read.'))
  }, [])

  return (
    <section className="geng-settings" aria-labelledby="privacy-title">
      <h2 id="privacy-title">PIN lock</h2>
      <p>Maglagay ng 6 hanggang 12 digit na PIN. Magla-lock kapag binuksan ulit ang app o hindi nagamit nang limang minuto. Nababasa pa rin ang browser storage at backups sa labas ng app.</p>
      {enabled !== undefined && (
        <form className="wallet-form" onSubmit={async (event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const pin = String(form.get('pin'))
          setBusy(true)
          setError('')
          try {
            const saved = await getPreference(pinKey)
            if (saved) {
              if (!await matchesPin(pin, saved)) throw new Error('Hindi tugma ang PIN.')
              await savePreference(pinKey, '')
            } else {
              if (pin !== form.get('confirm')) throw new Error('Dapat magkapareho ang PIN.')
              const salt = crypto.randomUUID()
              await savePreference(pinKey, salt + ':' + await hashPin(pin, salt))
            }
            reloadLocalSession()
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The privacy setting could not be saved.')
            setBusy(false)
          }
        }}>
          <PinField name="pin" label={enabled ? 'Current PIN' : 'New PIN'} />
          {!enabled && <PinField name="confirm" label="Confirm PIN" />}
          <div className="form-row">
            <button className="button button-secondary" disabled={busy}>{enabled ? 'Alisin ang PIN' : 'I-on ang PIN'}</button>
            {enabled && <button className="button button-secondary" type="button" disabled={busy}
              onClick={() => window.location.reload()}>I-lock ngayon</button>}
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
