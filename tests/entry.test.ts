import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeSchedule, validateCompletedDate } from '../src/domain/entry.ts'
import { calculateForecast } from '../src/domain/forecast.ts'
import { calculateWalletBalances, type LedgerTransaction } from '../src/domain/ledger.ts'
import { updateObligationPayment, updateDebtSettlement } from '../src/domain/debts.ts'

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
