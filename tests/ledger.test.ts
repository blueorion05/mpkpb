import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateLedgerTotals,
  calculateWalletBalances,
  filterAndSortTransactions,
  isLedgerTransaction,
  type LedgerTransaction,
} from '../src/domain/ledger.ts'

const walletA = { id: 'wallet-a', openingBalanceCentavos: 100_000 }
const walletB = { id: 'wallet-b', openingBalanceCentavos: 25_000 }

function transaction(
  id: string,
  kind: LedgerTransaction['kind'],
  amountCentavos: number,
  walletId = walletA.id,
  extra: Partial<LedgerTransaction> = {},
): LedgerTransaction {
  return {
    id,
    kind,
    occurredOn: '2026-03-01',
    description: id,
    amountCentavos,
    walletId,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...extra,
  }
}

test('derives wallet balances from income, expense, transfer fees, and adjustments', () => {
  const transactions = [
    transaction('income', 'income', 50_000),
    transaction('expense', 'expense', 12_500),
    transaction('transfer', 'transfer', 20_000, walletA.id, {
      toWalletId: walletB.id,
      feeCentavos: 250,
    }),
    transaction('count-cash', 'adjustment', -100),
  ]

  const balances = calculateWalletBalances([walletA, walletB], transactions)
  assert.equal(balances.get(walletA.id), 117_150)
  assert.equal(balances.get(walletB.id), 45_000)
})

test('keeps transfers neutral and counts only their fees as expenses', () => {
  const totals = calculateLedgerTotals([
    transaction('salary', 'income', 80_000),
    transaction('groceries', 'expense', 15_000),
    transaction('transfer', 'transfer', 20_000, walletA.id, {
      toWalletId: walletB.id,
      feeCentavos: 300,
    }),
    transaction('adjustment', 'adjustment', 500),
  ])
  assert.deepEqual(totals, {
    incomeCentavos: 80_000,
    expenseCentavos: 15_000,
    transferFeeCentavos: 300,
    totalExpenseCentavos: 15_300,
    adjustmentCentavos: 500,
    netChangeCentavos: 65_200,
  })
})

test('rejects invalid same-wallet transfers, dates, zero amounts, and unsafe transfer totals', () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const futureDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  assert.equal(
    isLedgerTransaction(transaction('same', 'transfer', 100, walletA.id, { toWalletId: walletA.id })),
    false,
  )
  assert.equal(isLedgerTransaction(transaction('zero', 'expense', 0)), false)
  assert.equal(
    isLedgerTransaction(transaction('date', 'income', 100, walletA.id, { occurredOn: '2026-02-30' })),
    false,
  )
  assert.equal(isLedgerTransaction(transaction('future', 'income', 100, walletA.id, { occurredOn: futureDate })), false)
  assert.equal(
    isLedgerTransaction(
      transaction('overflow', 'transfer', Number.MAX_SAFE_INTEGER, walletA.id, {
        toWalletId: walletB.id,
        feeCentavos: 1,
      }),
    ),
    false,
  )
  assert.equal(
    isLedgerTransaction(
      { ...transaction('null-fee', 'transfer', 100, walletA.id, { toWalletId: walletB.id }), feeCentavos: null },
    ),
    false,
  )
})

test('rejects missing wallets and arithmetic overflow rather than fabricating balances', () => {
  assert.throws(
    () => calculateWalletBalances([walletA], [transaction('missing', 'expense', 100, 'not-a-wallet')]),
    /missing wallet/,
  )
  assert.throws(
    () => calculateWalletBalances(
      [{ id: 'large', openingBalanceCentavos: Number.MAX_SAFE_INTEGER }],
      [transaction('overflow', 'income', 1, 'large')],
    ),
    RangeError,
  )
})

test('searches and filters by category, wallet, date, and transaction type with stable sorting', () => {
  const items = [
    transaction('late-expense', 'expense', 500, walletA.id, {
      occurredOn: '2026-03-03',
      categoryId: 'food',
    }),
    transaction('early-income', 'income', 1_000, walletB.id, {
      occurredOn: '2026-03-01',
      categoryId: 'salary',
    }),
  ]

  assert.deepEqual(
    filterAndSortTransactions(
      items,
      { query: 'groceries', kind: 'expense', walletId: walletA.id, fromDate: '2026-03-02' },
      [{ id: 'food', name: 'Groceries', kind: 'expense', normalizedName: 'groceries', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' }],
      [{ id: walletA.id, name: 'Cash' }],
    ).map((item) => item.id),
    ['late-expense'],
  )
  assert.deepEqual(
    filterAndSortTransactions(items, { sort: 'oldest' }).map((item) => item.id),
    ['early-income', 'late-expense'],
  )
})
