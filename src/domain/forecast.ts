import {
  calculateWalletBalances,
  isLedgerTransaction,
  type LedgerTransaction,
} from './ledger.ts'
import { sumCentavos } from './money.ts'
import {
  getDebtProgress,
  getObligationProgress,
  isDebtRecord,
  isFinancialObligation,
  type DebtRecord,
  type FinancialObligation,
} from './debts.ts'
import { getExpectedIncomeProgress, isExpectedIncome, type ExpectedIncome } from './planning.ts'
import { isDateOnly, nextRecurringDate } from './recurrence.ts'

export type ForecastScenario = 'conservative' | 'expected' | 'optimistic'
export type ForecastEventKind = 'expectedIncome' | 'debt' | 'obligation' | 'purchase'

export interface ForecastWallet {
  id: string
  name: string
  openingBalanceCentavos: number
  protected: boolean
  archived: boolean
}

export interface ForecastEvent {
  id: string
  label: string
  walletId: string
  dueOn: string
  projectedOn: string
  kind: ForecastEventKind
  direction: 'inflow' | 'outflow'
  amountCentavos: number
  confidence?: ExpectedIncome['confidence']
}

export interface ForecastPoint {
  date: string
  balances: Readonly<Record<string, number>>
  totalCentavos: number
  spendableCentavos: number
}

export interface ForecastShortageEpisode {
  startOn: string
  recoveryOn?: string
  maximumShortageCentavos: number
}

export interface ForecastWalletSummary {
  walletId: string
  minimumBalanceCentavos: number
  minimumBalanceOn: string
  maximumShortageCentavos: number
  shortageEpisodes: readonly ForecastShortageEpisode[]
}

export interface ForecastScenarioResult {
  scenario: ForecastScenario
  events: readonly ForecastEvent[]
  points: readonly ForecastPoint[]
  startingBalances: Readonly<Record<string, number>>
  startingTotalCentavos: number
  endingTotalCentavos: number
  minimumTotalCentavos: number
  minimumTotalOn: string
  startingSpendableCentavos: number
  endingSpendableCentavos: number
  minimumSpendableCentavos: number
  minimumSpendableOn: string
  maximumSpendableShortageCentavos: number
  spendableShortageEpisodes: readonly ForecastShortageEpisode[]
  walletSummaries: readonly ForecastWalletSummary[]
  safeDailyCentavos: number
  safeWeeklyCentavos: number
}

export interface ForecastRequest {
  wallets: readonly ForecastWallet[]
  transactions: readonly LedgerTransaction[]
  expectedIncomes: readonly ExpectedIncome[]
  debts: readonly DebtRecord[]
  obligations: readonly FinancialObligation[]
  today: string
  endOn: string
  safetyBufferCentavos: number
  hypotheticalPurchase?: {
    walletId: string
    amountCentavos: number
    occurredOn: string
  }
}

const MAX_FORECAST_DAYS = 3660
const MAX_SCHEDULE_OCCURRENCES = 100_000

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('The forecast exceeds the safe integer range for centavos.')
  }
  return result
}

function dayOffset(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000
}

function laterDate(date: string, today: string): string {
  return date < today ? today : date
}

function addEvent(
  events: ForecastEvent[],
  wallets: ReadonlySet<string>,
  event: ForecastEvent,
): void {
  if (!wallets.has(event.walletId)) {
    throw new TypeError('A forecast schedule references a missing wallet.')
  }
  if (!Number.isSafeInteger(event.amountCentavos) || event.amountCentavos < 0) {
    throw new TypeError('A forecast schedule contains an invalid amount.')
  }
  if (event.amountCentavos > 0) events.push(event)
}

function collectExpectedIncomeEvents(
  item: ExpectedIncome,
  request: ForecastRequest,
  walletIds: ReadonlySet<string>,
  events: ForecastEvent[],
): void {
  if (item.archived) return
  const progress = getExpectedIncomeProgress(item, request.today)
  let dueOn = progress.dueOn
  let index = 0
  while (dueOn <= request.endOn) {
    const received = sumCentavos(item.receipts
      .filter((receipt) => receipt.dueOn === dueOn)
      .map((receipt) => receipt.amountCentavos))
    addEvent(events, walletIds, {
      id: `${item.id}:${dueOn}`,
      label: item.description,
      walletId: item.walletId,
      dueOn,
      projectedOn: laterDate(dueOn, request.today),
      kind: 'expectedIncome',
      direction: 'inflow',
      amountCentavos: item.amountCentavos - received,
      confidence: item.confidence,
    })
    if (item.recurrence === 'none') break
    if (++index > MAX_SCHEDULE_OCCURRENCES) {
      throw new RangeError('An expected-income schedule has too many forecast occurrences.')
    }
    dueOn = nextRecurringDate(dueOn, item.recurrence, item.monthlyAnchorDay)
  }
}

