import {
  isLedgerTransaction,
  isTransactionCategory,
  type LedgerTransaction,
  type TransactionCategory,
} from '../domain/ledger.ts'

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
const DATABASE_VERSION = 3
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

export async function saveTransaction(entry: LedgerTransaction): Promise<void> {
  if (!isLedgerTransaction(entry)) {
    throw new Error('The transaction details are invalid. Please review the amount and wallets.')
  }

  const database = await openDatabase()
  const storeNames = ['wallets', 'transactions']
  if (entry.categoryId) storeNames.push('categories')
  const transaction = database.transaction(storeNames, 'readwrite')
  const completed = transactionComplete(transaction)
  const transactions = transaction.objectStore('transactions')
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
  let pendingChecks = checks.length
  for (const check of checks) {
    check.request.onsuccess = () => {
      if (!check.isValid(check.request.result)) {
        validationError = new Error(check.message)
        transaction.abort()
        return
      }
      pendingChecks -= 1
      if (pendingChecks === 0) transactions.put(entry)
    }
  }

  try {
    await completed
  } catch (error) {
    if (validationError) throw validationError
    throw error
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!id) throw new Error('A transaction ID is required.')
  const database = await openDatabase()
  const transaction = database.transaction('transactions', 'readwrite')
  const completed = transactionComplete(transaction)
  transaction.objectStore('transactions').delete(id)
  await completed
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
