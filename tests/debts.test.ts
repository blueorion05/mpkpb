import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDebtProgress,
  getObligationProgress,
  isDebtRecord,
  isFinancialObligation,
  removeDebtSettlement,
  removeObligationPayment,
  updateDebtSettlement,
  updateObligationPayment,
  type DebtRecord,
  type FinancialObligation,
} from '../src/domain/debts.ts'
import type { LedgerTransaction } from '../src/domain/ledger.ts'
import { calculateLedgerTotals, calculateWalletBalances } from '../src/domain/ledger.ts'
import { calculateBudgetProgress, type BudgetPlan } from '../src/domain/planning.ts'

function settlement(
  amountCentavos: number,
  id: string,
  dueOn: string,
  direction: 'payable' | 'receivable' = 'payable',
  excluded = false,
): LedgerTransaction {
  return {
    id,
    kind: direction === 'payable' ? 'expense' : 'income',
    occurredOn: '2025-01-31',
    description: 'Debt settlement',
    amountCentavos,
    walletId: 'wallet-1',
    debtSettlementId: 'debt-1',
    debtSettlementDueOn: dueOn,
    debtSettlementExcludedFromTotals: excluded,
    createdAt: '2025-01-31T12:00:00.000Z',
    updatedAt: '2025-01-31T12:00:00.000Z',
  }
}

