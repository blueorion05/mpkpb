# MPKPB? — May Pera Ka Pa Ba?

MPKPB? is a local-first personal finance application for Filipino users. It helps you track wallets and budgets, understand upcoming cash flow, and get a little Taglish encouragement — without an account or cloud database.

The v0.4.0 foundation includes responsive onboarding, customizable wallets, protected funds, themes and balance privacy, an income/expense/transfer ledger, category-based budget plans, expected income, debt balances, and upcoming bills. Balances derive from posted ledger entries; expected income only changes a balance after a receipt is posted, and debt or bill payments change balances only when recorded. Linking an original debt transaction prevents later settlements from double-counting that income or expense. Forecasting, analytics, backup/restore, and PWA support remain later milestones.

## Development

Requirements: Node.js 20.19+ or 22.12+, npm. The built-in TypeScript test runner requires Node.js 22.6+.

```bash
npm install
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
```

MPKPB? stores wallets, transactions, categories, budget plans, expected income, debts, bills, and preferences in this browser's IndexedDB. Posted transfers are neutral to income/expense totals; only their fees count as expenses. Expected income is not treated as available money before receipt. Planned bills do not affect balances until paid. The app has no backend, account, analytics, or financial API; financial data stays on this device. Clearing site storage removes local records; backup and restore are planned.

## Project documentation

- [Product requirements](docs/PRODUCT_SPEC.md)
- [Architecture and local database](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Current progress](docs/PROGRESS.md)
- [Contributor instructions](AGENTS.md)

