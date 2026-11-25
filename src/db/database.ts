import { isCategoryIcon, type CategoryIcon } from '../domain/categoryIcons.ts'
import { validateCompletedDate } from '../domain/entry.ts'
import {
  calculateWalletBalances,
  calculateLedgerTotals,
  isLedgerTransaction,
  isTransactionCategory,
  type LedgerTransaction,
  type TransactionCategory,
} from '../domain/ledger.ts'
import {
  isBudgetPlan,
  isExpectedIncome,
  isExpectedIncomeReceipt,
  removeExpectedIncomeReceipt,
  updateExpectedIncomeReceipt,
  type BudgetPlan,
  type ExpectedIncome,
} from '../domain/planning.ts'
import {
  isDebtRecord,
  isDebtSettlementTransaction,
  isFinancialObligation,
  isObligationPaymentTransaction,
  removeDebtSettlement,
  removeObligationPayment,
  updateDebtSettlement,
  updateObligationPayment,
  validateDebtReferences,
  type DebtRecord,
  type FinancialObligation,
} from '../domain/debts.ts'

export type WalletType =
  | 'Cash'
  | 'E-wallet'
  | 'Bank'
  | 'Savings'
  | 'Emergency fund'
  | 'Other'

export const WALLET_ICONS = ['wallet', 'cash', 'bank', 'savings', 'card', 'other'] as const
export type WalletIcon = (typeof WALLET_ICONS)[number]

export const WALLET_COLORS = ['green', 'blue', 'purple', 'orange', 'red', 'gray'] as const
export type WalletColor = (typeof WALLET_COLORS)[number]

export interface Wallet {
  id: string
  name: string
  type: WalletType
  icon: WalletIcon
  color: WalletColor
  openingBalanceCentavos: number
  protected: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

interface Preference {
  key: string
  value: string
}

const DATABASE_NAME = 'mpkpb'
const DATABASE_VERSION = 5
const STORE_NAMES = [
  'wallets',
  'transactions',
  'categories',
  'budgets',
  'debts',
  'scheduledEvents',
  'snapshots',
  'preferences',
] as const
const WALLET_TYPES: readonly WalletType[] = [
  'Cash',
  'E-wallet',
  'Bank',
  'Savings',
  'Emergency fund',
  'Other',
]

let databaseInstance: IDBDatabase | undefined
let databaseOpening: Promise<IDBDatabase> | undefined

export function isWalletType(value: unknown): value is WalletType {
  return typeof value === 'string' && WALLET_TYPES.some((type) => type === value)
}

export function isWalletIcon(value: unknown): value is WalletIcon {
  return typeof value === 'string' && WALLET_ICONS.some((icon) => icon === value)
}

export function isWalletColor(value: unknown): value is WalletColor {
  return typeof value === 'string' && WALLET_COLORS.some((color) => color === value)
}

export function defaultWalletIcon(type: WalletType): WalletIcon {
  switch (type) {
    case 'Cash':
      return 'cash'
    case 'Bank':
      return 'bank'
    case 'Savings':
    case 'Emergency fund':
      return 'savings'
    case 'E-wallet':
      return 'wallet'
    case 'Other':
      return 'other'
  }
}

export function defaultWalletColor(type: WalletType): WalletColor {
  switch (type) {
    case 'Cash':
    case 'Savings':
      return 'green'
    case 'E-wallet':
      return 'blue'
    case 'Bank':
      return 'purple'
    case 'Emergency fund':
      return 'orange'
    case 'Other':
      return 'gray'
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databaseInstance) return Promise.resolve(databaseInstance)
  if (databaseOpening) return databaseOpening

  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support local IndexedDB storage.'))
  }

  databaseOpening = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = (event) => {
      const database = request.result
      for (const storeName of STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, {
            keyPath: storeName === 'preferences' ? 'key' : 'id',
          })
        }
      }

      if (event.oldVersion < 2) {
        const walletStore = request.transaction?.objectStore('wallets')
        if (walletStore) {
          const cursorRequest = walletStore.openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return

            const storedWallet = cursor.value as Partial<Wallet>
            const walletType = isWalletType(storedWallet.type) ? storedWallet.type : 'Other'
            cursor.update({
              ...storedWallet,
              icon: isWalletIcon(storedWallet.icon)
                ? storedWallet.icon
                : defaultWalletIcon(walletType),
              color: isWalletColor(storedWallet.color)
                ? storedWallet.color
                : defaultWalletColor(walletType),
            })
            cursor.continue()
          }
        }
      }

      if (event.newVersion !== null && event.newVersion >= 3) {
        const transactions = request.transaction?.objectStore('transactions')
        if (transactions && !transactions.indexNames.contains('byDate')) {
          transactions.createIndex('byDate', 'occurredOn')
        }
        if (transactions && !transactions.indexNames.contains('byWallet')) {
          transactions.createIndex('byWallet', 'walletId')
        }
        if (transactions && !transactions.indexNames.contains('byDestinationWallet')) {
          transactions.createIndex('byDestinationWallet', 'toWalletId')
        }
        const categories = request.transaction?.objectStore('categories')
        if (categories && !categories.indexNames.contains('byKindAndName')) {
          categories.createIndex('byKindAndName', ['kind', 'normalizedName'], { unique: true })
        }
      }

      if (event.newVersion !== null && event.newVersion >= 4) {
        const budgets = request.transaction?.objectStore('budgets')
        if (budgets && !budgets.indexNames.contains('byStartOn')) {
          budgets.createIndex('byStartOn', 'startOn')
        }

        if (event.newVersion !== null && event.newVersion >= 5) {
          const transactions = request.transaction?.objectStore('transactions')
          if (transactions && !transactions.indexNames.contains('byDebtSettlement')) {
            transactions.createIndex('byDebtSettlement', 'debtSettlementId')
          }
          if (transactions && !transactions.indexNames.contains('byObligation')) {
            transactions.createIndex('byObligation', 'obligationId')
          }
          const debts = request.transaction?.objectStore('debts')
          if (debts && !debts.indexNames.contains('byDirection')) {
            debts.createIndex('byDirection', 'direction')
          }
          if (debts && !debts.indexNames.contains('byPrincipalTransaction')) {
            debts.createIndex('byPrincipalTransaction', 'principalTransactionId')
          }
        }
        const scheduledEvents = request.transaction?.objectStore('scheduledEvents')
        if (scheduledEvents && !scheduledEvents.indexNames.contains('byDueOn')) {
          scheduledEvents.createIndex('byDueOn', 'dueOn')
        }
        if (scheduledEvents && !scheduledEvents.indexNames.contains('byKind')) {
          scheduledEvents.createIndex('byKind', 'kind')
        }
      }
    }

    request.onsuccess = () => {
      databaseInstance = request.result
      databaseInstance.onversionchange = () => {
        databaseInstance?.close()
        databaseInstance = undefined
        databaseOpening = undefined
      }
      resolve(request.result)
    }

    request.onerror = () => {
      databaseOpening = undefined
      reject(request.error ?? new Error('The local database could not be opened.'))
    }

    request.onblocked = () => {
      databaseOpening = undefined
      reject(new Error('The local database is blocked by another open tab. Close other MPKPB? tabs and try again.'))
    }
  })

  return databaseOpening
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('The local database transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('The local database transaction was cancelled.'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The local database request failed.'))
  })
}

