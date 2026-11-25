import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  isLedgerTransaction,
  isTransactionKind,
  type LedgerTransaction,
  type TransactionCategory,
  type TransactionKind,
} from '../domain/ledger'
import { formatPHP, parsePesoToCentavos } from '../domain/money'
import type { Wallet } from '../db/database'

interface TransactionDialogProps {
  wallets: readonly Wallet[]
  categories: readonly TransactionCategory[]
  editingTransaction: LedgerTransaction | null
  onClose: () => void
  onSave: (transaction: LedgerTransaction) => Promise<void>
  onCreateCategory: (name: string, kind: 'income' | 'expense') => Promise<TransactionCategory>
}

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function TransactionDialog({
  wallets,
  categories,
  editingTransaction,
  onClose,
  onSave,
  onCreateCategory,
}: TransactionDialogProps) {
  const defaultWalletId = editingTransaction?.walletId ?? wallets.find((wallet) => !wallet.archived)?.id ?? ''
  const [kind, setKind] = useState<TransactionKind>(editingTransaction?.kind ?? 'expense')
  const [walletId, setWalletId] = useState(defaultWalletId)
  const [toWalletId, setToWalletId] = useState(() => {
    if (editingTransaction?.toWalletId) return editingTransaction.toWalletId
    return wallets.find((wallet) => wallet.id !== defaultWalletId && !wallet.archived)?.id ?? ''
  })
  const [categoryId, setCategoryId] = useState(editingTransaction?.categoryId ?? '')
  const [adjustmentDirection, setAdjustmentDirection] = useState(
    editingTransaction?.kind === 'adjustment' && editingTransaction.amountCentavos < 0
      ? 'decrease'
      : 'increase',
  )
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)

  const categoryKind = kind === 'income' || kind === 'expense' ? kind : null
  const linkedSchedule = editingTransaction?.expectedIncomeId
    ? 'income'
    : editingTransaction?.debtSettlementId
      ? 'debt'
      : editingTransaction?.obligationId
        ? 'obligation'
        : undefined
  const availableCategories = categoryKind
    ? categories.filter((category) => category.kind === categoryKind)
    : []
  const selectableWallets = wallets.filter((wallet) =>
    !wallet.archived ||
    (editingTransaction !== null &&
      (wallet.id === editingTransaction.walletId || wallet.id === editingTransaction.toWalletId)),
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      if (focusable.length === 0) return
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
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  async function handleCategoryCreate() {
    if (!categoryKind) return
    setCategoryError('')
    try {
      const category = await onCreateCategory(newCategoryName, categoryKind)
      setCategoryId(category.id)
      setNewCategoryName('')
      setCreatingCategory(false)
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'The category could not be saved.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const formData = new FormData(event.currentTarget)
    const parsedAmount = parsePesoToCentavos(String(formData.get('amount') ?? ''))
    const amountCentavos = parsedAmount === null
      ? null
      : kind === 'adjustment' && adjustmentDirection === 'decrease'
        ? -parsedAmount
        : parsedAmount
    const feeCentavos = kind === 'transfer'
      ? parsePesoToCentavos(String(formData.get('fee') ?? ''))
      : null
    const description = String(formData.get('description') ?? '').trim()
    const occurredOn = String(formData.get('occurredOn') ?? '')

    if (amountCentavos === null || amountCentavos === 0) {
      setFormError('Enter an amount greater than ₱0.00 with no more than two decimal places.')
      return
    }
    if (kind === 'transfer' && (feeCentavos === null || !toWalletId)) {
      setFormError('Choose a destination wallet and enter a valid transfer fee.')
      return
    }

    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: editingTransaction?.id ?? crypto.randomUUID(),
      kind,
      occurredOn,
      description: description || (kind === 'income' ? 'Income' : kind === 'expense' ? 'Expense' : kind === 'transfer' ? 'Wallet transfer' : 'Balance adjustment'),
      amountCentavos,
      walletId,
      createdAt: editingTransaction?.createdAt ?? now,
      updatedAt: now,
      ...(editingTransaction?.expectedIncomeId && editingTransaction.expectedIncomeDueOn
        ? {
            expectedIncomeId: editingTransaction.expectedIncomeId,
            expectedIncomeDueOn: editingTransaction.expectedIncomeDueOn,
          }
        : {}),
      ...(editingTransaction?.debtSettlementId &&
      editingTransaction.debtSettlementDueOn &&
      editingTransaction.debtSettlementExcludedFromTotals !== undefined
        ? {
            debtSettlementId: editingTransaction.debtSettlementId,
            debtSettlementDueOn: editingTransaction.debtSettlementDueOn,
            debtSettlementExcludedFromTotals: editingTransaction.debtSettlementExcludedFromTotals,
          }
        : {}),
      ...(editingTransaction?.obligationId && editingTransaction.obligationDueOn
        ? {
            obligationId: editingTransaction.obligationId,
            obligationDueOn: editingTransaction.obligationDueOn,
          }
        : {}),
      ...(kind === 'transfer'
        ? { toWalletId, feeCentavos: feeCentavos ?? undefined }
        : {}),
      ...(categoryKind && categoryId ? { categoryId } : {}),
    }

    if (!isLedgerTransaction(transaction)) {
      setFormError('Review the transaction details. Transfers must use different wallets.')
      return
    }

    setSaving(true)
    try {
      await onSave(transaction)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The transaction could not be saved.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <section
        ref={dialogRef}
        className="wallet-dialog transaction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{editingTransaction ? 'UPDATE YOUR LEDGER' : 'ADD TO YOUR LEDGER'}</span>
            <h2 id="transaction-dialog-title">{editingTransaction ? 'Edit transaction' : 'New transaction'}</h2>
            <p>Saved privately on this device. Every amount is kept in centavos.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose} disabled={saving}>×</button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>Transaction type</span>
            <select
              name="kind"
              value={kind}
              disabled={Boolean(linkedSchedule)}
              onChange={(event) => {
                if (isTransactionKind(event.target.value)) {
                  setKind(event.target.value)
                  setCategoryId('')
                }
              }}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Balance adjustment</option>
            </select>
          </label>
          {linkedSchedule && (
            <p className="field-note">
              {linkedSchedule === 'income'
                ? 'This receipt is linked to expected income. Its type stays as income; deleting it reopens the expected amount.'
                : linkedSchedule === 'debt'
                  ? 'This entry is linked to a debt settlement. Its type stays fixed; deleting it reopens the settlement amount.'
                  : 'This entry is linked to a bill payment. Its type stays as an expense; deleting it reopens the amount due.'}
            </p>
          )}

          <div className="form-row">
            <label className="field">
              <span>{kind === 'adjustment' ? 'Adjustment amount' : 'Amount'}</span>
              <span className="currency-input">
                <b>₱</b>
                <input
                  autoFocus
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={editingTransaction ? formatPHP(editingTransaction.amountCentavos).replace(/[^\d.]/g, '') : ''}
                  placeholder="0.00"
                />
              </span>
            </label>
            <label className="field">
              <span>Date</span>
              <input name="occurredOn" type="date" max={localDateInput()} required defaultValue={editingTransaction?.occurredOn ?? localDateInput()} />
            </label>
          </div>

          {kind === 'adjustment' && (
            <label className="field">
              <span>Balance change</span>
              <select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value === 'decrease' ? 'decrease' : 'increase')}>
                <option value="increase">Increase wallet balance</option>
                <option value="decrease">Decrease wallet balance</option>
              </select>
            </label>
          )}

          <label className="field">
            <span>{kind === 'transfer' ? 'From wallet' : 'Wallet'}</span>
            <select
              value={walletId}
              onChange={(event) => {
                setWalletId(event.target.value)
                if (event.target.value === toWalletId) {
                  setToWalletId(wallets.find((wallet) => wallet.id !== event.target.value && !wallet.archived)?.id ?? '')
                }
              }}
              required
            >
              {selectableWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}{wallet.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>

          {kind === 'transfer' && (
            <>
              <label className="field">
                <span>To wallet</span>
                <select value={toWalletId} onChange={(event) => setToWalletId(event.target.value)} required>
                  <option value="">Choose a different wallet</option>
                  {selectableWallets.filter((wallet) => wallet.id !== walletId).map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name}{wallet.archived ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Transfer fee <small>optional</small></span>
                <span className="currency-input">
                  <b>₱</b>
                  <input name="fee" inputMode="decimal" defaultValue={editingTransaction?.feeCentavos !== undefined ? formatPHP(editingTransaction.feeCentavos).replace(/[^\d.]/g, '') : '0.00'} />
                </span>
              </label>
            </>
          )}

          {categoryKind && (
            <div className="category-field">
              <label className="field">
                <span>Category <small>optional</small></span>
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Uncategorized</option>
                  {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <button className="text-button" type="button" onClick={() => setCreatingCategory((current) => !current)}>
                {creatingCategory ? 'Cancel' : '+ New category'}
              </button>
              {creatingCategory && (
                <div className="inline-category-form">
                  <label className="field">
                    <span>New {categoryKind} category</span>
                    <input
                      autoFocus
                      maxLength={40}
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      placeholder={categoryKind === 'expense' ? 'e.g. Merienda' : 'e.g. Side hustle'}
                    />
                  </label>
                  <button className="button button-outline" type="button" onClick={() => void handleCategoryCreate()}>
                    Save category
                  </button>
                </div>
              )}
              {categoryError && <p className="form-error" role="alert">{categoryError}</p>}
            </div>
          )}

          <label className="field">
            <span>Description <small>optional</small></span>
            <input name="description" maxLength={120} defaultValue={editingTransaction?.description ?? ''} placeholder="What was this for?" />
          </label>

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || !wallets.length}>
              {saving ? 'Saving…' : editingTransaction ? 'Save changes' : 'Save transaction'}
            </button>
          </div>
          <p className="form-privacy">⌑ All financial data stays on this device.</p>
        </form>
      </section>
    </div>
  )
}
