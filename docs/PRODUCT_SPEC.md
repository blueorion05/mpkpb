# Product requirements

MPKPB? (May Pera Ka Pa Ba?) is a responsive, local-first personal finance app primarily for Filipino users. It should make actual balances, planned money, budgets, debts, and predicted cash flow easy to understand without sacrificing financial accuracy or privacy.

## Principles

- No registration, backend, cloud database, paid API, analytics, or external AI service.
- Store monetary values as integer centavos and format Philippine pesos using `en-PH`.
- Make examples customizable and distinguish actual money from projections.
- Prioritize mobile usability, keyboard access, accessible contrast, and reduced motion.
- Use English for navigation and financial labels; use contextual Taglish humor sparingly.
- Never let humor obscure important financial information.

## Primary areas

Dashboard, wallets, transactions, budget plans, calendar/forecast, debts, insights, save history, and settings. Mobile navigation prioritizes Home, Wallets, Activity, Plans, and More.

## Current foundation

The v0.2.0 foundation and ledger provide a responsive application shell, skippable first-run wallet onboarding, wallet create/edit/archive/restore, custom wallet names/icons/colors, protected funds, theme choice, balance visibility, and local IndexedDB persistence. The ledger supports dated income, expenses, transfers and fees, manual balance adjustments, custom categories, transaction edits/deletion, and searchable/filterable/sortable history. Current balances derive from opening balances plus posted ledger deltas. A future-dated expected income is not a posted transaction and does not increase current balance; expected income is planned separately in v0.3. Budgets, debts, and forecasts remain later milestones. See `docs/ROADMAP.md` for current scope and sequencing.

## Financial behavior

- Store money as safe integer centavos; reject unsupported precision and unsafe values.
- Expected income is not current available balance.
- Transfers change wallet balances but are neutral in overall income/expense totals.
- Transfer fees decrease the source wallet and count as expenses; the transferred principal does not.
- Posted income/expense transactions are not permitted to be future-dated.
- Protected funds are included in total balance and excluded from spendable funds.
- Wallet balances must ultimately be derived from opening balances and posted ledger entries.
- Forecasting must report intermediate cash shortages even when the period ends positive.