function isWallet(value: unknown): value is Wallet {
  if (typeof value !== 'object' || value === null) return false
  const wallet = value as Partial<Wallet>
  const balance = wallet.openingBalanceCentavos
  return (
    typeof wallet.id === 'string' &&
    typeof wallet.name === 'string' &&
    wallet.name.trim().length > 0 &&
    isWalletType(wallet.type) &&
    isWalletIcon(wallet.icon) &&
    isWalletColor(wallet.color) &&
    typeof balance === 'number' &&
    Number.isSafeInteger(balance) &&
    balance >= 0 &&
    typeof wallet.protected === 'boolean' &&
    typeof wallet.archived === 'boolean' &&
    typeof wallet.createdAt === 'string' &&
    typeof wallet.updatedAt === 'string'
  )
}

export async function getWallets(): Promise<Wallet[]> {
  const database = await openDatabase()
  const transaction = database.transaction('wallets', 'readonly')
  const completed = transactionComplete(transaction)
  const [results] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('wallets').getAll()),
    completed,
  ] as const)

  if (!results.every(isWallet)) {
    throw new Error('Some saved wallet data is invalid. No balances were changed.')
  }
  return results
}

export async function createWallet(wallet: Wallet, displayName?: string): Promise<void> {
  if (!isWallet(wallet)) {
    throw new Error('The wallet details are invalid. Please check the name and balance.')
  }

  const database = await openDatabase()
  const transaction = writeTransaction(database, ['wallets', 'preferences'])
  const completed = transactionComplete(transaction)
  transaction.objectStore('wallets').add(wallet)
  transaction.objectStore('preferences').put({ key: 'onboardingComplete', value: 'true' } satisfies Preference)
  if (displayName) {
    transaction.objectStore('preferences').put({ key: 'displayName', value: displayName } satisfies Preference)
  }
  await completed
}

export async function updateWallet(wallet: Wallet): Promise<void> {
  if (!isWallet(wallet)) {
    throw new Error('The wallet details are invalid. Please check the name and balance.')
  }

  const database = await openDatabase()
  const transaction = writeTransaction(database, ['wallets', 'transactions'])
  const completed = transactionComplete(transaction)
  const wallets = transaction.objectStore('wallets')
  const storedWalletRequest = wallets.get(wallet.id)
  let validationError: Error | undefined
  storedWalletRequest.onsuccess = () => {
    const storedWallet = storedWalletRequest.result
    if (!isWallet(storedWallet)) {
      validationError = new Error('The saved wallet could not be verified. No changes were made.')
      transaction.abort()
      return
    }
    if (storedWallet.openingBalanceCentavos === wallet.openingBalanceCentavos) {
      wallets.put(wallet)
      return
    }

    const historyRequest = transaction.objectStore('transactions').getAll()
    historyRequest.onsuccess = () => {
      const history = historyRequest.result as unknown[]
      if (!history.every(isLedgerTransaction)) {
        validationError = new Error('Saved ledger data is invalid. No wallet balances were changed.')
        transaction.abort()
        return
      }
      if (history.some((entry) => entry.walletId === wallet.id || entry.toWalletId === wallet.id)) {
        validationError = new Error('This wallet already has ledger activity. Use a balance adjustment instead of changing its opening balance.')
        transaction.abort()
        return
      }
      wallets.put(wallet)
    }
  }

  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
}

export async function archiveWallet(wallet: Wallet): Promise<Wallet> {
  const archivedWallet = {
    ...wallet,
    archived: true,
    updatedAt: new Date().toISOString(),
  }
  await updateWallet(archivedWallet)
  return archivedWallet
}

export async function restoreWallet(wallet: Wallet): Promise<Wallet> {
  const restoredWallet = {
    ...wallet,
    archived: false,
    updatedAt: new Date().toISOString(),
  }
  await updateWallet(restoredWallet)
  return restoredWallet
}

export async function getTransactions(): Promise<LedgerTransaction[]> {
  const database = await openDatabase()
  const transaction = database.transaction('transactions', 'readonly')
  const completed = transactionComplete(transaction)
  const [results] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('transactions').getAll()),
    completed,
  ] as const)
  if (!results.every(isLedgerTransaction)) {
    throw new Error('Some saved transaction data is invalid. No balances were changed.')
  }
  return results
}

export type UpdatedScheduledEvent = ExpectedIncome | DebtRecord | FinancialObligation | undefined

