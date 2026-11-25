# MPKPB? — May Pera Ka Pa Ba?

MPKPB? is a local-first personal finance application for Filipino users. It helps you track wallets and budgets, understand upcoming cash flow, and get a little Taglish encouragement — without an account or cloud database.

The application includes responsive onboarding, customizable wallets, protected funds, themes and balance privacy, an income/expense/transfer ledger, category-based budget plans, expected income, debt balances, upcoming bills, and chronological cash-flow forecasts. Forecasts compare conservative, expected, and optimistic income scenarios, flag intermediate and wallet-specific shortages, and calculate safe spending after a locally saved safety buffer. A what-if purchase simulator shows projected impact without saving a transaction. The More area provides a local financial calendar, in-app schedule/budget reminders, and date-filtered analytics for cash flow, categories, budgets, wallets, and debt progress. Actual balances remain ledger-derived; planned income and bills affect balances only when recorded.

## Development

Use Node.js 22.12+ and npm.

```bash
npm install
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
```

MPKPB? stores wallets, transactions, categories, budget plans, expected income, debts, bills, and preferences in this browser's IndexedDB. Forecasting, reminders, and insights use local records and send no financial data externally. Posted transfers are neutral to income/expense totals; only their fees count as expenses. Expected income is not treated as available money before receipt. Planned bills do not affect balances until paid. The app has no backend, account, telemetry, or financial API; financial data stays on this device. Clearing site storage removes local records. Use **More ? Save history** to create a snapshot, download a JSON backup, preview a restore, or export CSV. Keep a copy of your JSON backup outside the browser. The optional PIN hides the interface after five minutes of inactivity and when the app reopens. Browser storage and exported files remain readable outside the app.

## Install and verify

Open the production site once online, then install MPKPB? from your browser if it offers installation. The **More** page confirms when offline access is ready. When an update is ready, finish your changes and close every MPKPB? window before reopening.

Build first, then run `npm run test:browser` to verify critical flows in a disposable Edge profile. Set `MPKPB_BROWSER` to a Chromium executable if Edge is installed elsewhere and `MPKPB_BUILD_DIR` to test a different output directory.

Deploy the static Vite build through the existing Vercel Git integration. After pushing, check its deployment for the release commit, then test the production URL over HTTPS with a disposable profile.

## Project documentation

- [Product requirements](docs/PRODUCT_SPEC.md)
- [Architecture and local database](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Current progress](docs/PROGRESS.md)
- [Contributor instructions](AGENTS.md)