function debt(overrides: Partial<DebtRecord> = {}): DebtRecord {
  return {
    id: 'debt-1',
    kind: 'debt',
    name: 'Laptop financing',
    direction: 'payable',
    amountCentavos: 10_000,
    walletId: 'wallet-1',
    dueOn: '2025-01-31',
    recurrence: 'monthly',
    monthlyAnchorDay: 31,
    installmentAmountCentavos: 3_400,
    installmentCount: 3,
    settlements: [],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function obligation(overrides: Partial<FinancialObligation> = {}): FinancialObligation {
  return {
    id: 'bill-1',
    kind: 'obligation',
    description: 'Electricity',
    amountCentavos: 5_000,
    walletId: 'wallet-1',
    categoryId: 'utilities',
    dueOn: '2025-01-31',
    recurrence: 'monthly',
    monthlyAnchorDay: 31,
    payments: [],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test('debt installments preserve centavos, allow partial settlement, and advance monthly dates', () => {
  const firstPayment = updateDebtSettlement(debt(), settlement(3_400, 'pay-1', '2025-01-31'), '2025-01-31')
  assert.equal(isDebtRecord(firstPayment), true)
  assert.deepEqual(getDebtProgress(firstPayment, '2025-01-31'), {
    dueOn: '2025-02-28',
    expectedCentavos: 3_400,
    settledThisOccurrenceCentavos: 0,
    remainingThisOccurrenceCentavos: 3_400,
    remainingTotalCentavos: 6_600,
    installmentsCompleted: 1,
    status: 'upcoming',
  })

  const partialSecondPayment = updateDebtSettlement(
    firstPayment,
    settlement(2_000, 'pay-2', '2025-02-28'),
    '2025-02-28',
  )
  const progress = getDebtProgress(partialSecondPayment, '2025-03-01')
  assert.equal(progress.dueOn, '2025-02-28')
  assert.equal(progress.remainingThisOccurrenceCentavos, 1_400)
  assert.equal(progress.remainingTotalCentavos, 4_600)
  assert.equal(progress.status, 'overdue')
})

test('debt schedules settle the exact final remainder and finite bills complete on their final payment', () => {
  const first = updateDebtSettlement(debt(), settlement(3_400, 'installment-1', '2025-01-31'), '2025-01-31')
  const second = updateDebtSettlement(first, settlement(3_400, 'installment-2', '2025-02-28'), '2025-02-28')
  const final = updateDebtSettlement(second, settlement(3_200, 'installment-3', '2025-03-31'), '2025-03-31')
  assert.deepEqual(getDebtProgress(final, '2025-03-31'), {
    dueOn: '2025-03-31',
    expectedCentavos: 3_200,
    settledThisOccurrenceCentavos: 3_200,
    remainingThisOccurrenceCentavos: 0,
    remainingTotalCentavos: 0,
    installmentsCompleted: 3,
    status: 'settled',
  })

  const finiteBill = obligation({
    amountCentavos: 2_500,
    installmentCount: 2,
    payments: [
      { transactionId: 'bill-one', dueOn: '2025-01-31', amountCentavos: 2_500 },
      { transactionId: 'bill-two', dueOn: '2025-02-28', amountCentavos: 2_500 },
    ],
  })
  assert.equal(getObligationProgress(finiteBill, '2025-03-01').status, 'paid')
  assert.equal(getObligationProgress(finiteBill, '2025-03-01').installmentsCompleted, 2)
})

test('a linked original transaction marks debt repayments as balance changes, not duplicate expenses', () => {
  const originalExpense: LedgerTransaction = {
    id: 'purchase',
    kind: 'expense',
    occurredOn: '2025-01-01',
    description: 'Laptop',
    amountCentavos: 10_000,
    walletId: 'wallet-1',
    categoryId: 'laptop',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
  const repayment = settlement(3_400, 'pay-1', '2025-01-31', 'payable', true)
  const transactions = [originalExpense, repayment]
  assert.equal(calculateLedgerTotals(transactions).expenseCentavos, 10_000)
  assert.equal(calculateWalletBalances(
    [{ id: 'wallet-1', openingBalanceCentavos: 50_000 }],
    transactions,
  ).get('wallet-1'), 36_600)

  const budget: BudgetPlan = {
    id: 'budget-1',
    name: 'January',
    startOn: '2025-01-01',
    endOn: '2025-01-31',
    categoryLimits: [{ categoryId: 'laptop', limitCentavos: 12_000 }],
    archived: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
  const category: TransactionCategory = {
    id: 'laptop',
    name: 'Electronics',
    kind: 'expense',
    normalizedName: 'electronics',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
  assert.equal(calculateBudgetProgress(budget, [category], transactions, '2025-01-31').totalSpentCentavos, 10_000)
})

test('recurring obligation payments only become paid expenses and deleting one reopens the amount', () => {
  const schedule = obligation()
  const billPayment: LedgerTransaction = {
    id: 'bill-payment-1',
    kind: 'expense',
    occurredOn: '2025-01-31',
    description: 'Electricity',
    amountCentavos: 2_000,
    walletId: 'wallet-1',
    categoryId: 'utilities',
    obligationId: 'bill-1',
    obligationDueOn: '2025-01-31',
    createdAt: '2025-01-31T12:00:00.000Z',
    updatedAt: '2025-01-31T12:00:00.000Z',
  }
  const partial = updateObligationPayment(schedule, billPayment, '2025-01-31')
  assert.equal(isFinancialObligation(partial), true)
  assert.deepEqual(getObligationProgress(partial, '2025-01-31'), {
    dueOn: '2025-01-31',
    paidThisOccurrenceCentavos: 2_000,
    remainingThisOccurrenceCentavos: 3_000,
    installmentsCompleted: 0,
    status: 'due',
  })
  assert.equal(getObligationProgress(partial, '2025-02-01').status, 'overdue')
  const reopened = removeObligationPayment(partial, billPayment.id, '2025-02-01T00:00:00.000Z')
  assert.equal(getObligationProgress(reopened, '2025-01-31').remainingThisOccurrenceCentavos, 5_000)
})

test('installment schedules reject counts that cannot settle the full principal', () => {
  assert.equal(isDebtRecord(debt({ installmentAmountCentavos: 2_000, installmentCount: 3 })), false)
  assert.throws(
    () => updateDebtSettlement(debt(), settlement(3_401, 'overpay', '2025-01-31'), '2025-01-31'),
    /exceed the remaining debt amount/,
  )
})

test('removing an earlier settlement cannot leave later installment history disconnected', () => {
  const scheduledDebt = debt({
    settlements: [
      { transactionId: 'paid-jan', dueOn: '2025-01-31', amountCentavos: 3_400 },
      { transactionId: 'paid-feb', dueOn: '2025-02-28', amountCentavos: 3_400 },
    ],
  })
  assert.throws(
    () => removeDebtSettlement(scheduledDebt, 'paid-jan', '2025-03-01T00:00:00.000Z'),
    /Remove later debt settlements first/,
  )

  const scheduledBill = obligation({
    payments: [
      { transactionId: 'bill-jan', dueOn: '2025-01-31', amountCentavos: 5_000 },
      { transactionId: 'bill-feb', dueOn: '2025-02-28', amountCentavos: 5_000 },
    ],
  })
  assert.throws(
    () => removeObligationPayment(scheduledBill, 'bill-jan', '2025-03-01T00:00:00.000Z'),
    /Remove later bill payments first/,
  )
})
