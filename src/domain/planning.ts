import { isLedgerTransaction, isValidNotes, type LedgerTransaction, type TransactionCategory } from './ledger.ts'
import { sumCentavos } from './money.ts'
import {
  isDateOnly,
  isRecurrenceFrequency,
  nextRecurringDate,
  type RecurrenceFrequency,
} from './recurrence.ts'

export type IncomeConfidence = 'low' | 'medium' | 'high'
export type IncomeRecurrence = RecurrenceFrequency

export interface BudgetCategoryLimit {
  categoryId: string
  limitCentavos: number
}

export interface BudgetPlan {
  id: string
  name: string
  startOn: string
  endOn: string
  categoryLimits: BudgetCategoryLimit[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface IncomeReceipt {
  transactionId: string
  dueOn: string
  amountCentavos: number
}

export interface ExpectedIncome {
  notes?: string
  id: string
  kind: 'expectedIncome'
  description: string
  amountCentavos: number
  walletId: string
  categoryId?: string
  dueOn: string
  confidence: IncomeConfidence
  recurrence: IncomeRecurrence
  monthlyAnchorDay: number
  receipts: IncomeReceipt[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface BudgetCategoryProgress {
  categoryId: string
  limitCentavos: number
  spentCentavos: number
  remainingCentavos: number
  utilizationPercent: number
}

export interface BudgetProgress {
  status: 'upcoming' | 'active' | 'ended'
  categories: BudgetCategoryProgress[]
  totalLimitCentavos: number
  totalSpentCentavos: number
  totalRemainingCentavos: number
}

export interface ExpectedIncomeProgress {
  dueOn: string
  receivedCentavos: number
  remainingCentavos: number
  status: 'upcoming' | 'due' | 'overdue' | 'received'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isPositiveSafeAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isIncomeConfidence(value: unknown): value is IncomeConfidence {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isIncomeRecurrence(value: unknown): value is IncomeRecurrence {
  return isRecurrenceFrequency(value)
}

export function isBudgetPlan(value: unknown): value is BudgetPlan {
  if (typeof value !== 'object' || value === null) return false
  const plan = value as Partial<BudgetPlan>
  if (
    typeof plan.id !== 'string' ||
    !plan.id ||
    typeof plan.name !== 'string' ||
    plan.name.trim().length === 0 ||
    plan.name.length > 50 ||
    !isDateOnly(plan.startOn) ||
    !isDateOnly(plan.endOn) ||
    plan.startOn > plan.endOn ||
    !Array.isArray(plan.categoryLimits) ||
    plan.categoryLimits.length === 0 ||
    plan.categoryLimits.length > 100 ||
    typeof plan.archived !== 'boolean' ||
    !isTimestamp(plan.createdAt) ||
    !isTimestamp(plan.updatedAt)
  ) {
    return false
  }

  const categories = new Set<string>()
  for (const limit of plan.categoryLimits) {
    if (
      typeof limit !== 'object' ||
      limit === null ||
      typeof limit.categoryId !== 'string' ||
      !limit.categoryId ||
      !isPositiveSafeAmount(limit.limitCentavos) ||
      categories.has(limit.categoryId)
    ) {
      return false
    }
    categories.add(limit.categoryId)
  }
  return true
}

export function isExpectedIncome(value: unknown): value is ExpectedIncome {
  if (typeof value !== 'object' || value === null) return false
  const expected = value as Partial<ExpectedIncome>
  if (!isValidNotes(expected.notes)) return false
  const amountCentavos = expected.amountCentavos
  const monthlyAnchorDay = expected.monthlyAnchorDay
  if (
    typeof expected.id !== 'string' ||
    !expected.id ||
    expected.kind !== 'expectedIncome' ||
    typeof expected.description !== 'string' ||
    expected.description.trim().length === 0 ||
    expected.description.length > 120 ||
    !isPositiveSafeAmount(amountCentavos) ||
    typeof expected.walletId !== 'string' ||
    !expected.walletId ||
    (expected.categoryId !== undefined &&
      (typeof expected.categoryId !== 'string' || !expected.categoryId)) ||
    !isDateOnly(expected.dueOn) ||
    !isIncomeConfidence(expected.confidence) ||
    !isIncomeRecurrence(expected.recurrence) ||
    typeof monthlyAnchorDay !== 'number' ||
    !Number.isInteger(monthlyAnchorDay) ||
    monthlyAnchorDay < 1 ||
    monthlyAnchorDay > 31 ||
    !Array.isArray(expected.receipts) ||
    typeof expected.archived !== 'boolean' ||
    !isTimestamp(expected.createdAt) ||
    !isTimestamp(expected.updatedAt)
  ) {
    return false
  }

  const transactionIds = new Set<string>()
  const receivedByDueDate = new Map<string, number[]>()
  for (const receipt of expected.receipts) {
    if (
      typeof receipt !== 'object' ||
      receipt === null ||
      typeof receipt.transactionId !== 'string' ||
      !receipt.transactionId ||
      !isDateOnly(receipt.dueOn) ||
      receipt.dueOn < expected.dueOn! ||
      !isPositiveSafeAmount(receipt.amountCentavos) ||
      transactionIds.has(receipt.transactionId)
    ) {
      return false
    }
    transactionIds.add(receipt.transactionId)
    const amounts = receivedByDueDate.get(receipt.dueOn) ?? []
    amounts.push(receipt.amountCentavos)
    receivedByDueDate.set(receipt.dueOn, amounts)
  }

  for (const amounts of receivedByDueDate.values()) {
    let total = 0
    for (const amount of amounts) {
      total += amount
      if (!Number.isSafeInteger(total) || total > amountCentavos) return false
    }
  }
  return true
}

export function normalizePlanName(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en')
}

export function nextIncomeOccurrence(expected: ExpectedIncome, dueOn: string): string {
  return nextRecurringDate(dueOn, expected.recurrence, expected.monthlyAnchorDay)
}

function receiptsForDate(expected: ExpectedIncome, dueOn: string): IncomeReceipt[] {
  return expected.receipts.filter((receipt) => receipt.dueOn === dueOn)
}

export function getExpectedIncomeProgress(
  expected: ExpectedIncome,
  today: string,
): ExpectedIncomeProgress {
  if (!isExpectedIncome(expected) || !isDateOnly(today)) {
    throw new TypeError('Expected income data or the current date is invalid.')
  }

  let dueOn = expected.dueOn
  let receipts = receiptsForDate(expected, dueOn)
  let receivedCentavos = sumCentavos(receipts.map((receipt) => receipt.amountCentavos))
  if (expected.recurrence !== 'none') {
    let advanced = 0
    while (receivedCentavos === expected.amountCentavos && advanced < expected.receipts.length) {
      dueOn = nextIncomeOccurrence(expected, dueOn)
      receipts = receiptsForDate(expected, dueOn)
      receivedCentavos = sumCentavos(receipts.map((receipt) => receipt.amountCentavos))
      advanced += 1
    }
  }

  const remainingCentavos = expected.amountCentavos - receivedCentavos
  const status = remainingCentavos === 0
    ? 'received'
    : dueOn > today
      ? 'upcoming'
      : dueOn < today
        ? 'overdue'
        : 'due'
  return { dueOn, receivedCentavos, remainingCentavos, status }
}

export function updateExpectedIncomeReceipt(
  expected: ExpectedIncome,
  transaction: LedgerTransaction,
): ExpectedIncome {
  if (
    !isExpectedIncome(expected) ||
    !isExpectedIncomeReceipt(transaction) ||
    transaction.expectedIncomeId !== expected.id ||
    !isLedgerTransaction(transaction)
  ) {
    throw new TypeError('The expected income receipt is invalid.')
  }
  const existing = expected.receipts.find((receipt) => receipt.transactionId === transaction.id)
  const dueOn = existing?.dueOn ?? transaction.expectedIncomeDueOn
  if (dueOn !== transaction.expectedIncomeDueOn) {
    throw new Error('A saved receipt cannot be moved to a different expected-income occurrence.')
  }
  if (!existing && (expected.archived || getExpectedIncomeProgress(expected, todayDateOnly()).dueOn !== dueOn)) {
    throw new Error('Only the current, active expected-income occurrence can receive a new payment.')
  }

  const otherReceipts = expected.receipts.filter((receipt) => receipt.transactionId !== transaction.id)
  const alreadyReceived = sumCentavos(otherReceipts
    .filter((receipt) => receipt.dueOn === dueOn)
    .map((receipt) => receipt.amountCentavos))
  if (transaction.amountCentavos > expected.amountCentavos - alreadyReceived) {
    throw new Error('This receipt would exceed the expected amount for that occurrence.')
  }

  const receipt: IncomeReceipt = {
    transactionId: transaction.id,
    dueOn,
    amountCentavos: transaction.amountCentavos,
  }
  const updated = {
    ...expected,
    receipts: [...otherReceipts, receipt],
    updatedAt: transaction.updatedAt,
  }
  if (!isExpectedIncome(updated)) {
    throw new Error('This change would make the expected-income receipt history inconsistent.')
  }
  return updated
}

export function removeExpectedIncomeReceipt(
  expected: ExpectedIncome,
  transactionId: string,
  updatedAt: string,
): ExpectedIncome {
  if (!isExpectedIncome(expected) || !transactionId || !isTimestamp(updatedAt)) {
    throw new TypeError('The expected income receipt could not be verified.')
  }
  const updated = {
    ...expected,
    receipts: expected.receipts.filter((receipt) => receipt.transactionId !== transactionId),
    updatedAt,
  }
  if (!isExpectedIncome(updated)) {
    throw new Error('Remove later receipts first to preserve the expected-income history.')
  }
  return updated
}

export function calculateBudgetProgress(
  plan: BudgetPlan,
  categories: readonly TransactionCategory[],
  transactions: readonly LedgerTransaction[],
  today: string,
): BudgetProgress {
  if (!isBudgetPlan(plan) || !isDateOnly(today)) {
    throw new TypeError('Budget plan or current date is invalid.')
  }
  if (!transactions.every(isLedgerTransaction)) {
    throw new TypeError('Ledger data is invalid; budget progress was not calculated.')
  }

  const expenseCategoryIds = new Set(
    categories.filter((category) => category.kind === 'expense').map((category) => category.id),
  )
  if (plan.categoryLimits.some((limit) => !expenseCategoryIds.has(limit.categoryId))) {
    throw new TypeError('A budget references a missing expense category.')
  }

  const categoryProgress = plan.categoryLimits.map((limit) => {
    const spentCentavos = sumCentavos(transactions
      .filter((entry) =>
        entry.kind === 'expense' &&
        !entry.debtSettlementExcludedFromTotals &&
        entry.categoryId === limit.categoryId &&
        entry.occurredOn >= plan.startOn &&
        entry.occurredOn <= plan.endOn,
      )
      .map((entry) => entry.amountCentavos))
    return {
      categoryId: limit.categoryId,
      limitCentavos: limit.limitCentavos,
      spentCentavos,
      remainingCentavos: limit.limitCentavos - spentCentavos,
      utilizationPercent: spentCentavos / limit.limitCentavos * 100,
    }
  })

  const totalLimitCentavos = sumCentavos(categoryProgress.map((item) => item.limitCentavos))
  const totalSpentCentavos = sumCentavos(categoryProgress.map((item) => item.spentCentavos))
  return {
    status: today < plan.startOn ? 'upcoming' : today > plan.endOn ? 'ended' : 'active',
    categories: categoryProgress,
    totalLimitCentavos,
    totalSpentCentavos,
    totalRemainingCentavos: totalLimitCentavos - totalSpentCentavos,
  }
}

function todayDateOnly(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isExpectedIncomeReceipt(
  transaction: LedgerTransaction,
): transaction is LedgerTransaction & { expectedIncomeId: string; expectedIncomeDueOn: string } {
  return typeof transaction.expectedIncomeId === 'string' &&
    transaction.expectedIncomeId.length > 0 &&
    isDateOnly(transaction.expectedIncomeDueOn)
}
