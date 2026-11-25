import { useMemo, useState } from 'react'
import {
  filterAndSortTransactions,
  isTransactionKind,
  type LedgerTransaction,
  type TransactionCategory,
  type TransactionKind,
} from '../domain/ledger'
import { formatPHP, sumCentavos } from '../domain/money'
import type { Wallet } from '../db/database'

interface ActivityPageProps {
  wallets: readonly Wallet[]
  transactions: readonly LedgerTransaction[]
  categories: readonly TransactionCategory[]
  summary: {
    incomeCentavos: number
    totalExpenseCentavos: number
    netChangeCentavos: number
  } | null
  loading: boolean
  dataUnavailable: boolean
  canAdd: boolean
  onAdd: () => void
  onEdit: (transaction: LedgerTransaction) => void
  onDelete: (transaction: LedgerTransaction) => void
}

const transactionDateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

const kindLabels: Record<TransactionKind, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  adjustment: 'Balance adjustment',
}

function transactionAmount(transaction: LedgerTransaction): string {
  switch (transaction.kind) {
    case 'income':
      return `+${formatPHP(transaction.amountCentavos)}`
    case 'expense':
      return `−${formatPHP(transaction.amountCentavos)}`
    case 'transfer':
      return `−${formatPHP(sumCentavos([
        transaction.amountCentavos,
        transaction.feeCentavos ?? 0,
      ]))}`
    case 'adjustment':
      return `${transaction.amountCentavos > 0 ? '+' : '−'}${formatPHP(Math.abs(transaction.amountCentavos))}`
  }
}

export default function ActivityPage({
  wallets,
  transactions,
  categories,
  summary,
  loading,
  dataUnavailable,
  canAdd,
  onAdd,
  onEdit,
  onDelete,
}: ActivityPageProps) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<TransactionKind | 'all'>('all')
  const [walletId, setWalletId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')

  const filteredTransactions = useMemo(
    () => filterAndSortTransactions(transactions, {
      query,
      kind,
      walletId,
      categoryId,
      fromDate,
      toDate,
      sort,
    }, categories, wallets),
    [transactions, query, kind, walletId, categoryId, fromDate, toDate, sort, categories, wallets],
  )
  const categoryOptions = kind === 'income' || kind === 'expense'
    ? categories.filter((category) => category.kind === kind)
    : categories
  const netChange = summary?.netChangeCentavos ?? null

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR MONEY, ACCOUNTED FOR</span>
          <h1>Activity</h1>
          <p>Every peso has a story. Keep the whole picture close.</p>
        </div>
        {!loading && !dataUnavailable && transactions.length > 0 && !summary && (
          <div className="error-banner" role="alert">
            Ledger totals exceed the safe calculation range. No summary is shown.
          </div>
        )}
        <button className="button button-primary add-wallet-button" type="button" onClick={onAdd} disabled={!canAdd}>
          <span aria-hidden="true">＋</span> Add transaction
        </button>
      </div>

      <section className="activity-summary" aria-label="Transaction summary">
        <article className="panel activity-metric">
          <span className="metric-label">INCOME</span>
          <strong>{loading ? '…' : summary ? formatPHP(summary.incomeCentavos) : '—'}</strong>
        </article>
        <article className="panel activity-metric">
          <span className="metric-label">EXPENSES + FEES</span>
          <strong>{loading ? '…' : summary ? formatPHP(summary.totalExpenseCentavos) : '—'}</strong>
        </article>
        <article className="panel activity-metric">
          <span className="metric-label">NET CHANGE</span>
          <strong>{loading ? '…' : netChange === null ? '—' : `${netChange > 0 ? '+' : netChange < 0 ? '−' : ''}${formatPHP(Math.abs(netChange))}`}</strong>
        </article>
      </section>

      <section className="panel activity-panel" aria-label="Transaction history">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">LEDGER</span>
            <h2>Transaction history</h2>
          </div>
          <span className="activity-count">{loading ? 'Loading…' : `${filteredTransactions.length} shown`}</span>
        </div>

        <div className="transaction-filters">
          <label className="field search-field">
            <span>Search history</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Description, category, wallet" />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={kind} onChange={(event) => {
              const nextKind = event.target.value
              if (nextKind === 'all' || isTransactionKind(nextKind)) {
                setKind(nextKind)
                setCategoryId('')
              }
            }}>
              <option value="all">All activity</option>
              <option value="income">Income</option>
              <option value="expense">Expenses</option>
              <option value="transfer">Transfers</option>
              <option value="adjustment">Adjustments</option>
            </select>
          </label>
          <label className="field">
            <span>Wallet</span>
            <select value={walletId} onChange={(event) => setWalletId(event.target.value)}>
              <option value="">All wallets</option>
              {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.archived ? ' (archived)' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Sort by date</span>
            <select value={sort} onChange={(event) => {
              if (event.target.value === 'newest' || event.target.value === 'oldest') {
                setSort(event.target.value)
              }
            }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="loading-state">Getting your transactions together…</p>
        ) : dataUnavailable ? (
          <p className="error-state">Ledger details could not be loaded. Use the retry action above to try again.</p>
        ) : transactions.length === 0 ? (
          <div className="empty-page activity-empty">
            <span className="empty-icon" aria-hidden="true">↗</span>
            <h2>Your ledger starts here</h2>
            <p>Add income, expenses, transfers, or a balance adjustment. Entries stay on this device.</p>
            <button className="button button-primary" type="button" onClick={onAdd} disabled={!canAdd}>＋ Add your first transaction</button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-page activity-empty">
            <h2>No matches</h2>
            <p>Try a different search or adjust your filters.</p>
          </div>
        ) : (
          <ul className="transaction-list">
            {filteredTransactions.map((transaction) => {
              const sourceWallet = wallets.find((wallet) => wallet.id === transaction.walletId)
              const destinationWallet = wallets.find((wallet) => wallet.id === transaction.toWalletId)
              const category = categories.find((item) => item.id === transaction.categoryId)
              return (
                <li className={`transaction-row transaction-${transaction.kind}`} key={transaction.id}>
                  <span className="transaction-icon" aria-hidden="true">
                    {transaction.kind === 'income' ? '↙' : transaction.kind === 'expense' ? '↗' : transaction.kind === 'transfer' ? '⇄' : '±'}
                  </span>
                  <div className="transaction-info">
                    <strong>{transaction.description}</strong>
                    <span>
                      {kindLabels[transaction.kind]} · {transactionDateFormatter.format(new Date(`${transaction.occurredOn}T00:00:00.000Z`))}
                    </span>
                    <small>
                      {transaction.kind === 'transfer'
                        ? `${sourceWallet?.name ?? 'Unknown wallet'} → ${destinationWallet?.name ?? 'Unknown wallet'} · Fee ${formatPHP(transaction.feeCentavos ?? 0)}`
                        : [
                            sourceWallet?.name,
                            category?.name,
                            transaction.expectedIncomeId ? 'Scheduled income receipt' : null,
                            transaction.debtSettlementId
                              ? transaction.debtSettlementExcludedFromTotals
                                ? 'Debt settlement · original transaction already counted'
                                : 'Debt settlement'
                              : null,
                            transaction.obligationId ? 'Bill payment' : null,
                          ].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <strong className="transaction-amount">{transactionAmount(transaction)}</strong>
                  <div className="transaction-actions">
                    <button className="wallet-action" type="button" onClick={() => onEdit(transaction)} aria-label={`Edit ${transaction.description}`}>Edit</button>
                    <button className="wallet-action archive-action" type="button" onClick={() => onDelete(transaction)} aria-label={`Delete ${transaction.description}`}>Delete</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
