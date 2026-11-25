import {
  isLedgerTransaction,
  isTransactionCategory,
  type LedgerTransaction,
  type TransactionCategory,
} from './ledger.ts'
import { sumCentavos } from './money.ts'
import { isDateOnly } from './recurrence.ts'

export interface AnalyticsCategoryTotal {
  id: string
  name: string
  kind: 'income' | 'expense'
  amountCentavos: number
}

export interface MonthlyFinancialTrend {
  month: string
  incomeCentavos: number
  expenseCentavos: number
}

export interface FinancialAnalytics {
  fromDate: string
  toDate: string
  incomeCentavos: number
  expenseCentavos: number
  netChangeCentavos: number
  incomeCategories: readonly AnalyticsCategoryTotal[]
  expenseCategories: readonly AnalyticsCategoryTotal[]
  monthlyTrends: readonly MonthlyFinancialTrend[]
}

interface CategoryAccumulator {
  id: string
  name: string
  kind: 'income' | 'expense'
  amounts: number[]
}

interface TrendAccumulator {
  income: number[]
  expense: number[]
}

const MAX_ANALYTICS_MONTHS = 360

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function calculateFinancialAnalytics(
  transactions: readonly LedgerTransaction[],
  categories: readonly TransactionCategory[],
  fromDate: string,
  toDate: string,
): FinancialAnalytics {
  if (
    !isDateOnly(fromDate) ||
    !isDateOnly(toDate) ||
    fromDate > toDate ||
    toDate > localDateInput() ||
    !transactions.every(isLedgerTransaction) ||
    !categories.every(isTransactionCategory)
  ) {
    throw new TypeError('The analytics data or date range is invalid.')
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  if (categoriesById.size !== categories.length) {
    throw new TypeError('Analytics categories must have unique identifiers.')
  }
  const categoryTotals = new Map<string, CategoryAccumulator>()
  const monthlyTotals = new Map<string, TrendAccumulator>()
  for (const month of monthsBetween(fromDate, toDate)) {
    monthlyTotals.set(month, { income: [], expense: [] })
  }
  const incomes: number[] = []
  const expenses: number[] = []

  function record(
    kind: 'income' | 'expense',
    categoryId: string | undefined,
    amountCentavos: number,
    occurredOn: string,
    customLabel?: string,
  ): void {
    if (amountCentavos <= 0) return
    const category = categoryId ? categoriesById.get(categoryId) : undefined
    if (categoryId && (!category || category.kind !== kind)) {
      throw new TypeError('A transaction references a missing or mismatched analytics category.')
    }
    const key = customLabel
      ? `custom:${customLabel}`
      : categoryId
        ? `category:${categoryId}`
        : `${kind}:uncategorized`
    const name = customLabel ?? category?.name ?? 'Uncategorized'
    let total = categoryTotals.get(key)
    if (!total) {
      total = { id: key, name, kind, amounts: [] }
      categoryTotals.set(key, total)
    }
    total.amounts.push(amountCentavos)
    const month = occurredOn.slice(0, 7)
    const trend = monthlyTotals.get(month)
    if (!trend) throw new Error('A transaction month is missing from the analytics date range.')
    trend[kind].push(amountCentavos)
    if (kind === 'income') incomes.push(amountCentavos)
    else expenses.push(amountCentavos)
  }

  for (const transaction of transactions) {
    if (transaction.occurredOn < fromDate || transaction.occurredOn > toDate) continue
    if (transaction.kind === 'income' && !transaction.debtSettlementExcludedFromTotals) {
      record('income', transaction.categoryId, transaction.amountCentavos, transaction.occurredOn)
    } else if (transaction.kind === 'expense' && !transaction.debtSettlementExcludedFromTotals) {
      record('expense', transaction.categoryId, transaction.amountCentavos, transaction.occurredOn)
    } else if (transaction.kind === 'transfer' && (transaction.feeCentavos ?? 0) > 0) {
      record('expense', undefined, transaction.feeCentavos ?? 0, transaction.occurredOn, 'Transfer fees')
    }
  }

  const categoryResults = [...categoryTotals.values()].map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    amountCentavos: sumCentavos(category.amounts),
  }))
  const incomeCentavos = sumCentavos(incomes)
  const expenseCentavos = sumCentavos(expenses)
  return {
    fromDate,
    toDate,
    incomeCentavos,
    expenseCentavos,
    netChangeCentavos: sumCentavos([incomeCentavos, -expenseCentavos]),
    incomeCategories: categoryResults
      .filter((category) => category.kind === 'income')
      .sort((left, right) => right.amountCentavos - left.amountCentavos),
    expenseCategories: categoryResults
      .filter((category) => category.kind === 'expense')
      .sort((left, right) => right.amountCentavos - left.amountCentavos),
    monthlyTrends: [...monthlyTotals.entries()].map(([month, amounts]) => ({
      month,
      incomeCentavos: sumCentavos(amounts.income),
      expenseCentavos: sumCentavos(amounts.expense),
    })),
  }
}

function monthsBetween(fromDate: string, toDate: string): string[] {
  const result: string[] = []
  const first = fromDate.slice(0, 7)
  const last = toDate.slice(0, 7)
  let date = new Date(`${first}-01T00:00:00.000Z`)
  while (date.toISOString().slice(0, 7) <= last) {
    result.push(date.toISOString().slice(0, 7))
    if (result.length > MAX_ANALYTICS_MONTHS) {
      throw new RangeError('Choose an analytics period of 30 years or less.')
    }
    date.setUTCMonth(date.getUTCMonth() + 1)
  }
  return result
}