function debtInstallmentAmount(debt: DebtRecord, index: number): number {
  if (debt.installmentAmountCentavos === undefined) return debt.amountCentavos
  const regularInstallments = Math.floor(debt.amountCentavos / debt.installmentAmountCentavos)
  const remainder = debt.amountCentavos % debt.installmentAmountCentavos
  if (index < regularInstallments) return debt.installmentAmountCentavos
  return index === regularInstallments ? remainder : 0
}

function collectDebtEvents(
  debt: DebtRecord,
  request: ForecastRequest,
  walletIds: ReadonlySet<string>,
  events: ForecastEvent[],
): void {
  if (debt.archived) return
  const progress = getDebtProgress(debt, request.today)
  let dueOn = progress.dueOn
  let index = progress.installmentsCompleted
  let paidCentavos = progress.settledThisOccurrenceCentavos
  let count = 0
  while (
    dueOn <= request.endOn &&
    (debt.installmentCount === undefined || index < debt.installmentCount)
  ) {
    const amountCentavos = debtInstallmentAmount(debt, index)
    if (amountCentavos <= 0) break
    addEvent(events, walletIds, {
      id: `${debt.id}:${dueOn}`,
      label: debt.name,
      walletId: debt.walletId,
      dueOn,
      projectedOn: laterDate(dueOn, request.today),
      kind: 'debt',
      direction: debt.direction === 'payable' ? 'outflow' : 'inflow',
      amountCentavos: amountCentavos - paidCentavos,
    })
    if (debt.recurrence === 'none') break
    if (++count > MAX_SCHEDULE_OCCURRENCES) {
      throw new RangeError('A debt schedule has too many forecast occurrences.')
    }
    dueOn = nextRecurringDate(dueOn, debt.recurrence, debt.monthlyAnchorDay)
    index += 1
    paidCentavos = 0
  }
}

function collectObligationEvents(
  obligation: FinancialObligation,
  request: ForecastRequest,
  walletIds: ReadonlySet<string>,
  events: ForecastEvent[],
): void {
  if (obligation.archived) return
  const progress = getObligationProgress(obligation, request.today)
  let dueOn = progress.dueOn
  let index = progress.installmentsCompleted
  let paidCentavos = progress.paidThisOccurrenceCentavos
  let count = 0
  while (
    dueOn <= request.endOn &&
    (obligation.installmentCount === undefined || index < obligation.installmentCount)
  ) {
    addEvent(events, walletIds, {
      id: `${obligation.id}:${dueOn}`,
      label: obligation.description,
      walletId: obligation.walletId,
      dueOn,
      projectedOn: laterDate(dueOn, request.today),
      kind: 'obligation',
      direction: 'outflow',
      amountCentavos: obligation.amountCentavos - paidCentavos,
    })
    if (obligation.recurrence === 'none') break
    if (++count > MAX_SCHEDULE_OCCURRENCES) {
      throw new RangeError('A bill schedule has too many forecast occurrences.')
    }
    dueOn = nextRecurringDate(dueOn, obligation.recurrence, obligation.monthlyAnchorDay)
    index += 1
    paidCentavos = 0
  }
}

function scenarioIncludes(event: ForecastEvent, scenario: ForecastScenario): boolean {
  if (event.kind === 'purchase') return true
  if (event.kind === 'expectedIncome') {
    if (scenario === 'conservative') return event.confidence === 'high'
    if (scenario === 'expected') return event.confidence !== 'low'
    return true
  }
  return event.direction !== 'inflow' || scenario !== 'conservative'
}

