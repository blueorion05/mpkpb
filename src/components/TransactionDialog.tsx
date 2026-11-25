import { Plus, X } from 'lucide-react'
import { CategoryIconPicker, CategorySymbol } from './IconPicker'
import type { CategoryIcon } from '../domain/categoryIcons'
import { entryLabels, ledgerKind, makeSchedule, quickAddKinds, scheduleEntryKind, validateCompletedDate, type EntryKind, type ScheduledRecord } from '../domain/entry'
import { isRecurrenceFrequency } from '../domain/recurrence'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  isLedgerTransaction,
  type LedgerTransaction,
  type TransactionCategory,
} from '../domain/ledger'
import { formatPHP, parsePesoToCentavos } from '../domain/money'
import type { Wallet } from '../db/database'

interface TransactionDialogProps {
  wallets: readonly Wallet[]
  categories: readonly TransactionCategory[]
  editingTransaction: LedgerTransaction | null
  editingSchedule?: ScheduledRecord
  lastWalletId?: string
  onSchedule: (record: ScheduledRecord) => Promise<void>
  onClose: () => void
  onSave: (transaction: LedgerTransaction) => Promise<void>
  onCategoryIcon: (id: string, icon: CategoryIcon) => Promise<void>
  onCreateCategory: (name: string, kind: 'income' | 'expense', icon?: CategoryIcon) => Promise<TransactionCategory>
}

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function TransactionDialog({
  wallets,
  categories,
  editingTransaction,
  editingSchedule,
  lastWalletId,
  onSchedule,
  onClose,
  onSave,
  onCreateCategory,
  onCategoryIcon,
}: TransactionDialogProps) {
  const defaultWalletId = editingTransaction?.walletId ?? editingSchedule?.walletId ?? wallets.find((wallet) => !wallet.archived && wallet.id === lastWalletId)?.id ?? wallets.find((wallet) => !wallet.archived)?.id ?? ''
  const [entryKind, setEntryKind] = useState<EntryKind>(editingSchedule ? scheduleEntryKind(editingSchedule) : editingTransaction?.kind ?? 'expense')
  const kind = ledgerKind(entryKind)
  const today = localDateInput()
  const [date, setDate] = useState(editingSchedule?.dueOn ?? editingTransaction?.occurredOn ?? today)
  const hasHistory = editingSchedule && (editingSchedule.kind === 'expectedIncome' ? editingSchedule.receipts.length
    : editingSchedule.kind === 'debt' ? editingSchedule.settlements.length : editingSchedule.payments.length)
  const canSchedule = !editingTransaction && kind !== 'transfer' && kind !== 'adjustment'
  const [planOverride, setPlanOverride] = useState<boolean>()
  const [recurrence, setRecurrence] = useState(editingSchedule?.recurrence ?? 'none')
  const isDebt = entryKind === 'payable' || entryKind === 'receivable'
  const planned = canSchedule && (Boolean(editingSchedule) || date > today ||
    (planOverride ?? ['bill', 'payable', 'receivable'].includes(entryKind)))
  const [walletId, setWalletId] = useState(defaultWalletId)
  const [toWalletId, setToWalletId] = useState(() => {
    if (editingTransaction?.toWalletId) return editingTransaction.toWalletId
    return wallets.find((wallet) => wallet.id !== defaultWalletId && !wallet.archived)?.id ?? ''
  })
  const [categoryId, setCategoryId] = useState(editingTransaction?.categoryId ?? editingSchedule?.categoryId ?? '')
  const [adjustmentDirection, setAdjustmentDirection] = useState(
    editingTransaction?.kind === 'adjustment' && editingTransaction.amountCentavos < 0
      ? 'decrease'
      : 'increase',
  )
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryIcon, setNewCategoryIcon] = useState<CategoryIcon>('tag')
  const [categoryIconBusy, setCategoryIconBusy] = useState(false)
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
  const selection = availableCategories.find((category) => category.id === categoryId)
  const selectableWallets = wallets.filter((wallet) =>
    !wallet.archived || wallet.id === editingSchedule?.walletId ||
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
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary',
      )).filter((element) => element.getClientRects().length > 0)
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
      const category = await onCreateCategory(newCategoryName, categoryKind, newCategoryIcon)
      setCategoryId(category.id)
      setNewCategoryName('')
      setNewCategoryIcon('tag')
      setCreatingCategory(false)
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'The category could not be saved.')
    }
  }

  async function changeCategoryIcon(icon: CategoryIcon) {
    setCategoryError('')
    setCategoryIconBusy(true)
    try {
      await onCategoryIcon(categoryId, icon)
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'Hindi na-save ang icon.')
    } finally {
      setCategoryIconBusy(false)
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
      ? parsePesoToCentavos(String(formData.get('fee') || '0'))
      : null
    const description = String(formData.get('description') ?? '').trim()
    const occurredOn = date

    if (amountCentavos === null || amountCentavos === 0) {
      setFormError('Maglagay ng amount na higit sa ₱0.00 at hanggang dalawang decimal.')
      return
    }
    if (kind === 'transfer' && (feeCentavos === null || !toWalletId)) {
      setFormError('Pumili ng ibang wallet at i-check ang transfer fee.')
      return
    }

    const now = new Date().toISOString()
    if (planned) {
      setSaving(true)
      try {
        const confidence = formData.get('confidence')
        await onSchedule(makeSchedule(entryKind, {
          id: crypto.randomUUID(),
          description: description || entryLabels[entryKind],
          amountCentavos, walletId, categoryId: categoryId || undefined,
          dueOn: occurredOn, timestamp: now,
          recurrence,
          installmentAmountCentavos: parsePesoToCentavos(String(formData.get('installmentAmount') ?? '')) ?? undefined,
          confidence: confidence === 'low' || confidence === 'medium' ? confidence : 'high',
        }, editingSchedule))
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Hindi na-save ang schedule.')
        setSaving(false)
      }
      return
    }
    try {
      validateCompletedDate(occurredOn, today)
    } catch (error) {
      setFormError((error as Error).message)
      return
    }
    const transaction: LedgerTransaction = {
      id: editingTransaction?.id ?? crypto.randomUUID(),
      kind,
      occurredOn,
      description: description || entryLabels[entryKind],
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
      setFormError('I-check ang record. Dapat magkaiba ang wallet sa transfer.')
      return
    }

    setSaving(true)
    try {
      await onSave(transaction)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Hindi na-save ang record. Subukan ulit.')
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
            <h2 id="transaction-dialog-title">{editingTransaction || editingSchedule ? 'Edit record' : 'Add record'}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Isara" onClick={onClose} disabled={saving} title="Isara"><X className="ui-icon" aria-hidden="true" /></button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void handleSubmit(event)}>
          {!editingTransaction && !editingSchedule ? (
            <div className="quick-choices" role="group" aria-label="Anong idadagdag?">
              {quickAddKinds.map((choice) => <button key={choice} type="button" className="button button-outline"
                aria-pressed={entryKind === choice} onClick={() => {
                  setEntryKind(choice)
                  setCategoryId('')
                  setCreatingCategory(false)
                  setPlanOverride(undefined)
                  setRecurrence('none')
                  setFormError('')
                }}>{entryLabels[choice]}</button>)}
            </div>
          ) : editingTransaction && !linkedSchedule ? (
            <label className="field">Uri ng record
              <select value={entryKind} onChange={(event) => {
                setEntryKind(event.target.value as EntryKind)
                setCategoryId('')
              }}>
                {(['expense', 'income', 'transfer', 'adjustment'] as const).map((choice) =>
                  <option key={choice} value={choice}>{entryLabels[choice]}</option>)}
              </select>
            </label>
          ) : <p className="field-note">{entryLabels[entryKind]}</p>}
          {Boolean(hasHistory) && <p className="field-note">Naka-lock ang due date at ulit kapag may bayad o receipt na.</p>}
          <label className="field">
            <span>Para saan?</span>
            <input name="description" maxLength={isDebt ? 80 : 120}
              defaultValue={editingTransaction?.description ?? (editingSchedule?.kind === 'debt' ? editingSchedule.name : editingSchedule?.description) ?? ''}
              placeholder="Hal. Sahod, merienda, o kuryente" />
          </label>
          {linkedSchedule && (
            <p className="field-note">
              {linkedSchedule === 'income'
                ? 'Konektado ang receipt sa paparating na pera. Pag dinelete mo ito, babalik sa schedule ang amount.'
                : linkedSchedule === 'debt'
                  ? 'Konektado ito sa utang. Pag dinelete mo ang record, babalik ang amount na kailangan pang bayaran o kolektahin.'
                  : 'Konektado ito sa bayarin. Pag dinelete mo ang record, babalik ang amount na due.'}
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
                  defaultValue={editingTransaction || editingSchedule ? formatPHP((editingTransaction ?? editingSchedule)!.amountCentavos).replace(/[^\d.]/g, '') : ''}
                  placeholder="0.00"
                />
              </span>
            </label>
            <label className="field">
              <span>Date</span>
              <input name="occurredOn" type="date" required disabled={Boolean(hasHistory)} value={date} onChange={(event) => {
                setDate(event.target.value)
                setPlanOverride(undefined)
              }} />
            </label>
          </div>

          {canSchedule && (
            <label className="field">Status
              <select value={planned ? 'upcoming' : 'done'} disabled={Boolean(editingSchedule) || date > today}
                onChange={(event) => setPlanOverride(event.target.value === 'upcoming')}>
                <option value="upcoming">Upcoming</option>
                <option value="done">{kind === 'income' ? 'Nakuha na' : 'Bayad na'}</option>
              </select>
              {planned && <small>Sa forecast muna ito. Magbabago ang wallet kapag ni-record ang aktwal na bayad o receipt.</small>}
            </label>
          )}
          {!canSchedule && date > today && <p className="field-note">Pumili ng petsa ngayong araw o mas maaga para sa record na ito.</p>}

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
            </>
          )}

          {(categoryKind || planned || kind === 'transfer' || (!editingTransaction && !editingSchedule)) && (
            <details className="entry-options">
              <summary>More options</summary>
              <div>
                {!editingTransaction && !editingSchedule && <button className="text-button" type="button"
                  onClick={() => { setEntryKind('adjustment'); setPlanOverride(undefined) }}>{entryLabels.adjustment}</button>}
                {kind === 'transfer' && (
              <label className="field">
                <span>Transfer fee <small>optional</small></span>
                <span className="currency-input">
                  <b>₱</b>
                  <input name="fee" inputMode="decimal" defaultValue={editingTransaction?.feeCentavos !== undefined ? formatPHP(editingTransaction.feeCentavos).replace(/[^\d.]/g, '') : '0.00'} />
                </span>
              </label>
                )}
          {categoryKind && (
            <div className="category-field">
              <label className="field">
                <span>Category <small>optional</small></span>
                <span className="icon-picker"><CategorySymbol icon={selection?.icon} /><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Walang category</option>
                  {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select></span>
              </label>
              <button className="text-button" type="button" onClick={() => setCreatingCategory((current) => !current)}>
                {creatingCategory ? 'Cancel' : <><Plus className="ui-icon" aria-hidden="true" /> Bagong category</>}
              </button>
              {selection && !creatingCategory && <fieldset className="category-icon-edit" disabled={categoryIconBusy}>
                <CategoryIconPicker icon={selection.icon ?? 'tag'} onChange={(icon) => void changeCategoryIcon(icon)} />
              </fieldset>}
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
                  <CategoryIconPicker icon={newCategoryIcon} onChange={setNewCategoryIcon} />
                  <button className="button button-outline" type="button" onClick={() => void handleCategoryCreate()}>
                    I-save ang category
                  </button>
                </div>
              )}
              {categoryError && <p className="form-error" role="alert">{categoryError}</p>}
            </div>
          )}

                {planned && (
                  <label className="field">Ulit
                    <select name="recurrence" disabled={Boolean(hasHistory)} value={recurrence} onChange={(event) => {
                      if (isRecurrenceFrequency(event.target.value)) setRecurrence(event.target.value)
                    }}>
                      <option value="none">Isang beses</option><option value="weekly">Weekly</option>
                      <option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option>
                    </select>
                  </label>
                )}
                {planned && isDebt && recurrence !== 'none' && (
                  <label className="field">Amount kada hulog
                    <input name="installmentAmount" inputMode="decimal" disabled={Boolean(hasHistory)}
                      defaultValue={editingSchedule?.kind === 'debt' && editingSchedule.installmentAmountCentavos
                        ? formatPHP(editingSchedule.installmentAmountCentavos).replace(/[^\d.]/g, '') : ''} />
                  </label>
                )}
                {planned && entryKind === 'income' && (
                  <label className="field">Gaano kasigurado?
                    <select name="confidence" defaultValue={editingSchedule?.kind === 'expectedIncome' ? editingSchedule.confidence : 'high'}>
                      <option value="high">Sigurado</option><option value="medium">Malamang</option><option value="low">Posible</option>
                    </select>
                  </label>
                )}
              </div>
            </details>
          )}

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || !wallets.length}>
              {saving ? 'Sine-save…' : 'I-save ang record'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
