import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateForecast,
  type ForecastRequest,
  type ForecastScenarioResult,
  type ForecastWallet,
} from '../src/domain/forecast.ts'
import type { LedgerTransaction } from '../src/domain/ledger.ts'
import type { DebtRecord, FinancialObligation } from '../src/domain/debts.ts'
import type { ExpectedIncome } from '../src/domain/planning.ts'

const today = new Date()
const todayOnly = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function wallet(
  id: string,
  openingBalanceCentavos: number,
  protectedFunds = false,
): ForecastWallet {
  return {
    id,
    name: id,
    openingBalanceCentavos,
    protected: protectedFunds,
    archived: false,
  }
}

function income(
  id: string,
  dueOn: string,
  amountCentavos: number,
  confidence: ExpectedIncome['confidence'],
): ExpectedIncome {
  return {
    id,
    kind: 'expectedIncome',
    description: id,
    amountCentavos,
    walletId: 'wallet-1',
    dueOn,
    confidence,
    recurrence: 'none',
    monthlyAnchorDay: Number(dueOn.slice(-2)),
    receipts: [],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

function bill(
  id: string,
  dueOn: string,
  amountCentavos: number,
  payments: FinancialObligation['payments'] = [],
): FinancialObligation {
  return {
    id,
    kind: 'obligation',
    description: id,
    amountCentavos,
    walletId: 'wallet-1',
    dueOn,
    recurrence: 'none',
    monthlyAnchorDay: Number(dueOn.slice(-2)),
    payments,
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

function request(overrides: Partial<ForecastRequest> = {}): ForecastRequest {
  return {
    wallets: [wallet('wallet-1', 0)],
    transactions: [],
    expectedIncomes: [],
    debts: [],
    obligations: [],
    today: todayOnly,
    endOn: addDays(todayOnly, 30),
    safetyBufferCentavos: 0,
    ...overrides,
  }
}

function scenario(
  results: readonly ForecastScenarioResult[],
  name: ForecastScenarioResult['scenario'],
): ForecastScenarioResult {
  const result = results.find((item) => item.scenario === name)
  assert.ok(result)
  return result
}

test('reports an intermediate wallet shortage even when later income leaves the period positive', () => {
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 10_000)],
    obligations: [bill('rent', addDays(todayOnly, 1), 20_000)],
    expectedIncomes: [income('salary', addDays(todayOnly, 2), 20_000, 'high')],
    endOn: addDays(todayOnly, 3),
  }))
  const conservative = scenario(results, 'conservative')

  assert.equal(conservative.endingTotalCentavos, 10_000)
  assert.equal(conservative.maximumSpendableShortageCentavos, 10_000)
  assert.deepEqual(conservative.spendableShortageEpisodes, [{
    startOn: addDays(todayOnly, 1),
    recoveryOn: addDays(todayOnly, 2),
    maximumShortageCentavos: 10_000,
  }])
})

test('applies confidence tiers consistently across conservative, expected, and optimistic scenarios', () => {
  const results = calculateForecast(request({
    expectedIncomes: [
      income('high', addDays(todayOnly, 1), 1_000, 'high'),
      income('medium', addDays(todayOnly, 1), 2_000, 'medium'),
      income('low', addDays(todayOnly, 1), 3_000, 'low'),
    ],
    endOn: addDays(todayOnly, 1),
  }))

  assert.equal(scenario(results, 'conservative').endingTotalCentavos, 1_000)
  assert.equal(scenario(results, 'expected').endingTotalCentavos, 3_000)
  assert.equal(scenario(results, 'optimistic').endingTotalCentavos, 6_000)
})

test('projects only the remainder of an overdue, partially received expected-income occurrence', () => {
  const dueOn = addDays(todayOnly, -1)
  const receipt: LedgerTransaction = {
    id: 'late-receipt',
    kind: 'income',
    occurredOn: todayOnly,
    description: 'Partial salary',
    amountCentavos: 400,
    walletId: 'wallet-1',
    expectedIncomeId: 'late-income',
    expectedIncomeDueOn: dueOn,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const expectedIncome = {
    ...income('late-income', dueOn, 1_000, 'high'),
    receipts: [{ transactionId: receipt.id, dueOn, amountCentavos: receipt.amountCentavos }],
  }
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 0)],
    transactions: [receipt],
    expectedIncomes: [expectedIncome],
    endOn: addDays(todayOnly, 1),
  }))
  const expected = scenario(results, 'expected')

  assert.equal(expected.startingTotalCentavos, 400)
  assert.equal(expected.endingTotalCentavos, 1_000)
  assert.equal(expected.events[0].amountCentavos, 600)
  assert.equal(expected.events[0].projectedOn, todayOnly)
})

