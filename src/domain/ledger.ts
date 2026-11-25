import { sumCentavos } from './money.ts'

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'adjustment'
export type CategoryKind = 'income' | 'expense'

export interface LedgerTransaction {
  id: string
  kind: TransactionKind
  occurredOn: string
  description: string
  amountCentavos: number
  walletId: string
  toWalletId?: string
  feeCentavos?: number
  categoryId?: string
  expectedIncomeId?: string
  expectedIncomeDueOn?: string
  createdAt: string
  updatedAt: string
}

export interface TransactionCategory {
  id: string
  name: string
  kind: CategoryKind
  normalizedName: string
  createdAt: string
  updatedAt: string
}

export interface LedgerWallet {
  id: string
  openingBalanceCentavos: number
}

export interface TransactionFilters {
  query?: string
  kind?: TransactionKind | 'all'
  walletId?: string
  categoryId?: string
  fromDate?: string
  toDate?: string
  sort?: 'newest' | 'oldest'
}

export function isTransactionKind(value: unknown): value is TransactionKind {
  return value === 'income' || value === 'expense' || value === 'transfer' || value === 'adjustment'
}

function isSafeAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function todayDateOnly(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= todayDateOnly()
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isExpectedIncomeLink(transaction: Partial<LedgerTransaction>): boolean {
  const hasId = transaction.expectedIncomeId !== undefined
  const hasDueOn = transaction.expectedIncomeDueOn !== undefined
  if (!hasId && !hasDueOn) return true
  return transaction.kind === 'income' &&
    typeof transaction.expectedIncomeId === 'string' &&
    transaction.expectedIncomeId.length > 0 &&
    typeof transaction.expectedIncomeDueOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(transaction.expectedIncomeDueOn) &&
    Number.isFinite(new Date(`${transaction.expectedIncomeDueOn}T00:00:00.000Z`).getTime()) &&
    new Date(`${transaction.expectedIncomeDueOn}T00:00:00.000Z`).toISOString().slice(0, 10) === transaction.expectedIncomeDueOn
}

export function isLedgerTransaction(value: unknown): value is LedgerTransaction {
  if (typeof value !== 'object' || value === null) return false
  const transaction = value as Partial<LedgerTransaction>
  if (
    typeof transaction.id !== 'string' ||
    !transaction.id ||
    !isDateOnly(transaction.occurredOn) ||
    typeof transaction.description !== 'string' ||
    transaction.description.trim().length === 0 ||
    transaction.description.length > 120 ||
    typeof transaction.walletId !== 'string' ||
    !transaction.walletId ||
    !isTimestamp(transaction.createdAt) ||
    !isTimestamp(transaction.updatedAt) ||
    !isSafeAmount(transaction.amountCentavos)
  ) {
    return false
  }
  if (!isExpectedIncomeLink(transaction)) return false

  if (transaction.kind === 'income' || transaction.kind === 'expense') {
    return (
      transaction.amountCentavos > 0 &&
      (transaction.categoryId === undefined ||
        (typeof transaction.categoryId === 'string' && transaction.categoryId.length > 0)) &&
      transaction.toWalletId === undefined &&
      transaction.feeCentavos === undefined
    )
  }

  if (transaction.kind === 'transfer') {
    const feeCentavos = transaction.feeCentavos === undefined ? 0 : transaction.feeCentavos
    return (
      transaction.amountCentavos > 0 &&
      typeof transaction.toWalletId === 'string' &&
      transaction.toWalletId.length > 0 &&
      transaction.toWalletId !== transaction.walletId &&
      (transaction.categoryId === undefined) &&
      isSafeAmount(feeCentavos) &&
      feeCentavos >= 0 &&
      Number.isSafeInteger(transaction.amountCentavos + feeCentavos)
    )
  }

  if (transaction.kind === 'adjustment') {
    return (
      transaction.amountCentavos !== 0 &&
      transaction.toWalletId === undefined &&
      transaction.feeCentavos === undefined &&
      transaction.categoryId === undefined
    )
  }

  return false
}

export function normalizeCategoryName(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en')
}

export function isTransactionCategory(value: unknown): value is TransactionCategory {
  if (typeof value !== 'object' || value === null) return false
  const category = value as Partial<TransactionCategory>
  return (
    typeof category.id === 'string' &&
    category.id.length > 0 &&
    typeof category.name === 'string' &&
    category.name.trim().length > 0 &&
    category.name.length <= 40 &&
    (category.kind === 'income' || category.kind === 'expense') &&
    typeof category.normalizedName === 'string' &&
    category.normalizedName === normalizeCategoryName(category.name) &&
    isTimestamp(category.createdAt) &&
    isTimestamp(category.updatedAt)
  )
}

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('The ledger exceeds the safe integer range for centavos.')
  }
  return result
}

