# Architecture

## Current layout

- `src/App.tsx`: responsive app shell, navigation, first-run onboarding, wallet management, and foundation views.
- `src/components/ActivityPage.tsx` and `src/components/TransactionDialog.tsx`: searchable ledger history and transaction/category entry.
- `src/db/database.ts`: browser-native IndexedDB database, schema migration, and typed wallet/ledger/preference operations.
- `src/domain/ledger.ts`: transaction invariants, balance deltas, ledger summaries, and history filters.
- `src/domain/money.ts`: centavo parsing, PHP formatting, and safe aggregation.
- `tests/ledger.test.ts` and `tests/money.test.ts`: financial invariant tests using Node's built-in test runner.
- `src/index.css` and `src/App.css`: theme tokens, global styles, and responsive components.

## Local database

Database: `mpkpb`, schema version `3`. Stores and indexes are created in IndexedDB's upgrade transaction. Version 2 adds wallet icon/color attributes with a migration for v1 records. Version 3 indexes transaction dates and wallet references, and adds a unique category index while preserving existing wallet and preference records:

| Store | Key path | Purpose |
| --- | --- | --- |
| wallets | `id` | User-created wallet records with type, icon, color, opening centavos, and archive/protection state |
| transactions | `id` | Posted income, expenses, transfers/fees, and balance adjustments |
| categories | `id` | User-defined income and expense categories; unique per type/name |
| budgets | `id` | Reserved for budget plans |
| debts | `id` | Reserved for debt records |
| scheduledEvents | `id` | Reserved for expected income and obligations |
| snapshots | `id` | Reserved for local save history |
| preferences | `key` | Theme and optional display name |

Database access stays in `src/db`. Transaction writes validate the referenced wallet(s) and category and commit in one read-write IndexedDB transaction. Updating a wallet's opening balance is rejected after ledger activity; use a signed balance adjustment instead. Future schema changes must increment the database version and use IndexedDB's `onupgradeneeded` migration transaction. Archived wallets remain stored and included in total balance; they are excluded from spendable funds until restored.

## Ledger rules

Balances are derived as opening centavos plus posted transaction deltas. Income increases one wallet; expenses decrease one wallet; transfers debit the source by principal plus fee and credit the destination by principal; adjustments are signed deltas. Transfer principal is excluded from income/expense summaries, while its fee is an expense. Calculations reject invalid references and unsafe intermediate or aggregate values rather than displaying a fabricated balance. Expected income is stored separately in a later milestone and must not affect current balances.

## Calculation rules

Financial amounts are safe integer centavos. Once ledger entries exist, wallet totals must be derived from opening balances and posted entries. Keep calculations in `src/domain`; test rounding boundaries, transfers, same-day ordering, and intermediate forecast shortages. Persist source records rather than cached totals that can drift from the ledger.

## Privacy

No application backend is present. Financial records use IndexedDB on the user's device. Do not send financial records to remote services. Backup/export and PWA support are future work; browser storage is not a backup.