function localDateOnly(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function saveTransaction(entry: LedgerTransaction): Promise<UpdatedScheduledEvent> {
  if (!isLedgerTransaction(entry)) {
    throw new Error('The transaction details are invalid. Please review the amount and wallets.')
  }

  validateCompletedDate(entry.occurredOn, localDateOnly())
  const database = await openDatabase()
  const storeNames = ['wallets', 'transactions', 'scheduledEvents', 'debts']
  if (entry.categoryId) storeNames.push('categories')
  const transaction = writeTransaction(database, storeNames)
  const completed = transactionComplete(transaction)
  const transactions = transaction.objectStore('transactions')
  const scheduledEvents = transaction.objectStore('scheduledEvents')
  const debts = transaction.objectStore('debts')
  const previousRequest = transactions.get(entry.id)
  const principalRequest = debts.index('byPrincipalTransaction').getAll(entry.id)
  const checks: {
    request: IDBRequest<unknown>
    isValid: (value: unknown) => boolean
    message: string
  }[] = [
    {
      request: transaction.objectStore('wallets').get(entry.walletId),
      isValid: isWallet,
      message: 'The selected wallet no longer exists.',
    },
  ]
  if (entry.kind === 'transfer' && entry.toWalletId) {
    checks.push({
      request: transaction.objectStore('wallets').get(entry.toWalletId),
      isValid: isWallet,
      message: 'The destination wallet no longer exists.',
    })
  }
  if (entry.categoryId) {
    checks.push({
      request: transaction.objectStore('categories').get(entry.categoryId),
      isValid: (value) => isTransactionCategory(value) && value.kind === entry.kind,
      message: 'The selected category is no longer available for this transaction type.',
    })
  }

  let validationError: Error | undefined
  let candidate = entry
  let principalDebts: unknown[] | undefined
  let previousResolved = false
  let principalResolved = false
  let pendingChecks = checks.length
  let linkedLookupStarted = false
  let updatedEvent: UpdatedScheduledEvent
  function fail(message: string) {
    if (validationError) return
    validationError = new Error(message)
    transaction.abort()
  }
  function preserveExistingLink(saved: LedgerTransaction) {
    if (isExpectedIncomeReceipt(saved)) {
      if (
        (entry.expectedIncomeId !== undefined && entry.expectedIncomeId !== saved.expectedIncomeId) ||
        (entry.expectedIncomeDueOn !== undefined && entry.expectedIncomeDueOn !== saved.expectedIncomeDueOn) ||
        entry.debtSettlementId !== undefined ||
        entry.obligationId !== undefined
      ) {
        fail('A scheduled income receipt must remain linked to its original expected-income occurrence.')
        return
      }
      candidate = {
        ...entry,
        expectedIncomeId: saved.expectedIncomeId,
        expectedIncomeDueOn: saved.expectedIncomeDueOn,
      }
    } else if (isDebtSettlementTransaction(saved)) {
      if (
        (entry.debtSettlementId !== undefined && entry.debtSettlementId !== saved.debtSettlementId) ||
        (entry.debtSettlementDueOn !== undefined && entry.debtSettlementDueOn !== saved.debtSettlementDueOn) ||
        (entry.debtSettlementExcludedFromTotals !== undefined &&
          entry.debtSettlementExcludedFromTotals !== saved.debtSettlementExcludedFromTotals) ||
        entry.expectedIncomeId !== undefined ||
        entry.obligationId !== undefined
      ) {
        fail('A debt settlement must remain linked to its original debt occurrence.')
        return
      }
      candidate = {
        ...entry,
        debtSettlementId: saved.debtSettlementId,
        debtSettlementDueOn: saved.debtSettlementDueOn,
        debtSettlementExcludedFromTotals: saved.debtSettlementExcludedFromTotals,
      }
    } else if (isObligationPaymentTransaction(saved)) {
      if (
        (entry.obligationId !== undefined && entry.obligationId !== saved.obligationId) ||
        (entry.obligationDueOn !== undefined && entry.obligationDueOn !== saved.obligationDueOn) ||
        entry.expectedIncomeId !== undefined ||
        entry.debtSettlementId !== undefined
      ) {
        fail('An obligation payment must remain linked to its original bill occurrence.')
        return
      }
      candidate = {
        ...entry,
        obligationId: saved.obligationId,
        obligationDueOn: saved.obligationDueOn,
      }
    }
    if (!isLedgerTransaction(candidate)) {
      fail('A linked payment must keep its original transaction type.')
    }
  }
  function commitWhenReady() {
    if (validationError || !previousResolved || !principalResolved || pendingChecks > 0) return
    if (!principalDebts || !principalDebts.every(isDebtRecord)) {
      fail('Saved debt data could not be verified. No transaction was saved.')
      return
    }
    if (principalDebts.some((debt) =>
      debt.amountCentavos !== candidate.amountCentavos ||
      candidate.kind !== (debt.direction === 'payable' ? 'expense' : 'income'),
    )) {
      fail('The original debt transaction must keep its amount and transaction type.')
      return
    }

    const candidateReceipt = isExpectedIncomeReceipt(candidate) ? candidate : undefined
    const candidateSettlement = isDebtSettlementTransaction(candidate) ? candidate : undefined
    const candidatePayment = isObligationPaymentTransaction(candidate) ? candidate : undefined
    if (!candidateReceipt && !candidateSettlement && !candidatePayment) {
      transactions.put(candidate)
      return
    }
    if (linkedLookupStarted) return
    linkedLookupStarted = true
    if (candidateReceipt) {
      const expectedRequest = scheduledEvents.get(candidateReceipt.expectedIncomeId)
      expectedRequest.onsuccess = () => {
        if (!isExpectedIncome(expectedRequest.result)) {
          fail('The linked expected-income schedule could not be verified. No transaction was saved.')
          return
        }
        try {
          const updated = updateExpectedIncomeReceipt(expectedRequest.result, candidateReceipt)
          scheduledEvents.put(updated)
          transactions.put(candidateReceipt)
          updatedEvent = updated
        } catch (error) {
          fail(error instanceof Error ? error.message : 'The expected-income receipt could not be saved.')
        }
      }
      return
    }
    if (candidateSettlement) {
      const debtRequest = debts.get(candidateSettlement.debtSettlementId)
      debtRequest.onsuccess = () => {
        const debt = debtRequest.result
        if (!isDebtRecord(debt)) {
          fail('The linked debt could not be verified. No transaction was saved.')
          return
        }
        if (candidateSettlement.debtSettlementExcludedFromTotals !== Boolean(debt.principalTransactionId)) {
          fail('Debt repayments can only be excluded from expense totals when the original transaction is linked.')
          return
        }
        try {
          const updated = updateDebtSettlement(debt, candidateSettlement, localDateOnly())
          debts.put(updated)
          transactions.put(candidateSettlement)
          updatedEvent = updated
        } catch (error) {
          fail(error instanceof Error ? error.message : 'The debt settlement could not be saved.')
        }
      }
      return
    }
    if (!candidatePayment) return
    const obligationRequest = scheduledEvents.get(candidatePayment.obligationId)
    obligationRequest.onsuccess = () => {
      const obligation = obligationRequest.result
      if (!isFinancialObligation(obligation)) {
        fail('The linked bill could not be verified. No transaction was saved.')
        return
      }
      try {
        const updated = updateObligationPayment(obligation, candidatePayment, localDateOnly())
        scheduledEvents.put(updated)
        transactions.put(candidatePayment)
        updatedEvent = updated
      } catch (error) {
        fail(error instanceof Error ? error.message : 'The bill payment could not be saved.')
      }
    }
  }

  previousRequest.onsuccess = () => {
    const saved = previousRequest.result
    if (saved !== undefined) {
      if (!isLedgerTransaction(saved)) {
        fail('The existing transaction could not be verified. No changes were made.')
        return
      }
      preserveExistingLink(saved)
    }
    previousResolved = true
    commitWhenReady()
  }
  principalRequest.onsuccess = () => {
    principalDebts = principalRequest.result
    principalResolved = true
    commitWhenReady()
  }

  for (const check of checks) {
    check.request.onsuccess = () => {
      if (!check.isValid(check.request.result)) {
        fail(check.message)
        return
      }
      pendingChecks -= 1
      commitWhenReady()
    }
  }

  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
  return updatedEvent
}

export async function deleteTransaction(id: string): Promise<UpdatedScheduledEvent> {
  if (!id) throw new Error('A transaction ID is required.')
  const database = await openDatabase()
  const transaction = writeTransaction(database, ['transactions', 'scheduledEvents', 'debts'])
  const completed = transactionComplete(transaction)
  const transactions = transaction.objectStore('transactions')
  const scheduledEvents = transaction.objectStore('scheduledEvents')
  const debts = transaction.objectStore('debts')
  const existingRequest = transactions.get(id)
  const principalRequest = debts.index('byPrincipalTransaction').getAll(id)
  let validationError: Error | undefined
  let updatedEvent: UpdatedScheduledEvent
  let existing: unknown
  let principalDebts: unknown[] | undefined
  let existingResolved = false
  let principalResolved = false
  let linkLookupStarted = false
  function fail(message: string) {
    if (validationError) return
    validationError = new Error(message)
    transaction.abort()
  }
  function finishWhenReady() {
    if (validationError || !existingResolved || !principalResolved) return
    if (!principalDebts || !principalDebts.every(isDebtRecord)) {
      fail('Saved debt data could not be verified. No transaction was deleted.')
      return
    }
    if (principalDebts.length > 0) {
      fail('This transaction is linked to an existing debt. Remove that debt link before deleting it.')
      return
    }
    if (existing === undefined) return
    if (!isLedgerTransaction(existing)) {
      fail('The saved transaction could not be verified. No data was changed.')
      return
    }
    const savedTransaction = existing
    if (linkLookupStarted) return
    if (isExpectedIncomeReceipt(savedTransaction)) {
      linkLookupStarted = true
      const expectedRequest = scheduledEvents.get(savedTransaction.expectedIncomeId)
      expectedRequest.onsuccess = () => {
        if (!isExpectedIncome(expectedRequest.result)) {
          fail('The linked expected-income schedule could not be verified. No data was changed.')
          return
        }
        try {
          const updated = removeExpectedIncomeReceipt(
            expectedRequest.result,
            savedTransaction.id,
            new Date().toISOString(),
          )
          scheduledEvents.put(updated)
          transactions.delete(id)
          updatedEvent = updated
        } catch (error) {
          fail(error instanceof Error ? error.message : 'The linked income receipt could not be removed.')
        }
      }
      return
    }
    if (isDebtSettlementTransaction(savedTransaction)) {
      linkLookupStarted = true
      const debtRequest = debts.get(savedTransaction.debtSettlementId)
      debtRequest.onsuccess = () => {
        if (!isDebtRecord(debtRequest.result)) {
          fail('The linked debt could not be verified. No data was changed.')
          return
        }
        try {
          const updated = removeDebtSettlement(debtRequest.result, id, new Date().toISOString())
          debts.put(updated)
          transactions.delete(id)
          updatedEvent = updated
        } catch (error) {
          fail(error instanceof Error ? error.message : 'The debt settlement could not be removed.')
        }
      }
      return
    }
    if (isObligationPaymentTransaction(savedTransaction)) {
      linkLookupStarted = true
      const obligationRequest = scheduledEvents.get(savedTransaction.obligationId)
      obligationRequest.onsuccess = () => {
        if (!isFinancialObligation(obligationRequest.result)) {
          fail('The linked bill could not be verified. No data was changed.')
          return
        }
        try {
          const updated = removeObligationPayment(obligationRequest.result, id, new Date().toISOString())
          scheduledEvents.put(updated)
          transactions.delete(id)
          updatedEvent = updated
        } catch (error) {
          fail(error instanceof Error ? error.message : 'The bill payment could not be removed.')
        }
      }
      return
    }
    transactions.delete(id)
  }
  existingRequest.onsuccess = () => {
    existing = existingRequest.result
    existingResolved = true
    finishWhenReady()
  }
  principalRequest.onsuccess = () => {
    principalDebts = principalRequest.result
    principalResolved = true
    finishWhenReady()
  }
  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
  return updatedEvent
}

export async function getCategories(): Promise<TransactionCategory[]> {
  const database = await openDatabase()
  const transaction = database.transaction('categories', 'readonly')
  const completed = transactionComplete(transaction)
  const [results] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('categories').getAll()),
    completed,
  ] as const)
  if (!results.every(isTransactionCategory)) {
    throw new Error('Some saved category data is invalid. No transactions were changed.')
  }
  return results
}

