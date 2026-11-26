import { Plus, X } from 'lucide-react'
import Mascot from './Mascot'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  getDebtProgress,
  getObligationProgress,
  isDebtRecord,
  isFinancialObligation,
  type DebtRecord,
  type FinancialObligation,
} from '../domain/debts'
import type { LedgerTransaction, TransactionCategory } from '../domain/ledger'
import { formatPHP, parsePesoToCentavos } from '../domain/money'
import { isRecurrenceFrequency, type RecurrenceFrequency } from '../domain/recurrence'
import type { Wallet } from '../db/database'
import './DebtsPage.css'

interface DebtsPageProps {
  wallets: readonly Wallet[]
  transactions: readonly LedgerTransaction[]
  categories: readonly TransactionCategory[]
  debts: readonly DebtRecord[]
  obligations: readonly FinancialObligation[]
  onSaveDebt: (debt: DebtRecord) => Promise<void>
  onArchiveDebt: (debt: DebtRecord) => Promise<void>
  onSaveObligation: (obligation: FinancialObligation) => Promise<void>
  onArchiveObligation: (obligation: FinancialObligation) => Promise<void>
  onSettleDebt: (debt: DebtRecord, amountCentavos: number, dueOn: string) => Promise<void>
  onPayObligation: (
    obligation: FinancialObligation,
    amountCentavos: number,
    dueOn: string,
  ) => Promise<void>
}

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

const recurrenceLabels: Record<RecurrenceFrequency, string> = {
  none: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

function todayDateOnly(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function displayDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function amountInputValue(amount: number): string {
  return formatPHP(amount).replace(/[^\d.]/g, '')
}

function displayAmountInput(raw: FormDataEntryValue | null): number | null {
  return parsePesoToCentavos(String(raw ?? ''))
}

function useDialogKeyboard(onClose: () => void, locked: boolean) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    const initialFocus = dialog.querySelector<HTMLElement>('[autofocus]') ?? focusable[0]
    initialFocus?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !locked) {
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [locked])
  return dialogRef
}

