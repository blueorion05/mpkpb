import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  addCategory,
  archiveWallet,
  createWallet,
  deleteTransaction,
  defaultWalletColor,
  defaultWalletIcon,
  getCategories,
  getBudgetPlans,
  getDebts,
  getExpectedIncomes,
  getObligations,
  getPreference,
  getTransactions,
  getWallets,
  isWalletColor,
  isWalletIcon,
  isWalletType,
  restoreWallet,
  saveTransaction,
  savePreference,
  saveBudgetPlan,
  saveExpectedIncome,
  saveDebt,
  archiveDebt,
  saveObligation,
  archiveObligation,
  archiveBudgetPlan,
  archiveExpectedIncome,
  updateWallet,
  WALLET_COLORS,
  WALLET_ICONS,
  type WalletColor,
  type WalletIcon,
  type Wallet,
  type UpdatedScheduledEvent,
} from './db/database'
import ActivityPage from './components/ActivityPage'
import PlansPage from './components/PlansPage'
import TransactionDialog from './components/TransactionDialog'
import {
  type DebtRecord,
  type FinancialObligation,
} from './domain/debts'
import {
  calculateLedgerTotals,
  calculateWalletBalances,
  normalizeCategoryName,
  type LedgerTransaction,
  type TransactionCategory,
} from './domain/ledger'
import {
  type BudgetPlan,
  type ExpectedIncome,
} from './domain/planning'
import { formatPHP, parsePesoToCentavos, sumCentavos } from './domain/money'
import './App.css'

type Page = 'home' | 'wallets' | 'activity' | 'plans' | 'more'
type Theme = 'system' | 'light' | 'dark'

const pages: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'wallets', label: 'Wallets', icon: '▣' },
  { id: 'activity', label: 'Activity', icon: '↗' },
  { id: 'plans', label: 'Plans', icon: '▤' },
  { id: 'more', label: 'More', icon: '•••' },
]
const iconLabels: Record<WalletIcon, string> = {
  wallet: 'Wallet',
  cash: 'Cash',
  bank: 'Bank',
  savings: 'Savings',
  card: 'Card',
  other: 'Other',
}
const iconGlyphs: Record<WalletIcon, string> = {
  wallet: '▣',
  cash: '₱',
  bank: '▥',
  savings: '◒',
  card: '▤',
  other: '⋯',
}
const colorLabels: Record<WalletColor, string> = {
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  orange: 'Orange',
  red: 'Red',
  gray: 'Gray',
}
const todayLabel = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date())

