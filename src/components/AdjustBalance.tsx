import { useEffect, useRef, useState, type FormEvent } from 'react'
import { balanceAdjustment, formatPHP, parsePesoToCentavos } from '../domain/money'

export default function AdjustBalance({ name, recorded, onClose, onSave }: {
  name: string; recorded: number; onClose: () => void;
  onSave: (amount: number, reason: string, recorded: number) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = parsePesoToCentavos(value.trim().replace(/^-/, ''))
  let adjustment: number | undefined
  if (input !== null) {
    try { adjustment = balanceAdjustment(recorded, value.trim().startsWith('-') ? -input : input) }
    catch { /* The entered balance is outside the supported range. */ }
  }
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adjustment || busy) return
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
    setBusy(true)
    setError('')
    try { await onSave(adjustment, reason, recorded) }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Hindi na-save ang adjustment.')
      setBusy(false)
    }
  }
  return <dialog ref={dialog} className="wallet-dialog balance-adjustment-dialog" aria-labelledby="adjust-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <form className="wallet-form" onSubmit={(event) => void submit(event)}>
      <h2 id="adjust-title">Adjust balance · {name}</h2>
      <p>Recorded balance: <strong>{formatPHP(recorded)}</strong></p>
      <label className="field">Actual balance ngayon
        <span className="currency-input"><b aria-hidden="true">₱</b><input autoFocus inputMode="decimal" value={value} placeholder="0.00"
          onChange={(event) => setValue(event.target.value)} required /></span>
      </label>
      <p aria-live="polite">Adjustment: <strong>{adjustment === undefined ? '—' : formatPHP(adjustment)}</strong></p>
      {value && adjustment === undefined && <p className="form-error">Maglagay ng valid na balance hanggang dalawang decimal.</p>}
      <label className="field">Reason (optional)<input name="reason" maxLength={120} placeholder="Hal. Binilang ulit ang cash" /></label>
      <p>I-aadjust natin ang wallet para tumugma sa totoong pera mo. May record nito sa Activity.</p>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="button button-primary" disabled={busy || !adjustment}>I-save ang adjustment</button>
      </div>
    </form>
  </dialog>
}
