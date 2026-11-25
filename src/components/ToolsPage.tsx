import { CategorySymbol } from './IconPicker'
import { Bell, LockKeyhole, Monitor, Moon, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Wallet } from '../db/database'
import { calculateFinancialAnalytics } from '../domain/analytics'
import { getDebtProgress, type DebtRecord, type FinancialObligation } from '../domain/debts'
import type { LedgerTransaction, TransactionCategory } from '../domain/ledger'
import { calculateWalletBalances } from '../domain/ledger'
import { formatPHP } from '../domain/money'
import { calculateBudgetProgress, type BudgetPlan, type ExpectedIncome } from '../domain/planning'
import { calculateForecast, type ForecastEvent } from '../domain/forecast'
import './ToolsPage.css'

type Theme = 'system' | 'light' | 'dark'
type Tab = 'calendar' | 'insights' | 'settings'
const toolTabs: readonly { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'insights', label: 'Saan napunta?' },
  { id: 'settings', label: 'Settings' },
]

interface ToolsPageProps {
  wallets: readonly Wallet[]
  transactions: readonly LedgerTransaction[]
  categories: readonly TransactionCategory[]
  budgetPlans: readonly BudgetPlan[]
  expectedIncomes: readonly ExpectedIncome[]
  debts: readonly DebtRecord[]
  obligations: readonly FinancialObligation[]
  loading: boolean
  dataUnavailable: boolean
  visible: boolean
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

interface TimelineItem {
  id: string
  date: string
  title: string
  detail: string
  kind: string
  amountCentavos: number
  direction: 'inflow' | 'outflow' | 'neutral'
  overdue: boolean
}

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function displayAmount(amountCentavos: number, visible: boolean): string {
  return visible ? formatPHP(amountCentavos) : '••••••'
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const monthFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

function reminderDate(event: ForecastEvent, today: string): string {
  return event.dueOn < today ? `Lampas na sa due date mula ${dateFormatter.format(new Date(`${event.dueOn}T00:00:00.000Z`))}` : `Due ${dateFormatter.format(new Date(`${event.dueOn}T00:00:00.000Z`))}`
}

function reminderPriority(reminder: { id: string; detail: string }): number {
  if (reminder.id.startsWith('budget:') && reminder.detail.startsWith('Over budget')) return 0
  if (reminder.detail.startsWith('Lampas na sa due date')) return 1
  if (reminder.id.startsWith('budget:')) return 2
  return 3
}

export default function ToolsPage({
  wallets,
  transactions,
  categories,
  budgetPlans,
  expectedIncomes,
  debts,
  obligations,
  loading,
  dataUnavailable,
  visible,
  theme,
  onThemeChange,
}: ToolsPageProps) {
  const [tab, setTab] = useState<Tab>('calendar')
  const [today] = useState(localDateInput)
  const [calendarFrom, setCalendarFrom] = useState(() => monthStart(localDateInput()))
  const [calendarTo, setCalendarTo] = useState(() => addDays(localDateInput(), 60))
  const [analyticsRange, setAnalyticsRange] = useState('90')
  const [customFrom, setCustomFrom] = useState(() => addDays(localDateInput(), -89))
  const [customTo, setCustomTo] = useState(localDateInput)
  const [budgetFilter, setBudgetFilter] = useState('')

  const calendar = useMemo(() => {
    if (tab !== 'calendar' || loading || dataUnavailable || wallets.length === 0) {
      return { items: [] as TimelineItem[], reminders: [] as { id: string; title: string; detail: string; amount: number }[], error: '' }
    }
    if (!calendarFrom || !calendarTo) {
      return { items: [], reminders: [], error: 'Piliin kung kailan magsisimula at matatapos ang calendar.' }
    }
    if (calendarFrom > calendarTo || calendarTo > addDays(today, 3660)) {
      return { items: [], reminders: [], error: 'Pumili ng mga petsa sa loob ng susunod na sampung taon.' }
    }
    try {
      const forecastEvents = calculateForecast({
        wallets,
        transactions,
        expectedIncomes,
        debts,
        obligations,
        today,
        endOn: calendarTo < today ? today : calendarTo,
        safetyBufferCentavos: 0,
      }, ['optimistic'])[0]?.events ?? []
      const scheduledItems: TimelineItem[] = forecastEvents
        .filter((event) => event.projectedOn >= calendarFrom && event.projectedOn <= calendarTo)
        .map((event) => ({
          id: `scheduled:${event.id}`,
          date: event.projectedOn,
          title: event.label,
          detail: `${event.kind === 'expectedIncome' ? 'Paparating na pera' : event.kind === 'debt' ? 'Debt settlement' : 'Bill or obligation'} · ${reminderDate(event, today)}`,
          kind: event.kind,
          amountCentavos: event.amountCentavos,
          direction: event.direction,
          overdue: event.dueOn < today,
        }))
      const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
      const actualItems: TimelineItem[] = transactions
        .filter((transaction) => transaction.occurredOn >= calendarFrom && transaction.occurredOn <= calendarTo)
        .map((transaction) => ({
          id: `actual:${transaction.id}`,
          date: transaction.occurredOn,
          title: transaction.description,
          detail: transaction.kind === 'transfer'
            ? `Transfer · ${walletNames.get(transaction.walletId) ?? 'Wallet'} → ${walletNames.get(transaction.toWalletId ?? '') ?? 'Wallet'}${transaction.feeCentavos ? ` · fee ${formatPHP(transaction.feeCentavos)}` : ''}`
            : `${transaction.kind === 'adjustment' ? 'Ayusin ang balance' : transaction.kind} · ${walletNames.get(transaction.walletId) ?? 'Wallet'}`,
          kind: transaction.kind,
          amountCentavos: transaction.amountCentavos,
          direction: transaction.kind === 'income'
            ? 'inflow'
            : transaction.kind === 'expense'
              ? 'outflow'
              : 'neutral',
          overdue: false,
        }))
      const reminders = forecastEvents
        .filter((event) => event.projectedOn >= today && event.projectedOn <= addDays(today, 7))
        .map((event) => ({
          id: event.id,
          title: event.label,
          detail: reminderDate(event, today),
          amount: event.amountCentavos,
        }))
      for (const plan of budgetPlans.filter((item) => !item.archived)) {
        const progress = calculateBudgetProgress(plan, categories, transactions, today)
        if (progress.status !== 'active') continue
        for (const item of progress.categories) {
          if (item.utilizationPercent >= 80) {
            const categoryName = categories.find((category) => category.id === item.categoryId)?.name ?? 'Budget category'
            reminders.push({
              id: `budget:${plan.id}:${item.categoryId}`,
              title: `${plan.name}: ${categoryName}`,
              detail: item.remainingCentavos < 0
                ? `Over budget by ${formatPHP(Math.abs(item.remainingCentavos))}`
                : `${Math.round(item.utilizationPercent)}% used · ${formatPHP(item.remainingCentavos)} left`,
              amount: item.spentCentavos,
            })
          }
        }
      }
      reminders.sort((left, right) => reminderPriority(left) - reminderPriority(right))
      const items = [...actualItems, ...scheduledItems].sort((left, right) =>
        left.date.localeCompare(right.date) ||
        (left.direction === right.direction ? 0 : left.direction === 'outflow' ? -1 : 1) ||
        left.title.localeCompare(right.title),
      )
      return { items, reminders: reminders.slice(0, 6), error: '' }
    } catch (error) {
      return {
        items: [] as TimelineItem[],
        reminders: [] as { id: string; title: string; detail: string; amount: number }[],
        error: error instanceof Error ? error.message : 'The calendar could not be calculated.',
      }
    }
  }, [tab, wallets, transactions, expectedIncomes, debts, obligations, budgetPlans, categories, loading, dataUnavailable, today, calendarFrom, calendarTo])

  const analyticsFrom = analyticsRange === 'custom'
    ? customFrom
    : addDays(today, -Number(analyticsRange) + 1)
  const analyticsTo = analyticsRange === 'custom' ? customTo : today
  const availableBudgets = budgetPlans.filter((plan) =>
    !plan.archived && plan.endOn >= analyticsFrom && plan.startOn <= analyticsTo,
  )
  const activeBudgetFilter = availableBudgets.some((plan) => plan.id === budgetFilter)
    ? budgetFilter
    : ''
  const analytics = useMemo(() => {

    if (tab !== 'insights' || loading || dataUnavailable) {
      return { result: null, walletTotals: [], budgetResults: [], debtResults: [], error: '' }
    }
    try {
      const result = calculateFinancialAnalytics(transactions, categories, analyticsFrom, analyticsTo)
      const balances = calculateWalletBalances(wallets, transactions)
      const walletTotals = wallets.map((wallet) => {
        const amount = balances.get(wallet.id)
        if (amount === undefined) throw new Error('A wallet balance is missing from the ledger calculation.')
        return { id: wallet.id, name: wallet.name, amount, protected: wallet.protected, archived: wallet.archived }
      })
      const budgetResults = budgetPlans
        .filter((plan) => !plan.archived && plan.endOn >= analyticsFrom && plan.startOn <= analyticsTo &&
          (!activeBudgetFilter || plan.id === activeBudgetFilter))
        .map((plan) => ({
          plan,
          progress: calculateBudgetProgress(plan, categories, transactions, today),
        }))
      const debtResults = debts
        .filter((debt) => !debt.archived)
        .map((debt) => ({ debt, progress: getDebtProgress(debt, today) }))
      return { result, walletTotals, budgetResults, debtResults, error: '' }
    } catch (error) {
      return {
        result: null,
        walletTotals: [],
        budgetResults: [],
        debtResults: [],
        error: error instanceof Error ? error.message : 'Your insights could not be calculated.',
      }
    }
  }, [tab, transactions, categories, wallets, budgetPlans, debts, loading, dataUnavailable, analyticsFrom, analyticsTo, today, activeBudgetFilter])

  return (
    <>
      <div className="page-heading">
        <div>

          <h1>Iba pa</h1>
          <p>Tingnan ang calendar, gastos, at settings mo.</p>
        </div>
      </div>
      <div className="tools-tabs" role="tablist" aria-label="More sections">
        {toolTabs.map(({ id, label }, index) => (
          <button
            key={id}
            id={`tools-tab-${id}`}
            className={`tools-tab${tab === id ? ' selected' : ''}`}
            type="button"
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            aria-selected={tab === id}
            aria-controls={`tools-panel-${id}`}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              const nextIndex = event.key === 'ArrowRight'
                ? (index + 1) % toolTabs.length
                : event.key === 'ArrowLeft'
                  ? (index + toolTabs.length - 1) % toolTabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? toolTabs.length - 1
                      : -1
              if (nextIndex < 0) return
              event.preventDefault()
              const nextTab = toolTabs[nextIndex]
              setTab(nextTab.id)
              document.getElementById(`tools-tab-${nextTab.id}`)?.focus()
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'calendar' && (
        <section id="tools-panel-calendar" role="tabpanel" tabIndex={0} aria-labelledby="tools-tab-calendar" className="tools-content">
          <section className="panel tools-controls" aria-label="Calendar date range">
            <label className="field"><span>From</span><input type="date" value={calendarFrom} max={calendarTo} onChange={(event) => setCalendarFrom(event.target.value)} /></label>
            <label className="field"><span>Through</span><input type="date" value={calendarTo} min={calendarFrom} onChange={(event) => setCalendarTo(event.target.value)} /></label>
            <p>Local ledger activity and active scheduled events. These reminders stay inside this app on this device.</p>
          </section>
          {loading ? <p className="loading-state">Gathering your money dates…</p> : dataUnavailable ? <p className="error-state">Planning data is unavailable. Retry loading local data before viewing this calendar.</p> : calendar.error ? <p className="error-state" role="alert">{calendar.error}</p> : (
            <>
              <section className="panel reminder-panel" aria-label="In-app reminders">
                <div className="tools-panel-heading"><div><h2>Reminders</h2></div><span className="tools-count">{calendar.reminders.length}</span></div>
                {calendar.reminders.length === 0
                  ? <p className="tools-muted">No bills, expected payments, or budget limits need attention this week. Ayos ah.</p>
                  : <ul className="reminder-list">{calendar.reminders.map((item) => <li key={item.id}><span className="reminder-mark" aria-hidden="true"><Bell className="ui-icon" aria-hidden="true" /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div><span className="reminder-amount">{displayAmount(item.amount, visible)}</span></li>)}</ul>}
              </section>
              <section className="panel timeline-panel" aria-label="Upcoming financial timeline">
                <div className="tools-panel-heading"><div><h2>Calendar ng pera</h2></div><span className="tools-count">{calendar.items.length} events</span></div>
                {calendar.items.length === 0
                  ? <div className="tools-empty"><h3>Walang record sa mga petsang ito</h3><p>Dito lalabas ang mga record at ang mga naka-schedule na pasok at bayad.</p></div>
                  : <ol className="timeline-list">{calendar.items.map((item) => (
                      <li className={`timeline-item${item.overdue ? ' overdue' : ''}`} key={item.id}>
                        <time dateTime={item.date}>{dateFormatter.format(new Date(`${item.date}T00:00:00.000Z`))}</time>
                        <span className={`timeline-dot ${item.direction}`} aria-hidden="true" />
                        <div className="timeline-copy"><strong>{item.title}</strong><small>{item.detail}</small></div>
                        <strong className={`timeline-amount ${item.direction}`}>{item.direction === 'inflow' ? '+' : item.direction === 'outflow' ? '−' : ''}{displayAmount(item.amountCentavos, visible)}</strong>
                      </li>
                    ))}</ol>}
              </section>
            </>
          )}
        </section>
      )}

      {tab === 'insights' && (
        <section id="tools-panel-insights" role="tabpanel" tabIndex={0} aria-labelledby="tools-tab-insights" className="tools-content">
          <section className="panel tools-controls analytics-controls" aria-label="Analytics date range">
            <label className="field"><span>Period</span><select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="custom">Custom dates</option></select></label>
            {analyticsRange === 'custom' && <>
              <label className="field"><span>From</span><input type="date" value={customFrom} max={today} onChange={(event) => setCustomFrom(event.target.value)} /></label>
              <label className="field"><span>Through</span><input type="date" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value)} /></label>
            </>}
            <label className="field"><span>Budget plan</span><select value={activeBudgetFilter} onChange={(event) => setBudgetFilter(event.target.value)}><option value="">All matching plans</option>{availableBudgets.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            <p>Actual ledger activity only; transfers are neutral except for their fees.</p>
          </section>
          {loading ? <p className="loading-state">Binabasa ang activity ng pera…</p> : dataUnavailable ? <p className="error-state">Ledger or planning data is unavailable. Retry loading local data before viewing insights.</p> : analytics.error ? <p className="error-state" role="alert">{analytics.error}</p> : analytics.result && (
            <>
              <section className="analytics-summary" aria-label="Income and expenses">
                <article className="panel analytics-metric"><span className="metric-label">INCOME</span><strong>{displayAmount(analytics.result.incomeCentavos, visible)}</strong></article>
                <article className="panel analytics-metric"><span className="metric-label">Gastos at fees</span><strong>{displayAmount(analytics.result.expenseCentavos, visible)}</strong></article>
                <article className="panel analytics-metric"><span className="metric-label">Pagbabago sa pera</span><strong className={analytics.result.netChangeCentavos < 0 ? 'negative' : 'positive'}>{analytics.result.netChangeCentavos > 0 ? '+' : analytics.result.netChangeCentavos < 0 ? '−' : ''}{displayAmount(Math.abs(analytics.result.netChangeCentavos), visible)}</strong></article>
              </section>
              <section className="analytics-grid">
                <article className="panel analytics-panel trend-panel">
                  <div className="tools-panel-heading"><div><h2>Pumasok at nagastos</h2></div></div>
                  <div className="trend-legend"><span><i className="income-legend" /> Income</span><span><i className="expense-legend" /> Expenses</span></div>
                  {analytics.result.monthlyTrends.map((month) => {
                    const max = Math.max(month.incomeCentavos, month.expenseCentavos, 1)
                    return <div className="trend-row" key={month.month}><time>{monthFormatter.format(new Date(`${month.month}-01T00:00:00.000Z`))}</time><div className="trend-bars"><div className="trend-bar income-bar" style={{ width: `${month.incomeCentavos / max * 100}%` }} title={`Income ${displayAmount(month.incomeCentavos, visible)}`} /><div className="trend-bar expense-bar" style={{ width: `${month.expenseCentavos / max * 100}%` }} title={`Expenses ${displayAmount(month.expenseCentavos, visible)}`} /></div></div>
                  })}
                  <div className="trend-totals"><span>Income <strong>{displayAmount(analytics.result.incomeCentavos, visible)}</strong></span><span>Expenses <strong>{displayAmount(analytics.result.expenseCentavos, visible)}</strong></span></div>
                </article>
                <CategoryBreakdown title="Spending by category" categories={analytics.result.expenseCategories} savedCategories={categories} visible={visible} />
                <CategoryBreakdown title="Income by category" categories={analytics.result.incomeCategories} savedCategories={categories} visible={visible} />
                <article className="panel analytics-panel">
                  <div className="tools-panel-heading"><div><h2>Pera sa bawat wallet</h2></div></div>
                  {analytics.walletTotals?.length ? <ul className="metric-list">{analytics.walletTotals.map((wallet) => <li key={wallet.id}><span><strong>{wallet.name}</strong><small>{wallet.protected ? 'Protected' : wallet.archived ? 'Archived' : 'Spendable'}</small></span><strong>{displayAmount(wallet.amount, visible)}</strong></li>)}</ul> : <p className="tools-muted">Add a wallet to see your distribution.</p>}
                </article>
                <article className="panel analytics-panel">
                  <div className="tools-panel-heading"><div><h2>Kumusta ang budget?</h2></div></div>
                  {analytics.budgetResults?.length ? <ul className="budget-performance-list">{analytics.budgetResults.map(({ plan, progress }) => <li key={plan.id}><div className="budget-performance-heading"><strong>{plan.name}</strong><span>{displayAmount(progress.totalSpentCentavos, visible)} / {displayAmount(progress.totalLimitCentavos, visible)}</span></div><div className="budget-performance-track" role="progressbar" aria-label={`${plan.name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(progress.totalLimitCentavos > 0 ? progress.totalSpentCentavos / progress.totalLimitCentavos * 100 : 0))}><span className={progress.totalSpentCentavos > progress.totalLimitCentavos ? 'over' : ''} style={{ width: `${Math.min(100, progress.totalSpentCentavos / progress.totalLimitCentavos * 100)}%` }} /></div><small>{progress.totalRemainingCentavos < 0 ? `Over by ${displayAmount(Math.abs(progress.totalRemainingCentavos), visible)}` : `${displayAmount(progress.totalRemainingCentavos, visible)} remaining`}</small></li>)}</ul> : <p className="tools-muted">No budget plan overlaps this reporting period.</p>}
                </article>
                <article className="panel analytics-panel">
                  <div className="tools-panel-heading"><div><h2>Bayad at natitirang utang</h2></div></div>
                  {analytics.debtResults?.length ? <ul className="metric-list">{analytics.debtResults.map(({ debt, progress }) => <li key={debt.id}><span><strong>{debt.name}</strong><small>{debt.direction === 'payable' ? 'Money I owe' : 'Money owed to me'} · {progress.status}</small></span><span className="debt-progress-amount">{displayAmount(progress.remainingTotalCentavos, visible)}<small>remaining</small></span></li>)}</ul> : <p className="tools-muted">No active debts to track. One less thing to stress about.</p>}
                  {obligations.filter((item) => !item.archived).length > 0 && <p className="tools-muted">{obligations.filter((item) => !item.archived).length} active bill or expense schedules are tracked in your calendar.</p>}
                </article>
              </section>
            </>
          )}
          <p className="privacy-note tools-privacy">Insights are calculated from local ledger data on this device. No account or financial-data connection is used.</p>
        </section>
      )}

      {tab === 'settings' && (
        <section id="tools-panel-settings" role="tabpanel" tabIndex={0} aria-labelledby="tools-tab-settings" className="tools-content">
          <section className="panel settings-panel">
            <div className="settings-title"><span className="card-icon"><Sun className="ui-icon" aria-hidden="true" /></span><div><h2>Appearance</h2><p>Piliin ang itsura ng app sa device na ito.</p></div></div>
            <div className="theme-options" role="group" aria-label="Color theme">
              {([
                { id: 'system', label: 'System', description: 'Follow your device settings', icon: Monitor },
                { id: 'light', label: 'Light', description: 'Bright and clear', icon: Sun },
                { id: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: Moon },
              ] as const).map((option) => (
                <button className={`theme-option${theme === option.id ? ' selected' : ''}`} key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => onThemeChange(option.id)}>
                  <option.icon className="ui-icon" aria-hidden="true" /><span><strong>{option.label}</strong><small>{option.description}</small></span>{theme === option.id && <i aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>
          <section className="panel about-panel">
            <span className="card-icon mint-icon"><LockKeyhole className="ui-icon" aria-hidden="true" /></span><div><h2>Privacy ng data</h2>            <p>Sa browser na ito lang naka-save ang pera records mo. Mawawala ang data kapag nilinis ang site storage. Magtabi ng JSON backup.</p></div>
          </section>
        </section>
      )}
    </>
  )
}

function CategoryBreakdown({
  title,
  categories,
  savedCategories,
  visible,
}: {
  title: string
  savedCategories: readonly TransactionCategory[]
  categories: readonly { id: string; name: string; amountCentavos: number }[]
  visible: boolean
}) {
  const maximum = Math.max(1, ...categories.map((category) => category.amountCentavos))
  return (
    <article className="panel analytics-panel">
      <div className="tools-panel-heading"><div><h2>{title}</h2></div></div>
      {categories.length === 0 ? <p className="tools-muted">No categorized activity in this period yet.</p> : <ul className="category-breakdown">{categories.slice(0, 8).map((category) => <li key={category.id}><div><strong className="category-label"><CategorySymbol icon={savedCategories.find((saved) => saved.id === category.id)?.icon} /> {category.name}</strong><span>{displayAmount(category.amountCentavos, visible)}</span></div><div className="category-track"><span style={{ width: `${category.amountCentavos / maximum * 100}%` }} /></div></li>)}</ul>}
    </article>
  )
}
