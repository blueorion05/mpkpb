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

The v0.1.0 foundation provides a responsive application shell, skippable first-run wallet onboarding, wallet create/edit/archive/restore, custom names/icons/colors, protected funds, theme choice, balance visibility, IndexedDB persistence, and centavo utilities. It does not yet include a transaction ledger, budgets, debts, or forecasts. See `docs/ROADMAP.md` for current scope and sequencing.

## Financial behavior

- Store money as safe integer centavos; reject unsupported precision and unsafe values.
- Expected income is not current available balance.
- Transfers change wallet balances but are neutral in overall income/expense totals.
- Protected funds are included in total balance and excluded from spendable funds.
- Wallet balances must ultimately be derived from opening balances and posted ledger entries.
- Forecasting must report intermediate cash shortages even when the period ends positive.