function localDateInput(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function centavosInput(amount: number): string {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
}

function keepFocusInside(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || !dialog) return
  const focusable = dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

function App() {
  const [page, setPage] = useState<Page>('home')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([])
  const [categories, setCategories] = useState<TransactionCategory[]>([])
  const [budgetPlans, setBudgetPlans] = useState<BudgetPlan[]>([])
  const [expectedIncomes, setExpectedIncomes] = useState<ExpectedIncome[]>([])
  const [debts, setDebts] = useState<DebtRecord[]>([])
  const [obligations, setObligations] = useState<FinancialObligation[]>([])
  const [theme, setTheme] = useState<Theme>('system')
  const [displayName, setDisplayName] = useState('')
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [walletLoadError, setWalletLoadError] = useState(false)
  const [planningLoadError, setPlanningLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null)
  const [walletToArchive, setWalletToArchive] = useState<Wallet | null>(null)
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<LedgerTransaction | null>(null)
  const [transactionToDelete, setTransactionToDelete] = useState<LedgerTransaction | null>(null)
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const walletDialogRef = useRef<HTMLElement>(null)
  const archiveDialogRef = useRef<HTMLElement>(null)
  const transactionDeleteDialogRef = useRef<HTMLElement>(null)

  function applyScheduledEventUpdate(event: UpdatedScheduledEvent) {
    if (!event) return
    if (event.kind === 'expectedIncome') {
      setExpectedIncomes((current) => current.some((item) => item.id === event.id)
        ? current.map((item) => item.id === event.id ? event : item)
        : [...current, event])
    } else if (event.kind === 'debt') {
      setDebts((current) => current.some((item) => item.id === event.id)
        ? current.map((item) => item.id === event.id ? event : item)
        : [...current, event])
    } else {
      setObligations((current) => current.some((item) => item.id === event.id)
        ? current.map((item) => item.id === event.id ? event : item)
        : [...current, event])
    }
  }

  useEffect(() => {
    let active = true

    async function load() {
      let savedWallets: Wallet[]
      let savedTransactions: LedgerTransaction[]
      let savedCategories: TransactionCategory[]
      try {
        [savedWallets, savedTransactions, savedCategories] = await Promise.all([
          getWallets(),
          getTransactions(),
          getCategories(),
        ])
        if (!active) return
        setWallets(savedWallets)
        setTransactions(savedTransactions)
        setCategories(savedCategories)
        setWalletLoadError(false)
      } catch (error) {
        if (active) {
          setWalletLoadError(true)
          setPageError(
            error instanceof Error ? error.message : 'Local data could not be loaded.',
          )
          setLoading(false)
        }
        return
      }

      try {
        const [savedBudgets, savedExpectedIncomes, savedDebts, savedObligations] = await Promise.all([
          getBudgetPlans(),
          getExpectedIncomes(),
          getDebts(),
          getObligations(),
        ])
        if (!active) return
        setBudgetPlans(savedBudgets)
        setExpectedIncomes(savedExpectedIncomes)
        setDebts(savedDebts)
        setObligations(savedObligations)
        setPlanningLoadError(false)
      } catch (error) {
        if (active) {
          setPlanningLoadError(true)
          setPageError(error instanceof Error ? error.message : 'Planning data could not be loaded.')
        }
      }

      try {
        const [savedTheme, savedName, onboardingComplete] = await Promise.all([
          getPreference('theme'),
          getPreference('displayName'),
          getPreference('onboardingComplete'),
        ])
        if (!active) return
        if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme)
        }
        setDisplayName(savedName ?? '')
        if (savedWallets.length === 0 && onboardingComplete !== 'true') {
          setIsOnboarding(true)
          setDialogOpen(true)
        }
      } catch (error) {
        if (active) {
          setPageError(error instanceof Error ? error.message : 'Preferences could not be loaded.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [loadAttempt])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (!dialogOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      keepFocusInside(event, walletDialogRef.current)
      if (event.key === 'Escape') {
        setDialogOpen(false)
        setEditingWallet(null)
        if (isOnboarding) {
          setIsOnboarding(false)
          void savePreference('onboardingComplete', 'true').catch((error: unknown) => {
            setPageError(error instanceof Error ? error.message : 'Onboarding preference could not be saved.')
          })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogOpen, isOnboarding])

  useEffect(() => {
    if (!walletToArchive) return
    function handleKeyDown(event: KeyboardEvent) {
      keepFocusInside(event, archiveDialogRef.current)
      if (event.key === 'Escape') setWalletToArchive(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [walletToArchive])

  useEffect(() => {
    if (!transactionToDelete) return
    function handleKeyDown(event: KeyboardEvent) {
      keepFocusInside(event, transactionDeleteDialogRef.current)
      if (event.key === 'Escape') setTransactionToDelete(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [transactionToDelete])

  const ledger = useMemo(() => {
    if (walletLoadError) return { balances: null, error: '' }
    try {
      return { balances: calculateWalletBalances(wallets, transactions), error: '' }
    } catch (error) {
      return {
        balances: null,
        error: error instanceof Error ? error.message : 'Wallet balances could not be calculated.',
      }
    }
  }, [wallets, transactions, walletLoadError])

  const totals = useMemo(() => {
    if (!ledger.balances) return null
    try {
      const spendableBalances = wallets
        .filter((wallet) => !wallet.protected && !wallet.archived)
        .map((wallet) => {
          const balance = ledger.balances?.get(wallet.id)
          if (balance === undefined) {
            throw new Error('A wallet balance is missing from the ledger calculation.')
          }
          return balance
        })
      return {
        all: sumCentavos([...ledger.balances.values()]),
        spendable: sumCentavos(spendableBalances),
      }
    } catch {
      return null
    }
  }, [ledger.balances, wallets])

  const activitySummary = useMemo(() => {
    if (walletLoadError) return null
    try {
      return calculateLedgerTotals(transactions)
    } catch {
      return null
    }
  }, [transactions, walletLoadError])

  async function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    try {
      await savePreference('theme', nextTheme)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Theme preference could not be saved.')
    }
  }

  async function handleSaveWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('walletName') ?? '').trim()
    const type = String(formData.get('walletType') ?? '')
    const icon = String(formData.get('walletIcon') ?? '')
    const color = String(formData.get('walletColor') ?? '')
    const amount = parsePesoToCentavos(String(formData.get('openingBalance') ?? ''))

    if (!name) {
      setFormError('Add a name for this wallet.')
      return
    }
    if (!isWalletType(type)) {
      setFormError('Choose a valid wallet type.')
      return
    }
    if (!isWalletIcon(icon) || !isWalletColor(color)) {
      setFormError('Choose a valid wallet icon and color.')
      return
    }
    if (amount === null) {
      setFormError('Enter an amount with no more than two decimal places.')
      return
    }

    const now = new Date().toISOString()
    const previousWallet = editingWallet
    const wallet: Wallet = {
      id: previousWallet?.id ?? crypto.randomUUID(),
      name,
      type,
      icon,
      color,
      openingBalanceCentavos: amount,
      protected: formData.get('protected') === 'on',
      archived: false,
      createdAt: previousWallet?.createdAt ?? now,
      updatedAt: now,
    }
    const nameInput = String(formData.get('displayName') ?? '').trim()

    try {
      if (previousWallet) {
        await updateWallet(wallet)
        setWallets((current) => current.map((item) => item.id === wallet.id ? wallet : item))
        setSuccessMessage(`${wallet.name} updated. Looks good, Geng Geng.`)
      } else {
        await createWallet(wallet, nameInput || undefined)
        setWallets((current) => [...current, wallet])
        setSuccessMessage(`${wallet.name} saved. Pera, meet dashboard.`)
      }
      if (nameInput) setDisplayName(nameInput)
      setDialogOpen(false)
      setIsOnboarding(false)
      setEditingWallet(null)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'The wallet could not be saved.',
      )
    }
  }

  async function closeWalletDialog() {
    if (isOnboarding) {
      try {
        await savePreference('onboardingComplete', 'true')
      } catch (error) {
        setPageError(error instanceof Error ? error.message : 'Onboarding preference could not be saved.')
      }
    }
    setDialogOpen(false)
    setIsOnboarding(false)
    setEditingWallet(null)
  }

  function openWalletDialog() {
    setFormError('')
    setEditingWallet(null)
    setIsOnboarding(false)
    setDialogOpen(true)
  }

  function openEditWallet(wallet: Wallet) {
    setFormError('')
    setEditingWallet(wallet)
    setIsOnboarding(false)
    setDialogOpen(true)
  }

  async function confirmArchiveWallet() {
    if (!walletToArchive) return
    try {
      const archivedWallet = await archiveWallet(walletToArchive)
      setWallets((current) => current.map((wallet) =>
        wallet.id === archivedWallet.id ? archivedWallet : wallet,
      ))
      setSuccessMessage(`${walletToArchive.name} archived. Its balance is still included in your total.`)
      setWalletToArchive(null)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The wallet could not be archived.')
    }
  }

  async function handleRestoreWallet(wallet: Wallet) {
    try {
      const restoredWallet = await restoreWallet(wallet)
      setWallets((current) => current.map((item) => item.id === wallet.id ? restoredWallet : item))
      setSuccessMessage(`${wallet.name} is back in your active wallets.`)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The wallet could not be restored.')
    }
  }

  function openTransactionDialog() {
    setEditingTransaction(null)
    setTransactionDialogOpen(true)
  }

  function openEditTransaction(transaction: LedgerTransaction) {
    setEditingTransaction(transaction)
    setTransactionDialogOpen(true)
  }

  async function handleSaveTransaction(transaction: LedgerTransaction) {
    const updatedEvent = await saveTransaction(transaction)
    setTransactions((current) => {
      const exists = current.some((item) => item.id === transaction.id)
      return exists
        ? current.map((item) => item.id === transaction.id ? transaction : item)
        : [...current, transaction]
    })
    applyScheduledEventUpdate(updatedEvent)
    setSuccessMessage(
      `${transaction.description} ${editingTransaction ? 'updated' : 'saved'} on this device.`,
    )
    setTransactionDialogOpen(false)
    setEditingTransaction(null)
  }

  async function handleCreateCategory(name: string, kind: 'income' | 'expense') {
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 40) {
      throw new Error('Category names must contain 1–40 characters.')
    }
    const normalizedName = normalizeCategoryName(trimmedName)
    if (categories.some((category) => category.kind === kind && category.normalizedName === normalizedName)) {
      throw new Error('A category with this name already exists for that transaction type.')
    }
    const now = new Date().toISOString()
    const category: TransactionCategory = {
      id: crypto.randomUUID(),
      name: trimmedName,
      kind,
      normalizedName,
      createdAt: now,
      updatedAt: now,
    }
    await addCategory(category)
    setCategories((current) => [...current, category])
    return category
  }

  async function confirmDeleteTransaction() {
    if (!transactionToDelete) return
    try {
      const updatedEvent = await deleteTransaction(transactionToDelete.id)
      setTransactions((current) => current.filter((item) => item.id !== transactionToDelete.id))
      applyScheduledEventUpdate(updatedEvent)
      setSuccessMessage(`${transactionToDelete.description} removed from your ledger.`)
      setTransactionToDelete(null)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The transaction could not be deleted.')
    }
  }

  async function handleSaveBudget(plan: BudgetPlan) {
    await saveBudgetPlan(plan)
    setBudgetPlans((current) => {
      const exists = current.some((item) => item.id === plan.id)
      return exists
        ? current.map((item) => item.id === plan.id ? plan : item)
        : [...current, plan]
    })
    setSuccessMessage(`${plan.name} saved on this device.`)
  }

  async function handleArchiveBudget(plan: BudgetPlan) {
    const archived = await archiveBudgetPlan(plan)
    setBudgetPlans((current) => current.map((item) => item.id === archived.id ? archived : item))
    setSuccessMessage(`${plan.name} archived. Its history stays saved.`)
  }

  async function handleDuplicateBudget(plan: BudgetPlan) {
    const suffix = ' copy'
    const name = `${plan.name.slice(0, 50 - suffix.length)}${suffix}`
    await handleSaveBudget({
      ...plan,
      id: crypto.randomUUID(),
      name,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  async function handleSaveExpectedIncome(expected: ExpectedIncome) {
    await saveExpectedIncome(expected)
    setExpectedIncomes((current) => {
      const exists = current.some((item) => item.id === expected.id)
      return exists
        ? current.map((item) => item.id === expected.id ? expected : item)
        : [...current, expected]
    })
    setSuccessMessage(`${expected.description} saved as expected income.`)
  }

  async function handleArchiveExpectedIncome(expected: ExpectedIncome) {
    const archived = await archiveExpectedIncome(expected)
    setExpectedIncomes((current) => current.map((item) => item.id === archived.id ? archived : item))
    setSuccessMessage(`${expected.description} archived. Its receipt history stays saved.`)
  }

  async function handleSaveDebt(debt: DebtRecord) {
    await saveDebt(debt)
    setDebts((current) => current.some((item) => item.id === debt.id)
      ? current.map((item) => item.id === debt.id ? debt : item)
      : [...current, debt])
    setSuccessMessage(`${debt.name} saved on this device.`)
  }

  async function handleArchiveDebt(debt: DebtRecord) {
    const archived = await archiveDebt(debt)
    setDebts((current) => current.map((item) => item.id === archived.id ? archived : item))
    setSuccessMessage(`${debt.name} archived. Its settlement history stays saved.`)
  }

  async function handleSaveObligation(obligation: FinancialObligation) {
    await saveObligation(obligation)
    setObligations((current) => current.some((item) => item.id === obligation.id)
      ? current.map((item) => item.id === obligation.id ? obligation : item)
      : [...current, obligation])
    setSuccessMessage(`${obligation.description} saved on this device.`)
  }

  async function handleArchiveObligation(obligation: FinancialObligation) {
    const archived = await archiveObligation(obligation)
    setObligations((current) => current.map((item) => item.id === archived.id ? archived : item))
    setSuccessMessage(`${obligation.description} archived. Its payment history stays saved.`)
  }

  async function handleReceiveIncome(
    expected: ExpectedIncome,
    amountCentavos: number,
    dueOn: string,
  ) {
    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      kind: 'income',
      occurredOn: localDateInput(),
      description: expected.description,
      amountCentavos,
      walletId: expected.walletId,
      expectedIncomeId: expected.id,
      expectedIncomeDueOn: dueOn,
      createdAt: now,
      updatedAt: now,
      ...(expected.categoryId ? { categoryId: expected.categoryId } : {}),
    }
    const updatedEvent = await saveTransaction(transaction)
    setTransactions((current) => [...current, transaction])
    applyScheduledEventUpdate(updatedEvent)
    setSuccessMessage(`${formatPHP(amountCentavos)} received and added to your ledger.`)
  }

  async function handleSettleDebt(
    debt: DebtRecord,
    amountCentavos: number,
    dueOn: string,
  ) {
    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      kind: debt.direction === 'payable' ? 'expense' : 'income',
      occurredOn: localDateInput(),
      description: `${debt.direction === 'payable' ? 'Debt payment' : 'Debt collection'}: ${debt.name}`,
      amountCentavos,
      walletId: debt.walletId,
      debtSettlementId: debt.id,
      debtSettlementDueOn: dueOn,
      debtSettlementExcludedFromTotals: Boolean(debt.principalTransactionId),
      createdAt: now,
      updatedAt: now,
      ...(debt.categoryId ? { categoryId: debt.categoryId } : {}),
    }
    const updatedEvent = await saveTransaction(transaction)
    setTransactions((current) => [...current, transaction])
    applyScheduledEventUpdate(updatedEvent)
    setSuccessMessage(`${formatPHP(amountCentavos)} ${debt.direction === 'payable' ? 'payment' : 'collection'} recorded in your ledger.`)
  }

  async function handlePayObligation(
    obligation: FinancialObligation,
    amountCentavos: number,
    dueOn: string,
  ) {
    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      kind: 'expense',
      occurredOn: localDateInput(),
      description: obligation.description,
      amountCentavos,
      walletId: obligation.walletId,
      obligationId: obligation.id,
      obligationDueOn: dueOn,
      createdAt: now,
      updatedAt: now,
      ...(obligation.categoryId ? { categoryId: obligation.categoryId } : {}),
    }
    const updatedEvent = await saveTransaction(transaction)
    setTransactions((current) => [...current, transaction])
    applyScheduledEventUpdate(updatedEvent)
    setSuccessMessage(`${formatPHP(amountCentavos)} bill payment recorded in your ledger.`)
  }

  const currentLabel = pages.find((item) => item.id === page)?.label ?? 'Home'
  const activeWallets = wallets.filter((wallet) => !wallet.archived)
  const archivedWallets = wallets.filter((wallet) => wallet.archived)
  const financialDataError = ledger.error || (
    !loading && !walletLoadError && !totals
      ? 'Combined wallet balances exceed the safe integer range; no total is shown.'
      : ''
  )

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setPage('home')}>
          <span className="brand-mark">m?</span>
          <span><strong>mpkpb?</strong><small>May Pera Ka Pa Ba?</small></span>
        </a>
        <p className="nav-caption">MENU</p>
        <nav className="side-nav" aria-label="Main navigation">
          {pages.map((item) => (
            <button
              className={`nav-link${page === item.id ? ' active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <span className="privacy-lock" aria-hidden="true">⌑</span>
          <strong>Your money stays yours.</strong>
          <p>Saved on this device only. No account, no cloud, no chismis.</p>
        </div>
        <div className={`sidebar-status${pageError ? ' status-error' : ''}`}>
          <span className="status-dot" /> {pageError ? 'Local storage needs attention' : 'Local mode is on'}
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">m?</span><strong>mpkpb?</strong></div>
          <div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">›</span><strong>{currentLabel}</strong></div>
          <div className="top-actions">
            <span className="today-label">{todayLabel}</span>
            <button
              className="icon-button"
              type="button"
              aria-label={balanceVisible ? 'Hide balances' : 'Show balances'}
              title={balanceVisible ? 'Hide balances' : 'Show balances'}
              onClick={() => setBalanceVisible((visible) => !visible)}
            >{balanceVisible ? '◉' : '◎'}</button>
            <button
              className="icon-button"
              type="button"
              aria-label={`Current theme: ${theme}. Change theme`}
              title={`Theme: ${theme}`}
              onClick={() => void changeTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
            >{theme === 'system' ? '▣' : theme === 'light' ? '☼' : '☾'}</button>
          </div>
        </header>

        <main className="page-content" id="main-content">
          {pageError && (
            <div className="error-banner" role="alert">
              <span>{pageError}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPageError('')
                  setLoading(true)
                  setLoadAttempt((attempt) => attempt + 1)
                }}
              >Retry</button>
              <button type="button" className="text-button" onClick={() => setPageError('')}>Dismiss</button>
            </div>
          )}
          {financialDataError && !walletLoadError && (
            <div className="error-banner" role="alert">
              <span>{financialDataError}</span>
            </div>
          )}
          {successMessage && (
            <div className="success-banner" role="status">
              <span>{successMessage}</span>
              <button type="button" className="text-button" onClick={() => setSuccessMessage('')}>Dismiss</button>
            </div>
          )}
          {page === 'home' && (
            <Dashboard
              displayName={displayName}
              wallets={activeWallets}
              totals={totals}
              balances={ledger.balances}
              visible={balanceVisible}
              loading={loading}
              dataUnavailable={walletLoadError}
              onAddWallet={openWalletDialog}
              onViewWallets={() => setPage('wallets')}
            />
          )}
          {page === 'wallets' && (
            <WalletsPage
              wallets={activeWallets}
              archivedWallets={archivedWallets}
              totals={totals}
              balances={ledger.balances}
              visible={balanceVisible}
              loading={loading}
              dataUnavailable={walletLoadError}
              onAdd={openWalletDialog}
              onEdit={openEditWallet}
              onArchive={setWalletToArchive}
              onRestore={(wallet) => void handleRestoreWallet(wallet)}
            />
          )}
          {page === 'activity' && (
            <ActivityPage
              wallets={wallets}
              transactions={transactions}
              categories={categories}
              summary={activitySummary}
              loading={loading}
              dataUnavailable={walletLoadError}
              canAdd={activeWallets.length > 0}
              onAdd={openTransactionDialog}
              onEdit={openEditTransaction}
              onDelete={setTransactionToDelete}
            />
          )}
          {page === 'plans' && (
            <PlansPage
              wallets={wallets}
              transactions={transactions}
              categories={categories}
              budgetPlans={budgetPlans}
              expectedIncomes={expectedIncomes}
              debts={debts}
              obligations={obligations}
              loading={loading}
              dataUnavailable={planningLoadError}
              onSaveBudget={handleSaveBudget}
              onArchiveBudget={handleArchiveBudget}
              onDuplicateBudget={handleDuplicateBudget}
              onSaveExpectedIncome={handleSaveExpectedIncome}
              onArchiveExpectedIncome={handleArchiveExpectedIncome}
              onCreateCategory={handleCreateCategory}
              onReceiveIncome={handleReceiveIncome}
              onSaveDebt={handleSaveDebt}
              onArchiveDebt={handleArchiveDebt}
              onSaveObligation={handleSaveObligation}
              onArchiveObligation={handleArchiveObligation}
              onSettleDebt={handleSettleDebt}
              onPayObligation={handlePayObligation}
            />
          )}
          {page === 'more' && <SettingsPage theme={theme} onThemeChange={(next) => void changeTheme(next)} />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {pages.map((item) => (
          <button
            className={`mobile-nav-link${page === item.id ? ' active' : ''}`}
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
          </button>
        ))}
      </nav>

      {dialogOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void closeWalletDialog()
          }}
        >
          <section ref={walletDialogRef} className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">{isOnboarding ? 'WELCOME TO MPKPB?' : editingWallet ? 'WALLET DETAILS' : 'WALLET SETUP'}</span>
                <h2 id="dialog-title">{isOnboarding ? 'Let’s give your money a home.' : editingWallet ? 'Edit wallet' : 'Add a wallet'}</h2>
                <p>{isOnboarding ? 'No account needed. Start with one wallet — skip anytime.' : 'Cash, GCash, savings — whatever keeps your pera.'}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close dialog" onClick={() => void closeWalletDialog()}>×</button>
            </div>
            <form className="wallet-form" onSubmit={(event) => void handleSaveWallet(event)}>
              {wallets.length === 0 && !editingWallet && (
                <label className="field">
                  <span>Your name <small>optional</small></span>
                  <input name="displayName" autoComplete="given-name" placeholder="What should we call you?" />
                </label>
              )}
              <label className="field">
                <span>Wallet name</span>
                <input name="walletName" autoFocus required maxLength={50} defaultValue={editingWallet?.name ?? ''} placeholder="e.g. GCash" />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>Wallet type</span>
                  <select name="walletType" defaultValue={editingWallet?.type ?? 'E-wallet'}>
                    <option>Cash</option><option>E-wallet</option><option>Bank</option>
                    <option>Savings</option><option>Emergency fund</option><option>Other</option>
                  </select>
                </label>
                <label className="field">
                  <span>Wallet icon</span>
                  <select name="walletIcon" defaultValue={editingWallet?.icon ?? defaultWalletIcon('E-wallet')}>
                    {WALLET_ICONS.map((icon) => <option key={icon} value={icon}>{iconLabels[icon]}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>Starting balance</span>
                  <span className="currency-input">
                    <b>₱</b>
                    <input
                      name="openingBalance"
                      inputMode="decimal"
                      defaultValue={editingWallet ? centavosInput(editingWallet.openingBalanceCentavos) : '0.00'}
                      readOnly={Boolean(editingWallet && transactions.some((transaction) =>
                        transaction.walletId === editingWallet.id || transaction.toWalletId === editingWallet.id,
                      ))}
                      required
                      aria-label="Starting balance in pesos"
                    />
                  </span>
                  {editingWallet && transactions.some((transaction) =>
                    transaction.walletId === editingWallet.id || transaction.toWalletId === editingWallet.id,
                  ) && <small className="field-note">Use a balance adjustment to correct the balance after ledger activity.</small>}
                </label>
                <label className="field">
                  <span>Wallet color</span>
                  <select name="walletColor" defaultValue={editingWallet?.color ?? defaultWalletColor('E-wallet')}>
                    {WALLET_COLORS.map((color) => <option key={color} value={color}>{colorLabels[color]}</option>)}
                  </select>
                </label>
              </div>
              <label className="checkbox-field">
                <input type="checkbox" name="protected" defaultChecked={editingWallet?.protected ?? false} />
                <span><strong>Protect this money</strong><small>Exclude it from spendable funds.</small></span>
              </label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="dialog-actions">
                <button className="button button-quiet" type="button" onClick={() => void closeWalletDialog()}>{isOnboarding ? 'Skip for now' : 'Cancel'}</button>
                <button className="button button-primary" type="submit">{editingWallet ? 'Save changes' : '＋ Save wallet'}</button>
              </div>
              <p className="form-privacy">⌑ Saved on this device only.</p>
            </form>
          </section>
        </div>
      )}
      {transactionDialogOpen && (
        <TransactionDialog
          wallets={wallets}
          categories={categories}
          editingTransaction={editingTransaction}
          onClose={() => {
            setTransactionDialogOpen(false)
            setEditingTransaction(null)
          }}
          onSave={handleSaveTransaction}
          onCreateCategory={handleCreateCategory}
        />
      )}
      {transactionToDelete && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setTransactionToDelete(null)
        }}>
          <section
            ref={transactionDeleteDialogRef}
            className="wallet-dialog confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-transaction-title"
            aria-describedby="delete-transaction-description"
          >
            <span className="eyebrow">LEDGER CHANGE</span>
            <h2 id="delete-transaction-title">Delete this transaction?</h2>
            <p id="delete-transaction-description">
              {transactionToDelete.description} will be removed. Wallet balances will be recalculated from the remaining history.
              {transactionToDelete.expectedIncomeId && ' Its expected-income schedule will reopen the amount.'}
              {transactionToDelete.debtSettlementId && ' Its debt settlement will reopen in the debt history.'}
              {transactionToDelete.obligationId && ' Its bill payment will reopen the amount due.'}
              {debts.some((debt) => debt.principalTransactionId === transactionToDelete.id) &&
                ' This is linked as an original debt transaction; clear that link before deleting it.'}
            </p>
            <div className="dialog-actions">
              <button className="button button-quiet" type="button" autoFocus onClick={() => setTransactionToDelete(null)}>Keep transaction</button>
              <button className="button button-danger" type="button" onClick={() => void confirmDeleteTransaction()}>Delete transaction</button>
            </div>
          </section>
        </div>
      )}
      {walletToArchive && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setWalletToArchive(null)
        }}>
          <section ref={archiveDialogRef} className="wallet-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-title" aria-describedby="archive-description">
            <span className="eyebrow">KEEPING THINGS TIDY</span>
            <h2 id="archive-title">Archive {walletToArchive.name}?</h2>
            <p id="archive-description">It will leave your active list and spendable total, but stay saved and included in your total balance. You can restore it later.</p>
            <div className="dialog-actions">
              <button className="button button-quiet" type="button" autoFocus onClick={() => setWalletToArchive(null)}>Keep wallet</button>
              <button className="button button-danger" type="button" onClick={() => void confirmArchiveWallet()}>Archive wallet</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Dashboard({
  displayName,
  wallets,
  totals,
  balances,
  visible,
  loading,
  dataUnavailable,
  onAddWallet,
  onViewWallets,
}: {
  displayName: string
  wallets: Wallet[]
  totals: { all: number; spendable: number } | null
  balances: ReadonlyMap<string, number> | null
  visible: boolean
  loading: boolean
  dataUnavailable: boolean
  onAddWallet: () => void
  onViewWallets: () => void
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR MONEY, YOUR CALL</span>
          <h1>Hey, {displayName || 'Geng Geng'}<span className="green-dot">.</span></h1>
          <p>Here’s the real talk on your money today.</p>
        </div>
        <button className="button button-primary add-wallet-button" type="button" onClick={onAddWallet}>
          <span aria-hidden="true">＋</span> Add wallet
        </button>
      </div>
      <section className="balance-grid" aria-label="Balance overview">
        <article className="balance-card primary-card">
          <div className="card-label-row"><span className="metric-label">TOTAL BALANCE</span><span className="card-icon">▣</span></div>
          <strong className="balance-amount">{loading ? '…' : totals ? visible ? formatPHP(totals.all) : '₱ ••••••' : '—'}</strong>
          <span className="metric-caption">Across all wallets <span className="actual-badge">ACTUAL</span></span>
        </article>
        <article className="balance-card">
          <div className="card-label-row"><span className="metric-label">SPENDABLE</span><span className="card-icon mint-icon">✳</span></div>
          <strong className="balance-amount">{loading ? '…' : totals ? visible ? formatPHP(totals.spendable) : '₱ ••••••' : '—'}</strong>
          <span className="metric-caption">Protected funds excluded</span>
        </article>
        <article className="balance-card wallet-count-card">
          <div className="card-label-row"><span className="metric-label">YOUR WALLETS</span><span className="card-icon lavender-icon">↗</span></div>
          <strong className="balance-amount">{loading ? '…' : dataUnavailable ? '—' : wallets.length}</strong>
          <span className="metric-caption">Places where your pera lives</span>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel wallet-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">THE BREAKDOWN</span><h2>Your wallets</h2></div>
            {wallets.length > 0 && <button className="link-button" type="button" onClick={onViewWallets}>View all ›</button>}
          </div>
          {loading ? (
            <p className="loading-state">Getting your money together…</p>
          ) : dataUnavailable ? (
            <p className="error-state">Wallet details could not be loaded. Use the retry action above to try again.</p>
          ) : wallets.length === 0 ? (
            <div className="empty-wallets">
              <span className="empty-icon" aria-hidden="true">▣</span>
              <div><strong>Your wallets are waiting for an intro.</strong><p>Add your cash, GCash, or bank account to see everything in one place.</p></div>
              <button className="button button-outline" type="button" onClick={onAddWallet}>Set up a wallet ›</button>
            </div>
          ) : (
            <div className="wallet-list">
              {wallets.slice(0, 4).map((wallet) => <WalletRow key={wallet.id} wallet={wallet} balanceCentavos={balances?.get(wallet.id)} visible={visible} />)}
            </div>
          )}
        </section>
        <aside className="panel insight-panel">
          <span className="insight-icon" aria-hidden="true">✦</span>
          <span className="eyebrow">GENG GENG SAYS</span>
          <h2>{wallets.length ? 'Good start. Now let’s track the plot.' : 'No judgment. We all start somewhere.'}</h2>
          <p>{wallets.length
            ? 'Your ledger is taking shape, one peso at a time.'
            : 'Your financial glow-up starts with one wallet. Add what you have — kahit pang-meryenda lang.'}</p>
          <div className="insight-footer"><span className="status-dot" /> Private by design</div>
        </aside>
      </div>

      <div className="privacy-note"><span aria-hidden="true">⌑</span><p><strong>Local-first, for real.</strong> Data stays in this browser on this device. Clearing browser storage removes it; backup tools are planned.</p></div>
    </>
  )
}

function WalletRow({
  wallet,
  balanceCentavos,
  visible,
  onEdit,
  onArchive,
  onRestore,
}: {
  wallet: Wallet
  balanceCentavos?: number
  visible: boolean
  onEdit?: (wallet: Wallet) => void
  onArchive?: (wallet: Wallet) => void
  onRestore?: (wallet: Wallet) => void
}) {
  return (
    <div className="wallet-row">
      <span className={`wallet-avatar wallet-color-${wallet.color}`} aria-hidden="true">{iconGlyphs[wallet.icon]}</span>
      <span className="wallet-info"><strong>{wallet.name}</strong><small>{wallet.type}{wallet.protected ? ' · Protected' : ''}</small></span>
      <strong className="wallet-amount">{visible ? balanceCentavos === undefined ? '—' : formatPHP(balanceCentavos) : '₱ ••••••'}</strong>
      {(onEdit || onArchive || onRestore) ? (
        <div className="wallet-actions">
          {onEdit && <button className="wallet-action" type="button" onClick={() => onEdit(wallet)} aria-label={`Edit ${wallet.name}`}>Edit</button>}
          {onArchive && <button className="wallet-action archive-action" type="button" onClick={() => onArchive(wallet)} aria-label={`Archive ${wallet.name}`}>Archive</button>}
          {onRestore && <button className="wallet-action" type="button" onClick={() => onRestore(wallet)} aria-label={`Restore ${wallet.name}`}>Restore</button>}
        </div>
      ) : <span className="row-chevron" aria-hidden="true">›</span>}
    </div>
  )
}

function WalletsPage({
  wallets,
  archivedWallets,
  totals,
  balances,
  visible,
  loading,
  dataUnavailable,
  onAdd,
  onEdit,
  onArchive,
  onRestore,
}: {
  wallets: Wallet[]
  archivedWallets: Wallet[]
  totals: { all: number; spendable: number } | null
  balances: ReadonlyMap<string, number> | null
  visible: boolean
  loading: boolean
  dataUnavailable: boolean
  onAdd: () => void
  onEdit: (wallet: Wallet) => void
  onArchive: (wallet: Wallet) => void
  onRestore: (wallet: Wallet) => void
}) {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">ALL YOUR PERA, ONE PLACE</span><h1>Wallets</h1><p>Keep tabs on where your money is hanging out.</p></div>
        <button className="button button-primary add-wallet-button" type="button" onClick={onAdd}><span aria-hidden="true">＋</span> Add wallet</button>
      </div>
      <section className="panel wallets-page-panel">
        <div className="wallets-summary"><div><span className="metric-label">TOTAL ACROSS WALLETS</span><strong>{loading ? '…' : totals ? visible ? formatPHP(totals.all) : '₱ ••••••' : '—'}</strong></div><span>{loading ? 'Loading wallets…' : dataUnavailable ? '— active · — archived' : `${wallets.length} active · ${archivedWallets.length} archived`}</span></div>
        {loading ? (
          <p className="loading-state">Loading your wallets…</p>
        ) : dataUnavailable ? (
          <p className="error-state">Wallet details could not be loaded. Use the retry action above to try again.</p>
        ) : wallets.length === 0 && archivedWallets.length === 0 ? (
          <div className="empty-page"><span className="empty-icon" aria-hidden="true">▣</span><h2>No wallets yet</h2><p>Add a wallet to see your money in one place.</p><button className="button button-primary" type="button" onClick={onAdd}>＋ Add your first wallet</button></div>
        ) : (
          <>
            {wallets.length > 0 ? (
              <div className="wallet-list">
                {wallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} balanceCentavos={balances?.get(wallet.id)} visible={visible} onEdit={onEdit} onArchive={onArchive} />)}
              </div>
            ) : !loading && <div className="empty-active-wallets"><p>No active wallets. Your archived balances remain in the total.</p><button className="button button-outline" type="button" onClick={onAdd}>＋ Add wallet</button></div>}
            {archivedWallets.length > 0 && (
              <section className="archived-wallets" aria-labelledby="archived-wallets-title">
                <h2 id="archived-wallets-title">Archived wallets</h2>
                <div className="wallet-list">
                  {archivedWallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} balanceCentavos={balances?.get(wallet.id)} visible={visible} onRestore={onRestore} />)}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </>
  )
}

function SettingsPage({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const options: { id: Theme; label: string; description: string; icon: string }[] = [
    { id: 'system', label: 'System', description: 'Follow your device settings', icon: '▣' },
    { id: 'light', label: 'Light', description: 'Bright and clear', icon: '☼' },
    { id: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: '☾' },
  ]
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h1>More</h1><p>Your settings, privacy, and app details.</p></div></div>
      <section className="panel settings-panel">
        <div className="settings-title"><span className="card-icon">☼</span><div><h2>Appearance</h2><p>Choose how MPKPB? looks on this device.</p></div></div>
        <div className="theme-options" role="group" aria-label="Color theme">
          {options.map((option) => (
            <button className={`theme-option${theme === option.id ? ' selected' : ''}`} key={option.id} type="button" aria-pressed={theme === option.id} onClick={() => onThemeChange(option.id)}>
              <span aria-hidden="true">{option.icon}</span><span><strong>{option.label}</strong><small>{option.description}</small></span>{theme === option.id && <i aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>
      <section className="panel about-panel">
        <span className="card-icon mint-icon">⌑</span><div><h2>Privacy, no drama</h2><p>Your financial data is stored in this browser’s IndexedDB. MPKPB? has no financial backend. Clearing site storage removes local data, so backup tools are important future work.</p></div>
      </section>
    </>
  )
}

export default App
