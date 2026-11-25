# MPKPB? — May Pera Ka Pa Ba?

MPKPB? is a local-first personal finance application for Filipino users. It helps you track wallets and budgets, understand upcoming cash flow, and get a little Taglish encouragement — without an account or cloud database.

The foundation includes a responsive app shell, theme settings, balance privacy toggle, first-wallet setup, local IndexedDB storage, and integer-centavo PHP utilities. Transactions, budgets, debts, forecasts, backup/restore, and PWA support are planned.

## Development

Requirements: Node.js 20.19+ or 22.12+, npm. The built-in TypeScript test runner requires Node.js 22.6+.

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

MPKPB? stores wallet and preference data in this browser's IndexedDB. It has no application backend, account, analytics, or financial API. Clearing site storage removes local records; backup and restore support is planned.

## Project documentation

- [Product requirements](docs/PRODUCT_SPEC.md)
- [Architecture and local database](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Current progress](docs/PROGRESS.md)
- [Contributor instructions](AGENTS.md)

