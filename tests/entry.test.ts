import { balanceAdjustment } from '../src/domain/money.ts'
import { readForecastPreferences } from '../src/domain/forecastPreferences.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeSchedule, validateCompletedDate } from '../src/domain/entry.ts'
import { calculateForecast } from '../src/domain/forecast.ts'
import { calculateWalletBalances, type LedgerTransaction } from '../src/domain/ledger.ts'
import { getDebtProgress, outstandingObligations, updateObligationPayment, updateDebtSettlement } from '../src/domain/debts.ts'

const today = '2026-11-25'
const timestamp = today + 'T00:00:00Z'
const input = {
  id: 'record', description: 'Test record', amountCentavos: 5_000, walletId: 'cash',
  dueOn: '2026-11-29', timestamp, recurrence: 'none', confidence: 'high',
} as const
const wallets = [{ id: 'cash', name: 'Cash', openingBalanceCentavos: 20_000, archived: false, protected: false }]
const base = { wallets, transactions: [], today, endOn: '2026-11-30', safetyBufferCentavos: 0 }

test('future income, expenses, debts, and receivables use existing schedule types', () => {
  const income = makeSchedule('income', input)
  const expense = makeSchedule('expense', { ...input, id: 'expense' })
  const payable = makeSchedule('payable', { ...input, id: 'payable' })
  const receivable = makeSchedule('receivable', { ...input, id: 'receivable' })
  assert.equal(income.kind, 'expectedIncome')
  assert.equal(expense.kind, 'obligation')
  assert.equal(payable.kind, 'debt')
  assert.equal(receivable.kind, 'debt')
  if (income.kind !== 'expectedIncome' || expense.kind !== 'obligation' ||
    payable.kind !== 'debt' || receivable.kind !== 'debt') return
  const [result] = calculateForecast({
    ...base, expectedIncomes: [income], obligations: [expense], debts: [payable, receivable],
  }, ['expected'])
  assert.equal(result.events.length, 4)
  assert.equal(result.startingTotalCentavos, 20_000)
  assert.equal(result.endingTotalCentavos, 20_000)
  assert.deepEqual(result.events.map((event) => event.projectedOn), Array(4).fill(input.dueOn))
  assert.throws(() => validateCompletedDate(input.dueOn, today), /mas maaga/)
  assert.throws(() => makeSchedule('transfer', input), /mas maaga/)
})

test('editing keeps schedule identity and keeps an overdue record upcoming until payment', () => {
  const original = makeSchedule('bill', input)
  const edited = makeSchedule('bill', { ...input, dueOn: '2026-11-24', amountCentavos: 6_000 }, original)
  assert.equal(edited.id, original.id)
  assert.equal(edited.createdAt, original.createdAt)
  assert.equal(edited.monthlyAnchorDay, 24)
  if (edited.kind !== 'obligation') return
  const [result] = calculateForecast({ ...base, expectedIncomes: [], debts: [], obligations: [edited] }, ['expected'])
  assert.equal(result.events[0].dueOn, '2026-11-24')
  assert.equal(result.events[0].projectedOn, today)
  assert.equal(result.startingTotalCentavos, 20_000)
  assert.equal(result.endingTotalCentavos, 14_000)
})

test('early partial and full settlement reduce forecast remainder exactly once', () => {
  const bill = makeSchedule('bill', input)
  const payable = makeSchedule('payable', { ...input, id: 'debt' })
  if (bill.kind !== 'obligation' || payable.kind !== 'debt') return
  const payment: LedgerTransaction = {
    id: 'payment', kind: 'expense', walletId: input.walletId, amountCentavos: 2_000,
    occurredOn: today, description: bill.description, createdAt: timestamp, updatedAt: timestamp,
    obligationId: bill.id, obligationDueOn: bill.dueOn,
  }
  const partial = updateObligationPayment(bill, payment, today)
  const [first] = calculateForecast({
    ...base, transactions: [payment], expectedIncomes: [], debts: [], obligations: [partial],
  }, ['expected'])
  assert.equal(calculateWalletBalances(wallets, [payment]).get('cash'), 18_000)
  assert.equal(first.events[0].amountCentavos, 3_000)
  assert.equal(first.endingTotalCentavos, 15_000)

  const last = { ...payment, id: 'last', amountCentavos: 3_000 }
  const settled = updateObligationPayment(partial, last, today)
  assert.throws(() => updateObligationPayment(settled, { ...last, id: 'duplicate' }, today))
  const [final] = calculateForecast({
    ...base, transactions: [payment, last], expectedIncomes: [], debts: [], obligations: [settled],
  }, ['expected'])
  assert.equal(final.events.length, 0)
  assert.equal(final.startingTotalCentavos, final.endingTotalCentavos)
  assert.equal(final.endingTotalCentavos, 15_000)

  const debtPayment: LedgerTransaction = {
    ...payment, id: 'debt-payment', obligationId: undefined, obligationDueOn: undefined,
    debtSettlementId: payable.id, debtSettlementDueOn: payable.dueOn,
    debtSettlementExcludedFromTotals: false,
  }
  const partialDebt = updateDebtSettlement(payable, debtPayment, today)
  assert.equal(partialDebt.settlements[0].dueOn, payable.dueOn)
})