function forecastScenario(
  scenario: ForecastScenario,
  allEvents: readonly ForecastEvent[],
  wallets: readonly ForecastWallet[],
  startingBalances: ReadonlyMap<string, number>,
  today: string,
  endOn: string,
  safetyBufferCentavos: number,
): ForecastScenarioResult {
  const events = allEvents
    .filter((event) => scenarioIncludes(event, scenario))
    .sort((left, right) =>
      left.projectedOn.localeCompare(right.projectedOn) ||
      (left.direction === right.direction ? 0 : left.direction === 'outflow' ? -1 : 1) ||
      left.dueOn.localeCompare(right.dueOn) ||
      left.id.localeCompare(right.id),
    )
  const balances = new Map(startingBalances)
  const spendableWalletIds = wallets
    .filter((wallet) => !wallet.protected && !wallet.archived)
    .map((wallet) => wallet.id)
  const dailyPoints: ForecastPoint[] = []
  const walletSamples = new Map<string, { date: string; balance: number }[]>()
  for (const wallet of wallets) {
    const balance = startingBalances.get(wallet.id)
    if (balance === undefined) throw new TypeError('A forecast wallet balance is missing.')
    walletSamples.set(wallet.id, [{ date: today, balance }])
  }
  const spendableSamples: { date: string; balance: number }[] = [{
    date: today,
    balance: sumCentavos(wallets
      .filter((wallet) => !wallet.protected && !wallet.archived)
      .map((wallet) => startingBalances.get(wallet.id) ?? 0)),
  }]
  const totalSamples: { date: string; balance: number }[] = [{
    date: today,
    balance: sumCentavos([...startingBalances.values()]),
  }]
  let eventIndex = 0

  for (let offset = 0; offset <= dayOffset(today, endOn); offset += 1) {
    const date = new Date(Date.parse(`${today}T00:00:00.000Z`) + offset * 86_400_000)
      .toISOString()
      .slice(0, 10)
    while (eventIndex < events.length && events[eventIndex].projectedOn === date) {
      const event = events[eventIndex++]
      const current = balances.get(event.walletId)
      if (current === undefined) throw new TypeError('A forecast wallet balance is missing.')
      const amount = event.direction === 'inflow' ? event.amountCentavos : -event.amountCentavos
      balances.set(event.walletId, addSafe(current, amount))
      for (const wallet of wallets) {
        const walletBalance = balances.get(wallet.id)
        if (walletBalance === undefined) throw new TypeError('A forecast wallet balance is missing.')
        const samples = walletSamples.get(wallet.id) ?? []
        samples.push({ date, balance: walletBalance })
        walletSamples.set(wallet.id, samples)
      }
      spendableSamples.push({
        date,
        balance: sumCentavos(spendableWalletIds.map((id) => balances.get(id) ?? 0)),
      })
      totalSamples.push({ date, balance: sumCentavos([...balances.values()]) })
    }
    const walletBalances: Record<string, number> = {}
    for (const wallet of wallets) {
      const balance = balances.get(wallet.id)
      if (balance === undefined) throw new TypeError('A forecast wallet balance is missing.')
      walletBalances[wallet.id] = balance
      const samples = walletSamples.get(wallet.id) ?? []
      if (samples.length === 0 || samples[samples.length - 1].date !== date) {
        samples.push({ date, balance })
        walletSamples.set(wallet.id, samples)
      }
    }
    const spendableCentavos = sumCentavos(spendableWalletIds.map((id) => balances.get(id) ?? 0))
    if (spendableSamples.length === 0 || spendableSamples[spendableSamples.length - 1].date !== date) {
      spendableSamples.push({ date, balance: spendableCentavos })
    }
    dailyPoints.push({
      date,
      balances: walletBalances,
      totalCentavos: sumCentavos(Object.values(walletBalances)),
      spendableCentavos,
    })
  }

  const startingTotalCentavos = sumCentavos([...startingBalances.values()])
  const startingSpendableCentavos = sumCentavos(spendableWalletIds.map((id) => startingBalances.get(id) ?? 0))
  const totalMinimum = minimumSample(totalSamples)
  const walletSummaries = wallets.map((wallet) => {
    const samples = walletSamples.get(wallet.id) ?? []
    const minimum = minimumSample(samples)
    return {
      walletId: wallet.id,
      minimumBalanceCentavos: minimum.balance,
      minimumBalanceOn: minimum.date,
      maximumShortageCentavos: Math.max(0, -minimum.balance),
      shortageEpisodes: findShortageEpisodes(samples),
    }
  })
  const minimumSpendableSample = minimumSample(spendableSamples)
  const dailySafe = safeDailySpending(spendableSamples, today, safetyBufferCentavos)
  const weeklyAtDailyRate = dailySafe <= Math.floor(Number.MAX_SAFE_INTEGER / 7)
    ? dailySafe * 7
    : Number.MAX_SAFE_INTEGER
  const weeklySafe = Math.min(
    weeklyAtDailyRate,
    Math.max(0, minimumSpendableSample.balance - safetyBufferCentavos),
  )

  return {
    scenario,
    events,
    points: dailyPoints,
    startingBalances: Object.fromEntries(startingBalances),
    startingTotalCentavos,
    endingTotalCentavos: dailyPoints[dailyPoints.length - 1].totalCentavos,
    minimumTotalCentavos: totalMinimum.balance,
    minimumTotalOn: totalMinimum.date,
    startingSpendableCentavos,
    endingSpendableCentavos: dailyPoints[dailyPoints.length - 1].spendableCentavos,
    minimumSpendableCentavos: minimumSpendableSample.balance,
    minimumSpendableOn: minimumSpendableSample.date,
    maximumSpendableShortageCentavos: Math.max(0, -minimumSpendableSample.balance),
    spendableShortageEpisodes: findShortageEpisodes(spendableSamples),
    walletSummaries,
    safeDailyCentavos: dailySafe,
    safeWeeklyCentavos: weeklySafe,
  }
}

