# Architecture

## Current layout

- `src/App.tsx`: responsive app shell, navigation, first-run onboarding, wallet management, and foundation views.
- `src/components/ActivityPage.tsx` and `src/components/TransactionDialog.tsx`: searchable ledger history and transaction/category entry.
- `src/components/PlansPage.tsx`: budget plans, category limits, expected income, and receipt workflows.
- `src/db/database.ts`: browser-native IndexedDB database, schema migration, and typed wallet/ledger/planning operations.
- `src/domain/ledger.ts`: transaction invariants, balance deltas, ledger summaries, and history filters.
- `src/domain/planning.ts`: budget validation/progress, expected-income schedules, recurrence dates, and receipt reconciliation.
- `src/domain/money.ts`: centavo parsing, PHP formatting, and safe aggregation.
- `tests/ledger.test.ts`, `tests/planning.test.ts`, and `tests/money.test.ts`: financial invariant tests using Node's built-in test runner.
- `src/index.css` and `src/App.css`: theme tokens, global styles, and responsive components.

## Local database

Database: `mpkpb`, schema version `4`. Stores and indexes are created in IndexedDB's upgrade transaction. Version 2 adds wallet icon/color attributes with a migration for v1 records. Version 3 indexes transaction dates and wallet references and adds a unique category index. Version 4 indexes budget start dates and scheduled-event due dates/types without rewriting wallet, preference, or ledger records:

| Store | Key path | Purpose |
| --- | --- | --- |
| wallets | `id` | User-created wallet records with type, icon, color, opening centavos, and archive/protection state |
| transactions | `id` | Posted income, expenses, transfers/fees, and balance adjustments |
| categories | `id` | User-defined income and expense categories; unique per type/name |
| budgets | `id` | User-defined date ranges and expense-category limits |
| debts | `id` | Reserved for debt records |
| scheduledEvents | `id` | Expected-income schedules and linked receipt history |
| snapshots | `id` | Reserved for local save history |
| preferences | `key` | Theme and optional display name |

Database access stays in `src/db`. Transaction writes validate the referenced wallet(s) and category and commit in one read-write IndexedDB transaction. Updating a wallet's opening balance is rejected after ledger activity; use a signed balance adjustment instead. Future schema changes must increment the database version and use IndexedDB's `onupgradeneeded` migration transaction. Archived wallets remain stored and included in total balance; they are excluded from spendable funds until restored.

`saveBudgetPlan` validates all category references in the same IndexedDB transaction. Expected-income schedules validate their wallet/category references and receipt links. Saving or deleting a linked receipt updates the schedule and ledger transaction in a single read-write transaction. The ledger entry is the source of truth for actual received money; expected amounts are never included in current balances.

## Ledger rules

Balances are derived as opening centavos plus posted transaction deltas. Income increases one wallet; expenses decrease one wallet; transfers debit the source by principal plus fee and credit the destination by principal; adjustments are signed deltas. Transfer principal is excluded from income/expense summaries, while its fee is an expense. Calculations reject invalid references and unsafe intermediate or aggregate values rather than displaying a fabricated balance. Expected income is stored separately and only changes a wallet after the receipt creates an actual linked income transaction.

## Planning rules

Budget progress counts categorized expense transactions whose dates fall inside the plan's inclusive custom date range. Each category limit is independent; totals can exceed limits and report the overspend rather than clamping it away. Expected income records confidence, recurrence, due dates, and receipt transaction IDs. Partial receipts remain due at the same occurrence; full recurring receipts advance to the next date while preserving monthly anchor days (for example, Jan 31 → Feb 28 → Mar 31). Editing or deleting a linked ledger receipt updates its expected-income progress atomically.

## Calculation rules

Financial amounts are safe integer centavos. Once ledger entries exist, wallet totals must be derived from opening balances and posted entries. Keep calculations in `src/domain`; test rounding boundaries, transfers, same-day ordering, and intermediate forecast shortages. Persist source records rather than cached totals that can drift from the ledger.

## Privacy

No application backend is present. Financial records use IndexedDB on the user's device. Do not send financial records to remote services. Backup/export and PWA support are future work; browser storage is not a backup.
