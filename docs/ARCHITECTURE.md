# Architecture

## Current layout

- `src/App.tsx`: responsive app shell, navigation, first-run onboarding, wallet management, and view composition.
- `src/components/ActivityPage.tsx` and `src/components/TransactionDialog.tsx`: searchable ledger history and transaction/category entry.
- `src/components/ForecastPage.tsx`: date- and wallet-specific forecast controls, scenarios, safe-to-spend summaries, and cash-flow visualizations.
- `src/components/ToolsPage.tsx`: local financial calendar/reminders, date- and budget-filtered insights, and theme settings.
- `src/components/PlansPage.tsx` and `src/components/DebtsPage.tsx`: budget plans, expected income, debts, bills, and payment workflows.
- `src/db/database.ts`: browser-native IndexedDB database, schema migration, and typed wallet/ledger/planning/debt operations.
- `src/domain/ledger.ts`: transaction invariants, balance deltas, ledger summaries, and history filters.
- `src/domain/planning.ts`: budget validation/progress, expected-income schedules, and receipt reconciliation.
- `src/domain/debts.ts` and `src/domain/recurrence.ts`: debt/obligation validation, installment progress, payment reconciliation, and shared recurrence dates.
- `src/domain/forecast.ts`: chronological scenario projections, overdue schedule expansion, shortage/recovery analysis, and safe daily/weekly spending.
- `src/domain/analytics.ts`: validated, centavo-safe income/expense totals, category breakdowns, and monthly trends derived from actual ledger entries.
- `src/domain/money.ts`: centavo parsing, PHP formatting, and safe aggregation.
- `tests/ledger.test.ts`, `tests/planning.test.ts`, `tests/debts.test.ts`, `tests/forecast.test.ts`, `tests/analytics.test.ts`, and `tests/money.test.ts`: financial invariant tests using Node's built-in test runner.
- `src/index.css` and `src/App.css`: theme tokens, global styles, and responsive components.

## Local database

Database: `mpkpb`, schema version `5`. Stores and indexes are created in IndexedDB's upgrade transaction. Version 2 adds wallet icon/color attributes with a migration for v1 records. Version 3 indexes transaction dates and wallet references and adds a unique category index. Version 4 indexes budget start dates and scheduled-event due dates/types. Version 5 indexes debt directions, original debt transactions, debt settlements, and bill payments without rewriting existing financial records:

| Store | Key path | Purpose |
| --- | --- | --- |
| wallets | `id` | User-created wallet records with type, icon, color, opening centavos, and archive/protection state |
| transactions | `id` | Posted income, expenses, transfers/fees, and balance adjustments |
| categories | `id` | User-defined income and expense categories; unique per type/name |
| budgets | `id` | User-defined date ranges and expense-category limits |
| debts | `id` | Debt schedules, optional original transaction links, and settlement history |
| scheduledEvents | `id` | Expected-income schedules and bill obligations with linked transactions |
| snapshots | `id` | Manual and pre-restore recovery points |
| preferences | `key` | Theme, display name, safety buffer, humor settings, autosave timestamp, and local PIN verifier |

Database access stays in `src/db`. Transaction writes validate the referenced wallet(s) and category and commit in one read-write IndexedDB transaction. Updating a wallet's opening balance is rejected after ledger activity; use a signed balance adjustment instead. Future schema changes must increment the database version and use IndexedDB's `onupgradeneeded` migration transaction. Archived wallets remain stored and included in total balance; they are excluded from spendable funds until restored.

`saveBudgetPlan` validates all category references in the same IndexedDB transaction. Expected-income schedules validate their wallet/category references and receipt links. Debt settlements and bill payments update their schedule records and ledger transactions in a single read-write transaction. The ledger is the source of truth for posted money; expected income and planned bills are never included in current balances.

## Ledger rules

Balances are derived as opening centavos plus posted transaction deltas. Income increases one wallet; expenses decrease one wallet; transfers debit the source by principal plus fee and credit the destination by principal; adjustments are signed deltas. Transfer principal is excluded from income/expense summaries, while its fee is an expense. Calculations reject invalid references and unsafe intermediate or aggregate values rather than displaying a fabricated balance. Expected income is stored separately and only changes a wallet after the receipt creates an actual linked income transaction.

## Planning rules

Budget progress counts categorized expense transactions whose dates fall inside the plan's inclusive custom date range. Each category limit is independent; totals can exceed limits and report the overspend rather than clamping it away. Expected income records confidence, recurrence, due dates, and receipt transaction IDs. Partial receipts remain due at the same occurrence; full recurring receipts advance to the next date while preserving monthly anchor days (for example, Jan 31 → Feb 28 → Mar 31). Editing or deleting a linked ledger receipt updates its expected-income progress atomically.

## Debt and obligation rules

Debt schedules store integer-centavo principal, direction, wallet/category references, recurrence, installment amount/count, optional principal transaction ID, and settlement transaction references. Each settlement is limited to the remaining amount for its due occurrence and the remaining principal. A linked original transaction must match debt direction and amount, cannot itself be a scheduled transaction, and cannot be deleted while referenced. When linked, settlement transactions continue to change wallet balances but are excluded from income/expense summaries and category budgets.