export async function addCategory(category: TransactionCategory): Promise<void> {
  if (!isTransactionCategory(category)) {
    throw new Error('The category details are invalid. Please check the category name.')
  }

  const database = await openDatabase()
  const transaction = writeTransaction(database, 'categories')
  const completed = transactionComplete(transaction)
  transaction.objectStore('categories').add(category)
  try {
    await completed
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      throw new Error('A category with this name already exists for that transaction type.')
    }
    throw error
  }
}

export async function getBudgetPlans(): Promise<BudgetPlan[]> {
  const database = await openDatabase()
  const transaction = database.transaction(['budgets', 'categories'], 'readonly')
  const completed = transactionComplete(transaction)
  const [results, categoryRecords] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('budgets').getAll()),
    requestResult<unknown[]>(transaction.objectStore('categories').getAll()),
    completed,
  ] as const)
  return validateBudgetPlans(results, categoryRecords)
}

function validateBudgetPlans(results: unknown[], categoryRecords: unknown[]) {
  if (!results.every(isBudgetPlan)) {
    throw new Error('Some saved budget data is invalid. No plan was changed.')
  }
  if (!categoryRecords.every(isTransactionCategory)) {
    throw new Error('Saved category data could not be verified. No budget progress was calculated.')
  }
  const expenseCategories = new Set(
    categoryRecords.filter((category) => category.kind === 'expense').map((category) => category.id),
  )
  if (results.some((plan) => plan.categoryLimits.some((limit) => !expenseCategories.has(limit.categoryId)))) {
    throw new Error('A budget references a missing expense category.')
  }
  return results
}

export async function saveBudgetPlan(plan: BudgetPlan): Promise<void> {
  if (!isBudgetPlan(plan)) {
    throw new Error('The budget details are invalid. Review the plan name, dates, and category limits.')
  }
  const database = await openDatabase()
  const transaction = writeTransaction(database, ['budgets', 'categories'])
  const completed = transactionComplete(transaction)
  const categoriesRequest = transaction.objectStore('categories').getAll()
  let validationError: Error | undefined
  categoriesRequest.onsuccess = () => {
    const categories = categoriesRequest.result
    if (!Array.isArray(categories) || !categories.every(isTransactionCategory)) {
      validationError = new Error('Saved category data could not be verified. No budget was saved.')
      transaction.abort()
      return
    }
    if (plan.categoryLimits.some((limit) =>
      !categories.some((category) => category.id === limit.categoryId && category.kind === 'expense'),
    )) {
      validationError = new Error('Every budget limit must use an existing expense category.')
      transaction.abort()
      return
    }
    transaction.objectStore('budgets').put(plan)
  }
  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
}

export async function archiveBudgetPlan(plan: BudgetPlan): Promise<BudgetPlan> {
  const archived = { ...plan, archived: true, updatedAt: new Date().toISOString() }
  await saveBudgetPlan(archived)
  return archived
}

export async function getExpectedIncomes(): Promise<ExpectedIncome[]> {
  const database = await openDatabase()
  const transaction = database.transaction(
    ['scheduledEvents', 'transactions', 'wallets', 'categories'],
    'readonly',
  )
  const completed = transactionComplete(transaction)
  const [records, transactionRecords, walletRecords, categoryRecords] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('scheduledEvents').index('byKind').getAll('expectedIncome')),
    requestResult<unknown[]>(transaction.objectStore('transactions').getAll()),
    requestResult<unknown[]>(transaction.objectStore('wallets').getAll()),
    requestResult<unknown[]>(transaction.objectStore('categories').getAll()),
    completed,
  ] as const)
  return validateExpectedIncomes(records, transactionRecords, walletRecords, categoryRecords)
}

