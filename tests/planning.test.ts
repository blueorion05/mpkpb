import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateBudgetProgress,
  getExpectedIncomeProgress,
  isBudgetPlan,
  isExpectedIncome,
  nextIncomeOccurrence,
  removeExpectedIncomeReceipt,
  updateExpectedIncomeReceipt,
  type BudgetPlan,
  type ExpectedIncome,
} from '../src/domain/planning.ts'
import type { LedgerTransaction, TransactionCategory } from '../src/domain/ledger.ts'

const today = new Date()
const todayOnly = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

function incomeSchedule(overrides: Partial<ExpectedIncome> = {}): ExpectedIncome {
  return {
    id: 'income-1',
    kind: 'expectedIncome',
    description: 'Monthly salary',
    amountCentavos: 100_000,
    walletId: 'wallet-1',
    categoryId: 'salary',
    dueOn: todayOnly,
    confidence: 'high',
    recurrence: 'monthly',
    monthlyAnchorDay: Number(todayOnly.slice(-2)),
    receipts: [],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function receipt(
  amountCentavos: number,
  id: string,
  dueOn = todayOnly,
): LedgerTransaction & { expectedIncomeId: string; expectedIncomeDueOn: string } {
  return {
    id,
    kind: 'income',
    occurredOn: todayOnly,
    description: 'Salary received',
    amountCentavos,
    walletId: 'wallet-1',
    expectedIncomeId: 'income-1',
    expectedIncomeDueOn: dueOn,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

test('budget progress includes only matching categorized expenses inside the plan dates', () => {
  const plan: BudgetPlan = {
    id: 'monthly',
    name: 'Monthly essentials',
    startOn: '2025-01-01',
    endOn: '2025-01-31',
    categoryLimits: [
      { categoryId: 'food', limitCentavos: 10_000 },
      { categoryId: 'travel', limitCentavos: 5_000 },
    ],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
  const categories: TransactionCategory[] = ['food', 'travel'].map((id) => ({
    id,
    name: id,
    kind: 'expense',
    normalizedName: id,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }))
  const transactions: LedgerTransaction[] = [
    { id: 'food-1', kind: 'expense', occurredOn: '2025-01-05', description: 'Groceries', amountCentavos: 7_000, walletId: 'wallet-1', categoryId: 'food', createdAt: '2025-01-05T00:00:00.000Z', updatedAt: '2025-01-05T00:00:00.000Z' },
    { id: 'food-2', kind: 'expense', occurredOn: '2025-02-01', description: 'Outside plan', amountCentavos: 6_000, walletId: 'wallet-1', categoryId: 'food', createdAt: '2025-02-01T00:00:00.000Z', updatedAt: '2025-02-01T00:00:00.000Z' },
    { id: 'travel-1', kind: 'expense', occurredOn: '2025-01-10', description: 'Ride', amountCentavos: 6_000, walletId: 'wallet-1', categoryId: 'travel', createdAt: '2025-01-10T00:00:00.000Z', updatedAt: '2025-01-10T00:00:00.000Z' },
  ]

  const progress = calculateBudgetProgress(plan, categories, transactions, '2025-01-15')
  assert.equal(progress.status, 'active')
  assert.equal(progress.totalLimitCentavos, 15_000)
  assert.equal(progress.totalSpentCentavos, 13_000)
  assert.equal(progress.totalRemainingCentavos, 2_000)
  assert.equal(progress.categories[0].remainingCentavos, 3_000)
  assert.equal(progress.categories[1].utilizationPercent, 120)
  assert.equal(isBudgetPlan(plan), true)
})

test('monthly recurring expected income preserves its anchor day across short months', () => {
  const schedule = incomeSchedule({ dueOn: '2025-01-31', monthlyAnchorDay: 31 })
  assert.equal(nextIncomeOccurrence(schedule, '2025-01-31'), '2025-02-28')
  assert.equal(nextIncomeOccurrence(schedule, '2025-02-28'), '2025-03-31')
})

test('partial and full receipts update the occurrence without changing current balances until posted', () => {
  const expected = incomeSchedule()
  const partial = updateExpectedIncomeReceipt(expected, receipt(40_000, 'receipt-1'), todayOnly)
  assert.equal(isExpectedIncome(partial), true)
  assert.deepEqual(getExpectedIncomeProgress(partial, todayOnly), {
    dueOn: todayOnly,
    receivedCentavos: 40_000,
    remainingCentavos: 60_000,
    status: 'due',
  })
  assert.throws(
    () => updateExpectedIncomeReceipt(partial, receipt(60_001, 'receipt-too-large'), todayOnly),
    /exceed the expected amount/,
  )

  const full = updateExpectedIncomeReceipt(partial, receipt(60_000, 'receipt-2'), todayOnly)
  const nextDueOn = nextIncomeOccurrence(expected, todayOnly)
  assert.deepEqual(getExpectedIncomeProgress(full, todayOnly), {
    dueOn: nextDueOn,
    receivedCentavos: 0,
    remainingCentavos: 100_000,
    status: nextDueOn > todayOnly ? 'upcoming' : 'due',
  })

  const reopened = removeExpectedIncomeReceipt(full, 'receipt-2', '2025-01-02T00:00:00.000Z')
  assert.deepEqual(getExpectedIncomeProgress(reopened, todayOnly), {
    dueOn: todayOnly,
    receivedCentavos: 40_000,
    remainingCentavos: 60_000,
    status: 'due',
  })
})