export function transactionDeltas(transaction: LedgerTransaction): Map<string, number> {
  if (!isLedgerTransaction(transaction)) {
    throw new TypeError('The transaction is invalid; ledger balances were not calculated.')
  }
  switch (transaction.kind) {
    case 'income':
      return new Map([[transaction.walletId, transaction.amountCentavos]])
    case 'expense':
      return new Map([[transaction.walletId, -transaction.amountCentavos]])
    case 'adjustment':
      return new Map([[transaction.walletId, transaction.amountCentavos]])
    case 'transfer': {
      const feeCentavos = transaction.feeCentavos ?? 0
      const destinationWalletId = transaction.toWalletId
      if (!destinationWalletId) {
        throw new TypeError('A transfer destination is required to calculate wallet balances.')
      }
      return new Map([
        [transaction.walletId, -addSafe(transaction.amountCentavos, feeCentavos)],
        [destinationWalletId, transaction.amountCentavos],
      ])
    }
  }
}

export function calculateWalletBalances(
  wallets: readonly LedgerWallet[],
  transactions: readonly LedgerTransaction[],
): Map<string, number> {
  const balances = new Map<string, number>()
  for (const wallet of wallets) {
    if (
      !wallet.id ||
      !isSafeAmount(wallet.openingBalanceCentavos) ||
      balances.has(wallet.id)
    ) {
      throw new TypeError('Wallet data is invalid; ledger balances were not calculated.')
    }
    balances.set(wallet.id, wallet.openingBalanceCentavos)
  }

  for (const transaction of transactions) {
    for (const [walletId, delta] of transactionDeltas(transaction)) {
      const balance = balances.get(walletId)
      if (balance === undefined) {
        throw new TypeError('A transaction references a missing wallet; ledger balances were not calculated.')
      }
      balances.set(walletId, addSafe(balance, delta))
    }
  }
  return balances
}

export function calculateLedgerTotals(transactions: readonly LedgerTransaction[]) {
  const incomes: number[] = []
  const expenses: number[] = []
  const transferFees: number[] = []
  const adjustments: number[] = []

  for (const transaction of transactions) {
    if (!isLedgerTransaction(transaction)) {
      throw new TypeError('The transaction is invalid; ledger totals were not calculated.')
    }
    switch (transaction.kind) {
      case 'income':
        incomes.push(transaction.amountCentavos)
        break
      case 'expense':
        expenses.push(transaction.amountCentavos)
        break
      case 'transfer':
        transferFees.push(transaction.feeCentavos ?? 0)
        break
      case 'adjustment':
        adjustments.push(transaction.amountCentavos)
        break
    }
  }

  const incomeCentavos = sumCentavos(incomes)
  const expenseCentavos = sumCentavos(expenses)
  const transferFeeCentavos = sumCentavos(transferFees)
  const adjustmentCentavos = sumCentavos(adjustments)
  const totalExpenseCentavos = addSafe(expenseCentavos, transferFeeCentavos)
  const netChangeCentavos = sumCentavos([
    incomeCentavos,
    -totalExpenseCentavos,
    adjustmentCentavos,
  ])
  return {
    incomeCentavos,
    expenseCentavos,
    transferFeeCentavos,
    totalExpenseCentavos,
    adjustmentCentavos,
    netChangeCentavos,
  }
}

export function filterAndSortTransactions(
  transactions: readonly LedgerTransaction[],
  filters: TransactionFilters,
  categories: readonly TransactionCategory[] = [],
  wallets: readonly { id: string; name: string }[] = [],
): LedgerTransaction[] {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
  const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const query = filters.query?.trim().toLocaleLowerCase('en') ?? ''

  return transactions
    .filter((transaction) => {
      if (filters.kind && filters.kind !== 'all' && transaction.kind !== filters.kind) return false
      if (
        filters.walletId &&
        transaction.walletId !== filters.walletId &&
        transaction.toWalletId !== filters.walletId
      ) {
        return false
      }
      if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false
      if (filters.fromDate && transaction.occurredOn < filters.fromDate) return false
      if (filters.toDate && transaction.occurredOn > filters.toDate) return false
      if (!query) return true

      const searchable = [
        transaction.description,
        transaction.occurredOn,
        categoryNames.get(transaction.categoryId ?? ''),
        walletNames.get(transaction.walletId),
        walletNames.get(transaction.toWalletId ?? ''),
      ]
      return searchable.some((value) => value?.toLocaleLowerCase('en').includes(query))
    })
    .sort((left, right) => {
      const dateOrder = left.occurredOn.localeCompare(right.occurredOn)
      const timeOrder = left.createdAt.localeCompare(right.createdAt)
      const order = dateOrder || timeOrder || left.id.localeCompare(right.id)
      return filters.sort === 'oldest' ? order : -order
    })
}