function validateExpectedIncomes(records: unknown[], transactionRecords: unknown[], walletRecords: unknown[], categoryRecords: unknown[]) {
  if (!records.every(isExpectedIncome)) {
    throw new Error('Some saved expected-income data is invalid. No schedules were changed.')
  }
  if (!transactionRecords.every(isLedgerTransaction)) {
    throw new Error('Saved ledger data could not be verified. No expected-income progress was calculated.')
  }
  if (!walletRecords.every(isWallet) || !categoryRecords.every(isTransactionCategory)) {
    throw new Error('Saved wallet or category data could not be verified. No expected-income progress was calculated.')
  }
  const wallets = new Set(walletRecords.map((wallet) => wallet.id))
  const incomeCategories = new Set(
    categoryRecords.filter((category) => category.kind === 'income').map((category) => category.id),
  )
  if (records.some((expected) =>
    !wallets.has(expected.walletId) ||
    (expected.categoryId !== undefined && !incomeCategories.has(expected.categoryId)),
  )) {
    throw new Error('An expected-income schedule references a missing wallet or income category.')
  }

  const expectedById = new Map(records.map((record) => [record.id, record]))
  const linkedTransactions = new Map(
    transactionRecords.filter(isExpectedIncomeReceipt).map((record) => [record.id, record]),
  )
  for (const expected of records) {
    for (const receipt of expected.receipts) {
      const linked = linkedTransactions.get(receipt.transactionId)
      if (
        !linked ||
        linked.expectedIncomeId !== expected.id ||
        linked.expectedIncomeDueOn !== receipt.dueOn ||
        linked.amountCentavos !== receipt.amountCentavos
      ) {
        throw new Error('An expected-income receipt does not match its saved ledger transaction.')
      }
      linkedTransactions.delete(receipt.transactionId)
    }
  }
  for (const linked of linkedTransactions.values()) {
    if (!expectedById.has(linked.expectedIncomeId)) {
      throw new Error('A ledger transaction references a missing expected-income schedule.')
    }
    throw new Error('A saved expected-income receipt is missing from its schedule history.')
  }
  return records
}

export async function saveExpectedIncome(expected: ExpectedIncome): Promise<void> {
  if (!isExpectedIncome(expected)) {
    throw new Error('The expected-income details are invalid. Review the amount, due date, and recurrence.')
  }
  const database = await openDatabase()
  const transaction = writeTransaction(database, ['scheduledEvents', 'transactions', 'wallets', 'categories'])
  const completed = transactionComplete(transaction)
  const events = transaction.objectStore('scheduledEvents')
  const previousRequest = events.get(expected.id)
  const walletRequest = transaction.objectStore('wallets').get(expected.walletId)
  const transactionsRequest = transaction.objectStore('transactions').getAll()
  const categoryRequest = expected.categoryId
    ? transaction.objectStore('categories').get(expected.categoryId)
    : undefined
  let pending = categoryRequest ? 4 : 3
  let previous: ExpectedIncome | undefined
  let savedTransactions: unknown[] | undefined
  let validWallet = false
  let validCategory = !expected.categoryId
  let validationError: Error | undefined
  function fail(message: string) {
    if (validationError) return
    validationError = new Error(message)
    transaction.abort()
  }
  function finishWhenReady() {
    if (validationError || pending > 0) return
    if (!validWallet) {
      fail('The selected wallet no longer exists.')
      return
    }
    if (!validCategory) {
      fail('The selected category is no longer available for income.')
      return
    }
    if (previous && !isExpectedIncome(previous)) {
      fail('The existing expected-income schedule could not be verified.')
      return
    }
    if (previous && previous.receipts.some((receipt) =>
      !expected.receipts.some((item) =>
        item.transactionId === receipt.transactionId &&
        item.dueOn === receipt.dueOn &&
        item.amountCentavos === receipt.amountCentavos,
      ),
    )) {
      fail('Receipt history can only be changed by editing or deleting its linked ledger transaction.')
      return
    }
    if (previous && previous.receipts.length > 0 &&
      (previous.dueOn !== expected.dueOn ||
        previous.recurrence !== expected.recurrence ||
        previous.monthlyAnchorDay !== expected.monthlyAnchorDay)) {
      fail('A schedule with receipt history must keep its original due date and recurrence.')
      return
    }
    if (!savedTransactions || !savedTransactions.every(isLedgerTransaction)) {
      fail('Saved ledger data could not be verified. No schedule was saved.')
      return
    }
    for (const receipt of expected.receipts) {
      const linked = savedTransactions.find((item) =>
        isExpectedIncomeReceipt(item) && item.id === receipt.transactionId,
      )
      if (
        !linked ||
        !isExpectedIncomeReceipt(linked) ||
        linked.expectedIncomeId !== expected.id ||
        linked.expectedIncomeDueOn !== receipt.dueOn ||
        linked.amountCentavos !== receipt.amountCentavos
      ) {
        fail('Each saved receipt must match its linked income transaction.')
        return
      }
    }
    events.put(expected)
  }
  previousRequest.onsuccess = () => {
    previous = previousRequest.result
    pending -= 1
    finishWhenReady()
  }
  walletRequest.onsuccess = () => {
    validWallet = isWallet(walletRequest.result)
    pending -= 1
    finishWhenReady()
  }
  transactionsRequest.onsuccess = () => {
    savedTransactions = transactionsRequest.result
    pending -= 1
    finishWhenReady()
  }
  if (categoryRequest) {
    categoryRequest.onsuccess = () => {
      const category = categoryRequest.result
      validCategory = isTransactionCategory(category) && category.kind === 'income'
      pending -= 1
      finishWhenReady()
    }
  }
  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
}

export async function archiveExpectedIncome(expected: ExpectedIncome): Promise<ExpectedIncome> {
  const archived = { ...expected, archived: true, updatedAt: new Date().toISOString() }
  await saveExpectedIncome(archived)
  return archived
}

export async function getDebts(): Promise<DebtRecord[]> {
  const database = await openDatabase()
  const transaction = database.transaction(['debts', 'transactions', 'wallets', 'categories'], 'readonly')
  const completed = transactionComplete(transaction)
  const [records, transactionRecords, walletRecords, categoryRecords] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('debts').getAll()),
    requestResult<unknown[]>(transaction.objectStore('transactions').getAll()),
    requestResult<unknown[]>(transaction.objectStore('wallets').getAll()),
    requestResult<unknown[]>(transaction.objectStore('categories').getAll()),
    completed,
  ] as const)
  return validateDebts(records, transactionRecords, walletRecords, categoryRecords)
}

function validateDebts(records: unknown[], transactionRecords: unknown[], walletRecords: unknown[], categoryRecords: unknown[]) {
  if (!records.every(isDebtRecord)) {
    throw new Error('Some saved debt data is invalid. No settlement progress was calculated.')
  }
  if (!transactionRecords.every(isLedgerTransaction) ||
      !walletRecords.every(isWallet) ||
      !categoryRecords.every(isTransactionCategory)) {
    throw new Error('Saved ledger, wallet, or category data could not be verified. No debt progress was calculated.')
  }
  const wallets = new Set(walletRecords.map((wallet) => wallet.id))
  const byId = new Map(transactionRecords.map((entry) => [entry.id, entry]))
  const linkedSettlements = new Map(
    transactionRecords.filter(isDebtSettlementTransaction).map((entry) => [entry.id, entry]),
  )
  const linkedPrincipals = new Set<string>()
  for (const debt of records) {
    if (!wallets.has(debt.walletId) || !validateDebtReferences(debt, categoryRecords)) {
      throw new Error('A debt references a missing wallet or an incompatible category.')
    }
    if (debt.principalTransactionId) {
      if (linkedPrincipals.has(debt.principalTransactionId)) {
        throw new Error('An original ledger transaction is linked to more than one debt.')
      }
      linkedPrincipals.add(debt.principalTransactionId)
      const principal = byId.get(debt.principalTransactionId)
      const expectedKind = debt.direction === 'payable' ? 'expense' : 'income'
      if (
        !principal ||
        principal.kind !== expectedKind ||
        principal.amountCentavos !== debt.amountCentavos ||
        isExpectedIncomeReceipt(principal) ||
        isDebtSettlementTransaction(principal) ||
        isObligationPaymentTransaction(principal)
      ) {
        throw new Error('A debt does not match its linked original ledger transaction.')
      }
    }
    for (const settlement of debt.settlements) {
      const linked = linkedSettlements.get(settlement.transactionId)
      if (
        !linked ||
        linked.debtSettlementId !== debt.id ||
        linked.debtSettlementDueOn !== settlement.dueOn ||
        linked.amountCentavos !== settlement.amountCentavos ||
        linked.kind !== (debt.direction === 'payable' ? 'expense' : 'income') ||
        linked.debtSettlementExcludedFromTotals !== Boolean(debt.principalTransactionId)
      ) {
        throw new Error('A debt settlement does not match its linked ledger transaction.')
      }
      linkedSettlements.delete(settlement.transactionId)
    }
  }
  if (linkedSettlements.size > 0) {
    throw new Error('A ledger debt settlement is missing from its saved debt history.')
  }
  return records
}