export default function DebtsPage({
  wallets,
  transactions,
  categories,
  debts,
  obligations,
  onSaveDebt,
  onArchiveDebt,
  onSaveObligation,
  onArchiveObligation,
  onSettleDebt,
  onPayObligation,
}: DebtsPageProps) {
  const [activeTab, setActiveTab] = useState<'debts' | 'bills'>('debts')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editingDebt, setEditingDebt] = useState<DebtRecord | null | undefined>(undefined)
  const [editingObligation, setEditingObligation] = useState<FinancialObligation | null | undefined>(undefined)
  const [paymentTarget, setPaymentTarget] = useState<
    | { kind: 'debt'; item: DebtRecord; dueOn: string; remaining: number }
    | { kind: 'bill'; item: FinancialObligation; dueOn: string; remaining: number }
    | null
  >(null)
  const [pageError, setPageError] = useState('')

  const activeWallets = wallets.filter((wallet) => !wallet.archived)
  const visibleDebts = debts
    .filter((debt) => includeArchived || !debt.archived)
    .sort((left, right) => left.dueOn.localeCompare(right.dueOn))
  const visibleObligations = obligations
    .filter((obligation) => includeArchived || !obligation.archived)
    .sort((left, right) => left.dueOn.localeCompare(right.dueOn))
  const eligibleTransactions = useMemo(
    () => transactions.filter((entry) =>
      !entry.expectedIncomeId &&
      !entry.debtSettlementId &&
      !entry.obligationId,
    ),
    [transactions],
  )

  async function saveDebt(debt: DebtRecord) {
    try {
      await onSaveDebt(debt)
      setEditingDebt(undefined)
      setPageError('')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The debt could not be saved.')
      throw error
    }
  }

  async function saveObligation(obligation: FinancialObligation) {
    try {
      await onSaveObligation(obligation)
      setEditingObligation(undefined)
      setPageError('')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The bill could not be saved.')
      throw error
    }
  }

  const debtCategories = categories.filter((category) => category.kind === 'expense' || category.kind === 'income')
  const expenseCategories = categories.filter((category) => category.kind === 'expense')

  return (
    <>
      <div className="page-heading debts-heading">
        <div>

          <h1>Mga utang at bayarin</h1>
          <p>Track what is owed and what is coming up. Only recorded payments change wallet balances.</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => activeTab === 'debts' ? setEditingDebt(null) : setEditingObligation(null)}
          disabled={activeWallets.length === 0}
        >
          <Plus className="ui-icon" aria-hidden="true" /> {activeTab === 'debts' ? 'Add debt' : 'Add bill'}
        </button>
      </div>
      <div className="plans-toolbar">
        <div className="plans-tabs" role="tablist" aria-label="Debt and bill sections">
          <button
            id="debts-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'debts'}
            aria-controls="debts-panel"
            className={activeTab === 'debts' ? 'selected' : ''}
            onClick={() => setActiveTab('debts')}
          >Debt balances</button>
          <button
            id="bills-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'bills'}
            aria-controls="bills-panel"
            className={activeTab === 'bills' ? 'selected' : ''}
            onClick={() => setActiveTab('bills')}
          >Mga babayaran</button>
        </div>
        <label className="archive-toggle">
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
          <span>Show archived</span>
        </label>
      </div>
      {pageError && (
        <div className="error-banner" role="alert">
          <span>{pageError}</span>
          <button className="text-button" type="button" onClick={() => setPageError('')}>Isara</button>
        </div>
      )}
      {activeTab === 'debts' ? (
        <section id="debts-panel" role="tabpanel" aria-labelledby="debts-tab" className="plans-list debts-list">
          {visibleDebts.length === 0 ? (
            <div className="panel plans-empty">
              <Mascot className="mascot-empty" />
              <h2>{includeArchived ? 'No archived debts' : 'Wala pang utang'}</h2>
              <p>Add money you owe or money owed to you, and keep every partial settlement in view.</p>
              {!includeArchived && <button className="button button-primary" type="button" onClick={() => setEditingDebt(null)}><Plus className="ui-icon" aria-hidden="true" /> Add a debt</button>}
            </div>
          ) : visibleDebts.map((debt) => {
            const progress = getDebtProgress(debt, todayDateOnly())
            const directionLabel = debt.direction === 'payable' ? 'I owe' : 'Owed to me'
            const category = debtCategories.find((item) => item.id === debt.categoryId)
            const wallet = wallets.find((item) => item.id === debt.walletId)
            const existingPrincipal = debt.principalTransactionId
              ? transactions.find((item) => item.id === debt.principalTransactionId)
              : undefined
            return (
              <article className={`panel debt-card${debt.archived ? ' plan-archived' : ''}`} key={debt.id}>
                <div className="debt-card-heading">
                  <div>
                    <span className={`debt-direction debt-${debt.direction}`}>{directionLabel}</span>
                    <h2>{debt.name}</h2>
                    <p>{recurrenceLabels[debt.recurrence]} · Due {displayDate(progress.dueOn)}</p>
                  </div>
                  <div className="debt-card-actions">
                    {!debt.archived && <button className="wallet-action" type="button" onClick={() => setEditingDebt(debt)}>Edit</button>}
                    {!debt.archived && progress.remainingThisOccurrenceCentavos > 0 && (
                      <button
                        className="wallet-action"
                        type="button"
                        onClick={() => setPaymentTarget({
                          kind: 'debt',
                          item: debt,
                          dueOn: progress.dueOn,
                          remaining: Math.min(progress.remainingThisOccurrenceCentavos, progress.remainingTotalCentavos),
                        })}
                      >Record {debt.direction === 'payable' ? 'payment' : 'collection'}</button>
                    )}
                    {!debt.archived && <button className="wallet-action archive-action" type="button" onClick={() => void onArchiveDebt(debt).catch((error: unknown) => setPageError(error instanceof Error ? error.message : 'The debt could not be archived.'))}>Archive</button>}
                  </div>
                </div>
                <div className="debt-overview">
                  <span><small>REMAINING TOTAL</small><strong>{formatPHP(progress.remainingTotalCentavos)}</strong></span>
                  <span><small>DUE THIS OCCURRENCE</small><strong>{formatPHP(progress.remainingThisOccurrenceCentavos)}</strong></span>
                  <span><small>STATUS</small><strong className={`debt-status status-${progress.status}`}>{progress.status}</strong></span>
                </div>
                <div className="debt-meta">
                  <span>{wallet?.name ?? 'Unknown wallet'}</span>
                  {category && <span>{category.name}</span>}
                  {existingPrincipal && (
                    <span title="The original transaction is already counted in ledger totals">
                      Original recorded: {existingPrincipal.description}
                    </span>
                  )}
                  {debt.installmentAmountCentavos && debt.installmentCount && (
                    <span>{progress.installmentsCompleted} of {debt.installmentCount} installments</span>
                  )}
                </div>
                {debt.settlements.length > 0 && (
                  <ul className="debt-history" aria-label={`${debt.name} settlement history`}>
                    {[...debt.settlements].sort((a, b) => b.dueOn.localeCompare(a.dueOn)).map((settlement) => {
                      const transaction = transactions.find((entry) => entry.id === settlement.transactionId)
                      return (
                        <li key={settlement.transactionId}>
                          <span>{displayDate(settlement.dueOn)} · {transaction?.description ?? 'Settlement'}</span>
                          <strong>{formatPHP(settlement.amountCentavos)}</strong>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })}
        </section>
      ) : (
        <section id="bills-panel" role="tabpanel" aria-labelledby="bills-tab" className="plans-list debts-list">
          {visibleObligations.length === 0 ? (
            <div className="panel plans-empty">
              <Mascot className="mascot-empty" />
              <h2>{includeArchived ? 'No archived bills' : 'Wala pang naka-schedule na bayarin'}</h2>
              <p>Add an upcoming bill or expense to track its due date and partial payments.</p>
              {!includeArchived && <button className="button button-primary" type="button" onClick={() => setEditingObligation(null)}><Plus className="ui-icon" aria-hidden="true" /> Add a bill</button>}
            </div>
          ) : visibleObligations.map((obligation) => {
            const progress = getObligationProgress(obligation, todayDateOnly())
            const wallet = wallets.find((item) => item.id === obligation.walletId)
            const category = expenseCategories.find((item) => item.id === obligation.categoryId)
            return (
              <article className={`panel debt-card${obligation.archived ? ' plan-archived' : ''}`} key={obligation.id}>
                <div className="debt-card-heading">
                  <div>
                    <span className="debt-direction debt-bill">{recurrenceLabels[obligation.recurrence]} bill</span>
                    <h2>{obligation.description}</h2>
                    <p>Due {displayDate(progress.dueOn)}</p>
                  </div>
                  <div className="debt-card-actions">
                    {!obligation.archived && <button className="wallet-action" type="button" onClick={() => setEditingObligation(obligation)}>Edit</button>}
                    {!obligation.archived && progress.remainingThisOccurrenceCentavos > 0 && (
                      <button
                        className="wallet-action"
                        type="button"
                        onClick={() => setPaymentTarget({
                          kind: 'bill',
                          item: obligation,
                          dueOn: progress.dueOn,
                          remaining: progress.remainingThisOccurrenceCentavos,
                        })}
                      >Bayad na</button>
                    )}
                    {!obligation.archived && <button className="wallet-action archive-action" type="button" onClick={() => void onArchiveObligation(obligation).catch((error: unknown) => setPageError(error instanceof Error ? error.message : 'The bill could not be archived.'))}>Archive</button>}
                  </div>
                </div>
                <div className="debt-overview">
                  <span><small>AMOUNT DUE</small><strong>{formatPHP(progress.remainingThisOccurrenceCentavos)}</strong></span>
                  <span><small>STATUS</small><strong className={`debt-status status-${progress.status}`}>{progress.status}</strong></span>
                  {obligation.installmentCount && <span><small>INSTALLMENTS</small><strong>{progress.installmentsCompleted} of {obligation.installmentCount}</strong></span>}
                </div>
                <div className="debt-meta">
                  <span>{wallet?.name ?? 'Unknown wallet'}</span>
                  {category && <span>{category.name}</span>}
                </div>
                {obligation.payments.length > 0 && (
                  <ul className="debt-history" aria-label={`${obligation.description} payment history`}>
                    {[...obligation.payments].sort((a, b) => b.dueOn.localeCompare(a.dueOn)).map((payment) => {
                      const transaction = transactions.find((entry) => entry.id === payment.transactionId)
                      return (
                        <li key={payment.transactionId}>
                          <span>{displayDate(payment.dueOn)} · {transaction?.description ?? 'Payment'}</span>
                          <strong>{formatPHP(payment.amountCentavos)}</strong>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })}
        </section>
      )}
      {editingDebt !== undefined && (
        <DebtDialog
          debt={editingDebt}
          wallets={wallets}
          categories={categories}
          transactions={eligibleTransactions}
          onClose={() => setEditingDebt(undefined)}
          onSave={saveDebt}
        />
      )}
      {editingObligation !== undefined && (
        <ObligationDialog
          obligation={editingObligation}
          wallets={wallets}
          categories={expenseCategories}
          onClose={() => setEditingObligation(undefined)}
          onSave={saveObligation}
        />
      )}
      {paymentTarget && (
        <PaymentDialog
          target={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSave={async (amountCentavos) => {
            if (!paymentTarget) return
            if (paymentTarget.kind === 'debt') {
              await onSettleDebt(paymentTarget.item, amountCentavos, paymentTarget.dueOn)
            } else {
              await onPayObligation(paymentTarget.item, amountCentavos, paymentTarget.dueOn)
            }
            setPaymentTarget(null)
            setPageError('')
          }}
        />
      )}
    </>
  )
}

interface DebtDialogProps {
  debt: DebtRecord | null
  wallets: readonly Wallet[]
  categories: readonly TransactionCategory[]
  transactions: readonly LedgerTransaction[]
  onClose: () => void
  onSave: (debt: DebtRecord) => Promise<void>
}

function DebtDialog({ debt, wallets, categories, transactions, onClose, onSave }: DebtDialogProps) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(debt?.recurrence ?? 'none')
  const [direction, setDirection] = useState<DebtRecord['direction']>(debt?.direction ?? 'payable')
  const hasSettlements = Boolean(debt?.settlements.length)
  const dialogRef = useDialogKeyboard(onClose, saving)
  const selectableCategories = categories.filter((category) => category.kind === (direction === 'payable' ? 'expense' : 'income'))
  const recordedMovement = transactions.find((entry) => entry.id === debt?.principalTransactionId && entry.kind === 'adjustment')
  const matchingTransactions = transactions.filter((entry) =>
    entry.id === recordedMovement?.id || entry.kind === (direction === 'payable' ? 'expense' : 'income'),
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const amountCentavos = displayAmountInput(form.get('amount'))
    const installmentAmountCentavos = recurrence === 'none'
      ? undefined
      : displayAmountInput(form.get('installmentAmount'))
    const dueOn = String(form.get('dueOn') ?? '')
    const name = String(form.get('name') ?? '').trim()
    if (!amountCentavos || (recurrence !== 'none' && !installmentAmountCentavos)) {
      setError('Enter a valid debt amount and installment amount.')
      return
    }
    const now = new Date().toISOString()
    const selectedPrincipal = recordedMovement?.id ?? String(form.get('principalTransactionId') ?? '')
    const debtRecord: DebtRecord = {
      id: debt?.id ?? crypto.randomUUID(),
      kind: 'debt',
      notes: debt?.notes,
      name,
      direction,
      amountCentavos,
      walletId: String(form.get('walletId') ?? ''),
      dueOn: hasSettlements && debt ? debt.dueOn : dueOn,
      recurrence: hasSettlements && debt ? debt.recurrence : recurrence,
      monthlyAnchorDay: hasSettlements && debt ? debt.monthlyAnchorDay : Number(dueOn.slice(-2)),
      ...(selectableCategories.some((category) => category.id === String(form.get('categoryId') ?? ''))
        ? { categoryId: String(form.get('categoryId')) }
        : {}),
      ...(recurrence !== 'none' && installmentAmountCentavos
        ? {
            installmentAmountCentavos: hasSettlements && debt
              ? debt.installmentAmountCentavos
              : installmentAmountCentavos,
            installmentCount: hasSettlements && debt
              ? debt.installmentCount
              : Math.ceil(amountCentavos / installmentAmountCentavos),
          }
        : {}),
      ...(selectedPrincipal ? { principalTransactionId: selectedPrincipal } : {}),
      settlements: debt?.settlements ?? [],
      archived: false,
      createdAt: debt?.createdAt ?? now,
      updatedAt: now,
    }
    if (!isDebtRecord(debtRecord)) {
      setError('Review the amount, due date, recurrence, and installment details.')
      return
    }
    setSaving(true)
    try {
      await onSave(debtRecord)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The debt could not be saved.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="wallet-dialog planning-dialog" role="dialog" aria-modal="true" aria-labelledby="debt-dialog-title">
        <div className="dialog-heading">
          <div><span className="eyebrow">{debt ? 'UPDATE A DEBT' : 'TRACK A DEBT'}</span><h2 id="debt-dialog-title">{debt ? 'Edit utang' : 'Add utang'}</h2><p>Magbabago lang ang wallet kapag ni-record mo ang aktwal na bayad.</p></div>
          <button className="icon-button" type="button" aria-label="Isara" disabled={saving} onClick={onClose} title="Isara"><X className="ui-icon" aria-hidden="true" /></button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Debt type</span><select name="direction" value={direction} onChange={(event) => setDirection(event.target.value === 'receivable' ? 'receivable' : 'payable')} disabled={hasSettlements}><option value="payable">Money I owe</option><option value="receivable">Money owed to me</option></select></label>
          <label className="field"><span>Description</span><input autoFocus name="name" required maxLength={80} defaultValue={debt?.name ?? ''} placeholder="e.g. Laptop financing" /></label>
          <div className="form-row">
            <label className="field"><span>Total amount</span><span className="currency-input"><b>₱</b><input name="amount" inputMode="decimal" required defaultValue={debt ? amountInputValue(debt.amountCentavos) : ''} placeholder="0.00" /></span></label>
            <label className="field"><span>Unang due date</span><input name="dueOn" type="date" required defaultValue={debt?.dueOn ?? todayDateOnly()} disabled={hasSettlements} /></label>
          </div>
          <div className="form-row">
            <label className="field"><span>Wallet</span><select name="walletId" required defaultValue={debt?.walletId ?? wallets[0]?.id ?? ''}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label>
            <label className="field"><span>Category <small>optional</small></span><select name="categoryId" defaultValue={debt?.categoryId ?? ''}><option value="">Walang category</option>{selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          </div>
          <label className="field"><span>Repeats</span><select value={recurrence} disabled={hasSettlements} onChange={(event) => { if (isRecurrenceFrequency(event.target.value)) setRecurrence(event.target.value) }}>{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {recurrence !== 'none' && <label className="field"><span>Amount per installment</span><span className="currency-input"><b>₱</b><input name="installmentAmount" inputMode="decimal" required defaultValue={debt?.installmentAmountCentavos ? amountInputValue(debt.installmentAmountCentavos) : ''} placeholder="0.00" disabled={hasSettlements} /></span></label>}
          {hasSettlements && <p className="field-note">The due date, recurrence, and installment structure are locked once settlement history exists.</p>}
          <label className="field">
            <span>Original transaction <small>optional</small></span>
            <select name="principalTransactionId" defaultValue={debt?.principalTransactionId ?? ''} disabled={hasSettlements || Boolean(recordedMovement)}>
              <option value="">Not recorded yet</option>
              {matchingTransactions.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {formatPHP(entry.amountCentavos)} · {displayDate(entry.occurredOn)}</option>)}
            </select>
          </label>
          <p className="field-note">Link a purchase or income already in your ledger to avoid counting its later repayments twice.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button className="button button-outline" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : debt ? 'Save debt' : 'Add debt'}</button></div>
        </form>
      </section>
    </div>
  )
}

interface ObligationDialogProps {
  obligation: FinancialObligation | null
  wallets: readonly Wallet[]
  categories: readonly TransactionCategory[]
  onClose: () => void
  onSave: (obligation: FinancialObligation) => Promise<void>
}

function ObligationDialog({ obligation, wallets, categories, onClose, onSave }: ObligationDialogProps) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(obligation?.recurrence ?? 'none')
  const hasPayments = Boolean(obligation?.payments.length)
  const dialogRef = useDialogKeyboard(onClose, saving)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const amountCentavos = displayAmountInput(form.get('amount'))
    const installmentCountValue = String(form.get('installmentCount') ?? '')
    const installmentCount = installmentCountValue ? Number(installmentCountValue) : undefined
    const dueOn = String(form.get('dueOn') ?? '')
    const now = new Date().toISOString()
    if (!amountCentavos) {
      setError('Enter a valid bill amount.')
      return
    }
    const bill: FinancialObligation = {
      id: obligation?.id ?? crypto.randomUUID(),
      kind: 'obligation',
      notes: obligation?.notes,
      description: String(form.get('description') ?? '').trim(),
      amountCentavos,
      walletId: String(form.get('walletId') ?? ''),
      ...(categories.some((category) => category.id === String(form.get('categoryId') ?? ''))
        ? { categoryId: String(form.get('categoryId')) }
        : {}),
      dueOn: hasPayments && obligation ? obligation.dueOn : dueOn,
      recurrence: hasPayments && obligation ? obligation.recurrence : recurrence,
      monthlyAnchorDay: hasPayments && obligation ? obligation.monthlyAnchorDay : Number(dueOn.slice(-2)),
      ...(installmentCount && recurrence !== 'none'
        ? { installmentCount: hasPayments && obligation ? obligation.installmentCount : installmentCount }
        : {}),
      payments: obligation?.payments ?? [],
      archived: false,
      createdAt: obligation?.createdAt ?? now,
      updatedAt: now,
    }
    if (!isFinancialObligation(bill)) {
      setError('Review the amount, due date, and recurrence details.')
      return
    }
    setSaving(true)
    try {
      await onSave(bill)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The bill could not be saved.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="wallet-dialog planning-dialog" role="dialog" aria-modal="true" aria-labelledby="bill-dialog-title">
        <div className="dialog-heading">
          <div><span className="eyebrow">{obligation ? 'UPDATE A BILL' : 'PLAN A PAYMENT'}</span><h2 id="bill-dialog-title">{obligation ? 'Edit bayarin' : 'I-schedule ang bayarin'}</h2><p>Sa forecast muna ang bayarin hanggang ma-record ang bayad.</p></div>
          <button className="icon-button" type="button" aria-label="Isara" disabled={saving} onClick={onClose} title="Isara"><X className="ui-icon" aria-hidden="true" /></button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Description</span><input autoFocus name="description" required maxLength={120} defaultValue={obligation?.description ?? ''} placeholder="e.g. Electricity" /></label>
          <div className="form-row">
            <label className="field"><span>Amount per occurrence</span><span className="currency-input"><b>₱</b><input name="amount" inputMode="decimal" required defaultValue={obligation ? amountInputValue(obligation.amountCentavos) : ''} placeholder="0.00" /></span></label>
            <label className="field"><span>Unang due date</span><input name="dueOn" type="date" required defaultValue={obligation?.dueOn ?? todayDateOnly()} disabled={hasPayments} /></label>
          </div>
          <div className="form-row">
            <label className="field"><span>Wallet</span><select name="walletId" required defaultValue={obligation?.walletId ?? wallets[0]?.id ?? ''}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label>
            <label className="field"><span>Expense category <small>optional</small></span><select name="categoryId" defaultValue={obligation?.categoryId ?? ''}><option value="">Walang category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          </div>
          <label className="field"><span>Repeats</span><select value={recurrence} disabled={hasPayments} onChange={(event) => { if (isRecurrenceFrequency(event.target.value)) setRecurrence(event.target.value) }}>{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {recurrence !== 'none' && (
            <label className="field"><span>Installment count <small>optional; leave blank for ongoing</small></span><input name="installmentCount" type="number" min="1" max="1200" defaultValue={obligation?.installmentCount ?? ''} disabled={hasPayments} /></label>
          )}
          {hasPayments && <p className="field-note">The due date and recurrence are locked after a payment is recorded.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button className="button button-outline" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : obligation ? 'Save bill' : 'Add bill'}</button></div>
        </form>
      </section>
    </div>
  )
}

interface PaymentDialogProps {
  target:
    | { kind: 'debt'; item: DebtRecord; dueOn: string; remaining: number }
    | { kind: 'bill'; item: FinancialObligation; dueOn: string; remaining: number }
  onClose: () => void
  onSave: (amountCentavos: number) => Promise<void>
}

function PaymentDialog({ target, onClose, onSave }: PaymentDialogProps) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const dialogRef = useDialogKeyboard(onClose, saving)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = displayAmountInput(new FormData(event.currentTarget).get('amount'))
    if (!amount || amount > target.remaining) {
      setError(`Enter an amount up to ${formatPHP(target.remaining)}.`)
      return
    }
    setSaving(true)
    try {
      await onSave(amount)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The payment could not be recorded.')
      setSaving(false)
    }
  }
  const title = target.kind === 'debt'
    ? target.item.direction === 'payable' ? 'Record debt payment' : 'Nakuha na'
    : 'Record bill payment'
  const description = target.kind === 'debt' ? target.item.name : target.item.description
  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="wallet-dialog planning-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
        <div className="dialog-heading">
          <div><h2 id="payment-dialog-title">{title}</h2><p>{description} · Due {displayDate(target.dueOn)}</p></div>
          <button className="icon-button" type="button" aria-label="Isara" disabled={saving} onClick={onClose} title="Isara"><X className="ui-icon" aria-hidden="true" /></button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void submit(event)}>
          <div className="receipt-remaining"><span>Still due</span><strong>{formatPHP(target.remaining)}</strong></div>
          <label className="field"><span>{target.kind === 'debt' ? target.item.direction === 'payable' ? 'Payment amount' : 'Collection amount' : 'Payment amount'}</span><span className="currency-input"><b>₱</b><input autoFocus name="amount" inputMode="decimal" required defaultValue={amountInputValue(target.remaining)} /></span></label>
          <p className="field-note">This creates an {target.kind === 'debt' && target.item.direction === 'receivable' ? 'income' : 'expense'} transaction in your local ledger. Partial amounts are allowed.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button className="button button-outline" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Bayad na'}</button></div>
        </form>
      </section>
    </div>
  )
}
