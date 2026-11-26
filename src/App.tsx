import { defaultForecastPreferences, readForecastPreferences, type ForecastPreferences } from './domain/forecastPreferences'
import { SlidersHorizontal } from 'lucide-react'
import AdjustBalance from './components/AdjustBalance'
import { outstandingObligations } from './domain/debts'
import { CircleAlert, CircleCheck, Activity, ChartNoAxesCombined, ClipboardList, ChevronRight, Ellipsis, Eye, EyeOff, House, LockKeyhole, Monitor, Moon, Plus, ShieldCheck, Sun, Wallet as WalletIconGlyph, X, type LucideIcon } from 'lucide-react'
import Mascot from './components/Mascot'
import { WalletIconPicker, WalletSymbol } from './components/IconPicker'
import type { CategoryIcon } from './domain/categoryIcons'
import UpcomingList from './components/UpcomingList'
import type { EntryKind, ScheduledRecord } from './domain/entry'
import { calculateForecast } from './domain/forecast'
import { localSessionChannel } from './localSession'
import OfflineStatus from './components/OfflineStatus'
import DataSafety from './components/DataSafety'
import { PrivacyGate, PrivacySettings } from './components/PrivacyLock'
import { GENG_EXPRESSION, getGengMessage, type GengContext } from './domain/humor'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  addCategory,
  updateCategoryIcon,
  archiveWallet,
  createWallet,
  deleteTransaction,
  defaultWalletColor,
  defaultWalletIcon,
  getCategories,
  getPlanningData,
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
  type WalletColor,
  type Wallet,
  type UpdatedScheduledEvent,
} from './db/database'
import ActivityPage from './components/ActivityPage'
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

const ForecastPage = lazy(() => import('./components/ForecastPage'))
const PlansPage = lazy(() => import('./components/PlansPage'))
const ToolsPage = lazy(() => import('./components/ToolsPage'))

type Page = 'home' | 'wallets' | 'activity' | 'forecast' | 'plans' | 'more'
type Theme = 'system' | 'light' | 'dark'