export async function saveDebt(debt: DebtRecord): Promise<void> {
  if (!isDebtRecord(debt)) {
    throw new Error('The debt details are invalid. Review the amount, due date, and installment schedule.')
  }
  const database = await openDatabase()
  const transaction = writeTransaction(database, ['debts', 'transactions', 'wallets', 'categories'])
  const completed = transactionComplete(transaction)
  const debts = transaction.objectStore('debts')
  const previousRequest = debts.get(debt.id)
  const walletRequest = transaction.objectStore('wallets').get(debt.walletId)
  const transactionsRequest = transaction.objectStore('transactions').getAll()
  const categoryRequest = debt.categoryId
    ? transaction.objectStore('categories').get(debt.categoryId)
    : undefined
  const principalRequest = debt.principalTransactionId
    ? debts.index('byPrincipalTransaction').getAll(debt.principalTransactionId)
    : undefined
  let pending = 3 + (categoryRequest ? 1 : 0) + (principalRequest ? 1 : 0)
  let previous: unknown
  let wallet: unknown
  let transactionRecords: unknown[] | undefined
  let category: unknown
  let categoryRecord: TransactionCategory | undefined
  let principalRecords: unknown[] = []
  let validCategory = !debt.categoryId
  let validationError: Error | undefined
  function fail(message: string) {
    if (validationError) return
    validationError = new Error(message)
    transaction.abort()
  }
  function finishWhenReady() {
    if (validationError || pending > 0) return
    if (!isWallet(wallet)) {
      fail('The selected wallet no longer exists.')
      return
    }
    if (!validCategory) {
      fail('The selected category is no longer available for this debt type.')
      return
    }
    if (previous !== undefined && !isDebtRecord(previous)) {
      fail('The existing debt could not be verified. No changes were made.')
      return
    }
    if (!transactionRecords || !transactionRecords.every(isLedgerTransaction)) {
      fail('Saved ledger data could not be verified. No debt was saved.')
      return
    }
    if (!validateDebtReferences(debt, categoryRecord ? [categoryRecord] : [])) {
      fail('The selected category is incompatible with this debt type.')
      return
    }
    if (previous && (
      previous.settlements.some((settlement) => !debt.settlements.some((item) =>
        item.transactionId === settlement.transactionId &&
        item.dueOn === settlement.dueOn &&
        item.amountCentavos === settlement.amountCentavos,
      )) ||
      (previous.settlements.length > 0 &&
        (previous.dueOn !== debt.dueOn ||
          previous.recurrence !== debt.recurrence ||
          previous.monthlyAnchorDay !== debt.monthlyAnchorDay ||
          previous.installmentAmountCentavos !== debt.installmentAmountCentavos ||
          previous.installmentCount !== debt.installmentCount ||
          previous.principalTransactionId !== debt.principalTransactionId))
    )) {
      fail('Debt settlement history and its schedule cannot be removed or changed.')
      return
    }
    if (!principalRecords.every(isDebtRecord) ||
        principalRecords.some((item) => item.id !== debt.id)) {
      fail('The original transaction is already linked to another debt or the debt data is invalid.')
      return
    }
    const transactionById = new Map(transactionRecords.map((entry) => [entry.id, entry]))
    if (debt.principalTransactionId) {
      const principal = transactionById.get(debt.principalTransactionId)
      if (
        !principal ||
        principal.kind !== (debt.direction === 'payable' ? 'expense' : 'income') ||
        principal.amountCentavos !== debt.amountCentavos ||
        isExpectedIncomeReceipt(principal) ||
        isDebtSettlementTransaction(principal) ||
        isObligationPaymentTransaction(principal)
      ) {
        fail('Link an existing income or expense transaction with the same amount as the debt.')
        return
      }
    }
    for (const settlement of debt.settlements) {
      const linked = transactionById.get(settlement.transactionId)
      if (
        !linked ||
        !isDebtSettlementTransaction(linked) ||
        linked.debtSettlementId !== debt.id ||
        linked.debtSettlementDueOn !== settlement.dueOn ||
        linked.amountCentavos !== settlement.amountCentavos ||
        linked.kind !== (debt.direction === 'payable' ? 'expense' : 'income') ||
        linked.debtSettlementExcludedFromTotals !== Boolean(debt.principalTransactionId)
      ) {
        fail('Each debt settlement must match its linked ledger transaction.')
        return
      }
    }
    debts.put(debt)
  }
  previousRequest.onsuccess = () => {
    previous = previousRequest.result
    pending -= 1
    finishWhenReady()
  }
  walletRequest.onsuccess = () => {
    wallet = walletRequest.result
    pending -= 1
    finishWhenReady()
  }
  transactionsRequest.onsuccess = () => {
    transactionRecords = transactionsRequest.result
    pending -= 1
    finishWhenReady()
  }
  if (categoryRequest) {
    categoryRequest.onsuccess = () => {
      category = categoryRequest.result
      validCategory = isTransactionCategory(category) &&
        category.kind === (debt.direction === 'payable' ? 'expense' : 'income')
      if (validCategory && isTransactionCategory(category)) categoryRecord = category
      pending -= 1
      finishWhenReady()
    }
  }
  if (principalRequest) {
    principalRequest.onsuccess = () => {
      principalRecords = principalRequest.result
      pending -= 1
      finishWhenReady()
    }
  }
  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
}

export async function archiveDebt(debt: DebtRecord): Promise<DebtRecord> {
  const archived = { ...debt, archived: true, updatedAt: new Date().toISOString() }
  await saveDebt(archived)
  return archived
}

export async function getObligations(): Promise<FinancialObligation[]> {
  const database = await openDatabase()
  const transaction = database.transaction(
    ['scheduledEvents', 'transactions', 'wallets', 'categories'],
    'readonly',
  )
  const completed = transactionComplete(transaction)
  const [records, transactionRecords, walletRecords, categoryRecords] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore('scheduledEvents').index('byKind').getAll('obligation')),
    requestResult<unknown[]>(transaction.objectStore('transactions').getAll()),
    requestResult<unknown[]>(transaction.objectStore('wallets').getAll()),
    requestResult<unknown[]>(transaction.objectStore('categories').getAll()),
    completed,
  ] as const)
  return validateObligations(records, transactionRecords, walletRecords, categoryRecords)
}