function minimumSample(
  samples: readonly { date: string; balance: number }[],
): { balance: number; date: string } {
  return samples.reduce((minimum, sample) =>
    sample.balance < minimum.balance ? sample : minimum,
  { balance: Number.MAX_SAFE_INTEGER, date: samples[0].date })
}

function findShortageEpisodes(
  samples: readonly { date: string; balance: number }[],
): ForecastShortageEpisode[] {
  const episodes: ForecastShortageEpisode[] = []
  let current: ForecastShortageEpisode | undefined
  for (const sample of samples) {
    if (sample.balance < 0) {
      if (!current) current = { startOn: sample.date, maximumShortageCentavos: -sample.balance }
      else current.maximumShortageCentavos = Math.max(current.maximumShortageCentavos, -sample.balance)
    } else if (current) {
      episodes.push({ ...current, recoveryOn: sample.date })
      current = undefined
    }
  }
  if (current) episodes.push(current)
  return episodes
}

function safeDailySpending(
  samples: readonly { date: string; balance: number }[],
  today: string,
  safetyBufferCentavos: number,
): number {
  let safeDaily = Number.MAX_SAFE_INTEGER
  for (const sample of samples) {
    const headroom = sample.balance - safetyBufferCentavos
    if (headroom < 0) return 0
    const elapsedDays = dayOffset(today, sample.date)
    if (elapsedDays === 0) {
      safeDaily = Math.min(safeDaily, headroom)
    } else {
      safeDaily = Math.min(safeDaily, Math.floor(headroom / elapsedDays))
    }
  }
  return safeDaily === Number.MAX_SAFE_INTEGER ? 0 : safeDaily
}

export function calculateForecast(
  request: ForecastRequest,
  scenarios: readonly ForecastScenario[] = ['conservative', 'expected', 'optimistic'],
): readonly ForecastScenarioResult[] {
  if (
    !isDateOnly(request.today) ||
    !isDateOnly(request.endOn) ||
    request.endOn < request.today ||
    dayOffset(request.today, request.endOn) > MAX_FORECAST_DAYS ||
    !Number.isSafeInteger(request.safetyBufferCentavos) ||
    request.safetyBufferCentavos < 0 ||
    !request.wallets.length ||
    !request.transactions.every(isLedgerTransaction) ||
    !request.expectedIncomes.every(isExpectedIncome) ||
    !request.debts.every(isDebtRecord) ||
    !request.obligations.every(isFinancialObligation)
  ) {
    throw new TypeError('The forecast inputs or date range are invalid.')
  }
  const walletIds = new Set<string>()
  for (const wallet of request.wallets) {
    if (
      typeof wallet.id !== 'string' ||
      !wallet.id ||
      typeof wallet.name !== 'string' ||
      typeof wallet.protected !== 'boolean' ||
      typeof wallet.archived !== 'boolean' ||
      walletIds.has(wallet.id)
    ) {
      throw new TypeError('Forecast wallet data is invalid.')
    }
    walletIds.add(wallet.id)
  }
  const startingBalances = calculateWalletBalances(request.wallets, request.transactions)
  const allEvents: ForecastEvent[] = []
  for (const expected of request.expectedIncomes) {
    collectExpectedIncomeEvents(expected, request, walletIds, allEvents)
  }
  for (const debt of request.debts) {
    collectDebtEvents(debt, request, walletIds, allEvents)
  }
  for (const obligation of request.obligations) {
    collectObligationEvents(obligation, request, walletIds, allEvents)
  }
  if (request.hypotheticalPurchase) {
    const purchase = request.hypotheticalPurchase
    if (
      !walletIds.has(purchase.walletId) ||
      !Number.isSafeInteger(purchase.amountCentavos) ||
      purchase.amountCentavos <= 0 ||
      !isDateOnly(purchase.occurredOn) ||
      purchase.occurredOn < request.today ||
      purchase.occurredOn > request.endOn
    ) {
      throw new TypeError('The hypothetical purchase is invalid or outside the forecast period.')
    }
    addEvent(allEvents, walletIds, {
      id: 'hypothetical-purchase',
      label: 'What-if purchase',
      walletId: purchase.walletId,
      dueOn: purchase.occurredOn,
      projectedOn: purchase.occurredOn,
      kind: 'purchase',
      direction: 'outflow',
      amountCentavos: purchase.amountCentavos,
    })
  }
  return scenarios.map((scenario) =>
    forecastScenario(
      scenario,
      allEvents,
      request.wallets,
      startingBalances,
      request.today,
      request.endOn,
      request.safetyBufferCentavos,
    ),
  )
}