const pages: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'wallets', label: 'Wallets', icon: WalletIconGlyph },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'forecast', label: 'Aabot pa?', icon: ChartNoAxesCombined },
  { id: 'plans', label: 'Budget', icon: ClipboardList },
  { id: 'more', label: 'More', icon: Ellipsis },
]
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
  const [forecastPreferences, setForecastPreferences] = useState(defaultForecastPreferences)
  const [forecastSafetyBufferCentavos, setForecastSafetyBufferCentavos] = useState(0)
  const [humorEnabled, setHumorEnabled] = useState(true)
  const [profanityEnabled, setProfanityEnabled] = useState(false)
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
  const [adjustingWallet, setAdjustingWallet] = useState<Wallet>()
  const [greetingVisible, setGreetingVisible] = useState(false)
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ScheduledRecord>()
  const [editingTransaction, setEditingTransaction] = useState<LedgerTransaction | null>(null)
  const [transactionToDelete, setTransactionToDelete] = useState<LedgerTransaction | null>(null)
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const entryTrigger = useRef<HTMLElement | null>(null)
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
        const planning = await getPlanningData()
        if (!active) return
        setBudgetPlans(planning.budgets)
        setExpectedIncomes(planning.expected)
        setDebts(planning.debts)
        setObligations(planning.obligations)
        setPlanningLoadError(false)
      } catch (error) {
        if (active) {
          setPlanningLoadError(true)
          setPageError(error instanceof Error ? error.message : 'Planning data could not be loaded.')
        }
      }

      try {
        const [savedTheme, savedName, onboardingComplete, savedForecastBuffer, savedHumor, savedProfanity, savedForecastPreferences] = await Promise.all([
          getPreference('theme'),
          getPreference('displayName'),
          getPreference('onboardingComplete'),
          getPreference('forecastSafetyBufferCentavos'),
          getPreference('humorEnabled'),
          getPreference('profanityEnabled'),
          getPreference('forecastView'),
        ])
        if (!active) return
        if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme)
        }
        setDisplayName(savedName ?? '')
        setHumorEnabled(savedHumor !== 'false')
        setForecastPreferences(readForecastPreferences(savedForecastPreferences))
        setProfanityEnabled(savedProfanity === 'true')
        if (savedForecastBuffer !== undefined) {
          const parsedBuffer = Number(savedForecastBuffer)
          if (Number.isSafeInteger(parsedBuffer) && parsedBuffer >= 0) {
            setForecastSafetyBufferCentavos(parsedBuffer)
          }
        }
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
    const amount = parsePesoToCentavos(String(formData.get('openingBalance') ?? '').trim() || '0')

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
        setSuccessMessage(`${wallet.name} updated.`)
      } else {
        await createWallet(wallet, nameInput || undefined)
        setWallets((current) => [...current, wallet])
        setSuccessMessage(`${wallet.name} saved on this device.`)
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
    entryTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditingSchedule(undefined)
    setEditingTransaction(null)
    setTransactionDialogOpen(true)
  }

  function openEditTransaction(transaction: LedgerTransaction) {
    entryTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditingSchedule(undefined)
    setEditingTransaction(transaction)
    setTransactionDialogOpen(true)
  }

  function closeEntry() {
    setTransactionDialogOpen(false)
    setEditingTransaction(null)
    setEditingSchedule(undefined)
    requestAnimationFrame(() => entryTrigger.current?.focus())
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
    closeEntry()
  }

  async function handleCreateCategory(name: string, kind: 'income' | 'expense', icon?: CategoryIcon) {
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
      icon,
      createdAt: now,
      updatedAt: now,
    }
    await addCategory(category)
    setCategories((current) => [...current, category])
    return category
  }

  async function handleCategoryIcon(id: string, icon: CategoryIcon) {
    const updated = await updateCategoryIcon(id, icon)
    setCategories((current) => current.map((category) => category.id === id ? updated : category))
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

  async function handleSaveDebt(debt: DebtRecord, principal?: LedgerTransaction) {
    await saveDebt(debt, principal)
    if (principal) setTransactions((current) => [...current, principal])
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
    actualOn = localDateInput(),
  ) {
    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      kind: 'income',
      occurredOn: actualOn,
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
    setSuccessMessage(`${formatPHP(amountCentavos)} nakuha na at kasama na sa balance.`)
  }

  async function handleSettleDebt(
    debt: DebtRecord,
    amountCentavos: number,
    dueOn: string,
    actualOn = localDateInput(),
  ) {
    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      kind: debt.direction === 'payable' ? 'expense' : 'income',
      occurredOn: actualOn,
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
    setSuccessMessage(`${formatPHP(amountCentavos)} ${debt.direction === 'payable' ? 'na bayad' : 'na nakolekta'} na-save na.`)
  }

  async function handlePayObligation(
    obligation: FinancialObligation,
    amountCentavos: number,
    dueOn: string,
    actualOn = localDateInput(),
  ) {
    const now = new Date().toISOString()
    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      kind: 'expense',
      occurredOn: actualOn,
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
    setSuccessMessage(`${formatPHP(amountCentavos)} na bayad, na-save na.`)
  }

  function saveForecastPreferences(value: ForecastPreferences) {
    setForecastPreferences(value)
    void savePreference('forecastView', JSON.stringify(value)).catch((error: unknown) =>
      setPageError(error instanceof Error ? error.message : 'Hindi na-save ang forecast settings.'))
  }

  async function handleSaveForecastSafetyBuffer(amountCentavos: number) {
    if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 0) {
      throw new TypeError('The safety buffer must be a non-negative centavo amount.')
    }
    await savePreference('forecastSafetyBufferCentavos', String(amountCentavos))
    setForecastSafetyBufferCentavos(amountCentavos)
    setSuccessMessage('Na-save sa device ang reserba mo.')
  }

  async function handleSaveSchedule(record: ScheduledRecord, principalDate?: string) {
    if (record.kind === 'expectedIncome') await handleSaveExpectedIncome(record)
    else if (record.kind === 'obligation') await handleSaveObligation(record)
    else if (principalDate !== undefined) {
      const principal: LedgerTransaction = {
        id: crypto.randomUUID(), kind: 'adjustment', walletId: record.walletId,
        amountCentavos: record.direction === 'payable' ? record.amountCentavos : -record.amountCentavos,
        description: record.direction === 'payable' ? 'Bagong hiram: ' + record.name : 'Bagong pautang: ' + record.name,
        occurredOn: principalDate, createdAt: record.createdAt, updatedAt: record.updatedAt,
      }
      await handleSaveDebt({ ...record, principalTransactionId: principal.id }, principal)
    } else await handleSaveDebt(record)
    setSuccessMessage('Na-save sa schedule. Kasama na ito sa forecast.')
    closeEntry()
  }

  async function handleSettleSchedule(record: ScheduledRecord, amount: number, dueOn: string, actualOn: string) {
    if (record.kind === 'expectedIncome') await handleReceiveIncome(record, amount, dueOn, actualOn)
    else if (record.kind === 'obligation') await handlePayObligation(record, amount, dueOn, actualOn)
    else await handleSettleDebt(record, amount, dueOn, actualOn)
  }

  function openEditSchedule(record: ScheduledRecord) {
    entryTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditingTransaction(null)
    setEditingSchedule(record)
    setTransactionDialogOpen(true)
  }

  const today = localDateInput()
  const endDate = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
  const endOn = today.slice(0, 8) + String(endDate).padStart(2, '0')
  const atHome = page === 'home'
  const hideBrandMascot = atHome && greetingVisible && !dialogOpen
  const month = useMemo(() => {
    if (!atHome || loading || walletLoadError || planningLoadError || !wallets.length) return
    try {
      const [result] = calculateForecast({
        wallets, transactions, expectedIncomes, debts, obligations, today, endOn,
        safetyBufferCentavos: forecastSafetyBufferCentavos,
      }, ['expected'])
      const amounts = (direction: 'inflow' | 'outflow') =>
        sumCentavos(result.events.filter((event) => event.direction === direction).map((event) => event.amountCentavos))
      return { result, incoming: amounts('inflow'), outgoing: amounts('outflow') }
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'Hindi maipakita ang forecast.' }
    }
  }, [atHome, loading, walletLoadError, planningLoadError, wallets, transactions, expectedIncomes, debts,
    obligations, today, endOn, forecastSafetyBufferCentavos])

  const outstanding = useMemo(() => {
    if (!atHome || loading || planningLoadError) return {}
    try { return { amount: outstandingObligations(debts, obligations, today) } }
    catch { return { error: 'Hindi makuwenta ang kabuuang babayaran.' } }
  }, [atHome, loading, planningLoadError, debts, obligations, today])

  async function saveBalanceAdjustment(amountCentavos: number, reason: string, recorded: number) {
    if (!adjustingWallet) return
    const now = new Date().toISOString()
    const entry: LedgerTransaction = {
      id: crypto.randomUUID(), kind: 'adjustment', walletId: adjustingWallet.id,
      occurredOn: localDateInput(), description: reason || 'Balance adjustment',
      amountCentavos, createdAt: now, updatedAt: now,
    }
    await saveTransaction(entry, recorded)
    setTransactions((current) => [...current, entry])
    setAdjustingWallet(undefined)
    setSuccessMessage('Na-adjust na ang wallet. Makikita ang record sa Activity.')
  }

  const lastEntryDefaults = useMemo(() => {
    let latest: { walletId: string; updatedAt: string; kind: EntryKind } | undefined
    const activeIds = new Set(wallets.filter((wallet) => !wallet.archived).map((wallet) => wallet.id))
    for (const group of [transactions, expectedIncomes, debts, obligations]) {
      for (const record of group) {
        if (record.kind !== 'adjustment' && activeIds.has(record.walletId) && (!latest || latest.updatedAt < record.updatedAt)) {
          const kind = record.kind === 'debt' ? record.direction : record.kind === 'obligation' ? 'expense'
            : record.kind === 'expectedIncome' ? 'income' : record.kind
          latest = { walletId: record.walletId, updatedAt: record.updatedAt, kind }
        }
      }
    }
    return latest
  }, [wallets, transactions, expectedIncomes, debts, obligations])

  const currentLabel = pages.find((item) => item.id === page)?.label ?? 'Home'
  const activeWallets = wallets.filter((wallet) => !wallet.archived)
  const archivedWallets = wallets.filter((wallet) => wallet.archived)
  const financialDataError = ledger.error || (
    !loading && !walletLoadError && !totals
      ? 'Combined wallet balances exceed the safe integer range; no total is shown.'
      : ''
  )

  async function changeHumor(key: 'humorEnabled' | 'profanityEnabled', enabled: boolean) {
    try {
      await savePreference(key, String(enabled))
      if (key === 'humorEnabled') setHumorEnabled(enabled)
      else setProfanityEnabled(enabled)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The humor preference could not be saved.')
    }
  }

  const walletContext: GengContext = !activeWallets.length ? 'new-wallet'
    : balanceVisible && totals && totals.spendable <= 0 ? 'tight-wallet'
      : activeWallets.some((wallet) => wallet.protected) ? 'saving'
        : balanceVisible && month?.result && month.result.minimumSpendableCentavos > 0
          && month.result.walletSummaries.every((wallet) => !wallet.shortageEpisodes.length) ? 'healthy-wallet' : 'generic'
  const pageContext: Record<Page, GengContext> = {
    home: walletContext, wallets: walletContext, activity: 'ledger', forecast: 'forecast',
    plans: 'planning', more: 'generic',
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Dumiretso sa content</a>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setPage('home')}>
          <span className="brand-mascot-slot" data-hidden={hideBrandMascot}><Mascot className="mascot-brand" /></span>
          <span><strong>mpkpb?</strong><small>May Pera Ka Pa Ba?</small></span>
        </a>

        <nav className="side-nav" aria-label="Main navigation">
          {pages.map((item) => (
            <button
              className={`nav-link${page === item.id ? ' active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true"><item.icon className="ui-icon" aria-hidden="true" /></span>
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <span className="privacy-lock" aria-hidden="true"><LockKeyhole className="ui-icon" aria-hidden="true" /></span>
          <strong>Dito lang ang data mo.</strong>
          <p>Sa device na ito lang naka-save. Walang account o cloud.</p>
        </div>
        <div className={`sidebar-status${pageError ? ' status-error' : ''}`}>
          <span className="status-dot" /> {pageError ? 'Local storage needs attention' : 'Naka-save sa device'}
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mascot-slot" data-hidden={hideBrandMascot}><Mascot className="mascot-brand" /></span><strong>mpkpb?</strong></div>
          <div className="breadcrumb"><strong>{currentLabel}</strong></div>
          <div className="top-actions">
            <span className="today-label">{todayLabel}</span>
            {page !== 'home' && page !== 'activity' && <button className="button button-primary top-quick-add"
              type="button" disabled={loading || walletLoadError} onClick={activeWallets.length ? openTransactionDialog : openWalletDialog}>
              {activeWallets.length ? 'Add record' : 'Add wallet'}
            </button>}
            <button
              className="icon-button"
              type="button"
              aria-label={balanceVisible ? 'Itago ang balances' : 'Ipakita ang balances'}
              title={balanceVisible ? 'Itago ang balances' : 'Ipakita ang balances'}
              onClick={() => setBalanceVisible((visible) => !visible)}
            >{balanceVisible ? <Eye className="ui-icon" aria-hidden="true" /> : <EyeOff className="ui-icon" aria-hidden="true" />}</button>
            <button
              className="icon-button"
              type="button"
              aria-label={`Current theme: ${theme}. Change theme`}
              title={`Theme: ${theme}`}
              onClick={() => void changeTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
            >{theme === 'system' ? <Monitor className="ui-icon" aria-hidden="true" /> : theme === 'light' ? <Sun className="ui-icon" aria-hidden="true" /> : <Moon className="ui-icon" aria-hidden="true" />}</button>
          </div>
        </header>

        <main className="page-content" id="main-content" tabIndex={-1}>
          <OfflineStatus showReady={page === 'more'} />
          {!loading && !walletLoadError && !planningLoadError && humorEnabled && page !== 'more' && page !== 'home' && (
            <p className="geng-note"><span aria-hidden="true">{GENG_EXPRESSION}</span> {getGengMessage(pageContext[page], { humorEnabled, profanityEnabled })}</p>
          )}
          {pageError && (
            <div className="error-banner" role="alert">
              <CircleAlert className="ui-icon" aria-hidden="true" /><span>{pageError}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPageError('')
                  setLoading(true)
                  setLoadAttempt((attempt) => attempt + 1)
                }}
              >Subukan ulit</button>
              <button type="button" className="text-button" onClick={() => setPageError('')}>Isara</button>
            </div>
          )}
          {financialDataError && !walletLoadError && (
            <div className="error-banner" role="alert">
              <span>{financialDataError}</span>
            </div>
          )}
          {successMessage && (
            <div className="success-banner" role="status">
              <CircleCheck className="ui-icon" aria-hidden="true" /><span>{successMessage}</span>
              <button type="button" className="text-button" onClick={() => setSuccessMessage('')}>Isara</button>
            </div>
          )}
          {page === 'home' && (
            <Dashboard
              displayName={displayName}
              animateMascot={!dialogOpen && !transactionDialogOpen && !walletToArchive && !transactionToDelete}
              gengMessage={humorEnabled && !loading && !walletLoadError
                ? getGengMessage(walletContext, { humorEnabled, profanityEnabled }) : undefined}
              wallets={activeWallets}
              totals={totals}
              balances={ledger.balances}
              visible={balanceVisible}
              loading={loading}
              dataUnavailable={walletLoadError}
              onAddWallet={openWalletDialog}
              onQuickAdd={openTransactionDialog}
              month={month}
              outstanding={outstanding}
              onGreetingVisibility={setGreetingVisible}
              upcoming={!loading && !walletLoadError && !planningLoadError && wallets.length > 0 && (
                <UpcomingList records={[...expectedIncomes, ...debts, ...obligations]} today={today}
                  visible={balanceVisible} onEdit={openEditSchedule} onSettle={handleSettleSchedule} />
              )}
              onForecast={() => setPage('forecast')}
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
              onAdjust={setAdjustingWallet}
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
          <Suspense fallback={<p role="status">Binubuksan ang page…</p>}>
          {page === 'forecast' && (
            <ForecastPage
              wallets={wallets}
              transactions={transactions}
              expectedIncomes={expectedIncomes}
              debts={debts}
              obligations={obligations}
              loading={loading}
              dataUnavailable={walletLoadError || planningLoadError}
              visible={balanceVisible}
              safetyBufferCentavos={forecastSafetyBufferCentavos}
              budgetPlans={budgetPlans}
              preferences={forecastPreferences}
              onChangePreferences={saveForecastPreferences}
              onSaveSafetyBuffer={handleSaveForecastSafetyBuffer}
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
          {page === 'more' && (
            <fieldset className="geng-settings">
              <legend>Geng Geng</legend>
              <label><input type="checkbox" checked={humorEnabled} disabled={loading}
                onChange={(event) => void changeHumor('humorEnabled', event.target.checked)} /> Show Taglish humor</label>
              <label><input type="checkbox" checked={profanityEnabled} disabled={loading || !humorEnabled}
                onChange={(event) => void changeHumor('profanityEnabled', event.target.checked)} /> Allow mild profanity</label>
            </fieldset>
          )}
          {page === 'more' && (
            <ToolsPage
              wallets={wallets}
              transactions={transactions}
              categories={categories}
              budgetPlans={budgetPlans}
              expectedIncomes={expectedIncomes}
              debts={debts}
              obligations={obligations}
              loading={loading}
              dataUnavailable={walletLoadError || planningLoadError}
              visible={balanceVisible}
              theme={theme}
              onThemeChange={(next) => void changeTheme(next)}
            />
          )}
          </Suspense>
          {page === 'more' && !loading && <><DataSafety /><PrivacySettings /></>}
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
            <span aria-hidden="true"><item.icon className="ui-icon" aria-hidden="true" /></span><small>{item.label}</small>
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
              {isOnboarding && <Mascot className="mascot-onboarding" />}
              <div>
                <span className="eyebrow">{isOnboarding ? 'WELCOME TO MPKPB?' : editingWallet ? 'WALLET DETAILS' : 'WALLET SETUP'}</span>
                <h2 id="dialog-title">{isOnboarding ? 'Saan mo nilalagay ang pera mo?' : editingWallet ? 'Edit wallet' : 'Add wallet'}</h2>
                <p>{isOnboarding ? 'Dito lang sa browser ang data mo. Add ka ng wallet para magsimula, o i-skip muna.' : 'Cash, GCash, bank account, o saan man nakalagay ang pera mo.'}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Isara" onClick={() => void closeWalletDialog()} title="Isara"><X className="ui-icon" aria-hidden="true" /></button>
            </div>
            <form className="wallet-form" onSubmit={(event) => void handleSaveWallet(event)}>
              {wallets.length === 0 && !editingWallet && (
                <label className="field">
                  <span>Your name <small>optional</small></span>
                  <input name="displayName" autoComplete="given-name" placeholder="What should we call you?" />
                </label>
              )}
              <label className="field">
                <span>Pangalan ng wallet</span>
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
                <WalletIconPicker initial={editingWallet?.icon ?? defaultWalletIcon('E-wallet')} />
              </div>
              <div className="form-row">
                <label className="field">
                  <span>Starting balance</span>
                  <span className="currency-input">
                    <b>₱</b>
                    <input
                      name="openingBalance"
                      inputMode="decimal"
                      defaultValue={editingWallet?.openingBalanceCentavos ? centavosInput(editingWallet.openingBalanceCentavos) : ''}
                      readOnly={Boolean(editingWallet && transactions.some((transaction) =>
                        transaction.walletId === editingWallet.id || transaction.toWalletId === editingWallet.id,
                      ))}
                      placeholder="0.00"
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
                <span><strong>Pera na hindi gagalawin</strong><small>Hiwalay ito sa pwedeng gastusin.</small></span>
              </label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="dialog-actions">
                <button className="button button-quiet" type="button" onClick={() => void closeWalletDialog()}>{isOnboarding ? 'Skip for now' : 'Cancel'}</button>
                <button className="button button-primary" type="submit">{editingWallet ? 'Save changes' : 'Save wallet'}</button>
              </div>
              <p className="form-privacy"><LockKeyhole className="ui-icon" aria-hidden="true" /> Saved on this device only.</p>
            </form>
          </section>
        </div>
      )}
      {adjustingWallet && ledger.balances?.get(adjustingWallet.id) !== undefined && (
        <AdjustBalance name={adjustingWallet.name} recorded={ledger.balances.get(adjustingWallet.id)!}
          onClose={() => setAdjustingWallet(undefined)} onSave={saveBalanceAdjustment} />
      )}
      {transactionDialogOpen && (
        <TransactionDialog
          wallets={wallets}
          categories={categories}
          editingTransaction={editingTransaction}
          editingSchedule={editingSchedule}
          lastWalletId={lastEntryDefaults?.walletId}
          lastKind={lastEntryDefaults?.kind}
          budgetPlans={budgetPlans}
          onSchedule={handleSaveSchedule}
          onClose={closeEntry}
          onSave={handleSaveTransaction}
          onCategoryIcon={handleCategoryIcon}
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

            <h2 id="delete-transaction-title">Burahin ang record na ito?</h2>
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
              <button className="button button-danger" type="button" onClick={() => void confirmDeleteTransaction()}>Burahin ang record</button>
            </div>
          </section>
        </div>
      )}
      {walletToArchive && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setWalletToArchive(null)
        }}>
          <section ref={archiveDialogRef} className="wallet-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-title" aria-describedby="archive-description">

            <h2 id="archive-title">Archive {walletToArchive.name}?</h2>
            <p id="archive-description">Mawawala ito sa active na listahan at sa pwedeng gastusin. Kasama pa rin ang wallet sa total at pwede mong ibalik.</p>
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
  animateMascot,
  outstanding,
  onGreetingVisibility,
  gengMessage,
  wallets,
  totals,
  balances,
  visible,
  loading,
  dataUnavailable,
  onAddWallet,
  onViewWallets,
  onQuickAdd,
  onForecast,
  month,
  upcoming,
}: {
  gengMessage?: string
  displayName: string
  animateMascot: boolean
  outstanding: { amount?: number; error?: string }
  onGreetingVisibility: (visible: boolean) => void
  wallets: Wallet[]
  totals: { all: number; spendable: number } | null
  balances: ReadonlyMap<string, number> | null
  visible: boolean
  loading: boolean
  dataUnavailable: boolean
  onAddWallet: () => void
  onViewWallets: () => void
  onQuickAdd: () => void
  onForecast: () => void
  upcoming: import('react').ReactNode
  month?: { result?: ReturnType<typeof calculateForecast>[number]; incoming?: number; outgoing?: number; error?: string }
}) {
  const greeting = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!greeting.current || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => onGreetingVisibility(entry.isIntersecting))
    observer.observe(greeting.current)
    return () => { observer.disconnect(); onGreetingVisibility(false) }
  }, [onGreetingVisibility])
  const money = (amount: number | undefined) => amount === undefined ? '—' : visible ? formatPHP(amount) : '••••'
  const shortage = month?.result?.spendableShortageEpisodes[0]
  const walletShortage = month?.result?.walletSummaries.flatMap((wallet) => wallet.shortageEpisodes)
    .sort((a, b) => a.startOn.localeCompare(b.startOn))[0]
  const shortageDate = [shortage?.startOn, walletShortage?.startOn].filter(Boolean).sort()[0]

  return (
    <>
      <div className="page-heading">
        <div className="greeting-copy" ref={greeting}>
          <Mascot animated={animateMascot} className="greeting-mascot" />
          <div>
            <h1>Kumusta{displayName ? ', ' + displayName : ''}<span className="green-dot">.</span></h1>
            <p>Eto ang pera mo ngayon at ang paparating ngayong buwan.</p>
          </div>
        </div>
        <button className="button button-primary add-wallet-button" type="button" onClick={wallets.length ? onQuickAdd : onAddWallet} disabled={loading || dataUnavailable}>
          <Plus className="ui-icon" aria-hidden="true" /> {wallets.length ? 'Add record' : 'Add wallet'}
        </button>
      </div>
      <section className="balance-grid" aria-label="Balance overview">
        <article className="balance-card primary-card">
          <div className="card-label-row"><span className="metric-label">Pera mo ngayon</span><span className="card-icon"><WalletIconGlyph className="ui-icon" aria-hidden="true" /></span></div>
          <strong className="balance-amount">{loading ? '…' : totals ? visible ? formatPHP(totals.all) : '₱ ••••••' : '—'}</strong>
          <span className="metric-caption">Kasama lahat ng wallet</span>
        </article>
        <article className="balance-card">
          <div className="card-label-row"><span className="metric-label">Pwedeng gastusin</span><span className="card-icon mint-icon"><ShieldCheck className="ui-icon" aria-hidden="true" /></span></div>
          <strong className="balance-amount">{loading ? '…' : totals ? visible ? formatPHP(totals.spendable) : '₱ ••••••' : '—'}</strong>
          <span className="metric-caption">Hiwalay ang pera na hindi gagalawin</span>
        </article>
      </section>

      <section className="panel upcoming-panel" aria-label="Tantiya hanggang katapusan">
        <div className="panel-heading"><h2>Aabot ba hanggang katapusan?</h2>
          <button className="text-button" type="button" onClick={onForecast}>Tingnan ang forecast</button>
        </div>
        {month?.error && <p role="alert">{month.error}</p>}
        {!month?.error && <>
          <dl className="month-summary">
            <div><dt>Paparating na pera</dt><dd>{money(month?.incoming)}</dd></div>
            <div><dt>Due hanggang katapusan</dt><dd>{money(month?.outgoing)}</dd></div>
            <div><dt>Matitira sa'yo</dt><dd>{money(month?.result?.endingTotalCentavos)}</dd></div>
          </dl>
          {shortageDate ? <p className="form-error" role="status">Kukulangin ang spendable na pera o isang wallet simula {shortageDate}.</p>
            : month?.result && <p>Sa projection, kasya hanggang katapusan base sa mga naka-schedule.</p>}
        </>}
      </section>
<section className="panel upcoming-panel"><h2>Mga babayaran</h2><strong>{money(outstanding.amount)}</strong><p>Natitirang bayarin at utang sa lahat ng petsa. Sa paulit-ulit na bill na walang end date, kasama ang susunod na hindi pa bayad.</p>{outstanding.error && <p role="alert">{outstanding.error}</p>}</section>
      {upcoming}
      {gengMessage && <p className="geng-note"><span aria-hidden="true">{GENG_EXPRESSION}</span> {gengMessage}</p>}
      <div>
        <section className="panel wallet-panel">
          <div className="panel-heading">
            <div><h2>Mga wallet mo</h2></div>
            {wallets.length > 0 && <button className="link-button" type="button" onClick={onViewWallets}>View all <ChevronRight className="ui-icon" aria-hidden="true" /></button>}
          </div>
          {loading ? (
            <p className="loading-state">Binabasa ang wallet mo…</p>
          ) : dataUnavailable ? (
            <p className="error-state">Wallet details could not be loaded. Use the retry action above to try again.</p>
          ) : wallets.length === 0 ? (
            <div className="empty-wallets">
              <div><strong>Wala pang wallet.</strong><p>Ilagay ang cash, GCash, o bank account na gusto mong i-track.</p></div>
              <button className="button button-outline" type="button" onClick={onAddWallet}>Set up a wallet <ChevronRight className="ui-icon" aria-hidden="true" /></button>
            </div>
          ) : (
            <div className="wallet-list">
              {wallets.slice(0, 4).map((wallet) => <WalletRow key={wallet.id} wallet={wallet} balanceCentavos={balances?.get(wallet.id)} visible={visible} />)}
            </div>
          )}
        </section>
      </div>

      <div className="privacy-note"><span aria-hidden="true"><LockKeyhole className="ui-icon" aria-hidden="true" /></span><p><strong>Local-first, for real.</strong> Data stays in this browser on this device. Clearing browser storage removes it. Download a backup from More.</p></div>
    </>
  )
}

function WalletRow({
  wallet,
  balanceCentavos,
  visible,
  onEdit,
  onAdjust,
  onArchive,
  onRestore,
}: {
  wallet: Wallet
  balanceCentavos?: number
  visible: boolean
  onAdjust?: (wallet: Wallet) => void
  onEdit?: (wallet: Wallet) => void
  onArchive?: (wallet: Wallet) => void
  onRestore?: (wallet: Wallet) => void
}) {
  return (
    <div className="wallet-row">
      <span className={`wallet-avatar wallet-color-${wallet.color}`} aria-hidden="true"><WalletSymbol icon={wallet.icon} /></span>
      <span className="wallet-info"><strong>{wallet.name}</strong><small>{wallet.type}{wallet.protected ? ' · Protected' : ''}</small></span>
      <strong className="wallet-amount">{visible ? balanceCentavos === undefined ? '—' : formatPHP(balanceCentavos) : '₱ ••••••'}</strong>
      {(onEdit || onArchive || onRestore) ? (
        <div className="wallet-actions">
          {onEdit && <button className="wallet-action" type="button" onClick={() => onEdit(wallet)} aria-label={`Edit ${wallet.name}`}>Edit</button>}
          {onAdjust && balanceCentavos !== undefined && <button className="wallet-action" type="button" onClick={() => onAdjust(wallet)}><SlidersHorizontal className="ui-icon" aria-hidden="true" /> Adjust balance</button>}
          {onArchive && <button className="wallet-action archive-action" type="button" onClick={() => onArchive(wallet)} aria-label={`Archive ${wallet.name}`}>Archive</button>}
          {onRestore && <button className="wallet-action" type="button" onClick={() => onRestore(wallet)} aria-label={`Restore ${wallet.name}`}>Restore</button>}
        </div>
      ) : <span className="row-chevron" aria-hidden="true"><ChevronRight className="ui-icon" aria-hidden="true" /></span>}
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
  onAdjust,
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
  onAdjust: (wallet: Wallet) => void
  onEdit: (wallet: Wallet) => void
  onArchive: (wallet: Wallet) => void
  onRestore: (wallet: Wallet) => void
}) {
  return (
    <>
      <div className="page-heading">
        <div><h1>Wallets</h1><p>Tingnan ang cash, e-wallet, bank, at ipon mo.</p></div>
        <button className="button button-primary add-wallet-button" type="button" onClick={onAdd}><Plus className="ui-icon" aria-hidden="true" /> Add wallet</button>
      </div>
      <section className="panel wallets-page-panel">
        <div className="wallets-summary"><div><span className="metric-label">TOTAL ACROSS WALLETS</span><strong>{loading ? '…' : totals ? visible ? formatPHP(totals.all) : '₱ ••••••' : '—'}</strong></div><span>{loading ? 'Loading wallets…' : dataUnavailable ? '— active · — archived' : `${wallets.length} active · ${archivedWallets.length} archived`}</span></div>
        {loading ? (
          <p className="loading-state">Loading your wallets…</p>
        ) : dataUnavailable ? (
          <p className="error-state">Wallet details could not be loaded. Use the retry action above to try again.</p>
        ) : wallets.length === 0 && archivedWallets.length === 0 ? (
          <div className="empty-page"><Mascot className="mascot-empty" /><h2>Wala pang wallet</h2><p>Add ka ng wallet para makita lahat ng pera mo rito.</p><button className="button button-primary" type="button" onClick={onAdd}><Plus className="ui-icon" aria-hidden="true" /> Add your first wallet</button></div>
        ) : (
          <>
            {wallets.length > 0 ? (
              <div className="wallet-list">
                {wallets.map((wallet) => <WalletRow key={wallet.id} wallet={wallet} balanceCentavos={balances?.get(wallet.id)} visible={visible} onEdit={onEdit} onAdjust={onAdjust} onArchive={onArchive} />)}
              </div>
            ) : !loading && <div className="empty-active-wallets"><p>No active wallets. Your archived balances remain in the total.</p><button className="button button-outline" type="button" onClick={onAdd}><Plus className="ui-icon" aria-hidden="true" /> Add wallet</button></div>}
            {archivedWallets.length > 0 && (
              <section className="archived-wallets" aria-labelledby="archived-wallets-title">
                <h2 id="archived-wallets-title">Mga naka-archive na wallet</h2>
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

export default function PrivateApp() {
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const channel = new BroadcastChannel(localSessionChannel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === 'reload') window.location.reload()
    }
    return () => channel.close()
  }, [])

  return <PrivacyGate><App /></PrivacyGate>
}