function validateObligations(records: unknown[], transactionRecords: unknown[], walletRecords: unknown[], categoryRecords: unknown[]) {
  if (!records.every(isFinancialObligation)) {
    throw new Error('Some saved bill data is invalid. No payment progress was calculated.')
  }
  if (!transactionRecords.every(isLedgerTransaction) ||
      !walletRecords.every(isWallet) ||
      !categoryRecords.every(isTransactionCategory)) {
    throw new Error('Saved ledger, wallet, or category data could not be verified. No bill progress was calculated.')
  }
  const wallets = new Set(walletRecords.map((wallet) => wallet.id))
  const expenseCategories = new Set(
    categoryRecords.filter((category) => category.kind === 'expense').map((category) => category.id),
  )
  const linkedPayments = new Map(
    transactionRecords.filter(isObligationPaymentTransaction).map((entry) => [entry.id, entry]),
  )
  for (const obligation of records) {
    if (
      !wallets.has(obligation.walletId) ||
      (obligation.categoryId !== undefined && !expenseCategories.has(obligation.categoryId))
    ) {
      throw new Error('A bill references a missing wallet or expense category.')
    }
    for (const payment of obligation.payments) {
      const linked = linkedPayments.get(payment.transactionId)
      if (
        !linked ||
        linked.obligationId !== obligation.id ||
        linked.obligationDueOn !== payment.dueOn ||
        linked.amountCentavos !== payment.amountCentavos
      ) {
        throw new Error('A bill payment does not match its linked ledger transaction.')
      }
      linkedPayments.delete(payment.transactionId)
    }
  }
  if (linkedPayments.size > 0) {
    throw new Error('A ledger bill payment is missing from its saved bill history.')
  }
  return records
}

export async function saveObligation(obligation: FinancialObligation): Promise<void> {
  if (!isFinancialObligation(obligation)) {
    throw new Error('The bill details are invalid. Review the amount, due date, and recurrence.')
  }
  const database = await openDatabase()
  const transaction = writeTransaction(database, ['scheduledEvents', 'transactions', 'wallets', 'categories'])
  const completed = transactionComplete(transaction)
  const events = transaction.objectStore('scheduledEvents')
  const previousRequest = events.get(obligation.id)
  const walletRequest = transaction.objectStore('wallets').get(obligation.walletId)
  const transactionsRequest = transaction.objectStore('transactions').getAll()
  const categoryRequest = obligation.categoryId
    ? transaction.objectStore('categories').get(obligation.categoryId)
    : undefined
  let pending = 3 + (categoryRequest ? 1 : 0)
  let previous: unknown
  let wallet: unknown
  let transactionRecords: unknown[] | undefined
  let validCategory = !obligation.categoryId
  let validationError: Error | undefined
  function fail(message: string) {
    if (validationError) return
    validationError = new Error(message)
    transaction.abort()
  }
  function finishWhenReady() {
    if (validationError || pending > 0) return
    if (!isWallet(wallet)) {
      fail('The selected wallet no longer exists.')
      return
    }
    if (!validCategory) {
      fail('The selected category is no longer available for bills.')
      return
    }
    if (previous !== undefined && !isFinancialObligation(previous)) {
      fail('The ID is already used by another scheduled event. No bill was saved.')
      return
    }
    if (!transactionRecords || !transactionRecords.every(isLedgerTransaction)) {
      fail('Saved ledger data could not be verified. No bill was saved.')
      return
    }
    if (previous && (
      previous.payments.some((payment) => !obligation.payments.some((item) =>
        item.transactionId === payment.transactionId &&
        item.dueOn === payment.dueOn &&
        item.amountCentavos === payment.amountCentavos,
      )) ||
      (previous.payments.length > 0 &&
        (previous.dueOn !== obligation.dueOn ||
          previous.recurrence !== obligation.recurrence ||
          previous.monthlyAnchorDay !== obligation.monthlyAnchorDay ||
          previous.installmentCount !== obligation.installmentCount))
    )) {
      fail('Bill payment history and its schedule cannot be removed or changed.')
      return
    }
    const transactionById = new Map(transactionRecords.map((entry) => [entry.id, entry]))
    for (const payment of obligation.payments) {
      const linked = transactionById.get(payment.transactionId)
      if (
        !linked ||
        !isObligationPaymentTransaction(linked) ||
        linked.obligationId !== obligation.id ||
        linked.obligationDueOn !== payment.dueOn ||
        linked.amountCentavos !== payment.amountCentavos
      ) {
        fail('Each bill payment must match its linked ledger transaction.')
        return
      }
    }
    events.put(obligation)
  }
  previousRequest.onsuccess = () => {
    previous = previousRequest.result
    pending -= 1
    finishWhenReady()
  }
  walletRequest.onsuccess = () => {
    wallet = walletRequest.result
    pending -= 1
    finishWhenReady()
  }
  transactionsRequest.onsuccess = () => {
    transactionRecords = transactionsRequest.result
    pending -= 1
    finishWhenReady()
  }
  if (categoryRequest) {
    categoryRequest.onsuccess = () => {
      const category = categoryRequest.result
      validCategory = isTransactionCategory(category) && category.kind === 'expense'
      pending -= 1
      finishWhenReady()
    }
  }
  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
}

export async function archiveObligation(
  obligation: FinancialObligation,
): Promise<FinancialObligation> {
  const archived = { ...obligation, archived: true, updatedAt: new Date().toISOString() }
  await saveObligation(archived)
  return archived
}

export async function getPreference(key: string): Promise<string | undefined> {
  const database = await openDatabase()
  const transaction = database.transaction('preferences', 'readonly')
  const completed = transactionComplete(transaction)
  const [record] = await Promise.all([
    requestResult<unknown>(transaction.objectStore('preferences').get(key)),
    completed,
  ] as const)
  if (record === undefined) return undefined
  if (
    typeof record !== 'object' ||
    record === null ||
    !('key' in record) ||
    record.key !== key ||
    !('value' in record) ||
    typeof record.value !== 'string'
  ) {
    throw new Error('A saved preference is invalid. No financial data was changed.')
  }
  return record.value
}

export async function savePreference(key: string, value: string): Promise<void> {
  const database = await openDatabase()
  const transaction = writeTransaction(database, 'preferences')
  const completed = transactionComplete(transaction)
  transaction.objectStore('preferences').put({ key, value } satisfies Preference)
  await completed
}

function writeTransaction(database: IDBDatabase, stores: string | string[]): IDBTransaction {
  const transaction = database.transaction([...new Set([stores].flat().concat('preferences'))], 'readwrite')
  const timestamp = new Date().toISOString()
  transaction.objectStore('preferences').put({ key: 'lastSavedAt', value: timestamp })
  transaction.addEventListener('complete', () => window.dispatchEvent(new CustomEvent('mpkpb-saved', { detail: timestamp })))
  return transaction
}

const backupStores = ['wallets', 'transactions', 'categories', 'budgets', 'debts', 'scheduledEvents', 'preferences'] as const
type BackupStore = (typeof backupStores)[number]

export interface LocalBackup {
  format: 'mpkpb'
  version: 1
  createdAt: string
  records: Record<BackupStore, unknown[]>
}

interface Snapshot {
  id: string
  label: string
  backup: LocalBackup
}

