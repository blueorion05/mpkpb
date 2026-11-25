export type WalletType =
  | 'Cash'
  | 'E-wallet'
  | 'Bank'
  | 'Savings'
  | 'Emergency fund'
  | 'Other'

export interface Wallet {
  id: string
  name: string
  type: WalletType
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
const DATABASE_VERSION = 1
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

function openDatabase(): Promise<IDBDatabase> {
  if (databaseInstance) return Promise.resolve(databaseInstance)
  if (databaseOpening) return databaseOpening

  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support local IndexedDB storage.'))
  }

  databaseOpening = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      for (const storeName of STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, {
            keyPath: storeName === 'preferences' ? 'key' : 'id',
          })
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
  return results.filter((wallet) => !wallet.archived)
}

export async function createWallet(wallet: Wallet, displayName?: string): Promise<void> {
  if (!isWallet(wallet)) {
    throw new Error('The wallet details are invalid. Please check the name and balance.')
  }

  const database = await openDatabase()
  const transaction = database.transaction(['wallets', 'preferences'], 'readwrite')
  const completed = transactionComplete(transaction)
  transaction.objectStore('wallets').add(wallet)
  if (displayName) {
    transaction.objectStore('preferences').put({ key: 'displayName', value: displayName } satisfies Preference)
  }
  await completed
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
