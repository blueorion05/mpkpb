import {
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
const DATABASE_VERSION = 4
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
  const transaction = database.transaction(['wallets', 'preferences'], 'readwrite')
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
  const transaction = database.transaction(['wallets', 'transactions'], 'readwrite')
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

export async function saveTransaction(entry: LedgerTransaction): Promise<ExpectedIncome | undefined> {
  if (!isLedgerTransaction(entry)) {
    throw new Error('The transaction details are invalid. Please review the amount and wallets.')
  }

  const database = await openDatabase()
  const storeNames = ['wallets', 'transactions', 'scheduledEvents']
  if (entry.categoryId) storeNames.push('categories')
  const transaction = database.transaction(storeNames, 'readwrite')
  const completed = transactionComplete(transaction)
  const transactions = transaction.objectStore('transactions')
  const scheduledEvents = transaction.objectStore('scheduledEvents')
  const previousRequest = transactions.get(entry.id)
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
  let previous: LedgerTransaction | undefined
  let previousResolved = false
  let pendingChecks = checks.length
  let expectedLookupStarted = false
  let updatedExpectedIncome: ExpectedIncome | undefined
  function fail(message: string) {
    if (validationError) return
    validationError = new Error(message)
    transaction.abort()
  }
  function commitWhenReady() {
    if (validationError || !previousResolved || pendingChecks > 0) return

    const previousReceipt = previous && isExpectedIncomeReceipt(previous) ? previous : undefined
    const candidateReceipt = isExpectedIncomeReceipt(candidate) ? candidate : undefined
    if (previousReceipt && candidateReceipt &&
      (previousReceipt.expectedIncomeId !== candidateReceipt.expectedIncomeId ||
        previousReceipt.expectedIncomeDueOn !== candidateReceipt.expectedIncomeDueOn)) {
      fail('A scheduled income receipt must remain linked to its original expected-income occurrence.')
      return
    }
    if (!candidateReceipt) {
      transactions.put(candidate)
      return
    }
    if (expectedLookupStarted) return
    expectedLookupStarted = true
    const expectedRequest = scheduledEvents.get(candidateReceipt.expectedIncomeId)
    expectedRequest.onsuccess = () => {
      const expected = expectedRequest.result
      if (!isExpectedIncome(expected)) {
        fail('The linked expected-income schedule could not be verified. No transaction was saved.')
        return
      }
      try {
        const updated = updateExpectedIncomeReceipt(expected, candidateReceipt)
        scheduledEvents.put(updated)
        transactions.put(candidateReceipt)
        updatedExpectedIncome = updated
      } catch (error) {
        fail(error instanceof Error ? error.message : 'The expected-income receipt could not be saved.')
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
      previous = saved
      if (isExpectedIncomeReceipt(saved)) {
        if (
          (entry.expectedIncomeId !== undefined && entry.expectedIncomeId !== saved.expectedIncomeId) ||
          (entry.expectedIncomeDueOn !== undefined && entry.expectedIncomeDueOn !== saved.expectedIncomeDueOn)
        ) {
          fail('A scheduled income receipt must remain linked to its original expected-income occurrence.')
          return
        }
        candidate = {
          ...entry,
          expectedIncomeId: saved.expectedIncomeId,
          expectedIncomeDueOn: saved.expectedIncomeDueOn,
        }
        if (!isLedgerTransaction(candidate)) {
          fail('A scheduled income receipt must remain an income transaction.')
          return
        }
      }
    }
    previousResolved = true
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
  return updatedExpectedIncome
}

export async function deleteTransaction(id: string): Promise<ExpectedIncome | undefined> {
  if (!id) throw new Error('A transaction ID is required.')
  const database = await openDatabase()
  const transaction = database.transaction(['transactions', 'scheduledEvents'], 'readwrite')
  const completed = transactionComplete(transaction)
  const transactions = transaction.objectStore('transactions')
  const scheduledEvents = transaction.objectStore('scheduledEvents')
  const existingRequest = transactions.get(id)
  let validationError: Error | undefined
  let updatedExpectedIncome: ExpectedIncome | undefined
  existingRequest.onsuccess = () => {
    const existing = existingRequest.result
    if (existing !== undefined && !isLedgerTransaction(existing)) {
      validationError = new Error('The saved transaction could not be verified. No data was changed.')
      transaction.abort()
      return
    }
    if (existing && isExpectedIncomeReceipt(existing)) {
      const expectedRequest = scheduledEvents.get(existing.expectedIncomeId)
      expectedRequest.onsuccess = () => {
        if (!isExpectedIncome(expectedRequest.result)) {
          validationError = new Error('The linked expected-income schedule could not be verified. No data was changed.')
          transaction.abort()
          return
        }
        try {
          const updated = removeExpectedIncomeReceipt(
            expectedRequest.result,
            existing.id,
            new Date().toISOString(),
          )
          scheduledEvents.put(updated)
          transactions.delete(id)
          updatedExpectedIncome = updated
        } catch (error) {
          validationError = error instanceof Error
            ? error
            : new Error('The linked expected-income receipt could not be removed.')
          transaction.abort()
        }
      }
    } else {
      transactions.delete(id)
    }
  }
  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
  return updatedExpectedIncome
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
  const transaction = database.transaction('categories', 'readwrite')
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
  const transaction = database.transaction(['budgets', 'categories'], 'readwrite')
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
  const transaction = database.transaction(
    ['scheduledEvents', 'transactions', 'wallets', 'categories'],
    'readwrite',
  )
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
  const transaction = database.transaction('preferences', 'readwrite')
  const completed = transactionComplete(transaction)
  transaction.objectStore('preferences').put({ key, value } satisfies Preference)
  await completed
}
