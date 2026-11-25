# Progress

## v1.1.0

- Released with dashboard quick add, schedule management, month-end projection, Taglish copy, and 115 optional punchlines.
- All 39 tests, lint, type checking, and production build passed. Disposable Edge QA covered onboarding, future record creation, editing and settlement, short mobile dialogs, desktop navigation, themes, backups, PIN, offline use, update activation, and v4-to-v5 migration.
- Startup planning reads fell from 14 to 6. Initial JavaScript grew from 98.54 KB to 103.95 KB gzip as the dashboard gained the forecast and schedule workflows.
- Tag v1.1.0 points to 06297a6. Production served the matching JavaScript asset and passed Edge quick add, schedule balance isolation, offline settlement, installability, and offline forecast.
- Scheduled transfers remain unavailable. Firefox and Safari were outside this browser run.

## Current status

The v1.0.0 production release includes the v0.7 humor integration, v0.8 recovery and PIN, and v0.9 PWA. The historical v0.6.0 tools and analytics are complete. The v0.1.0 foundation through v0.5.0 forecasting are complete. Users can simulate hypothetical purchases without ledger writes, review local upcoming/overdue schedules and in-app reminders, and explore date-filtered cash-flow, category, budget, wallet, and debt insights.

## Verified

- Workspace was initially empty; Node.js v25.8.0, npm 11.11.0, and Git 2.46.1 are available.
- Vite scaffold created a local Git repository on `main`.
- `npm ls --depth=0`: all declared dependencies are installed; `package-lock.json` is present.
- `npm test`: 32 money, ledger, planning, debt, obligation, forecast, and analytics financial tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Browser checks verified v4-to-v5 migration with an existing wallet and transaction intact; debt/bill creation, partial payments, schedule progression, payment editing/deletion reconciliation, original transaction linking and deletion protection, ledger total de-duplication, and persistence after refresh.
- Forecast browser checks verified scenario selection, per-wallet chart selection, safety-buffer persistence after refresh, balance masking in the forecast chart and buffer control, and no horizontal overflow at 375px. Console showed no fresh page errors.
- v0.6 browser checks verified calendar and insights render with empty local records, a what-if purchase visibly creates a projected shortage without changing the saved wallet balance, and the 360px mobile viewport has no horizontal document overflow.
- Forecast domain regressions cover intermediate and same-day shortages, later recovery, scenario confidence tiers, overdue partial income/bills, recurring arrears, per-wallet deficits, protected funds, safe daily/weekly calculations, installment remainders, and the 10-year horizon limit.

## Not verified

- The browser reported no installability errors. The manual install dialog and standalone window launch were outside the headless run.

## Next

The v1.0.0 tag identifies release commit f708b79. The GitHub push and existing Vercel integration succeeded. Production Edge QA passed onboarding, installability, offline persistence, and offline forecast at https://mpkpb.vercel.app/.

## Continuation

- v0.6.0 baseline verified locally with 32 tests, lint, type checking, and a Vite build.
- v0.7 development integrates 105 contextual lines with local humor and profanity settings. The final build has browser coverage.
- v0.8 recovery verified in a disposable 375px Edge profile. Onboarding, autosave, manual snapshot, JSON replacement, safety-snapshot restoration, and incorrect/correct PIN entry passed. Schema remains at v5.
- Validation tests reject duplicate IDs, missing wallet references, and orphaned planned receipts.
- v0.9 verified install manifest and offline shell build. Edge QA passed offline wallet creation and persistence, lazy-loaded forecast, and deferred service-worker activation with preserved data.
- Route splitting reduced the initial JavaScript from approximately 426 KB (115 KB gzip) to 340 KB (98 KB gzip).
- v1.0 local QA passed with 36 tests, lint, type checking, a production build, and Edge browser QA. A v4 IndexedDB fixture migrated to v5 with the wallet, expense, and exact PHP 37.66 balance preserved.