function isPreference(value: unknown): value is Preference {
  return typeof value === 'object' && value !== null && 'key' in value &&
    typeof value.key === 'string' && value.key.length > 0 &&
    'value' in value && typeof value.value === 'string'
}

export function validateBackup(value: unknown): LocalBackup {
  if (typeof value !== 'object' || value === null || !('format' in value) || value.format !== 'mpkpb' ||
    !('version' in value) || value.version !== 1 || !('createdAt' in value) ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
    !('records' in value) || typeof value.records !== 'object' || value.records === null) {
    throw new Error('Choose a supported MPKPB backup file.')
  }
  const backup = value as LocalBackup
  const { wallets, transactions, categories, budgets, debts, scheduledEvents, preferences } = backup.records
  for (const store of backupStores) {
    const rows = backup.records[store]
    if (!Array.isArray(rows)) throw new Error('The backup is missing a required record list.')
    const key = store === 'preferences' ? 'key' : 'id'
    const ids = rows.map((row) => typeof row === 'object' && row !== null ? Reflect.get(row, key) : undefined)
    if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== rows.length) {
      throw new Error('The backup contains invalid or duplicate record IDs.')
    }
  }
  if (!wallets.every(isWallet) || !transactions.every(isLedgerTransaction) ||
    !categories.every(isTransactionCategory) || !preferences.every(isPreference)) {
    throw new Error('The backup contains invalid wallet, transaction, category, or preference data.')
  }
  if (new Set(categories.map((category) => JSON.stringify([category.kind, category.normalizedName]))).size !== categories.length) {
    throw new Error('The backup contains duplicate category names.')
  }
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  for (const entry of transactions) {
    if ('categoryId' in entry && entry.categoryId &&
      categoryById.get(entry.categoryId)?.kind !== entry.kind) {
      throw new Error('A transaction references a missing or incompatible category.')
    }
  }
  calculateWalletBalances(wallets, transactions)
  calculateLedgerTotals(transactions)
  validateBudgetPlans(budgets, categories)
  const income = scheduledEvents.filter(isExpectedIncome)
  const bills = scheduledEvents.filter(isFinancialObligation)
  if (income.length + bills.length !== scheduledEvents.length) {
    throw new Error('The backup contains an invalid scheduled event.')
  }
  validateExpectedIncomes(income, transactions, wallets, categories)
  validateDebts(debts, transactions, wallets, categories)
  validateObligations(bills, transactions, wallets, categories)
  return backup
}

async function readBackup(transaction: IDBTransaction): Promise<LocalBackup> {
  const entries = await Promise.all(backupStores.map(async (store) => [
    store, await requestResult<unknown[]>(transaction.objectStore(store).getAll()),
  ] as const))
  const records = Object.fromEntries(entries) as LocalBackup['records']
  // Security state belongs to this browser, independently of financial recovery.
  records.preferences = records.preferences.filter((record) => !isPreference(record) || record.key !== 'privacyPin')
  return { format: 'mpkpb', version: 1, createdAt: new Date().toISOString(), records }
}

export async function exportBackup(): Promise<LocalBackup> {
  const database = await openDatabase()
  const transaction = database.transaction(backupStores, 'readonly')
  const [backup] = await Promise.all([readBackup(transaction), transactionComplete(transaction)])
  return validateBackup(backup)
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const database = await openDatabase()
  const transaction = database.transaction('snapshots', 'readonly')
  const [snapshots] = await Promise.all([
    requestResult<Snapshot[]>(transaction.objectStore('snapshots').getAll()),
    transactionComplete(transaction),
  ])
  return snapshots.sort((a, b) => b.backup.createdAt.localeCompare(a.backup.createdAt))
}

export async function createSnapshot(): Promise<void> {
  const backup = await exportBackup()
  const database = await openDatabase()
  const transaction = database.transaction('snapshots', 'readwrite')
  const completed = transactionComplete(transaction)
  transaction.objectStore('snapshots').add({ id: crypto.randomUUID(), label: 'Manual snapshot', backup } satisfies Snapshot)
  await completed
}

export async function replaceFromBackup(candidate: LocalBackup, reset = false): Promise<void> {
  const backup = validateBackup(candidate)
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAMES, 'readwrite')
  const completed = transactionComplete(transaction)
  const operation = async () => {
    const previous = await readBackup(transaction)
    const preferences = transaction.objectStore('preferences')
    const pin = await requestResult<unknown>(preferences.get('privacyPin'))
    if (reset) transaction.objectStore('snapshots').clear()
    else transaction.objectStore('snapshots').add({
      id: crypto.randomUUID(), label: 'Before restore', backup: previous,
    } satisfies Snapshot)
    for (const store of backupStores) {
      const target = transaction.objectStore(store)
      target.clear()
      for (const record of backup.records[store]) {
        if (store !== 'preferences' || !isPreference(record) || record.key !== 'privacyPin') target.add(record)
      }
    }
    if (!reset && pin !== undefined) preferences.put(pin)
    preferences.put({ key: 'lastSavedAt', value: new Date().toISOString() })
  }
  await Promise.all([operation().catch((error: unknown) => {
    try { transaction.abort() } catch { /* Already aborted by IndexedDB. */ }
    throw error
  }), completed])
}

export function resetLocalData(): Promise<void> {
  const records = Object.fromEntries(backupStores.map((store) => [store, [] as unknown[]])) as LocalBackup['records']
  return replaceFromBackup({ format: 'mpkpb', version: 1, createdAt: new Date().toISOString(), records }, true)
}

export async function getPlanningData() {
  const database = await openDatabase()
  const stores = ['budgets', 'debts', 'scheduledEvents', 'wallets', 'transactions', 'categories']
  const transaction = database.transaction(stores, 'readonly')
  const [[budgets, debts, schedules, wallets, transactions, categories]] = await Promise.all([
    Promise.all(stores.map((store) => requestResult<unknown[]>(transaction.objectStore(store).getAll()))),
    transactionComplete(transaction),
  ])
  const expected = schedules.filter(isExpectedIncome)
  const obligations = schedules.filter(isFinancialObligation)
  if (expected.length + obligations.length !== schedules.length) {
    throw new Error('May schedule na hindi mabasa. Walang binago sa records mo.')
  }
  return {
    budgets: validateBudgetPlans(budgets, categories),
    expected: validateExpectedIncomes(expected, transactions, wallets, categories),
    debts: validateDebts(debts, transactions, wallets, categories),
    obligations: validateObligations(obligations, transactions, wallets, categories),
  }
}

export async function updateCategoryIcon(id: string, icon: CategoryIcon): Promise<TransactionCategory> {
  if (!isCategoryIcon(icon)) throw new Error('Pumili ng valid na category icon.')
  const database = await openDatabase()
  const transaction = writeTransaction(database, 'categories')
  const completed = transactionComplete(transaction)
  const store = transaction.objectStore('categories')
  const update = async () => {
    const category = await requestResult<unknown>(store.get(id))
    if (!isTransactionCategory(category)) {
      transaction.abort()
      throw new Error('Hindi mabasa ang category. Walang na-save na icon.')
    }
    const updated = { ...category, icon, updatedAt: new Date().toISOString() }
    store.put(updated)
    return updated
  }
  const [updated] = await Promise.all([update(), completed])
  return updated
}
