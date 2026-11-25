import { ArrowDownLeft, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { Wallet } from '../db/database'
import type { DebtRecord, FinancialObligation } from '../domain/debts'
import {
  calculateForecast,
  type ForecastScenario,
  type ForecastScenarioResult,
  type ForecastRequest,
} from '../domain/forecast'
import type { LedgerTransaction } from '../domain/ledger'
import type { ExpectedIncome } from '../domain/planning'
import { formatPHP, parsePesoToCentavos } from '../domain/money'
import './ForecastPage.css'

interface ForecastPageProps {
  wallets: readonly Wallet[]
  transactions: readonly LedgerTransaction[]
  expectedIncomes: readonly ExpectedIncome[]
  debts: readonly DebtRecord[]
  obligations: readonly FinancialObligation[]
  loading: boolean
  dataUnavailable: boolean
  visible: boolean
  safetyBufferCentavos: number
  onSaveSafetyBuffer: (amountCentavos: number) => Promise<void>
}

const scenarioLabels: Record<ForecastScenario, string> = {
  conservative: 'Conservative',
  expected: 'Expected',
  optimistic: 'Optimistic',
}

const scenarioDescriptions: Record<ForecastScenario, string> = {
  conservative: 'High-confidence income only; excludes debt collections.',
  expected: 'High- and medium-confidence income plus scheduled debt collections.',
  optimistic: 'All expected income and scheduled debt collections.',
}

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthEnd(date: string): string {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function chartValue(result: ForecastScenarioResult, walletId: string, index: number): number {
  const point = result.points[index]
  return walletId ? point.balances[walletId] ?? 0 : point.totalCentavos
}

function ForecastChart({
  result,
  walletId,
  walletName,
  visible,
}: {
  result: ForecastScenarioResult
  walletId: string
  walletName: string
  visible: boolean
}) {
  const values = result.points.map((_, index) => chartValue(result, walletId, index))
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const left = 132
  const right = 790
  const top = 18
  const bottom = 205
  const points = values.map((value, index) => {
    const x = values.length < 2 ? (left + right) / 2 : left + (index / (values.length - 1)) * (right - left)
    const y = bottom - ((value - min) / span) * (bottom - top)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const zeroY = bottom - ((0 - min) / span) * (bottom - top)
  const label = walletId ? `Projected balance for ${walletName}` : 'Projected total balance across all wallets'

  return (
    <div className="forecast-chart-wrap">
      <svg className="forecast-chart" viewBox="0 0 820 250" role="img" aria-label={label}>
        {[0, 0.5, 1].map((fraction) => {
          const y = top + fraction * (bottom - top)
          const value = max - fraction * span
          return (
            <g key={fraction}>
              <line x1={left} x2={right} y1={y} y2={y} className="forecast-gridline" />
              <text x="0" y={y + 4} className="forecast-axis-label">
                {displayAmount(Math.round(value), visible)}
              </text>
            </g>
          )
        })}
        {min < 0 && max > 0 && (
          <line x1={left} x2={right} y1={zeroY} y2={zeroY} className="forecast-zero-line" />
        )}
        {values.length === 1
          ? <circle cx={(left + right) / 2} cy={bottom - ((values[0] - min) / span) * (bottom - top)} r="4" className="forecast-point" />
          : <polyline points={points} className="forecast-line" />}
        <text x={left} y="234" className="forecast-axis-label">
          {dateFormatter.format(new Date(`${result.points[0].date}T00:00:00.000Z`))}
        </text>
        <text x={right} y="234" textAnchor="end" className="forecast-axis-label">
          {dateFormatter.format(new Date(`${result.points[result.points.length - 1].date}T00:00:00.000Z`))}
        </text>
      </svg>
    </div>
  )
}

function displayAmount(amountCentavos: number, visible: boolean): string {
  return visible ? formatPHP(amountCentavos) : '••••••'
}

export default function ForecastPage({
  wallets,
  transactions,
  expectedIncomes,
  debts,
  obligations,
  loading,
  dataUnavailable,
  visible,
  safetyBufferCentavos,
  onSaveSafetyBuffer,
}: ForecastPageProps) {
  const [today] = useState(localDateInput)
  const [endOn, setEndOn] = useState(() => monthEnd(localDateInput()))
  const [walletId, setWalletId] = useState('')
  const [selectedScenario, setSelectedScenario] = useState<ForecastScenario>('expected')
  const [bufferInput, setBufferInput] = useState((safetyBufferCentavos / 100).toFixed(2))
  const [bufferError, setBufferError] = useState('')
  const [bufferSaving, setBufferSaving] = useState(false)
  const [purchaseAmountInput, setPurchaseAmountInput] = useState('')
  const [purchaseWalletId, setPurchaseWalletId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today)
  const [hypotheticalPurchase, setHypotheticalPurchase] = useState<ForecastRequest['hypotheticalPurchase']>()
  const [purchaseError, setPurchaseError] = useState('')
  const purchaseWallet = purchaseWalletId || wallets.find((wallet) => !wallet.archived)?.id || ''
  const availablePurchaseWallets = wallets.filter((wallet) => !wallet.archived)

  const forecast = useMemo(() => {
    if (loading || dataUnavailable || wallets.length === 0) {
      return { results: [] as readonly ForecastScenarioResult[], error: '' }
    }
    try {
      return {
        results: calculateForecast({
          wallets,
          transactions,
          expectedIncomes,
          debts,
          obligations,
          today,
          endOn,
          safetyBufferCentavos,
          hypotheticalPurchase,
        }),
        error: '',
      }
    } catch (error) {
      return {
        results: [] as readonly ForecastScenarioResult[],
        error: error instanceof Error ? error.message : 'The forecast could not be calculated.',
      }
    }
  }, [wallets, transactions, expectedIncomes, debts, obligations, loading, dataUnavailable, today, endOn, safetyBufferCentavos, hypotheticalPurchase])

  const selectedResult = forecast.results.find((result) => result.scenario === selectedScenario)
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId)
  const visibleEvents = selectedResult?.events.filter((event) => !walletId || event.walletId === walletId) ?? []
  const selectedWalletSummary = selectedResult?.walletSummaries.find((item) => item.walletId === walletId)
  const selectedBalance = selectedWallet
    ? selectedResult?.points[selectedResult.points.length - 1]?.balances[walletId] ?? 0
    : selectedResult?.endingTotalCentavos ?? 0
  const startingBalance = selectedWallet
    ? selectedResult?.startingBalances[walletId] ?? 0
    : selectedResult?.startingTotalCentavos ?? 0
  const minimumBalance = selectedWallet
    ? selectedWalletSummary?.minimumBalanceCentavos ?? 0
    : selectedResult?.minimumTotalCentavos ?? 0
  const relevantShortages = selectedWallet
    ? selectedWalletSummary?.shortageEpisodes.map((episode) => ({
      ...episode,
      name: selectedWallet.name,
    })) ?? []
    : selectedResult?.walletSummaries
      .filter((summary) => summary.maximumShortageCentavos > 0)
      .flatMap((summary) => {
        const wallet = wallets.find((item) => item.id === summary.walletId)
        return summary.shortageEpisodes.map((episode) => ({
          ...episode,
          name: wallet?.name ?? 'Wallet',
        }))
      }) ?? []
  const bufferAtRisk = selectedResult
    ? selectedResult.minimumSpendableCentavos < safetyBufferCentavos
    : false

  async function saveBuffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBufferError('')
    const parsedAmount = parsePesoToCentavos(bufferInput)
    if (parsedAmount === null) {
      setBufferError('Enter a non-negative buffer with no more than two decimal places.')
      return
    }
    try {
      setBufferSaving(true)
      await onSaveSafetyBuffer(parsedAmount)
    } catch (error) {
      setBufferError(error instanceof Error ? error.message : 'The safety buffer could not be saved.')
    } finally {
      setBufferSaving(false)
    }
  }

  function simulatePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPurchaseError('')
    const amountCentavos = parsePesoToCentavos(purchaseAmountInput)
    if (amountCentavos === null || amountCentavos <= 0) {
      setPurchaseError('Enter a purchase amount greater than zero with no more than two decimal places.')
      return
    }
    if (!availablePurchaseWallets.some((wallet) => wallet.id === purchaseWallet)) {
      setPurchaseError('Choose a wallet for this what-if purchase.')
      return
    }
    if (!purchaseDate || purchaseDate < today || purchaseDate > endOn) {
      setPurchaseError('Choose a purchase date from today through the end of the forecast.')
      return
    }
    setPurchaseWalletId(purchaseWallet)
    setHypotheticalPurchase({
      walletId: purchaseWallet,
      amountCentavos,
      occurredOn: purchaseDate,
    })
  }

  function clearPurchaseSimulation() {
    setHypotheticalPurchase(undefined)
    setPurchaseAmountInput('')
    setPurchaseError('')
  }

  const maxEndOn = addDays(today, 3660)

  return (
    <>
      <div className="page-heading forecast-heading">
        <div>
          <h1>Aabot pa ba?</h1>
          <p>Silipin kung kailan papasok o lalabas ang pera at kung kailan ka posibleng kapusin. Tantiya ito.</p>
        </div>
      </div>

      <section className="panel forecast-controls" aria-label="Forecast settings">
        <label className="field">
          <span>Tantiya hanggang</span>
          <input
            type="date"
            min={today}
            max={maxEndOn}
            value={endOn}
            onChange={(event) => {
              const nextEndOn = event.target.value
              setEndOn(nextEndOn)
              if (purchaseDate > nextEndOn) setPurchaseDate(nextEndOn)
              if (hypotheticalPurchase && hypotheticalPurchase.occurredOn > nextEndOn) {
                setHypotheticalPurchase(undefined)
                setPurchaseError('The simulation was cleared because its date is outside the updated forecast.')
              }
            }}
          />
        </label>
        <label className="field">
          <span>Aling wallet?</span>
          <select value={walletId} onChange={(event) => setWalletId(event.target.value)}>
            <option value="">Lahat ng wallet</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}{wallet.protected ? ' · Protected' : ''}{wallet.archived ? ' · Archived' : ''}
              </option>
            ))}
          </select>
        </label>
        <form className="forecast-buffer-form" onSubmit={(event) => void saveBuffer(event)}>
          <label className="field">
            <span>Reserbang pera</span>
            <span className="currency-input">
              <b>₱</b>
              <input
                type={visible ? 'text' : 'password'}
                inputMode="decimal"
                value={bufferInput}
                onChange={(event) => setBufferInput(event.target.value)}
                aria-label="Reserbang pera sa pesos"
              />
            </span>
          </label>
          <button className="button button-quiet" type="submit" disabled={bufferSaving}>
            {bufferSaving ? 'Saving…' : 'I-save ang reserba'}
          </button>
        </form>
      </section>
      <p className="forecast-buffer-note">
        Protected and archived wallets are included in total projections, but not counted as spendable cash.
        The safety buffer is reserved when calculating safe daily and weekly spending.
      </p>
      {bufferError && <p className="form-error" role="alert">{bufferError}</p>}
      <section className="panel purchase-simulator" aria-label="Afford ko ba?">
        <div className="purchase-simulator-heading">
          <div>
            <h2>Afford ko ba?</h2>
            <p>Tingnan muna kung anong matitira kung itutuloy mo ang bili.</p>
          </div>
          {hypotheticalPurchase && <button className="button button-quiet" type="button" onClick={clearPurchaseSimulation}>Alisin ang test na gastos</button>}
        </div>
        <form className="purchase-simulator-form" onSubmit={(event) => simulatePurchase(event)}>
          <label className="field">
            <span>Presyo</span>
            <span className="currency-input"><b>₱</b><input type={visible ? 'text' : 'password'} inputMode="decimal" value={purchaseAmountInput} onChange={(event) => {
              setPurchaseAmountInput(event.target.value)
              setHypotheticalPurchase(undefined)
              setPurchaseError('')
            }} aria-label="What-if purchase amount in pesos" placeholder="0.00" /></span>
          </label>
          <label className="field">
            <span>Saan kukunin?</span>
            <select value={purchaseWallet} onChange={(event) => {
              setPurchaseWalletId(event.target.value)
              setHypotheticalPurchase(undefined)
              setPurchaseError('')
            }}>
              {availablePurchaseWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.protected ? ' · Protected' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Petsa ng bili</span>
            <input type="date" min={today} max={endOn} value={purchaseDate} onChange={(event) => {
              setPurchaseDate(event.target.value)
              setHypotheticalPurchase(undefined)
              setPurchaseError('')
            }} />
          </label>
          <button className="button button-primary" type="submit" disabled={availablePurchaseWallets.length === 0}>Tingnan kung kasya</button>
        </form>
        {purchaseError && <p className="form-error" role="alert">{purchaseError}</p>}
        {hypotheticalPurchase && <p className="purchase-simulation-status" role="status">Simulation applied to the {wallets.find((wallet) => wallet.id === hypotheticalPurchase.walletId)?.name ?? 'selected'} forecast. Actual balances and transactions are unchanged.</p>}
      </section>
      {loading ? (
        <section className="panel forecast-empty" aria-live="polite">

          <h2>Kinukuwenta ang forecast…</h2>
        </section>
      ) : dataUnavailable ? (
        <section className="panel forecast-empty" role="alert">
          <h2>Hindi mabasa ang data para sa forecast.</h2>
          <p>I-check ang wallet at schedule, tapos pindutin ang Subukan ulit.</p>
        </section>
      ) : wallets.length === 0 ? (
        <section className="panel forecast-empty">
          <h2>Mag-add ng wallet para makita ang forecast.</h2>
          <p>I-add ang wallet para maisama sa tantiya ang paparating na pera, utang, at bayarin.</p>
        </section>
      ) : forecast.error ? (
        <section className="panel forecast-empty" role="alert">
          <h2>Hindi nakuwenta ang forecast.</h2>
          <p>{forecast.error}</p>
        </section>
      ) : selectedResult ? (
        <>
          <section className="forecast-scenarios" aria-label="Forecast scenario">
            <div className="forecast-scenario-tabs" role="group" aria-label="Forecast scenarios">
              {(['conservative', 'expected', 'optimistic'] as const).map((scenario) => (
                <button
                  type="button"
                  aria-pressed={selectedScenario === scenario}
                  className={selectedScenario === scenario ? 'selected' : ''}
                  key={scenario}
                  onClick={() => setSelectedScenario(scenario)}
                >
                  {scenarioLabels[scenario]}
                </button>
              ))}
            </div>
            <p>{scenarioDescriptions[selectedScenario]}</p>
          </section>

          <section className="forecast-metrics" aria-label="Forecast summary">
            <article className="panel forecast-metric">
              <span className="metric-label">Matitira sa'yo</span>
              <strong>{displayAmount(selectedBalance, visible)}</strong>
              <small>From {displayAmount(startingBalance, visible)} today</small>
            </article>
            <article className="panel forecast-metric">
              <span className="metric-label">Pinakamababang tantiya</span>
              <strong className={minimumBalance < 0 ? 'forecast-negative' : ''}>
                {displayAmount(minimumBalance, visible)}
              </strong>
              <small>
                {selectedWalletSummary?.minimumBalanceOn
                  ? `On ${dateFormatter.format(new Date(`${selectedWalletSummary.minimumBalanceOn}T00:00:00.000Z`))}`
                  : selectedResult.minimumTotalOn
                    ? `On ${dateFormatter.format(new Date(`${selectedResult.minimumTotalOn}T00:00:00.000Z`))}`
                    : 'Across the forecast period'}
              </small>
            </article>
            <article className="panel forecast-metric">
              <span className="metric-label">Pwedeng gastusin kada araw</span>
              <strong>{displayAmount(selectedResult.safeDailyCentavos, visible)}</strong>
              <small>{displayAmount(selectedResult.safeWeeklyCentavos, visible)} kada linggo · bawas na ang reserba</small>
            </article>
          </section>

          {(relevantShortages.length > 0 || bufferAtRisk) && (
            <section className="forecast-shortage" role="alert" aria-label="Projected cash shortages">
              <div>
                <h2>
                  <TriangleAlert className="ui-icon" aria-hidden="true" /> {relevantShortages.length > 0
                    ? 'Posibleng kukulangin ang laman ng ilang wallet.'
                    : 'Posibleng bumaba sa reserba ang pwedeng gastusin.'}
                </h2>
              </div>
              {relevantShortages.length > 0 ? <ul>
                {relevantShortages.map((episode, index) => (
                  <li key={`${episode.name}-${episode.startOn}-${index}`}>
                    <strong>{episode.name}</strong>
                    <span>
                      Kukulangin sa {dateFormatter.format(new Date(`${episode.startOn}T00:00:00.000Z`))}
                      {episode.recoveryOn
                        ? ` · makakabawi sa ${dateFormatter.format(new Date(`${episode.recoveryOn}T00:00:00.000Z`))}`
                        : ' · kulang pa rin hanggang dulo ng forecast'}
                    </span>
                    <small>Pinakamalaking kulang: {displayAmount(episode.maximumShortageCentavos, visible)}</small>
                  </li>
                ))}
              </ul> : (
                <p>
                  Pinakamababang pwedeng gastusin: {displayAmount(selectedResult.minimumSpendableCentavos, visible)}
                  {' '}kumpara sa {displayAmount(safetyBufferCentavos, visible)} na reserba.
                </p>
              )}
            </section>
          )}

          <section className="panel forecast-chart-panel" aria-label="Projected wallet balance chart">
            <div className="panel-heading">
              <div>

                <h2>{selectedWallet ? `${selectedWallet.name} balance` : 'Balance ng lahat ng wallet'}</h2>
              </div>
              <span className="forecast-period">{today} – {endOn}</span>
            </div>
            <ForecastChart
              result={selectedResult}
              walletId={walletId}
              walletName={selectedWallet?.name ?? ''}
              visible={visible}
            />
            <p className="forecast-chart-note">
              Base ito sa balance ngayon at sa mga schedule. Kapag pareho ang petsa, inuuna sa tantiya ang lalabas na pera para makita kung kukulangin.
            </p>
          </section>

          <section className="panel forecast-events">
            <div className="panel-heading">
              <div>

                <h2>Mga naka-schedule</h2>
              </div>
              <span className="activity-count">{visibleEvents.length} included</span>
            </div>
            {visibleEvents.length === 0 ? (
              <p className="forecast-no-events">Walang naka-schedule na papasok o bayad sa mga petsang ito.</p>
            ) : (
              <ul>
                {visibleEvents.slice(0, 12).map((event) => {
                  const eventWallet = wallets.find((wallet) => wallet.id === event.walletId)
                  const sign = event.direction === 'inflow' ? '+' : '−'
                  return (
                    <li key={event.id}>
                      <span className={`forecast-event-icon ${event.direction}`} aria-hidden="true">
                        {event.direction === 'inflow' ? <ArrowDownLeft className="ui-icon" aria-hidden="true" /> : <ArrowUpRight className="ui-icon" aria-hidden="true" />}
                      </span>
                      <span className="forecast-event-copy">
                        <strong>{event.label}</strong>
                        <small>
                          {event.dueOn < today
                            ? `Lampas na sa due date mula ${dateFormatter.format(new Date(`${event.dueOn}T00:00:00.000Z`))} · kasama sa tantiya ngayon`
                            : dateFormatter.format(new Date(`${event.projectedOn}T00:00:00.000Z`))}
                          {eventWallet ? ` · ${eventWallet.name}` : ''}
                          {event.confidence ? ` · ${event.confidence} confidence` : ''}
                        </small>
                      </span>
                      <strong className={event.direction === 'inflow' ? 'forecast-inflow' : 'forecast-outflow'}>
                        {sign}{displayAmount(event.amountCentavos, visible)}
                      </strong>
                    </li>
                  )
                })}
              </ul>
            )}
            {visibleEvents.length > 12 && (
              <p className="forecast-more-events">Showing 12 of {visibleEvents.length} scheduled events.</p>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}