test('all-date obligations include remaining principal and finite future installments exactly once', () => {
  const payable = makeSchedule('payable', { ...input, id: 'payable', amountCentavos: 15_000,
    recurrence: 'monthly', installmentAmountCentavos: 5_000, dueOn: '2026-12-15' })
  const bill = makeSchedule('bill', { ...input, id: 'bill', dueOn: '2026-11-20', recurrence: 'monthly' })
  const receivable = makeSchedule('receivable', { ...input, id: 'incoming' })
  assert.ok(payable.kind === 'debt' && bill.kind === 'obligation' && receivable.kind === 'debt')
  const partial = { ...bill, installmentCount: 3, payments: [
    { transactionId: 'part', dueOn: bill.dueOn, amountCentavos: 1_000 },
  ] }
  assert.equal(outstandingObligations([payable, receivable, { ...payable, archived: true }],
    [partial], today), 29_000)
  assert.equal(outstandingObligations([], [{ ...partial, installmentCount: undefined }], today), 4_000)
  const [projection] = calculateForecast({
    ...base, expectedIncomes: [], debts: [payable], obligations: [partial],
  }, ['expected'])
  assert.equal(projection.startingTotalCentavos, 20_000)
  assert.equal(projection.endingTotalCentavos, 16_000)
})

test('adjustment uses the signed difference and avoids rounding or overflow', () => {
  assert.equal(balanceAdjustment(100_000, 85_000), -15_000)
  assert.equal(balanceAdjustment(-50, 0), 50)
  assert.throws(() => balanceAdjustment(-1, Number.MAX_SAFE_INTEGER))
})

test('forecast settings round-trip and reject unknown filters or invalid dates', () => {
  const view = { scenario: 'optimistic', startOn: '2026-11-26', endOn: '2026-12-15', walletId: 'cash', budgetId: 'budget' }
  assert.deepEqual(readForecastPreferences(JSON.stringify(view)), view)
  assert.deepEqual(readForecastPreferences('{"scenario":"random","startOn":"invalid","walletId":4}'), {
    scenario: 'expected', startOn: undefined, endOn: undefined, walletId: undefined, budgetId: undefined,
  })
})

test('undated debts can be settled without appearing in a dated forecast', () => {
  const payable = makeSchedule('payable', { ...input, dueOn: '' })
  const receivable = makeSchedule('receivable', { ...input, id: 'undated-in', dueOn: '' })
  assert.ok(payable.kind === 'debt' && receivable.kind === 'debt')
  assert.equal(payable.dueOn, undefined)
  const progress = getDebtProgress(payable, today)
  assert.equal(progress.status, 'undated')
  assert.equal(outstandingObligations([payable, receivable], [], today), 5_000)
  const [result] = calculateForecast({
    ...base, expectedIncomes: [], debts: [payable, receivable], obligations: [],
  }, ['expected'])
  assert.deepEqual(result.events, [])
  const payment: LedgerTransaction = {
    id: 'undated-pay', kind: 'expense', walletId: 'cash', occurredOn: today, description: 'Paid',
    amountCentavos: 1_500, createdAt: timestamp, updatedAt: timestamp,
    debtSettlementId: payable.id, debtSettlementDueOn: progress.dueOn,
    debtSettlementExcludedFromTotals: false,
  }
  const partial = updateDebtSettlement(payable, payment, today)
  assert.equal(outstandingObligations([partial], [], today), 3_500)
  const final = updateDebtSettlement(partial, { ...payment, id: 'undated-final', amountCentavos: 3_500 }, today)
  assert.equal(getDebtProgress(final, today).status, 'settled')
  assert.throws(() => makeSchedule('payable', { ...input, dueOn: '', recurrence: 'monthly' }), /due date/)
})
