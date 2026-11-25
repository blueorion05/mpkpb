import { reloadLocalSession } from '../localSession'
import { useEffect, useState } from 'react'
import {
  createSnapshot, exportBackup, getPreference, listSnapshots, replaceFromBackup,
  resetLocalData, validateBackup, type LocalBackup, type Wallet,
} from '../db/database'
import type { LedgerTransaction } from '../domain/ledger'

function download(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csv(headers: string[], rows: (string | number)[][]) {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map((cell) => {
    if (typeof cell === 'number') return String(cell)
    const text = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(cell) ? "'" + cell : cell
    return '"' + text.replaceAll('"', '""') + '"'
  }).join(',')).join('\r\n')
}

export default function DataSafety() {
  const [snapshots, setSnapshots] = useState<Awaited<ReturnType<typeof listSnapshots>>>([])
  const [savedAt, setSavedAt] = useState<string>()
  const [preview, setPreview] = useState<LocalBackup>()
  const [reset, setReset] = useState(false)
  const [resetText, setResetText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([listSnapshots(), getPreference('lastSavedAt')]).then(([items, timestamp]) => {
      if (active) { setSnapshots(items); setSavedAt(timestamp) }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Save history could not be opened.')
    })
    function handleSave(event: Event) {
      setSavedAt((event as CustomEvent<string>).detail)
    }
    window.addEventListener('mpkpb-saved', handleSave)
    return () => {
      active = false
      window.removeEventListener('mpkpb-saved', handleSave)
    }
  }, [])

  async function run(operation: () => Promise<void>) {
    setBusy(true)
    setError('')
    setStatus('')
    try { await operation() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The local data operation failed.') }
    finally { setBusy(false) }
  }

  return (
    <section className="geng-settings" aria-labelledby="save-history-title">
      <h2 id="save-history-title">Save history</h2>
      <p>{savedAt && Number.isFinite(Date.parse(savedAt))
        ? 'Last autosave ' + new Date(savedAt).toLocaleString('en-PH') : 'New changes are saved automatically on this device.'}</p>
      <fieldset className="data-controls" disabled={busy}>
        <legend>Local recovery</legend>
        <button className="button button-secondary" onClick={() => void run(async () => {
          await createSnapshot()
          setSnapshots(await listSnapshots())
          setStatus('Snapshot saved on this device.')
        })}>Create snapshot</button>
        <button className="button button-secondary" onClick={() => void run(async () => {
          const backup = await exportBackup()
          download('mpkpb-backup-' + backup.createdAt.slice(0, 10) + '.json', JSON.stringify(backup, null, 2), 'application/json')
        })}>Download JSON backup</button>
        <button className="button button-secondary" onClick={() => void run(async () => {
          const { records } = await exportBackup()
          const rows = (records.transactions as LedgerTransaction[]).map((entry) => [
            entry.occurredOn, entry.kind, entry.description, entry.walletId,
            'toWalletId' in entry ? entry.toWalletId ?? '' : '',
            'categoryId' in entry ? entry.categoryId ?? '' : '', entry.amountCentavos,
            'feeCentavos' in entry ? entry.feeCentavos ?? 0 : 0,
          ])
          download('mpkpb-transactions.csv', csv(['Date', 'Kind', 'Description', 'Wallet ID', 'Destination ID',
            'Category ID', 'Amount (centavos)', 'Fee (centavos)'], rows), 'text/csv;charset=utf-8')
        })}>Export transactions CSV</button>
        <button className="button button-secondary" onClick={() => void run(async () => {
          const { records } = await exportBackup()
          download('mpkpb-wallets.csv', csv(['ID', 'Name', 'Type', 'Opening balance (centavos)', 'Protected', 'Archived'],
            (records.wallets as Wallet[]).map((wallet) => [wallet.id, wallet.name, wallet.type,
              wallet.openingBalanceCentavos, String(wallet.protected), String(wallet.archived)])), 'text/csv;charset=utf-8')
        })}>Export wallets CSV</button>
        <label className="field">Preview JSON backup
          <input type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            setPreview(undefined)
            setReset(false)
            if (file) void run(async () => setPreview(validateBackup(JSON.parse(await file.text()))))
          }} />
        </label>
        {snapshots.length > 0 && <ul>{snapshots.map((item) => (
          <li key={item.id}><button className="text-button" onClick={() => void run(async () => {
            setReset(false)
            setPreview(validateBackup(item.backup))
          })}>{item.label} · {new Date(item.backup.createdAt).toLocaleString('en-PH')}</button></li>
        ))}</ul>}
        {preview && (
          <div aria-live="polite">
            <h3>Restore preview</h3>
            <p>{new Date(preview.createdAt).toLocaleString('en-PH')} · {preview.records.wallets.length} wallets · {preview.records.transactions.length} transactions · {preview.records.budgets.length} budgets · {preview.records.debts.length} debts · {preview.records.scheduledEvents.length} scheduled events</p>
            <p>Restoring replaces current records and creates a local safety snapshot.</p>
            <button className="button button-primary" onClick={() => void run(async () => {
              await replaceFromBackup(preview)
              reloadLocalSession()
            })}>Replace current records</button>
            <button className="text-button" onClick={() => setPreview(undefined)}>Cancel</button>
          </div>
        )}
        {!reset ? <button className="text-button" onClick={() => { setReset(true); setPreview(undefined); setResetText('') }}>Reset local data</button> : (
          <div>
            <p>Reset permanently deletes financial records, settings, and local snapshots from this browser. Download a backup first if you need these records.</p>
            <label className="field">Type RESET to confirm<input value={resetText} onChange={(event) => setResetText(event.target.value)} /></label>
            <button className="button button-secondary" disabled={resetText !== 'RESET'} onClick={() => void run(async () => {
              await resetLocalData()
              reloadLocalSession()
            })}>Delete all local data</button>
            <button className="text-button" onClick={() => setReset(false)}>Cancel</button>
          </div>
        )}
      </fieldset>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
