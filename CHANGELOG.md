# Changelog

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
