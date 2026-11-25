# Roadmap

## Phase 0 — Project initialization

- [x] Inspect workspace, Git state, and Node/npm/Git availability.
- [x] Scaffold React, Vite, and TypeScript on the local `main` branch.
- [x] Add project, architecture, development, and progress documentation.
- [x] Add a local Node test command and initial centavo utility tests.
- [x] Generate and retain the package lockfile; verify installed dependencies.
- [x] Run lint, type checking, tests, and production build.
- [ ] Configure GitHub Actions and a remote repository after account authorization.

## Phase 1 — Foundation and design system

- [x] Create MPKPB? branding and responsive app shell.
- [x] Add desktop sidebar and mobile bottom navigation.
- [x] Add system/light/dark themes and balance visibility toggle.
- [x] Establish versioned wallet and preference stores in IndexedDB.
- [x] Add skippable first-run onboarding and wallet create/edit/archive/restore.
- [x] Add customizable wallet names, icons, and colors.
- [x] Add protected/spendable totals, loading/empty/error/success states, and PHP centavo utilities.
- [x] Validate wallet and preference persistence plus desktop/mobile behavior in a browser.
- [x] Add dialog keyboard focus handling and responsive accessibility refinements.

**v0.1.0 foundation complete.**

## Phase 2 — Core financial ledger

- [x] Wallet transfers with fees; income, expense, and signed balance adjustment transactions.
- [x] Custom income/expense categories; transaction editing and confirmed deletion.
- [x] Search, wallet/category/date/type filters, sorting, and transaction history.
- [x] Ledger-derived wallet balances and atomic IndexedDB transaction writes.
- [x] Backward-compatible schema migration and financial calculation regression tests.

**v0.2.0 core ledger complete.** Expected income, budgets, debts, and forecasts remain future work.

## Phase 3 — Budgets and debts

- [ ] Budget plans and category limits.
- [ ] Expected income and upcoming obligations.
- [ ] Debt tracking, partial settlements, and recurring events.
- [ ] Financial calendar.

## Phase 4 — Financial intelligence

- [ ] Cash-flow scenarios, intermediate shortage detection, and safe-to-spend calculations.
- [ ] Wallet-specific projections, what-if simulator, and insights.

## Phase 5 — UX polish

- [ ] Contextual Taglish messages, empty states, animation polish, and optional demo data.
- [ ] Accessibility and mobile refinement.

## Phase 6 — Data safety and offline

- [ ] Snapshots, backup/restore, CSV export, optional PIN, and PWA support.
- [ ] Verify offline behavior and schema migrations.

## Phase 7 — Quality and deployment

- [ ] Full financial tests, regression/E2E, accessibility, and performance checks.
- [ ] Production build and deployment preparation/verification.