test('tests same-day outflows before inflows instead of hiding a temporary shortage', () => {
  const dueOn = addDays(todayOnly, 1)
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 0)],
    obligations: [bill('same-day-bill', dueOn, 10_000)],
    expectedIncomes: [income('same-day-income', dueOn, 10_000, 'high')],
    endOn: dueOn,
  }))
  const expected = scenario(results, 'expected')

  assert.equal(expected.endingTotalCentavos, 0)
  assert.equal(expected.minimumTotalCentavos, -10_000)
  assert.deepEqual(expected.spendableShortageEpisodes, [{
    startOn: dueOn,
    recoveryOn: dueOn,
    maximumShortageCentavos: 10_000,
  }])
})

test('projects only the unpaid portion of an overdue bill and excludes protected funds from safe spending', () => {
  const payment: LedgerTransaction = {
    id: 'bill-payment',
    kind: 'expense',
    occurredOn: todayOnly,
    description: 'Partial bill payment',
    amountCentavos: 4_000,
    walletId: 'wallet-1',
    obligationId: 'late-bill',
    obligationDueOn: addDays(todayOnly, -1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 20_000), wallet('protected', 90_000, true)],
    transactions: [payment],
    obligations: [bill('late-bill', addDays(todayOnly, -1), 10_000, [{
      transactionId: payment.id,
      dueOn: addDays(todayOnly, -1),
      amountCentavos: 4_000,
    }])],
    endOn: addDays(todayOnly, 2),
    safetyBufferCentavos: 5_000,
  }))
  const expected = scenario(results, 'expected')

  assert.equal(expected.startingTotalCentavos, 106_000)
  assert.equal(expected.startingSpendableCentavos, 16_000)
  assert.equal(expected.endingSpendableCentavos, 10_000)
  assert.equal(expected.safeDailyCentavos, 2_500)
  assert.equal(expected.events.find((event) => event.id.startsWith('late-bill:'))?.amountCentavos, 6_000)
  assert.equal(expected.events.find((event) => event.id.startsWith('late-bill:'))?.projectedOn, todayOnly)
})

test('keeps overdue recurring bill occurrences visible and projects their unpaid amounts from today', () => {
  const firstDueOn = addDays(todayOnly, -14)
  const payment: LedgerTransaction = {
    id: 'weekly-payment',
    kind: 'expense',
    occurredOn: todayOnly,
    description: 'Partial weekly bill',
    amountCentavos: 250,
    walletId: 'wallet-1',
    obligationId: 'weekly-bill',
    obligationDueOn: firstDueOn,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const weeklyBill: FinancialObligation = {
    ...bill('weekly-bill', firstDueOn, 1_000, [{
      transactionId: payment.id,
      dueOn: firstDueOn,
      amountCentavos: payment.amountCentavos,
    }]),
    recurrence: 'weekly',
  }
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 10_000)],
    transactions: [payment],
    obligations: [weeklyBill],
    endOn: addDays(todayOnly, 8),
  }))
  const expected = scenario(results, 'expected')
  const billEvents = expected.events.filter((event) => event.kind === 'obligation')

  assert.deepEqual(billEvents.map((event) => event.amountCentavos), [750, 1_000, 1_000, 1_000])
  assert.deepEqual(billEvents.slice(0, 3).map((event) => event.projectedOn), [todayOnly, todayOnly, todayOnly])
  assert.equal(billEvents[3].projectedOn, addDays(todayOnly, 7))
})

test('reports a wallet-specific shortage even when other wallets keep the combined balance positive', () => {
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 50_000), wallet('wallet-2', 0)],
    obligations: [{
      ...bill('rent', addDays(todayOnly, 1), 20_000),
      walletId: 'wallet-2',
    }],
    endOn: addDays(todayOnly, 2),
  }))
  const expected = scenario(results, 'expected')
  const walletTwo = expected.walletSummaries.find((item) => item.walletId === 'wallet-2')

  assert.equal(expected.endingTotalCentavos, 30_000)
  assert.equal(walletTwo?.maximumShortageCentavos, 20_000)
  assert.deepEqual(walletTwo?.shortageEpisodes, [{
    startOn: addDays(todayOnly, 1),
    maximumShortageCentavos: 20_000,
  }])
})

