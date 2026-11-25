# Progress

## Current status

v0.5.0 financial forecasting is complete. The v0.1.0 foundation, v0.2.0 ledger, v0.3.0 budget planning, and v0.4.0 debts/obligations milestones are complete. Forecasts provide three confidence scenarios, recurring/overdue event expansion, wallet-level shortage/recovery analysis, protected-fund handling, and safe spending after a locally saved buffer.

## Verified

- Workspace was initially empty; Node.js v25.8.0, npm 11.11.0, and Git 2.46.1 are available.
- Vite scaffold created a local Git repository on `main`.
- `npm ls --depth=0`: all declared dependencies are installed; `package-lock.json` is present.
- `npm test`: 28 money, ledger, planning, debt, obligation, and forecast financial tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Browser checks verified v4-to-v5 migration with an existing wallet and transaction intact; debt/bill creation, partial payments, schedule progression, payment editing/deletion reconciliation, original transaction linking and deletion protection, ledger total de-duplication, and persistence after refresh.
- Forecast browser checks verified scenario selection, per-wallet chart selection, safety-buffer persistence after refresh, balance masking in the forecast chart and buffer control, and no horizontal overflow at 375px. Console showed no fresh page errors.
- Forecast domain regressions cover intermediate and same-day shortages, later recovery, scenario confidence tiers, overdue partial income/bills, recurring arrears, per-wallet deficits, protected funds, safe daily/weekly calculations, installment remainders, and the 10-year horizon limit.

## Not verified

- Analytics, backup/restore, and PWA are not implemented; they remain future milestones.

## Next

Next: proceed to v0.6.0 financial tools and analytics. Preserve all wallet, ledger, planning, debt, and bill records across future schema changes.
