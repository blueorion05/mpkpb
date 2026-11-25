# Changelog

## 1.0.0 — Production release

- Updated product, recovery, installation, and development documentation.
- Refreshes other open app windows after data replacement or changes to PIN settings.

## 0.9.0 — Offline app and QA

- Added an install manifest, app icons, an offline shell, and deferred updates.
- Split planning, forecast, and tools into separate route bundles.
- Added browser checks for recovery, PIN, offline writes, and update activation.

## 0.8.0 — Local recovery and privacy

- Added autosave timestamps, manual and safety snapshots, validated JSON backup and restore, CSV exports, and explicit reset.
- Added a local inactivity PIN gate. IndexedDB schema version 5 remains compatible.

## 0.7.0 — Geng Geng

- Integrated 105 contextual Taglish lines and local humor and profanity settings.
- Kept warnings and error messages separate from optional humor.

## 0.6.0 — Financial tools and analytics

- Added a what-if purchase simulator that feeds hypothetical expenses into every forecast scenario without changing ledger data.
- Added a local financial calendar combining actual transactions with forecast-engine schedule events, plus in-app reminders for near-term obligations and budget thresholds.
- Added centavo-safe monthly cash-flow trends, income/expense category breakdowns, date-filtered analytics, budget-plan filtering, wallet distribution, and debt progress.
- Kept forecasts and reminders on-device and reused existing ledger, schedule, budget, and debt calculations.

## 0.5.0 — Financial forecasting

- Added chronological conservative, expected, and optimistic cash-flow projections through a customizable date, defaulting to month-end.
- Projected recurring income, debt installments/collections, and bills using unpaid amounts; overdue occurrences are visible from the current date.
- Added same-day outflow-first shortage checks, maximum shortfall and recovery dates, and wallet-specific balance projections.
- Added protected-fund exclusions, a locally persisted safety buffer, and safe daily/weekly spending estimates.
- Added responsive forecast controls, an accessible SVG balance chart, scenario explanations, and centavo-level regression coverage.

## 0.4.0 — Debts and upcoming obligations

- Added payable and receivable debt records with one-time or recurring installment schedules, partial settlements, progress, and archival.
- Added optional links to original ledger transactions so principal entries are counted once while subsequent settlements still change wallet balances.
- Added upcoming bills with due/overdue status, recurrence, finite installments, partial payments, and payment history.
- Made debt settlements and bill payments atomic with their ledger transactions; editing or deleting a linked payment reconciles its schedule.
- Added v5 IndexedDB indexes without rewriting existing wallet, ledger, budget, or scheduled-income data.
- Added centavo-level financial regression coverage for installment remainders, overdue status, budget exclusions, and safe history deletion.

## 0.3.0 — Budget planning and expected income

- Added multiple budget plans with custom date ranges, per-expense-category limits, utilization, remaining allowances, duplication, and archival.
- Added expected income schedules with confidence levels and one-time, weekly, biweekly, or monthly recurrence.
- Added partial/full income receipts that atomically create ledger income and update schedule progress; editing or deleting a linked receipt reconciles the plan.
- Added safe date, category, receipt, and centavo validation plus regression tests for budget periods, overspending, recurrence anchors, and receipt reconciliation.
- Upgraded IndexedDB to schema v4 with non-destructive budget and scheduled-income indexes.

## 0.2.0 — Core financial ledger

- Added dated income, expense, transfer-with-fee, and signed balance-adjustment transactions.
- Added custom income/expense categories and transaction edit/delete.
- Added searchable, filterable, sortable transaction history.
- Derived current wallet balances from opening balances and posted ledger entries; transfer principal remains neutral while fees count as expenses.
- Added atomic IndexedDB reference validation, transaction indexes, and backward-compatible v3 schema migration.
- Added financial regression tests for balances, transfer neutrality/fees, invalid dates/amounts, overflow, and history filters.

## 0.1.0 — Foundation

- Completed the responsive MPKPB? shell, desktop/mobile navigation, first-run onboarding, and theme settings.
- Added wallet creation, editing, archival/restoration, custom icons/colors, protected funds, and versioned IndexedDB migration.
- Added balance privacy, loading/empty/error/success states, and PHP integer-centavo utilities.
- Added focused tests, project instructions, architecture/product docs, and a committed package lockfile.
