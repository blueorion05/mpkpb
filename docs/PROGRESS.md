# Progress

## Current status

v0.2.0 core ledger is complete. Phase 1 is complete. The ledger supports income, expenses, transfer fees, signed balance adjustments, custom categories, transaction editing/deletion, history search/filter/sort, and ledger-derived wallet balances.

## Verified

- Workspace was initially empty; Node.js v25.8.0, npm 11.11.0, and Git 2.46.1 are available.
- Vite scaffold created a local Git repository on `main`.
- `npm ls --depth=0`: all declared dependencies are installed; `package-lock.json` is present.
- `npm test`: 8 money and ledger financial tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Browser checks verified migration of existing v0.1 wallet data, custom category creation, income/expense entry, transfer principal and fees, balance adjustments, transaction edit/delete/search, ledger-derived totals, and transaction persistence after refresh. Mobile (390px) and desktop (1440px) layouts had no horizontal overflow. Test-page requests remained on the local origin.

## Not verified

- Budget plans, expected/recurring income, debts, obligations, forecasting, analytics, backup/restore, and PWA are not implemented; they remain future milestones.

## Next

Next: proceed to v0.3.0 budgets and expected income. Preserve transaction history and all existing wallet records across future schema changes.
