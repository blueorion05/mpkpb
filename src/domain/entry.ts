import type { DebtRecord, FinancialObligation } from './debts.ts'
import type { ExpectedIncome } from './planning.ts'
import { isDateOnly, type RecurrenceFrequency } from './recurrence.ts'
import type { TransactionKind } from './ledger.ts'

export type EntryKind = TransactionKind | 'bill' | 'payable' | 'receivable'
export type ScheduledRecord = ExpectedIncome | FinancialObligation | DebtRecord

export const entryLabels: Record<EntryKind, string> = {
  income: 'Income', expense: 'Gastos', transfer: 'Transfer', bill: 'Bayarin',
  payable: 'Utang ko', receivable: 'May utang sa akin', adjustment: 'Ayusin ang balance',
}

export const quickAddKinds: readonly EntryKind[] = ['expense', 'income', 'transfer', 'payable']

export function ledgerKind(kind: EntryKind): TransactionKind {
  if (kind === 'receivable') return 'income'
  if (kind === 'bill' || kind === 'payable') return 'expense'
  return kind
}

export function scheduleEntryKind(record: ScheduledRecord): EntryKind {
  return record.kind === 'debt' ? record.direction : record.kind === 'obligation' ? 'bill' : 'income'
}

export function makeSchedule(
  kind: EntryKind,
  entry: {
    id: string
    description: string
    amountCentavos: number
    walletId: string
    categoryId?: string
    dueOn: string
    recurrence: RecurrenceFrequency
    confidence: ExpectedIncome['confidence']
    timestamp: string
    notes?: string
    installmentAmountCentavos?: number
  },
  previous?: ScheduledRecord,
): ScheduledRecord {
  if (kind === 'transfer' || kind === 'adjustment') {
    throw new Error('Pumili ng petsa ngayong araw o mas maaga para sa record na ito.')
  }
  const undatedDebt = (kind === 'payable' || kind === 'receivable') && !entry.dueOn
  if (undatedDebt && entry.recurrence !== 'none') throw new Error('Maglagay ng unang due date para sa hulugan.')
  if ((!undatedDebt && !isDateOnly(entry.dueOn)) || !Number.isSafeInteger(entry.amountCentavos) || entry.amountCentavos <= 0) {
    throw new Error('I-check ang petsa at amount bago i-save.')
  }
  // Keep the original recurrence anchor when editing a shortened monthly date.
  const base = {
    id: previous?.id ?? entry.id,
    walletId: entry.walletId,
    notes: entry.notes,
    categoryId: entry.categoryId,
    amountCentavos: entry.amountCentavos,
    dueOn: entry.dueOn,
    recurrence: entry.recurrence,
    monthlyAnchorDay: previous && previous.dueOn === entry.dueOn
      ? previous.monthlyAnchorDay : undatedDebt ? 1 : Number(entry.dueOn.slice(-2)),
    archived: previous?.archived ?? false,
    createdAt: previous?.createdAt ?? entry.timestamp,
    updatedAt: entry.timestamp,
  }
  if (kind === 'income') return {
    ...base, kind: 'expectedIncome', description: entry.description, confidence: entry.confidence,
    receipts: previous?.kind === 'expectedIncome' ? previous.receipts : [],
  }
  if (kind === 'payable' || kind === 'receivable') {
    const debt = previous?.kind === 'debt' ? previous : undefined
    const installment = entry.recurrence === 'none' ? undefined
      : debt?.settlements.length ? debt.installmentAmountCentavos : entry.installmentAmountCentavos
    if (entry.recurrence !== 'none' && (!installment || !Number.isSafeInteger(installment) ||
      installment <= 0 || installment > entry.amountCentavos || Math.ceil(entry.amountCentavos / installment) > 1200)) {
      throw new Error('Ilagay sa More options ang valid na amount kada hulog.')
    }
    return {
      ...base, kind: 'debt', direction: kind, name: entry.description,
      dueOn: undatedDebt ? undefined : entry.dueOn,
      principalTransactionId: debt?.principalTransactionId,
      installmentAmountCentavos: installment,
      installmentCount: debt?.settlements.length ? debt.installmentCount
        : installment ? Math.ceil(entry.amountCentavos / installment) : undefined,
      settlements: debt?.settlements ?? [],
    }
  }
  return {
    ...(previous?.kind === 'obligation' ? previous : undefined),
    ...base, kind: 'obligation', description: entry.description,
    payments: previous?.kind === 'obligation' ? previous.payments : [],
  }
}

export function validateCompletedDate(date: string, today: string) {
  if (!isDateOnly(date) || date > today) {
    throw new Error('Pumili ng petsa ngayong araw o mas maaga para sa perang pumasok o lumabas na.')
  }
}
