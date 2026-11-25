# Architecture

## Current layout

- `src/App.tsx`: responsive app shell, navigation, first-wallet setup, and foundation views.
- `src/db/database.ts`: browser-native IndexedDB database and typed wallet/preference operations.
- `src/domain/money.ts`: centavo parsing, PHP formatting, and safe aggregation.
- `tests/money.test.ts`: focused tests using Node's built-in test runner.
- `src/index.css` and `src/App.css`: theme tokens, global styles, and responsive components.

## Local database

Database: `mpkpb`, schema version `1`. Stores are created in IndexedDB's upgrade transaction:

| Store | Key path | Purpose |
| --- | --- | --- |
| wallets | `id` | User-created wallet records |
| transactions | `id` | Reserved for the future ledger |
| categories | `id` | Reserved for customizable categories |
| budgets | `id` | Reserved for budget plans |
| debts | `id` | Reserved for debt records |
| scheduledEvents | `id` | Reserved for expected income and obligations |
| snapshots | `id` | Reserved for local save history |
| preferences | `key` | Theme and optional display name |

Database access stays in `src/db`. Future schema changes must increment the database version and use IndexedDB's `onupgradeneeded` migration transaction. Storage and migration errors must be visible to users; never silently substitute in-memory state for persisted financial data.

## Calculation rules

Financial amounts are safe integer centavos. Once ledger entries exist, wallet totals must be derived from opening balances and posted entries. Keep calculations in `src/domain`; test rounding boundaries, transfers, same-day ordering, and intermediate forecast shortages. Persist source records rather than cached totals that can drift from the ledger.

## Privacy

No application backend is present. Financial records use IndexedDB on the user's device. Do not send financial records to remote services. Backup/export and PWA support are future work; browser storage is not a backup.