test('caps the weekly safe-to-spend estimate at available headroom in a short forecast window', () => {
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 10_000)],
    endOn: todayOnly,
    safetyBufferCentavos: 2_000,
  }))
  const expected = scenario(results, 'expected')

  assert.equal(expected.safeDailyCentavos, 8_000)
  assert.equal(expected.safeWeeklyCentavos, 8_000)
})

test('simulates a purchase as a hypothetical expense without mutating or saving the ledger', () => {
  const baseRequest = request({
    wallets: [wallet('wallet-1', 20_000)],
    endOn: addDays(todayOnly, 3),
  })
  const baseline = scenario(calculateForecast(baseRequest), 'expected')
  const withPurchase = scenario(calculateForecast({
    ...baseRequest,
    hypotheticalPurchase: {
      walletId: 'wallet-1',
      amountCentavos: 25_000,
      occurredOn: addDays(todayOnly, 1),
    },
  }), 'expected')

  assert.equal(baseline.endingTotalCentavos, 20_000)
  assert.equal(withPurchase.endingTotalCentavos, -5_000)
  assert.equal(withPurchase.events.some((event) => event.kind === 'purchase'), true)
  assert.equal(baseRequest.transactions.length, 0)
  assert.equal(withPurchase.walletSummaries[0].maximumShortageCentavos, 5_000)
})

test('rejects hypothetical purchases with invalid wallets, amounts, or dates', () => {
  const baseRequest = request({
    wallets: [wallet('wallet-1', 20_000)],
    endOn: addDays(todayOnly, 3),
  })
  const purchase = {
    walletId: 'wallet-1',
    amountCentavos: 1_000,
    occurredOn: addDays(todayOnly, 1),
  }

  assert.throws(() => calculateForecast({
    ...baseRequest,
    hypotheticalPurchase: { ...purchase, walletId: 'missing-wallet' },
  }), /hypothetical purchase is invalid/)
  assert.throws(() => calculateForecast({
    ...baseRequest,
    hypotheticalPurchase: { ...purchase, amountCentavos: 0 },
  }), /hypothetical purchase is invalid/)
  assert.throws(() => calculateForecast({
    ...baseRequest,
    hypotheticalPurchase: { ...purchase, occurredOn: addDays(todayOnly, 4) },
  }), /hypothetical purchase is invalid/)
})

test('forecasts centavo-exact final debt installments after a partial payment', () => {
  const dueOn = todayOnly
  const transaction: LedgerTransaction = {
    id: 'debt-payment',
    kind: 'expense',
    occurredOn: todayOnly,
    description: 'Partial debt payment',
    amountCentavos: 1_000,
    walletId: 'wallet-1',
    debtSettlementId: 'debt-1',
    debtSettlementDueOn: dueOn,
    debtSettlementExcludedFromTotals: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const debt: DebtRecord = {
    id: 'debt-1',
    kind: 'debt',
    name: 'Appliance',
    direction: 'payable',
    amountCentavos: 10_000,
    walletId: 'wallet-1',
    dueOn,
    recurrence: 'monthly',
    monthlyAnchorDay: Number(dueOn.slice(-2)),
    installmentAmountCentavos: 4_000,
    installmentCount: 3,
    settlements: [{ transactionId: transaction.id, dueOn, amountCentavos: 1_000 }],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
  const results = calculateForecast(request({
    wallets: [wallet('wallet-1', 20_000)],
    transactions: [transaction],
    debts: [debt],
    endOn: addDays(todayOnly, 100),
  }))
  const expected = scenario(results, 'expected')
  const debtEvents = expected.events.filter((event) => event.kind === 'debt')

  assert.deepEqual(debtEvents.map((event) => event.amountCentavos), [3_000, 4_000, 2_000])
  assert.equal(expected.endingTotalCentavos, 10_000)
})

test('rejects forecast periods longer than the supported ten-year horizon', () => {
  assert.throws(
    () => calculateForecast(request({ endOn: addDays(todayOnly, 3_661) })),
    /inputs or date range are invalid/,
  )
})
