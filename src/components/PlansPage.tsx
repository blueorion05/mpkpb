import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  calculateBudgetProgress,
  getExpectedIncomeProgress,
  isBudgetPlan,
  isExpectedIncome,
  type BudgetPlan,
  type ExpectedIncome,
  type IncomeConfidence,
  type IncomeRecurrence,
} from '../domain/planning'
import type { LedgerTransaction, TransactionCategory } from '../domain/ledger'
import DebtsPage from './DebtsPage'
import type { DebtRecord, FinancialObligation } from '../domain/debts'
import { formatPHP, parsePesoToCentavos } from '../domain/money'
import type { Wallet } from '../db/database'
import './PlansPage.css'

interface PlansPageProps {
  wallets: readonly Wallet[]
  transactions: readonly LedgerTransaction[]
  categories: readonly TransactionCategory[]
  budgetPlans: readonly BudgetPlan[]
  expectedIncomes: readonly ExpectedIncome[]
  debts: readonly DebtRecord[]
  obligations: readonly FinancialObligation[]
  loading: boolean
  dataUnavailable: boolean
  onSaveBudget: (plan: BudgetPlan) => Promise<void>
  onArchiveBudget: (plan: BudgetPlan) => Promise<void>
  onDuplicateBudget: (plan: BudgetPlan) => Promise<void>
  onSaveExpectedIncome: (expected: ExpectedIncome) => Promise<void>
  onArchiveExpectedIncome: (expected: ExpectedIncome) => Promise<void>
  onCreateCategory: (name: string, kind: 'income' | 'expense') => Promise<TransactionCategory>
  onReceiveIncome: (expected: ExpectedIncome, amountCentavos: number, dueOn: string) => Promise<void>
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

const recurrenceLabels: Record<IncomeRecurrence, string> = {
  none: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

const confidenceLabels: Record<IncomeConfidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
}

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthRange(): { startOn: string; endOn: string } {
  const date = new Date()
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const toDateInput = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return { startOn: toDateInput(first), endOn: toDateInput(last) }
}

function displayDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

function amountInputValue(amount: number): string {
  return formatPHP(amount).replace(/[^\d.]/g, '')
}

function useDialogKeyboard(onClose: () => void, locked = false) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

function PlansPage({
  wallets,
  transactions,
  categories,
  budgetPlans,
  expectedIncomes,
  debts,
  obligations,
  loading,
  dataUnavailable,
  onSaveBudget,
  onArchiveBudget,
  onDuplicateBudget,
  onSaveExpectedIncome,
  onArchiveExpectedIncome,
  onCreateCategory,
  onReceiveIncome,
  onSaveDebt,
  onArchiveDebt,
  onSaveObligation,
  onArchiveObligation,
  onSettleDebt,
  onPayObligation,
}: PlansPageProps) {
  const [activeTab, setActiveTab] = useState<'budgets' | 'income' | 'debts'>('budgets')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetPlan | null | undefined>(undefined)
  const [editingIncome, setEditingIncome] = useState<ExpectedIncome | null | undefined>(undefined)
  const [receivingIncome, setReceivingIncome] = useState<ExpectedIncome | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<
    { type: 'budget'; value: BudgetPlan } | { type: 'income'; value: ExpectedIncome } | null
  >(null)
  const [pageError, setPageError] = useState('')
  const archiveDialogRef = useDialogKeyboard(() => setArchiveTarget(null))

  const expenseCategories = categories.filter((category) => category.kind === 'expense')
  const incomeCategories = categories.filter((category) => category.kind === 'income')
  const visibleBudgets = budgetPlans
    .filter((plan) => includeArchived || !plan.archived)
    .sort((left, right) => right.startOn.localeCompare(left.startOn))
  const visibleIncomes = expectedIncomes
    .filter((income) => includeArchived || !income.archived)
    .sort((left, right) => left.dueOn.localeCompare(right.dueOn))

  async function saveBudget(plan: BudgetPlan) {
    try {
      await onSaveBudget(plan)
      setEditingBudget(undefined)
      setPageError('')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The budget could not be saved.')
      throw error
    }
  }

  async function saveIncome(expected: ExpectedIncome) {
    try {
      await onSaveExpectedIncome(expected)
      setEditingIncome(undefined)
      setPageError('')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Expected income could not be saved.')
      throw error
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    try {
      if (archiveTarget.type === 'budget') await onArchiveBudget(archiveTarget.value)
      else await onArchiveExpectedIncome(archiveTarget.value)
      setArchiveTarget(null)
      setPageError('')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The item could not be archived.')
    }
  }

  async function duplicateBudget(plan: BudgetPlan) {
    try {
      await onDuplicateBudget(plan)
      setPageError('')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The budget could not be duplicated.')
    }
  }

  const budgetCards = useMemo(() => {
    return visibleBudgets.map((plan) => {
      try {
        return { plan, progress: calculateBudgetProgress(plan, categories, transactions, localDateInput()), error: '' }
      } catch (error) {
        return {
          plan,
          progress: null,
          error: error instanceof Error ? error.message : 'Budget progress could not be calculated.',
        }
      }
    })
  }, [visibleBudgets, categories, transactions])

  return (
    <>
      <div className="page-heading plans-heading">
        <div>

          <h1>Budget at schedule</h1>
          <p>Give every plan a date range. Actual balances only change when money is posted.</p>
        </div>
        {activeTab !== 'debts' && (
          <button
            className="button button-primary"
            type="button"
            onClick={() => activeTab === 'budgets' ? setEditingBudget(null) : setEditingIncome(null)}
          >
            ＋ {activeTab === 'budgets' ? 'New budget' : 'Schedule income'}
          </button>
        )}
      </div>

      <div className="plans-tabs" role="tablist" aria-label="Planning tools">
        <button
          id="budgets-tab"
          role="tab"
          aria-selected={activeTab === 'budgets'}
          aria-controls="budgets-panel"
          className={activeTab === 'budgets' ? 'selected' : ''}
          type="button"
          onClick={() => setActiveTab('budgets')}
        >Budget plans</button>
        <button
          id="income-tab"
          role="tab"
          aria-selected={activeTab === 'income'}
          aria-controls="income-panel"
          className={activeTab === 'income' ? 'selected' : ''}
          type="button"
          onClick={() => setActiveTab('income')}
        >Paparating na pera</button>
        <button
          id="plans-debts-tab"
          role="tab"
          aria-selected={activeTab === 'debts'}
          aria-controls="plans-debts-panel"
          className={activeTab === 'debts' ? 'selected' : ''}
          type="button"
          onClick={() => setActiveTab('debts')}
        >Mga utang at bayarin</button>
        {activeTab !== 'debts' && (
          <label className="plans-archived-toggle">
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            Include archived
          </label>
        )}
      </div>

      {pageError && <div className="error-banner" role="alert">{pageError}</div>}
      {dataUnavailable ? (
        <div className="empty-page plans-empty">
          <h2>Hindi mabasa ang budget at schedule</h2>
          <p>Saved planning data could not be verified. Your wallet and transaction records were not changed.</p>
        </div>
      ) : loading ? (
        <p className="loading-state">Getting your plans together…</p>
      ) : activeTab === 'budgets' ? (
        <section id="budgets-panel" role="tabpanel" aria-labelledby="budgets-tab" className="plans-list">
          {budgetCards.length === 0 ? (
            <div className="empty-page plans-empty">
              <span className="empty-icon" aria-hidden="true">▤</span>
              <h2>{includeArchived ? 'No budget plans yet' : 'Wala pang budget plan'}</h2>
              <p>Create a plan for a custom date range, then set limits for the expense categories you want to track.</p>
              <button className="button button-primary" type="button" onClick={() => setEditingBudget(null)}>＋ Create a budget</button>
            </div>
          ) : budgetCards.map(({ plan, progress, error }) => (
            <article className={`panel plan-card${plan.archived ? ' plan-archived' : ''}`} key={plan.id}>
              <div className="plan-card-heading">
                <div>
                  <span className="eyebrow">{progress?.status ?? 'PLAN' }{plan.archived ? ' · ARCHIVED' : ''}</span>
                  <h2>{plan.name}</h2>
                  <p>{displayDate(plan.startOn)} – {displayDate(plan.endOn)}</p>
                </div>
                <div className="plan-actions">
                  {!plan.archived && <button className="wallet-action" type="button" onClick={() => setEditingBudget(plan)}>Edit</button>}
                  {!plan.archived && <button className="wallet-action" type="button" onClick={() => void duplicateBudget(plan)}>Duplicate</button>}
                  {!plan.archived && <button className="wallet-action archive-action" type="button" onClick={() => setArchiveTarget({ type: 'budget', value: plan })}>Archive</button>}
                </div>
              </div>
              {error || !progress ? (
                <p className="error-state" role="alert">{error}</p>
              ) : (
                <>
                  <div className="plan-overview">
                    <span><small>PLANNED</small><strong>{formatPHP(progress.totalLimitCentavos)}</strong></span>
                    <span><small>SPENT</small><strong>{formatPHP(progress.totalSpentCentavos)}</strong></span>
                    <span className={progress.totalRemainingCentavos < 0 ? 'amount-over' : ''}>
                      <small>{progress.totalRemainingCentavos < 0 ? 'OVER LIMIT' : 'REMAINING'}</small>
                      <strong>{formatPHP(Math.abs(progress.totalRemainingCentavos))}</strong>
                    </span>
                  </div>
                  <ul className="budget-category-list">
                    {progress.categories.map((item) => {
                      const category = categories.find((candidate) => candidate.id === item.categoryId)
                      const percentage = Math.min(100, Math.max(0, item.utilizationPercent))
                      return (
                        <li key={item.categoryId}>
                          <div className="budget-category-heading">
                            <strong>{category?.name ?? 'Unknown category'}</strong>
                            <span className={item.remainingCentavos < 0 ? 'amount-over' : ''}>
                              {item.remainingCentavos < 0
                                ? `${formatPHP(Math.abs(item.remainingCentavos))} over`
                                : `${formatPHP(item.remainingCentavos)} left`}
                            </span>
                          </div>
                          <div className="budget-meter" role="progressbar" aria-label={`${category?.name ?? 'Category'} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(item.utilizationPercent))}>
                            <span className={item.remainingCentavos < 0 ? 'meter-over' : ''} style={{ width: `${percentage}%` }} />
                          </div>
                          <small>{formatPHP(item.spentCentavos)} of {formatPHP(item.limitCentavos)} · {Math.round(item.utilizationPercent)}%</small>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </article>
          ))}
        </section>
      ) : activeTab === 'income' ? (
        <section id="income-panel" role="tabpanel" aria-labelledby="income-tab" className="plans-list">
          <div className="local-note" role="note">
            Expected amounts are plans, not balances. A receipt becomes actual income only when you record it.
          </div>
          {visibleIncomes.length === 0 ? (
            <div className="empty-page plans-empty">
              <span className="empty-icon" aria-hidden="true">↙</span>
              <h2>Wala pang paparating na pera</h2>
              <p>I-schedule ang paparating na pera at i-record kapag nakuha mo na, buo man o kulang.</p>
              <button className="button button-primary" type="button" onClick={() => setEditingIncome(null)}>＋ Schedule expected income</button>
            </div>
          ) : visibleIncomes.map((expected) => {
            let progress
            let progressError = ''
            try {
              progress = getExpectedIncomeProgress(expected, localDateInput())
            } catch (error) {
              progressError = error instanceof Error ? error.message : 'Income progress could not be calculated.'
            }
            return (
              <article className={`panel plan-card income-card${expected.archived ? ' plan-archived' : ''}`} key={expected.id}>
                <div className="plan-card-heading">
                  <div>
                    <span className={`confidence-tag confidence-${expected.confidence}`}>{confidenceLabels[expected.confidence]}</span>
                    <h2>{expected.description}</h2>
                    <p>{recurrenceLabels[expected.recurrence]} · {displayDate(progress?.dueOn ?? expected.dueOn)}</p>
                  </div>
                  <div className="plan-actions">
                    {!expected.archived && <button className="wallet-action" type="button" onClick={() => setEditingIncome(expected)}>Edit</button>}
                    {!expected.archived && progress && progress.remainingCentavos > 0 && (
                      <button className="wallet-action" type="button" onClick={() => setReceivingIncome(expected)}>Nakuha na</button>
                    )}
                    {!expected.archived && <button className="wallet-action archive-action" type="button" onClick={() => setArchiveTarget({ type: 'income', value: expected })}>Archive</button>}
                  </div>
                </div>
                {progressError ? (
                  <p className="error-state" role="alert">{progressError}</p>
                ) : progress ? (
                  <>
                    <div className="plan-overview income-overview">
                      <span><small>EXPECTED</small><strong>{formatPHP(expected.amountCentavos)}</strong></span>
                      <span><small>RECEIVED THIS OCCURRENCE</small><strong>{formatPHP(progress.receivedCentavos)}</strong></span>
                      <span><small>STILL EXPECTED</small><strong>{formatPHP(progress.remainingCentavos)}</strong></span>
                    </div>
                    <div className="income-status-row">
                      <span className={`income-status status-${progress.status}`}>{progress.status}</span>
                      <span>{wallets.find((wallet) => wallet.id === expected.walletId)?.name ?? 'Unknown wallet'}</span>
                      {expected.categoryId && <span>{incomeCategories.find((category) => category.id === expected.categoryId)?.name ?? 'Unknown category'}</span>}
                    </div>
                    {expected.receipts.length > 0 && (
                      <ul className="receipt-history" aria-label={`${expected.description} receipt history`}>
                        {[...expected.receipts].sort((a, b) => b.dueOn.localeCompare(a.dueOn)).map((receipt) => (
                          <li key={receipt.transactionId}>
                            <span>{displayDate(receipt.dueOn)} occurrence</span>
                            <strong>{formatPHP(receipt.amountCentavos)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </article>
            )
          })}
        </section>
      ) : (
        <div id="plans-debts-panel" role="tabpanel" aria-labelledby="plans-debts-tab">
          <DebtsPage
            wallets={wallets}
            transactions={transactions}
            categories={categories}
            debts={debts}
            obligations={obligations}
            onSaveDebt={onSaveDebt}
            onArchiveDebt={onArchiveDebt}
            onSaveObligation={onSaveObligation}
            onArchiveObligation={onArchiveObligation}
            onSettleDebt={onSettleDebt}
            onPayObligation={onPayObligation}
          />
        </div>
      )}

      {editingBudget !== undefined && (
        <BudgetPlanDialog
          plan={editingBudget}
          categories={expenseCategories}
          onClose={() => setEditingBudget(undefined)}
          onSave={(plan) => saveBudget(plan)}
          onCreateCategory={onCreateCategory}
        />
      )}
      {editingIncome !== undefined && (
        <ExpectedIncomeDialog
          expected={editingIncome}
          wallets={wallets}
          categories={incomeCategories}
          onClose={() => setEditingIncome(undefined)}
          onSave={(expected) => saveIncome(expected)}
        />
      )}
      {receivingIncome && (
        <IncomeReceiptDialog
          expected={receivingIncome}
          onClose={() => setReceivingIncome(null)}
          onReceive={async (amount, dueOn) => {
            await onReceiveIncome(receivingIncome, amount, dueOn)
            setReceivingIncome(null)
          }}
        />
      )}
      {archiveTarget && (
        <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setArchiveTarget(null)}>
          <section ref={archiveDialogRef} className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-plan-title">
            <div className="dialog-heading">
              <div>

                <h2 id="archive-plan-title">Archive this {archiveTarget.type === 'budget' ? 'budget' : 'income schedule'}?</h2>
                <p>It will leave your active list, but its saved history stays on this device.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Isara" onClick={() => setArchiveTarget(null)}>×</button>
            </div>
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setArchiveTarget(null)}>Keep active</button>
              <button className="button button-primary" type="button" onClick={() => void confirmArchive()}>Archive</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

interface BudgetPlanDialogProps {
  plan: BudgetPlan | null
  categories: readonly TransactionCategory[]
  onClose: () => void
  onSave: (plan: BudgetPlan) => Promise<void>
  onCreateCategory: (name: string, kind: 'income' | 'expense') => Promise<TransactionCategory>
}

function BudgetPlanDialog({ plan, categories, onClose, onSave, onCreateCategory }: BudgetPlanDialogProps) {
  const dates = monthRange()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const dialogRef = useDialogKeyboard(onClose, saving)

  async function createCategory() {
    setError('')
    try {
      await onCreateCategory(newCategoryName, 'expense')
      setNewCategoryName('')
      setCreatingCategory(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The category could not be created.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const startOn = String(form.get('startOn') ?? '')
    const endOn = String(form.get('endOn') ?? '')
    const categoryLimits = []
    for (const category of categories) {
      if (form.get(`include-${category.id}`) !== 'on') continue
      const limitCentavos = parsePesoToCentavos(String(form.get(`limit-${category.id}`) ?? ''))
      if (limitCentavos === null || limitCentavos <= 0) {
        setError('Enter a positive limit in pesos for every selected category.')
        return
      }
      categoryLimits.push({ categoryId: category.id, limitCentavos })
    }
    const now = new Date().toISOString()
    const budget: BudgetPlan = {
      id: plan?.id ?? crypto.randomUUID(),
      name,
      startOn,
      endOn,
      categoryLimits,
      archived: false,
      createdAt: plan?.createdAt ?? now,
      updatedAt: now,
    }
    if (!isBudgetPlan(budget)) {
      setError('Choose a name, valid date range, and at least one positive category limit.')
      return
    }
    setSaving(true)
    try {
      await onSave(budget)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The budget could not be saved.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section ref={dialogRef} className="wallet-dialog planning-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{plan ? 'UPDATE YOUR PLAN' : 'A PLAN THAT FITS'}</span>
            <h2 id="budget-dialog-title">{plan ? 'Edit budget plan' : 'New budget plan'}</h2>
            <p>Limits track categorized expenses in this date range. They never change your actual balance.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Isara" onClick={onClose} disabled={saving}>×</button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Plan name</span><input autoFocus name="name" required maxLength={50} defaultValue={plan?.name ?? ''} placeholder="e.g. June essentials" /></label>
          <div className="form-row">
            <label className="field"><span>Starts</span><input name="startOn" type="date" required defaultValue={plan?.startOn ?? dates.startOn} /></label>
            <label className="field"><span>Ends</span><input name="endOn" type="date" required defaultValue={plan?.endOn ?? dates.endOn} /></label>
          </div>
          <fieldset className="budget-category-fields">
            <legend>Category limits</legend>
            {categories.length === 0 ? (
              <p className="field-note">Create an expense category first to add a budget limit.</p>
            ) : categories.map((category) => {
              const existingLimit = plan?.categoryLimits.find((limit) => limit.categoryId === category.id)
              return (
                <div className="budget-limit-row" key={category.id}>
                  <label><input type="checkbox" name={`include-${category.id}`} defaultChecked={Boolean(existingLimit)} /><span>{category.name}</span></label>
                  <span className="currency-input"><b>₱</b><input name={`limit-${category.id}`} inputMode="decimal" defaultValue={existingLimit ? amountInputValue(existingLimit.limitCentavos) : ''} placeholder="0.00" aria-label={`${category.name} limit`} /></span>
                </div>
              )
            })}
          </fieldset>
          {creatingCategory ? (
            <div className="inline-category-create">
              <label className="field"><span>New expense category</span><input autoFocus value={newCategoryName} maxLength={40} onChange={(event) => setNewCategoryName(event.target.value)} /></label>
              <button className="button button-secondary" type="button" onClick={() => void createCategory()}>Add</button>
            </div>
          ) : (
            <button className="text-button" type="button" onClick={() => setCreatingCategory(true)}>＋ Create expense category</button>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || categories.length === 0}>{saving ? 'Saving…' : 'Save plan'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

interface ExpectedIncomeDialogProps {
  expected: ExpectedIncome | null
  wallets: readonly Wallet[]
  categories: readonly TransactionCategory[]
  onClose: () => void
  onSave: (expected: ExpectedIncome) => Promise<void>
}

function ExpectedIncomeDialog({ expected, wallets, categories, onClose, onSave }: ExpectedIncomeDialogProps) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [recurrence, setRecurrence] = useState<IncomeRecurrence>(expected?.recurrence ?? 'none')
  const selectableWallets = wallets.filter((wallet) => !wallet.archived || wallet.id === expected?.walletId)
  const dialogRef = useDialogKeyboard(onClose, saving)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const amountCentavos = parsePesoToCentavos(String(form.get('amount') ?? ''))
    const dueOn = String(form.get('dueOn') ?? expected?.dueOn ?? '')
    const confidence = String(form.get('confidence') ?? '')
    const walletId = String(form.get('walletId') ?? '')
    const categoryId = String(form.get('categoryId') ?? '')
    const description = String(form.get('description') ?? '').trim()
    if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
      setError('Choose a valid confidence level.')
      return
    }
    if (amountCentavos === null || amountCentavos <= 0) {
      setError('Enter an expected amount greater than ₱0.00 with no more than two decimal places.')
      return
    }
    const now = new Date().toISOString()
    const expectedIncome: ExpectedIncome = {
      id: expected?.id ?? crypto.randomUUID(),
      kind: 'expectedIncome',
      description,
      amountCentavos,
      walletId,
      ...(categoryId ? { categoryId } : {}),
      dueOn,
      confidence,
      recurrence,
      monthlyAnchorDay: expected?.receipts.length
        ? expected.monthlyAnchorDay
        : Number(dueOn.slice(-2)),
      receipts: expected?.receipts ?? [],
      archived: false,
      createdAt: expected?.createdAt ?? now,
      updatedAt: now,
    }
    if (!isExpectedIncome(expectedIncome)) {
      setError('Review the description, wallet, confidence, and due date.')
      return
    }
    setSaving(true)
    try {
      await onSave(expectedIncome)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expected income could not be saved.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section ref={dialogRef} className="wallet-dialog planning-dialog" role="dialog" aria-modal="true" aria-labelledby="income-dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{expected ? 'UPDATE EXPECTED INCOME' : 'MONEY ON THE WAY'}</span>
            <h2 id="income-dialog-title">{expected ? 'Edit paparating na pera' : 'I-schedule ang paparating na pera'}</h2>
            <p>Planned income stays separate from your current balance until a receipt is posted.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Isara" onClick={onClose} disabled={saving}>×</button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Description</span><input autoFocus name="description" required maxLength={120} defaultValue={expected?.description ?? ''} placeholder="e.g. Salary" /></label>
          <div className="form-row">
            <label className="field"><span>Expected amount</span><span className="currency-input"><b>₱</b><input name="amount" inputMode="decimal" required defaultValue={expected ? amountInputValue(expected.amountCentavos) : ''} placeholder="0.00" /></span></label>
            <label className="field"><span>Kailan due?</span><input name="dueOn" type="date" required defaultValue={expected?.dueOn ?? localDateInput()} disabled={Boolean(expected?.receipts.length)} /></label>
          </div>
          <div className="form-row">
            <label className="field"><span>Wallet</span><select name="walletId" required defaultValue={expected?.walletId ?? selectableWallets[0]?.id ?? ''}>
              {selectableWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.archived ? ' (archived)' : ''}</option>)}
            </select></label>
            <label className="field"><span>Income category <small>optional</small></span><select name="categoryId" defaultValue={expected?.categoryId ?? ''}>
              <option value="">Walang category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
          </div>
          <div className="form-row">
            <label className="field"><span>Confidence</span><select name="confidence" defaultValue={expected?.confidence ?? 'medium'}>
              <option value="low">Low — uncertain</option><option value="medium">Medium — likely</option><option value="high">High — confirmed</option>
            </select></label>
            <label className="field"><span>Repeats</span><select value={recurrence} disabled={Boolean(expected?.receipts.length)} onChange={(event) => {
              if (event.target.value === 'none' || event.target.value === 'weekly' || event.target.value === 'biweekly' || event.target.value === 'monthly') setRecurrence(event.target.value)
            }}>
              <option value="none">One-time</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option>
            </select></label>
          </div>
          {Boolean(expected?.receipts.length) && <p className="field-note">The due date and recurrence are locked after a receipt is recorded so its history stays attached to the right occurrence.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || selectableWallets.length === 0}>{saving ? 'Saving…' : 'Save schedule'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

interface IncomeReceiptDialogProps {
  expected: ExpectedIncome
  onClose: () => void
  onReceive: (amountCentavos: number, dueOn: string) => Promise<void>
}

function IncomeReceiptDialog({ expected, onClose, onReceive }: IncomeReceiptDialogProps) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const progress = getExpectedIncomeProgress(expected, localDateInput())
  const dialogRef = useDialogKeyboard(onClose, saving)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const amount = parsePesoToCentavos(String(new FormData(event.currentTarget).get('amount') ?? ''))
    if (amount === null || amount <= 0 || amount > progress.remainingCentavos) {
      setError(`Enter a receipt greater than ₱0.00 and no more than ${formatPHP(progress.remainingCentavos)}.`)
      return
    }
    setSaving(true)
    try {
      await onReceive(amount, progress.dueOn)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The receipt could not be recorded.')
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section ref={dialogRef} className="wallet-dialog planning-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title">
        <div className="dialog-heading">
          <div>

            <h2 id="receipt-dialog-title">Nakuha na ang pera</h2>
            <p>This creates an income transaction in your ledger and updates this schedule together.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Isara" onClick={onClose} disabled={saving}>×</button>
        </div>
        <form className="wallet-form" onSubmit={(event) => void submit(event)}>
          <div className="receipt-remaining"><span>Still expected</span><strong>{formatPHP(progress.remainingCentavos)}</strong></div>
          <label className="field"><span>Amount received</span><span className="currency-input"><b>₱</b><input autoFocus name="amount" inputMode="decimal" required defaultValue={amountInputValue(progress.remainingCentavos)} /></span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Nakuha na'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default PlansPage
