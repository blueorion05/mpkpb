import MoneyInput from './MoneyInput'
import { getDebtProgress, getObligationProgress } from '../domain/debts'
import { getExpectedIncomeProgress } from '../domain/planning'
import { entryLabels, ledgerKind, scheduleEntryKind, type ScheduledRecord } from '../domain/entry'
import { formatPHP, parsePesoToCentavos } from '../domain/money'
import { useState, type FormEvent } from 'react'

export default function UpcomingList({ records, today, visible, onEdit, onSettle }: {
  records: readonly ScheduledRecord[]
  today: string
  visible: boolean
  onEdit: (record: ScheduledRecord) => void
  onSettle: (record: ScheduledRecord, amount: number, dueOn: string, actualOn: string) => Promise<void>
}) {
  const [settling, setSettling] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rows = records.filter((record) => !record.archived).map((record) => {
    const progress = record.kind === 'debt' ? getDebtProgress(record, today)
      : record.kind === 'obligation' ? getObligationProgress(record, today)
        : getExpectedIncomeProgress(record, today)
    return { record, ...progress, sortDate: record.kind === 'debt' && !record.dueOn ? '9999-12-31' : progress.dueOn, remaining: 'remainingCentavos' in progress
      ? progress.remainingCentavos : progress.remainingThisOccurrenceCentavos }
  }).sort((a, b) => Number(a.remaining === 0) - Number(b.remaining === 0) || a.sortDate.localeCompare(b.sortDate))

  async function settle(event: FormEvent<HTMLFormElement>, record: ScheduledRecord, dueOn: string, remaining: number) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const amount = parsePesoToCentavos(String(fields.get('amount') ?? ''))
    if (!amount || amount > remaining) {
      setError('Ilagay ang amount na higit sa zero at pasok sa natitira.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onSettle(record, amount, dueOn, String(fields.get('actualOn')))
      setSettling(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi na-save ang record. Subukan ulit.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel upcoming-panel" aria-labelledby="upcoming-heading">
    <div className="panel-heading"><h2 id="upcoming-heading">Mga naka-schedule</h2></div>
    {!rows.length && <p>Wala pang naka-schedule. Gamitin ang Add record para sa susunod na pasok o bayad.</p>}
    <ul className="upcoming-list">
      {(expanded ? rows : rows.slice(0, 5)).map(({ record, dueOn, remaining }) => {
        const undated = record.kind === 'debt' && !record.dueOn
        const kind = scheduleEntryKind(record)
        const incoming = ledgerKind(kind) === 'income'
        const action = incoming ? 'Nakuha na' : 'Bayad na'
        const title = record.kind === 'debt' ? record.name : record.description
        const active = settling === record.id
        return <li key={record.id}>
          <div className="upcoming-row">
            <div><strong>{title}</strong>{record.notes && <small>{record.notes}</small>}
              <small>{entryLabels[kind]} · {undated ? 'Walang due date' : dueOn} · {remaining === 0 ? action : undated ? 'Open' : dueOn < today ? 'Lampas na sa due date' : dueOn === today ? 'Due ngayon' : 'Upcoming'}</small>
            </div>
            <strong>{visible ? formatPHP(remaining || record.amountCentavos) : '••••'}</strong>
            {remaining > 0 && <div className="upcoming-actions">
              <button className="text-button" type="button" disabled={busy} onClick={() => onEdit(record)} aria-label={'Edit ' + title}>Edit</button>
              <button className="button button-outline" type="button" disabled={busy} aria-expanded={active}
                onClick={() => { setError(''); setSettling(active ? undefined : record.id) }}>{action}</button>
            </div>}
          </div>
          {active && <form className="wallet-form settlement-form" onSubmit={(event) => void settle(event, record, dueOn, remaining)}>
            <div className="form-row">
              <label className="field">Amount<MoneyInput name="amount" required
                defaultValue={visible ? formatPHP(remaining).replace(/[^\d.]/g, '') : ''} /></label>
              <label className="field">Aktwal na petsa<input name="actualOn" type="date" required defaultValue={today} max={today} /></label>
            </div>
            {error && <p role="alert" className="form-error">{error}</p>}
            <div className="upcoming-actions">
              <button className="button button-primary" type="submit" disabled={busy}>I-save ang bayad o receipt</button>
              <button className="button button-quiet" type="button" disabled={busy} onClick={() => setSettling(undefined)}>Cancel</button>
            </div>
          </form>}
        </li>
      })}
    </ul>
    {rows.length > 5 && <button className="text-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Mas kaunti' : 'Tingnan lahat'}
    </button>}
  </section>
}
