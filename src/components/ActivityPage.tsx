import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, SlidersHorizontal } from 'lucide-react'
import Mascot from './Mascot'
import { CategorySymbol } from './IconPicker'
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
  expense: 'Gastos',
  transfer: 'Transfer',
  adjustment: 'Ayusin ang balance',
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

  const walletById = useMemo(() => new Map(wallets.map((wallet) => [wallet.id, wallet])), [wallets])
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
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

          <h1>Activity</h1>
          <p>Dito mo makikita ang aktwal na pasok at labas ng pera.</p>
        </div>
        {!loading && !dataUnavailable && transactions.length > 0 && !summary && (
          <div className="error-banner" role="alert">
            Ledger totals exceed the safe calculation range. No summary is shown.
          </div>
        )}
        <button className="button button-primary add-wallet-button" type="button" onClick={onAdd} disabled={!canAdd}>
          <Plus className="ui-icon" aria-hidden="true" /> Add record
        </button>
      </div>

      <section className="activity-summary" aria-label="Transaction summary">
        <article className="panel activity-metric">
          <span className="metric-label">INCOME</span>
          <strong>{loading ? '…' : summary ? formatPHP(summary.incomeCentavos) : '—'}</strong>
        </article>
        <article className="panel activity-metric">
          <span className="metric-label">Gastos at fees</span>
          <strong>{loading ? '…' : summary ? formatPHP(summary.totalExpenseCentavos) : '—'}</strong>
        </article>
        <article className="panel activity-metric">
          <span className="metric-label">Pagbabago sa pera</span>
          <strong>{loading ? '…' : netChange === null ? '—' : `${netChange > 0 ? '+' : netChange < 0 ? '−' : ''}${formatPHP(Math.abs(netChange))}`}</strong>
        </article>
      </section>

      <section className="panel activity-panel" aria-label="Mga record">
        <div className="panel-heading">
          <div>

            <h2>Mga record</h2>
          </div>
          <span className="activity-count">{loading ? 'Naglo-load…' : `${filteredTransactions.length} shown`}</span>
        </div>

        <div className="transaction-search">
          <label className="field search-field">
            <span>Hanapin ang record</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pangalan, category, o wallet" />
          </label>
        </div>
        <details className="entry-options activity-options">
          <summary>Filters at sort</summary>
          <div className="transaction-filters">
          <label className="field">
            <span>Type</span>
            <select value={kind} onChange={(event) => {
              const nextKind = event.target.value
              if (nextKind === 'all' || isTransactionKind(nextKind)) {
                setKind(nextKind)
                setCategoryId('')
              }
            }}>
              <option value="all">Lahat ng activity</option>
              <option value="income">Income</option>
              <option value="expense">Gastos</option>
              <option value="transfer">Transfers</option>
              <option value="adjustment">Adjustments</option>
            </select>
          </label>
          <label className="field">
            <span>Wallet</span>
            <select value={walletId} onChange={(event) => setWalletId(event.target.value)}>
              <option value="">Lahat ng wallet</option>
              {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}{wallet.archived ? ' (archived)' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Lahat ng category</option>
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
        </details>

        {loading ? (
          <p className="loading-state">Binabasa ang mga record…</p>
        ) : dataUnavailable ? (
          <p className="error-state">Hindi mabasa ang mga record. Pindutin ang Subukan ulit.</p>
        ) : transactions.length === 0 ? (
          <div className="empty-page activity-empty">
            <Mascot className="mascot-empty" />
            <h2>Wala pang activity ng pera</h2>
            <p>I-record ang income, gastos, at transfer mo rito.</p>
            <button className="button button-primary" type="button" onClick={onAdd} disabled={!canAdd}><Plus className="ui-icon" aria-hidden="true" /> Add unang record</button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-page activity-empty">
            <h2>Walang tugmang record</h2>
            <p>Ibang search o filter ang subukan mo.</p>
          </div>
        ) : (
          <ul className="transaction-list">
            {filteredTransactions.map((transaction) => {
              const sourceWallet = walletById.get(transaction.walletId)
              const destinationWallet = walletById.get(transaction.toWalletId ?? '')
              const category = categoryById.get(transaction.categoryId ?? '')
              return (
                <li className={`transaction-row transaction-${transaction.kind}`} key={transaction.id}>
                  <span className="transaction-icon" aria-hidden="true">
                    {transaction.kind === 'income' ? <ArrowDownLeft className="ui-icon" aria-hidden="true" /> : transaction.kind === 'expense' ? <ArrowUpRight className="ui-icon" aria-hidden="true" /> : transaction.kind === 'transfer' ? <ArrowLeftRight className="ui-icon" aria-hidden="true" /> : <SlidersHorizontal className="ui-icon" aria-hidden="true" />}
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
                            category ? <span className="category-label"><CategorySymbol icon={category.icon} /> {category.name}</span> : null,
                            transaction.kind === 'income' ? 'Nakuha na' : transaction.kind === 'expense' ? 'Bayad na' : null,
                            transaction.expectedIncomeId ? 'Receipt ng naka-schedule na income' : null,
                            transaction.debtSettlementId
                              ? transaction.debtSettlementExcludedFromTotals
                                ? 'Bayad sa utang · kasama na ang unang record sa total'
                                : 'Bayad sa utang'
                              : null,
                            transaction.obligationId ? 'Bayad sa bill' : null,
                          ].filter(Boolean).map((part, index) => <span key={index}>{index > 0 && ' · '}{part}</span>)}
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
