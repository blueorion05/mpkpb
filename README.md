# MPKPB? — May Pera Ka Pa Ba?

MPKPB? is a local-first personal finance application for Filipino users. It helps you track wallets and budgets, understand upcoming cash flow, and get a little Taglish encouragement — without an account or cloud database.

The v0.2.0 foundation and ledger include responsive onboarding, customizable wallets, protected funds, themes and balance privacy, plus income, expenses, transfers with fees, manual balance adjustments, custom categories, searchable transaction history, and balances derived from the local ledger. Budgets, expected income, debts, forecasts, backup/restore, and PWA support are later milestones.

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

MPKPB? stores wallets, transactions, categories, and preferences in this browser's IndexedDB. Posted transfers are neutral to income/expense totals; only their fees count as expenses. Future income is not treated as available money. The app has no backend, account, analytics, or financial API; financial data stays on this device. Clearing site storage removes local records; backup and restore are planned.

## Project documentation

- [Product requirements](docs/PRODUCT_SPEC.md)
- [Architecture and local database](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Current progress](docs/PROGRESS.md)
- [Contributor instructions](AGENTS.md)

