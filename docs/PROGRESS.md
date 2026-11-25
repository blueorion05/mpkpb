# Progress

## Current status

v0.4.0 debt and upcoming-obligation tracking is complete. v0.1.0 foundation, v0.2.0 ledger, and v0.3.0 planning are complete. Debts support payable/receivable direction, installment schedules, partial settlements, optional original-transaction linking, and archival. Bills support due/overdue status, recurrence, finite installments, partial payments, and ledger-linked history.

## Verified

- Workspace was initially empty; Node.js v25.8.0, npm 11.11.0, and Git 2.46.1 are available.
- Vite scaffold created a local Git repository on `main`.
- `npm ls --depth=0`: all declared dependencies are installed; `package-lock.json` is present.
- `npm test`: 18 money, ledger, planning, debt, and obligation financial tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Browser checks verified v4-to-v5 migration with an existing wallet and transaction intact; debt/bill creation, partial payments, schedule progression, payment editing/deletion reconciliation, original transaction linking and deletion protection, ledger total de-duplication, and persistence after refresh. Mobile (375px) and desktop (1440px) layouts had no horizontal overflow. Browser resources remained on the local origin.

## Not verified

- Forecasting, analytics, backup/restore, and PWA are not implemented; they remain future milestones.

## Next

Next: proceed to v0.5.0 financial forecasting. Preserve all wallet, ledger, planning, debt, and bill records across future schema changes.
