import {
  isLedgerTransaction,
  isValidNotes,
  type LedgerTransaction,
  type TransactionCategory,
} from './ledger.ts'
import { sumCentavos } from './money.ts'
import { isDateOnly, isRecurrenceFrequency, nextRecurringDate, type RecurrenceFrequency } from './recurrence.ts'

export type DebtDirection = 'payable' | 'receivable'

export interface DebtSettlement {
  transactionId: string
  dueOn: string
  amountCentavos: number
}

export interface DebtRecord {
  notes?: string
  id: string
  kind: 'debt'
  name: string
  direction: DebtDirection
  amountCentavos: number
  walletId: string
  categoryId?: string
  dueOn?: string
  recurrence: RecurrenceFrequency
  monthlyAnchorDay: number
  installmentAmountCentavos?: number
  installmentCount?: number
  principalTransactionId?: string
  settlements: DebtSettlement[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface FinancialObligation {
  notes?: string
  id: string
  kind: 'obligation'
  description: string
  amountCentavos: number
  walletId: string
  categoryId?: string
  dueOn: string
  recurrence: RecurrenceFrequency
  monthlyAnchorDay: number
  installmentCount?: number
  payments: DebtSettlement[]
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface DebtProgress {
  dueOn: string
  expectedCentavos: number
  settledThisOccurrenceCentavos: number
  remainingThisOccurrenceCentavos: number
  remainingTotalCentavos: number
  installmentsCompleted: number
  status: 'upcoming' | 'due' | 'overdue' | 'undated' | 'settled'
}

export interface ObligationProgress {
  dueOn: string
  paidThisOccurrenceCentavos: number
  remainingThisOccurrenceCentavos: number
  installmentsCompleted: number
  status: 'upcoming' | 'due' | 'overdue' | 'paid'
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isPositiveSafeAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isDebtDirection(value: unknown): value is DebtDirection {
  return value === 'payable' || value === 'receivable'
}

function isValidInstallmentCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1200
}

function isSettlement(value: unknown): value is DebtSettlement {
  if (typeof value !== 'object' || value === null) return false
  const settlement = value as Partial<DebtSettlement>
  return (
    typeof settlement.transactionId === 'string' &&
    settlement.transactionId.length > 0 &&
    isDateOnly(settlement.dueOn) &&
    isPositiveSafeAmount(settlement.amountCentavos)
  )
}

function requiredDebtOccurrenceAmount(debt: DebtRecord, index: number): number {
  if (debt.installmentAmountCentavos === undefined) return debt.amountCentavos
  const completedRegularPayments = Math.floor(debt.amountCentavos / debt.installmentAmountCentavos)
  const remainder = debt.amountCentavos % debt.installmentAmountCentavos
  if (index < completedRegularPayments) return debt.installmentAmountCentavos
  return index === completedRegularPayments ? remainder : 0
}

function debtInstallmentCount(debt: DebtRecord): number | undefined {
  if (debt.installmentCount !== undefined) return debt.installmentCount
  if (debt.installmentAmountCentavos === undefined) return undefined
  return Math.ceil(debt.amountCentavos / debt.installmentAmountCentavos)
}

// Undated debts use a stable internal key for settlement links. The UI and forecast
// never treat that key as the date money is expected to move.
function debtOccurrenceKey(debt: DebtRecord): string {
  return debt.dueOn ?? new Date(debt.createdAt).toISOString().slice(0, 10)
}

function nextDebtDate(debt: DebtRecord, dueOn: string): string {
  if (debt.recurrence === 'none') return dueOn
  return nextRecurringDate(dueOn, debt.recurrence, debt.monthlyAnchorDay)
}

function isValidSchedulePayment(
  amountCentavos: number,
  recurrence: RecurrenceFrequency,
  installmentCount: number | undefined,
): boolean {
  if (installmentCount !== undefined && !isValidInstallmentCount(installmentCount)) return false
  if (installmentCount !== undefined && recurrence === 'none' && installmentCount > 1) return false
  return amountCentavos > 0
}

function validateSettlements(
  settlements: readonly DebtSettlement[],
  totalAmountCentavos: number | null,
  occurrenceAmount: (index: number) => number,
  dueOn: string,
  recurrence: RecurrenceFrequency,
  monthlyAnchorDay: number,
  installmentCount?: number,
): boolean {
  const transactionIds = new Set<string>()
  const receivedByDueDate = new Map<string, number[]>()
  for (const settlement of settlements) {
    if (!isSettlement(settlement) || transactionIds.has(settlement.transactionId)) return false
    transactionIds.add(settlement.transactionId)
    const amounts = receivedByDueDate.get(settlement.dueOn) ?? []
    amounts.push(settlement.amountCentavos)
    receivedByDueDate.set(settlement.dueOn, amounts)
  }

  const dueDates = [...receivedByDueDate.keys()].sort()
  let currentDueOn = dueOn
  let currentIndex = 0
  for (const settlementDate of dueDates) {
    while (currentDueOn < settlementDate && currentIndex < settlements.length + 1) {
      if (recurrence === 'none' || (installmentCount !== undefined && currentIndex >= installmentCount)) {
        return false
      }
      let completedOccurrence = 0
      for (const amount of receivedByDueDate.get(currentDueOn) ?? []) {
        completedOccurrence += amount
        if (!Number.isSafeInteger(completedOccurrence)) return false
      }
      if (completedOccurrence !== occurrenceAmount(currentIndex)) return false
      currentDueOn = nextRecurringDate(currentDueOn, recurrence, monthlyAnchorDay)
      currentIndex += 1
    }
    if (settlementDate !== currentDueOn) return false
    let totalForOccurrence = 0
    for (const amount of receivedByDueDate.get(settlementDate) ?? []) {
      totalForOccurrence += amount
      if (!Number.isSafeInteger(totalForOccurrence) || totalForOccurrence > occurrenceAmount(currentIndex)) {
        return false
      }
    }
  }

  if (totalAmountCentavos !== null) {
    let total = 0
    for (const settlement of settlements) {
      total += settlement.amountCentavos
      if (!Number.isSafeInteger(total) || total > totalAmountCentavos) return false
    }
  }
  return true
}

export function isDebtRecord(value: unknown): value is DebtRecord {
  if (typeof value !== 'object' || value === null) return false
  const debt = value as Partial<DebtRecord>
  if (!isValidNotes(debt.notes)) return false
  const recurrence = debt.recurrence
  const installmentCount = debt.installmentCount
  if (
    typeof debt.id !== 'string' ||
    !debt.id ||
    debt.kind !== 'debt' ||
    typeof debt.name !== 'string' ||
    debt.name.trim().length === 0 ||
    debt.name.length > 80 ||
    !isDebtDirection(debt.direction) ||
    !isPositiveSafeAmount(debt.amountCentavos) ||
    typeof debt.walletId !== 'string' ||
    !debt.walletId ||
    (debt.categoryId !== undefined && (typeof debt.categoryId !== 'string' || !debt.categoryId)) ||
    (debt.dueOn === undefined ? recurrence !== 'none' : !isDateOnly(debt.dueOn)) ||
    !isRecurrenceFrequency(recurrence) ||
    typeof debt.monthlyAnchorDay !== 'number' ||
    !Number.isInteger(debt.monthlyAnchorDay) ||
    debt.monthlyAnchorDay < 1 ||
    debt.monthlyAnchorDay > 31 ||
    !Array.isArray(debt.settlements) ||
    typeof debt.archived !== 'boolean' ||
    !isTimestamp(debt.createdAt) ||
    !isTimestamp(debt.updatedAt) ||
    (debt.principalTransactionId !== undefined &&
      (typeof debt.principalTransactionId !== 'string' || !debt.principalTransactionId)) ||
    !isValidSchedulePayment(debt.amountCentavos, recurrence, installmentCount)
  ) {
    return false
  }

  if (installmentCount !== undefined) {
    if (
      recurrence === 'none' ||
      !isPositiveSafeAmount(debt.installmentAmountCentavos) ||
      debt.installmentAmountCentavos > debt.amountCentavos ||
      Math.ceil(debt.amountCentavos / debt.installmentAmountCentavos) !== installmentCount
    ) {
      return false
    }
  } else if (debt.installmentAmountCentavos !== undefined) {
    if (
      !isPositiveSafeAmount(debt.installmentAmountCentavos) ||
      debt.installmentAmountCentavos > debt.amountCentavos ||
      recurrence === 'none'
    ) {
      return false
    }
  } else if (recurrence !== 'none') {
    return false
  }

  return validateSettlements(
    debt.settlements,
    debt.amountCentavos,
    (index) => requiredDebtOccurrenceAmount(debt as DebtRecord, index),
    debtOccurrenceKey(debt as DebtRecord),
    recurrence,
    debt.monthlyAnchorDay,
    installmentCount,
  )
}

export function isFinancialObligation(value: unknown): value is FinancialObligation {
  if (typeof value !== 'object' || value === null) return false
  const obligation = value as Partial<FinancialObligation>
  if (!isValidNotes(obligation.notes)) return false
  const recurrence = obligation.recurrence
  const installmentCount = obligation.installmentCount
  if (
    typeof obligation.id !== 'string' ||
    !obligation.id ||
    obligation.kind !== 'obligation' ||
    typeof obligation.description !== 'string' ||
    obligation.description.trim().length === 0 ||
    obligation.description.length > 120 ||
    !isPositiveSafeAmount(obligation.amountCentavos) ||
    typeof obligation.walletId !== 'string' ||
    !obligation.walletId ||
    (obligation.categoryId !== undefined &&
      (typeof obligation.categoryId !== 'string' || !obligation.categoryId)) ||
    !isDateOnly(obligation.dueOn) ||
    !isRecurrenceFrequency(recurrence) ||
    typeof obligation.monthlyAnchorDay !== 'number' ||
    !Number.isInteger(obligation.monthlyAnchorDay) ||
    obligation.monthlyAnchorDay < 1 ||
    obligation.monthlyAnchorDay > 31 ||
    !Array.isArray(obligation.payments) ||
    typeof obligation.archived !== 'boolean' ||
    !isTimestamp(obligation.createdAt) ||
    !isTimestamp(obligation.updatedAt) ||
    !isValidSchedulePayment(obligation.amountCentavos, recurrence, installmentCount)
  ) {
    return false
  }
  if (installmentCount !== undefined && recurrence === 'none') return false
  return validateSettlements(
    obligation.payments,
    null,
    () => obligation.amountCentavos ?? 0,
    obligation.dueOn,
    recurrence,
    obligation.monthlyAnchorDay,
    installmentCount,
  )
}

function amountPaidOn(settlements: readonly DebtSettlement[], dueOn: string): number {
  return sumCentavos(
    settlements.filter((item) => item.dueOn === dueOn).map((item) => item.amountCentavos),
  )
}

export function getDebtProgress(debt: DebtRecord, today: string): DebtProgress {
  if (!isDebtRecord(debt) || !isDateOnly(today)) {
    throw new TypeError('Debt data or the current date is invalid.')
  }
  const totalSettledCentavos = sumCentavos(debt.settlements.map((item) => item.amountCentavos))
  const remainingTotalCentavos = debt.amountCentavos - totalSettledCentavos
  let dueOn = debtOccurrenceKey(debt)
  let installmentsCompleted = 0
  let expectedCentavos = requiredDebtOccurrenceAmount(debt, 0)
  let settledThisOccurrenceCentavos = amountPaidOn(debt.settlements, dueOn)
  let advanced = 0
  const installmentCount = debtInstallmentCount(debt)
  while (expectedCentavos > 0 && settledThisOccurrenceCentavos === expectedCentavos) {
    installmentsCompleted += 1
    if (
      debt.recurrence === 'none' ||
      advanced >= debt.settlements.length ||
      (installmentCount !== undefined && installmentsCompleted >= installmentCount)
    ) {
      break
    }
    dueOn = nextDebtDate(debt, dueOn)
    expectedCentavos = requiredDebtOccurrenceAmount(debt, installmentsCompleted)
    settledThisOccurrenceCentavos = amountPaidOn(debt.settlements, dueOn)
    advanced += 1
  }
  const status = remainingTotalCentavos === 0
    ? 'settled'
    : debt.dueOn === undefined ? 'undated'
    : dueOn > today
      ? 'upcoming'
      : dueOn < today
        ? 'overdue'
        : 'due'
  return {
    dueOn,
    expectedCentavos,
    settledThisOccurrenceCentavos,
    remainingThisOccurrenceCentavos: expectedCentavos - settledThisOccurrenceCentavos,
    remainingTotalCentavos,
    installmentsCompleted,
    status,
  }
}

export function getObligationProgress(obligation: FinancialObligation, today: string): ObligationProgress {
  if (!isFinancialObligation(obligation) || !isDateOnly(today)) {
    throw new TypeError('Obligation data or the current date is invalid.')
  }
  let dueOn = obligation.dueOn
  let installmentsCompleted = 0
  let paidThisOccurrenceCentavos = amountPaidOn(obligation.payments, dueOn)
  let advanced = 0
  while (paidThisOccurrenceCentavos === obligation.amountCentavos) {
    installmentsCompleted += 1
    if (
      obligation.recurrence === 'none' ||
      advanced >= obligation.payments.length ||
      (obligation.installmentCount !== undefined && installmentsCompleted >= obligation.installmentCount)
    ) {
      break
    }
    dueOn = nextRecurringDate(dueOn, obligation.recurrence, obligation.monthlyAnchorDay)
    paidThisOccurrenceCentavos = amountPaidOn(obligation.payments, dueOn)
    advanced += 1
  }
  const paid = obligation.installmentCount !== undefined
    ? installmentsCompleted >= obligation.installmentCount
    : obligation.recurrence === 'none' && paidThisOccurrenceCentavos === obligation.amountCentavos
  const remainingThisOccurrenceCentavos = Math.max(0, obligation.amountCentavos - paidThisOccurrenceCentavos)
  const status = paid
    ? 'paid'
    : dueOn > today
      ? 'upcoming'
      : dueOn < today
        ? 'overdue'
        : 'due'
  return {
    dueOn,
    paidThisOccurrenceCentavos,
    remainingThisOccurrenceCentavos,
    installmentsCompleted,
    status,
  }
}

export function updateDebtSettlement(
  debt: DebtRecord,
  transaction: LedgerTransaction,
  today: string,
): DebtRecord {
  if (
    !isDebtRecord(debt) ||
    !isLedgerTransaction(transaction) ||
    transaction.debtSettlementId !== debt.id ||
    !isDateOnly(transaction.debtSettlementDueOn) ||
    !isDateOnly(today) ||
    transaction.debtSettlementExcludedFromTotals !== Boolean(debt.principalTransactionId) ||
    transaction.kind !== (debt.direction === 'payable' ? 'expense' : 'income')
  ) {
    throw new TypeError('The linked debt settlement is invalid.')
  }
  const existing = debt.settlements.find((item) => item.transactionId === transaction.id)
  const dueOn = existing?.dueOn ?? transaction.debtSettlementDueOn
  if (dueOn !== transaction.debtSettlementDueOn) {
    throw new Error('A debt settlement must remain linked to its original due occurrence.')
  }
  if (!existing && (debt.archived || getDebtProgress(debt, today).dueOn !== dueOn)) {
    throw new Error('Only the current, active debt payment occurrence can be settled.')
  }
  const otherSettlements = debt.settlements.filter((item) => item.transactionId !== transaction.id)
  const alreadyForOccurrence = amountPaidOn(otherSettlements, dueOn)
  const index = getDebtOccurrenceIndex(debt, dueOn)
  const installmentLimit = requiredDebtOccurrenceAmount(debt, index)
  if (
    transaction.amountCentavos > installmentLimit - alreadyForOccurrence ||
    transaction.amountCentavos > debt.amountCentavos - sumCentavos(otherSettlements.map((item) => item.amountCentavos))
  ) {
    throw new Error('This settlement would exceed the remaining debt amount.')
  }
  const updatedDebt = {
    ...debt,
    settlements: [
      ...otherSettlements,
      { transactionId: transaction.id, dueOn, amountCentavos: transaction.amountCentavos },
    ],
    updatedAt: transaction.updatedAt,
  }
  if (!isDebtRecord(updatedDebt)) {
    throw new Error('This change would make the debt installment history inconsistent.')
  }
  return updatedDebt
}

export function removeDebtSettlement(debt: DebtRecord, transactionId: string, updatedAt: string): DebtRecord {
  if (!isDebtRecord(debt) || !transactionId || !isTimestamp(updatedAt)) {
    throw new TypeError('The linked debt settlement could not be verified.')
  }
  const updatedDebt = {
    ...debt,
    settlements: debt.settlements.filter((item) => item.transactionId !== transactionId),
    updatedAt,
  }
  if (!isDebtRecord(updatedDebt)) {
    throw new Error('Remove later debt settlements first to preserve the installment history.')
  }
  return updatedDebt
}

function getDebtOccurrenceIndex(debt: DebtRecord, dueOn: string): number {
  let currentDueOn = debtOccurrenceKey(debt)
  let index = 0
  while (currentDueOn < dueOn && index < debt.settlements.length + 1) {
    if (debt.recurrence === 'none') break
    currentDueOn = nextRecurringDate(currentDueOn, debt.recurrence, debt.monthlyAnchorDay)
    index += 1
  }
  if (currentDueOn !== dueOn) {
    throw new Error('The debt settlement date is not a valid installment occurrence.')
  }
  return index
}

export function updateObligationPayment(
  obligation: FinancialObligation,
  transaction: LedgerTransaction,
  today: string,
): FinancialObligation {
  if (
    !isFinancialObligation(obligation) ||
    !isLedgerTransaction(transaction) ||
    transaction.kind !== 'expense' ||
    transaction.obligationId !== obligation.id ||
    !isDateOnly(transaction.obligationDueOn) ||
    !isDateOnly(today)
  ) {
    throw new TypeError('The linked obligation payment is invalid.')
  }
  const existing = obligation.payments.find((item) => item.transactionId === transaction.id)
  const dueOn = existing?.dueOn ?? transaction.obligationDueOn
  if (dueOn !== transaction.obligationDueOn) {
    throw new Error('An obligation payment must remain linked to its original due occurrence.')
  }
  if (!existing && (obligation.archived || getObligationProgress(obligation, today).dueOn !== dueOn)) {
    throw new Error('Only the current, active obligation can receive a new payment.')
  }
  const otherPayments = obligation.payments.filter((item) => item.transactionId !== transaction.id)
  if (
    transaction.amountCentavos > obligation.amountCentavos - amountPaidOn(otherPayments, dueOn)
  ) {
    throw new Error('This payment would exceed the amount due for that occurrence.')
  }
  const updatedObligation = {
    ...obligation,
    payments: [
      ...otherPayments,
      { transactionId: transaction.id, dueOn, amountCentavos: transaction.amountCentavos },
    ],
    updatedAt: transaction.updatedAt,
  }
  if (!isFinancialObligation(updatedObligation)) {
    throw new Error('This change would make the bill payment history inconsistent.')
  }
  return updatedObligation
}

export function removeObligationPayment(
  obligation: FinancialObligation,
  transactionId: string,
  updatedAt: string,
): FinancialObligation {
  if (!isFinancialObligation(obligation) || !transactionId || !isTimestamp(updatedAt)) {
    throw new TypeError('The linked obligation payment could not be verified.')
  }
  const updatedObligation = {
    ...obligation,
    payments: obligation.payments.filter((item) => item.transactionId !== transactionId),
    updatedAt,
  }
  if (!isFinancialObligation(updatedObligation)) {
    throw new Error('Remove later bill payments first to preserve the installment history.')
  }
  return updatedObligation
}

export function isDebtSettlementTransaction(
  transaction: LedgerTransaction,
): transaction is LedgerTransaction & {
  debtSettlementId: string
  debtSettlementDueOn: string
  debtSettlementExcludedFromTotals: boolean
} {
  return typeof transaction.debtSettlementId === 'string' &&
    transaction.debtSettlementId.length > 0 &&
    isDateOnly(transaction.debtSettlementDueOn) &&
    typeof transaction.debtSettlementExcludedFromTotals === 'boolean'
}

export function isObligationPaymentTransaction(
  transaction: LedgerTransaction,
): transaction is LedgerTransaction & { obligationId: string; obligationDueOn: string } {
  return transaction.kind === 'expense' &&
    typeof transaction.obligationId === 'string' &&
    transaction.obligationId.length > 0 &&
    isDateOnly(transaction.obligationDueOn)
}

export function validateDebtReferences(
  debt: DebtRecord,
  categories: readonly TransactionCategory[],
): boolean {
  const categoryKind = debt.direction === 'payable' ? 'expense' : 'income'
  return debt.categoryId === undefined ||
    categories.some((category) => category.id === debt.categoryId && category.kind === categoryKind)
}

export function outstandingObligations(debts: readonly DebtRecord[], bills: readonly FinancialObligation[], today: string): number {
  const principal = debts.filter((debt) => !debt.archived && debt.direction === 'payable')
    .map((debt) => getDebtProgress(debt, today).remainingTotalCentavos)
  const scheduled = bills.filter((bill) => !bill.archived).map((bill) => {
    const progress = getObligationProgress(bill, today)
    if (progress.status === 'paid') return 0
    const later = bill.installmentCount === undefined ? 0
      : Math.max(0, bill.installmentCount - progress.installmentsCompleted - 1)
    return sumCentavos([progress.remainingThisOccurrenceCentavos, later * bill.amountCentavos])
  })
  return sumCentavos([...principal, ...scheduled])
}

export function matchesDebtPrincipal(debt: DebtRecord, entry: LedgerTransaction): boolean {
  if (entry.kind === 'adjustment') {
    return entry.walletId === debt.walletId &&
      entry.amountCentavos === (debt.direction === 'payable' ? debt.amountCentavos : -debt.amountCentavos)
  }
  return entry.kind === (debt.direction === 'payable' ? 'expense' : 'income') &&
    entry.amountCentavos === debt.amountCentavos
}
