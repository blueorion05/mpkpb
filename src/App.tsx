import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createWallet,
  getPreference,
  getWallets,
  isWalletType,
  savePreference,
  type Wallet,
} from './db/database'
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

function App() {
  const [page, setPage] = useState<Page>('home')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [theme, setTheme] = useState<Theme>('system')
  const [displayName, setDisplayName] = useState('')
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [savedWallets, savedTheme, savedName] = await Promise.all([
          getWallets(),
          getPreference('theme'),
          getPreference('displayName'),
        ])
        if (!active) return
        setWallets(savedWallets)
        if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme)
        }
        setDisplayName(savedName ?? '')
      } catch (error) {
        if (active) {
          setPageError(
            error instanceof Error ? error.message : 'Local data could not be loaded.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (!dialogOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogOpen])

  const totals = useMemo(() => {
    try {
      return {
        all: sumCentavos(wallets.map((wallet) => wallet.openingBalanceCentavos)),
        spendable: sumCentavos(
          wallets
            .filter((wallet) => !wallet.protected)
            .map((wallet) => wallet.openingBalanceCentavos),
        ),
      }
    } catch {
      return null
    }
  }, [wallets])

  async function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    try {
      await savePreference('theme', nextTheme)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Theme preference could not be saved.')
    }
  }

  async function handleCreateWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('walletName') ?? '').trim()
    const type = String(formData.get('walletType') ?? '')
    const amount = parsePesoToCentavos(String(formData.get('openingBalance') ?? ''))

    if (!name) {
      setFormError('Add a name for this wallet.')
      return
    }
    if (!isWalletType(type)) {
      setFormError('Choose a valid wallet type.')
      return
    }
    if (amount === null) {
      setFormError('Enter an amount with no more than two decimal places.')
      return
    }

    const now = new Date().toISOString()
    const wallet: Wallet = {
      id: crypto.randomUUID(),
      name,
      type,
      openingBalanceCentavos: amount,
      protected: formData.get('protected') === 'on',
      archived: false,
      createdAt: now,
      updatedAt: now,
    }
    const nameInput = String(formData.get('displayName') ?? '').trim()

    try {
      await createWallet(wallet, nameInput || undefined)
      setWallets((current) => [...current, wallet])
      if (nameInput) setDisplayName(nameInput)
      setDialogOpen(false)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'The wallet could not be saved.',
      )
    }
  }

  const currentLabel = pages.find((item) => item.id === page)?.label ?? 'Home'
  const date = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const openWalletDialog = () => {
    setFormError('')
    setDialogOpen(true)
  }

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
            <span className="today-label">{date}</span>
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
              <button type="button" className="text-button" onClick={() => setPageError('')}>Dismiss</button>
            </div>
          )}
          {page === 'home' && (
            <Dashboard
              displayName={displayName}
              wallets={wallets}
              totals={totals}
              visible={balanceVisible}
              loading={loading}
              onAddWallet={openWalletDialog}
              onViewWallets={() => setPage('wallets')}
            />
          )}
          {page === 'wallets' && (
            <WalletsPage
              wallets={wallets}
              totals={totals}
              visible={balanceVisible}
              loading={loading}
              onAdd={openWalletDialog}
            />
          )}
          {page === 'activity' && (
            <ComingSoon title="Activity" detail="Income, expenses, and transfers belong in one clear ledger. That is the next build phase." />
          )}
          {page === 'plans' && (
            <ComingSoon title="Budget plans" detail="Build a plan around your real life — not a spreadsheet that makes you cry." />
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
            if (event.target === event.currentTarget) setDialogOpen(false)
          }}
        >
          <section className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">{wallets.length === 0 ? 'LET’S GET STARTED' : 'WALLET SETUP'}</span>
                <h2 id="dialog-title">{wallets.length === 0 ? 'Where’s your money?' : 'Add a wallet'}</h2>
                <p>Cash, GCash, savings — whatever keeps your pera.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setDialogOpen(false)}>×</button>
            </div>
            <form className="wallet-form" onSubmit={(event) => void handleCreateWallet(event)}>
              {wallets.length === 0 && (
                <label className="field">
                  <span>Your name <small>optional</small></span>
                  <input name="displayName" autoComplete="given-name" placeholder="What should we call you?" />
                </label>
              )}
              <label className="field">
                <span>Wallet name</span>
                <input name="walletName" autoFocus required placeholder="e.g. GCash" />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>Wallet type</span>
                  <select name="walletType" defaultValue="E-wallet">
                    <option>Cash</option><option>E-wallet</option><option>Bank</option>
                    <option>Savings</option><option>Emergency fund</option><option>Other</option>
                  </select>
                </label>
                <label className="field">
                  <span>Starting balance</span>
                  <span className="currency-input">
                    <b>₱</b>
                    <input name="openingBalance" inputMode="decimal" defaultValue="0.00" required aria-label="Starting balance in pesos" />
                  </span>
                </label>
              </div>
              <label className="checkbox-field">
                <input type="checkbox" name="protected" />
                <span><strong>Protect this money</strong><small>Exclude it from spendable funds.</small></span>
              </label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="dialog-actions">
                <button className="button button-quiet" type="button" onClick={() => setDialogOpen(false)}>Not now</button>
                <button className="button button-primary" type="submit">＋ Save wallet</button>
              </div>
              <p className="form-privacy">⌑ Saved on this device only.</p>
            </form>
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
  visible,
  loading,
  onAddWallet,
  onViewWallets,
}: {
  displayName: string
  wallets: Wallet[]
  totals: { all: number; spendable: number } | null
  visible: boolean
  loading: boolean
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
          <div className="card-label-row"><span className="metric-label">TOTAL STARTING BALANCE</span><span className="card-icon">▣</span></div>
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
          <strong className="balance-amount">{loading ? '…' : wallets.length}</strong>
          <span className="metric-caption">Places where your pera lives</span>
        </article>
      </section>

      {!totals && !loading && <div className="error-banner" role="alert">A saved wallet amount exceeds the safe calculation range. No total is shown.</div>}

      <div className="dashboard-grid">
        <section className="panel wallet-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">THE BREAKDOWN</span><h2>Your wallets</h2></div>
            {wallets.length > 0 && <button className="link-button" type="button" onClick={onViewWallets}>View all ›</button>}
          </div>
          {loading ? (
            <p className="loading-state">Getting your money together…</p>
          ) : wallets.length === 0 ? (
            <div className="empty-wallets">
              <span className="empty-icon" aria-hidden="true">▣</span>
              <div><strong>Your wallets are waiting for an intro.</strong><p>Add your cash, GCash, or bank account to see everything in one place.</p></div>
              <button className="button button-outline" type="button" onClick={onAddWallet}>Set up a wallet ›</button>
            </div>
          ) : (
            <div className="wallet-list">
              {wallets.slice(0, 4).map((wallet, index) => <WalletRow key={wallet.id} wallet={wallet} visible={visible} index={index} />)}
            </div>
          )}
        </section>
        <aside className="panel insight-panel">
          <span className="insight-icon" aria-hidden="true">✦</span>
          <span className="eyebrow">GENG GENG SAYS</span>
          <h2>{wallets.length ? 'Good start. Now let’s track the plot.' : 'No judgment. We all start somewhere.'}</h2>
          <p>{wallets.length
            ? 'Wallets are saved on this device. Transaction tracking and forecasts are up next.'
            : 'Your financial glow-up starts with one wallet. Add what you have — kahit pang-meryenda lang.'}</p>
          <div className="insight-footer"><span className="status-dot" /> Private by design</div>
        </aside>
      </div>

      <div className="privacy-note"><span aria-hidden="true">⌑</span><p><strong>Local-first, for real.</strong> Data stays in this browser on this device. Clearing browser storage removes it; backup tools are planned.</p></div>
    </>
  )
}