Bill obligations are stored as scheduled events, never as current balance. Payments are categorized expense transactions linked to a due occurrence. Partial payments remain attached to that occurrence; a completed recurring occurrence advances using the shared recurrence helper. Editing or deleting a linked transaction reconciles its schedule atomically. Removing an earlier payment when later installment history exists is rejected rather than leaving a broken schedule.

## Forecast rules

`calculateForecast` derives starting balances from the wallet ledger and expands active income, debt, and bill schedules into integer-centavo events. A partial occurrence contributes only its unpaid remainder. Overdue occurrences project from today, and same-day outflows are evaluated before inflows so an end-of-day positive balance cannot hide an intermediate shortage. Recurring arrears remain individually represented; protected and archived wallets appear in total and wallet projections but are excluded from spendable funds.

The conservative scenario includes only high-confidence expected income and excludes debt collections; expected includes high/medium income and scheduled debt collections; optimistic includes all expected income and collections. Planned outflows remain in every scenario. Safe daily spending is constrained by the minimum projected unprotected, active balance after the safety buffer across the selected period. Weekly spending is capped by both seven days at that daily pace and the lowest available headroom. The safety buffer is stored as a local preference; forecasts do not modify ledger balances or transmit data.

The what-if purchase is a validated forecast outflow and is not written to IndexedDB. Calendar schedule events are obtained from the same forecast engine, preserving recurrence, overdue, partial-settlement, and confidence-independent due-date logic. Calendar reminders are computed in memory from the next seven days of forecast events and active budget category utilization; no system notification permission is requested.

Analytics are calculated by `calculateFinancialAnalytics` from validated posted transactions and categories. Linked debt settlements marked as already represented by an original principal transaction are excluded; transfer principal and balance adjustments are excluded, and transfer fees are categorized separately as expenses. Monthly rows are initialized for the complete selected period, including months with no transactions. Budget and debt performance reuse the existing planning and debt progress functions, while wallet distribution is derived through the ledger balance calculator.

## Calculation rules

Financial amounts are safe integer centavos. Once ledger entries exist, wallet totals must be derived from opening balances and posted entries. Keep calculations in `src/domain`; test rounding boundaries, transfers, same-day ordering, and intermediate forecast shortages. Persist source records rather than cached totals that can drift from the ledger.

## Privacy

No application backend is present. Financial records use IndexedDB on the user's device. Do not send financial records to remote services. Manual snapshots remain in browser storage. JSON backups include source records and settings, with the PIN verifier and snapshot history excluded. CSV exports escape formula-like text for spreadsheet safety.

## Recovery and offline operation

Financial writes stamp the last-save time in the same transaction. Backup reads use a consistent IndexedDB transaction. Restore validates record shapes, unique IDs, wallet and category references, safe balances, and schedule-to-ledger links. Replacement and its safety snapshot commit together. A typed confirmation is required for reset, which clears all stores.

The privacy gate checks a salted PBKDF2 PIN verifier before mounting financial views. It locks on reopen and after five minutes of inactivity. PIN and restore changes refresh other open windows through a same-origin broadcast. Browser storage remains unencrypted.

Vite emits a service worker with a build-specific static resource list. The worker caches the app shell and all emitted routes. Each worker serves its own shell and assets until the next worker activates after all previous clients close. Cache Storage contains static app assets only. Financial data remains in IndexedDB.

## Dashboard quick add

The entry domain maps future income to ExpectedIncome, future gastos and bills to FinancialObligation, and both directions of debt to DebtRecord. The form edits existing source records and retains their IDs and settlement history. Dashboard settlement uses the existing atomic ledger and schedule write with a separate actual transaction date. Future transfers require a forecast model with linked wallet movements and remain outside the quick-add schedule workflow. The database and backup schemas are unchanged.

The Home month-end summary runs the expected scenario only and uses the existing forecast calculations. Planning initialization reads six required stores in one readonly transaction. Calendar and insights calculations run when their tabs are active.

## Mascot and icon persistence

The supplied GIF is composited into a local transparent WebP atlas. The visible dashboard or navigation canvas plays nine frames at the original 180 ms cadence and blends the final frame into the exact idle pose. Visibility and reduced-motion listeners control playback. Onboarding and empty-state instances use the same static pose. Vite's service worker precaches the atlas, idle image, favicon, manifest, and app icons.

Wallet icon IDs map directly to a fixed Lucide set. Categories accept an optional validated icon ID and existing records default to a tag. The optional field requires no structural IndexedDB migration and survives JSON backup and restore. Category icon edits preserve the record ID and all existing financial references.

## Outstanding obligations and forecast preferences

Outstanding totals use remaining payable principal, finite bill remainders, and the next unpaid occurrence of ongoing bills. Forecast projections remain bounded by the selected end date. The forecast view persists its range, scenario, wallet, and budget filter in the preferences store. The start date and budget filter narrow the displayed schedule, while projected balances account for all applicable events from today. Budget attribution still uses category and transaction date.

Balance adjustments verify the displayed balance inside the ledger write transaction. New borrowing and lending atomically save a debt and its linked signed principal movement. The existing debt settlement logic then applies repayments without counting principal as income or spending. Legacy debt links remain valid. No IndexedDB schema bump is required.

A non-installment debt may omit its due date. Its creation date supplies an internal occurrence key for linking partial and full settlements to the ledger. That key is never shown as a repayment date or used to project cash flow. Undated payable principal still counts toward outstanding obligations. The optional field needs no IndexedDB migration.
