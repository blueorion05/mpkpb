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

**v0.2.0 core ledger complete.**

## Phase 3 — v0.3.0 Budget planning and expected income

- [x] Multiple named budget plans with custom inclusive date ranges.
- [x] Expense-category limits, utilization, remaining allowances, and overspending visibility.
- [x] Budget plan duplication and archival.
- [x] Expected income with confidence levels and one-time, weekly, biweekly, or monthly recurrence.
- [x] Partial/full receipt tracking linked atomically to posted income transactions.
- [x] Receipt edit/delete reconciliation and safe monthly recurrence anchors.
- [x] v3-to-v4 IndexedDB migration, regression tests, responsive workflows, and documentation.

**v0.3.0 budget planning and expected income complete.**

## Phase 4 — v0.4.0 Debts and upcoming obligations

- [x] Money owed and receivable; existing and new debts.
- [x] Partial payments/collections, settlement history, and payment-to-transaction links.
- [x] Upcoming bills, due/overdue dates, recurring obligations, and installments.
- [x] Double-counting prevention for linked original transactions.
- [x] v4-to-v5 IndexedDB migration, atomic reconciliation, financial regressions, and responsive browser workflows.

**v0.4.0 debts and upcoming obligations complete.**

## Phase 5 — v0.5.0 Financial forecasting

- [x] Chronological cash flow with intermediate shortage detection and recovery dates.
- [x] Conservative, expected, and optimistic scenarios; overdue/partial-event handling.
- [x] Wallet projections, protected funds, safety buffers, and safe daily/weekly spending.
- [x] Forecast visualizations and customizable periods.
- [x] Centavo regression coverage, local safety-buffer persistence, and responsive browser checks.

**v0.5.0 financial forecasting complete.**

## Phase 6 — v0.6.0 Tools and analytics

- [x] What-if purchase simulator, calendar, upcoming timeline, and local reminders.
- [x] Trends, category breakdowns, income/expense, budget, wallet, and debt analytics.
- [x] Relevant date and budget filters.

## Phase 7 — v0.7.0 Geng personality and UI/UX

- [x] Context-aware Taglish humor engine with at least 100 unique punchlines.
- [x] Signature expression, humor/profanity toggles, separate financial warnings.
- [x] Polish onboarding copy and preserve responsive themes and reduced-motion support.
- [ ] Optional isolated demo data.

## Phase 8 — v0.8.0 Data safety and privacy

- [x] Autosave timestamps, manual/safety snapshots, previews, and restoration.
- [x] JSON backup/restore with validation/preview, CSV exports, and explicit full reset.
- [x] Optional local PIN lock, inactivity locking, verification, limitations, and migration tests.

## Phase 9 — v0.9.0 PWA and comprehensive QA

- [x] Installable PWA, manifest/icons, offline shell, and safe update handling.
- [x] Offline operations, responsive/accessibility/browser persistence testing.
- [x] Financial regression and critical workflow E2E tests; performance and cleanup.
- [x] Product-spec review against the complete implementation.

## Phase 10 — v1.0.0 Production release

- [x] Final functional, UI/UX, financial integrity, and privacy review.
- [x] Update the version and docs and verify the final production build locally.
- [ ] Push the release commit and tag, then verify deployment.
- [ ] Verify the production site or document the exact authorization blocker and remaining action.
