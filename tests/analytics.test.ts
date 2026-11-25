import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateFinancialAnalytics } from '../src/domain/analytics.ts'
import type { LedgerTransaction, TransactionCategory } from '../src/domain/ledger.ts'
import { normalizeCategoryName } from '../src/domain/ledger.ts'

const todayDate = new Date()
const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`
const timestamp = new Date().toISOString()

function category(id: string, name: string, kind: TransactionCategory['kind']): TransactionCategory {
  return { id, name, kind, normalizedName: normalizeCategoryName(name), createdAt: timestamp, updatedAt: timestamp }
}

function transaction(overrides: Partial<LedgerTransaction>): LedgerTransaction {
  return {
    id: crypto.randomUUID(),
    kind: 'expense',
    occurredOn: today,
    description: 'Test transaction',
    amountCentavos: 100,
    walletId: 'wallet-1',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

test('aggregates actual income, categorized expenses, and transfer fees by date without double-counting linked settlements', () => {
  const categories = [
    category('salary', 'Salary', 'income'),
    category('groceries', 'Groceries', 'expense'),
  ]
  const transactions = [
    transaction({ kind: 'income', amountCentavos: 12_500, categoryId: 'salary' }),
    transaction({ id: 'groceries', amountCentavos: 2_500, categoryId: 'groceries' }),
    transaction({ id: 'uncategorized', amountCentavos: 500 }),
    transaction({ id: 'linked-debt-payment', amountCentavos: 900, debtSettlementId: 'debt-1', debtSettlementDueOn: today, debtSettlementExcludedFromTotals: true }),
    transaction({ id: 'transfer', kind: 'transfer', amountCentavos: 5_000, toWalletId: 'wallet-2', feeCentavos: 35 }),
    transaction({ id: 'adjustment', kind: 'adjustment', amountCentavos: 500 }),
  ]

  const result = calculateFinancialAnalytics(transactions, categories, today.slice(0, 7) + '-01', today)
  const currentMonth = result.monthlyTrends.find((trend) => trend.month === today.slice(0, 7))

  assert.equal(result.incomeCentavos, 12_500)
  assert.equal(result.expenseCentavos, 3_035)
  assert.equal(result.netChangeCentavos, 9_465)
  assert.deepEqual(result.expenseCategories.map(({ name, amountCentavos }) => [name, amountCentavos]), [
    ['Groceries', 2_500],
    ['Uncategorized', 500],
    ['Transfer fees', 35],
  ])
  assert.equal(currentMonth?.incomeCentavos, 12_500)
  assert.equal(currentMonth?.expenseCentavos, 3_035)
})

test('rejects future analytics dates and missing transaction categories', () => {
  const future = new Date()
  future.setDate(future.getDate() + 1)
  const futureDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`

  assert.throws(() => calculateFinancialAnalytics([], [], today, futureDate), /invalid/)
  assert.throws(
    () => calculateFinancialAnalytics(
      [transaction({ categoryId: 'missing' })],
      [],
      today,
      today,
    ),
    /missing or mismatched/,
  )
})