function WalletRow({ wallet, visible, index }: { wallet: Wallet; visible: boolean; index: number }) {
  return (
    <div className="wallet-row">
      <span className={`wallet-avatar wallet-color-${index % 4}`} aria-hidden="true">▣</span>
      <span className="wallet-info"><strong>{wallet.name}</strong><small>{wallet.type}{wallet.protected ? ' · Protected' : ''}</small></span>
      <strong className="wallet-amount">{visible ? formatPHP(wallet.openingBalanceCentavos) : '₱ ••••••'}</strong>
      <span className="row-chevron" aria-hidden="true">›</span>
    </div>
  )
}

function WalletsPage({
  wallets,
  totals,
  visible,
  loading,
  onAdd,
}: {
  wallets: Wallet[]
  totals: { all: number; spendable: number } | null
  visible: boolean
  loading: boolean
  onAdd: () => void
}) {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">ALL YOUR PERA, ONE PLACE</span><h1>Wallets</h1><p>Keep tabs on where your money is hanging out.</p></div>
        <button className="button button-primary add-wallet-button" type="button" onClick={onAdd}>＋ Add wallet</button>
      </div>
      <section className="panel wallets-page-panel">
        <div className="wallets-summary"><div><span className="metric-label">TOTAL STARTING BALANCE</span><strong>{loading ? '…' : totals ? visible ? formatPHP(totals.all) : '₱ ••••••' : '—'}</strong></div><span>{wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}</span></div>
        {wallets.length === 0 && !loading ? (
          <div className="empty-page"><span className="empty-icon" aria-hidden="true">▣</span><h2>No wallets yet</h2><p>Add a wallet to see your money in one place.</p><button className="button button-primary" type="button" onClick={onAdd}>＋ Add your first wallet</button></div>
        ) : <div className="wallet-list">{wallets.map((wallet, index) => <WalletRow key={wallet.id} wallet={wallet} visible={visible} index={index} />)}</div>}
      </section>
    </>
  )
}

function ComingSoon({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="feature-empty">
      <span className="feature-icon" aria-hidden="true">✳</span>
      <span className="eyebrow">ONE STEP AT A TIME</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      <span className="phase-label"><span className="status-dot" /> Foundation phase</span>
    </section>
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
