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

The v0.4.0 foundation provides a responsive application shell, skippable first-run wallet onboarding, customizable wallets, protected funds, theme choice, balance visibility, and local IndexedDB persistence. The ledger supports dated income, expenses, transfers and fees, manual balance adjustments, custom categories, transaction edits/deletion, and searchable/filterable/sortable history. Balances derive from opening balances plus posted ledger deltas. Budget plans have customizable inclusive date ranges and expense-category limits. Expected income records due dates, confidence, and recurrence; receipts create linked posted income transactions. Debts support payable and receivable balances, installments, partial settlement, and optional original-transaction links. Upcoming bills support due dates, recurrence, installments, and partial payments. Forecasting and later milestones remain future work; see `docs/ROADMAP.md`.

## Financial behavior

- Store money as safe integer centavos; reject unsupported precision and unsafe values.
- Expected income is not current available balance.
- Budget utilization counts only categorized expenses inside the budget's inclusive date range; overspending remains visible as a negative allowance.
- Recording expected income creates an actual income transaction and updates its schedule atomically. Editing or deleting a linked receipt reconciles the expected amount.
- Recurring income advances after a full occurrence receipt; partial receipts do not skip or reduce the next scheduled occurrence.
- Debt settlements and bill payments create ledger transactions and update their schedule records atomically. Deleting a linked settlement/payment reopens its amount; editing preserves its original schedule occurrence.
- A debt may link to its original ledger income/expense. The original transaction remains counted; settlements still change wallet balances but are excluded from income/expense totals and budgets to avoid double counting. Deleting a linked original transaction is blocked.
- Planned bills do not affect current balances. Bill payments are categorized ledger expenses; debt payments without a linked original transaction count as income/expense.
- Transfers change wallet balances but are neutral in overall income/expense totals.
- Transfer fees decrease the source wallet and count as expenses; the transferred principal does not.
- Posted income/expense transactions are not permitted to be future-dated.
- Protected funds are included in total balance and excluded from spendable funds.
- Wallet balances must ultimately be derived from opening balances and posted ledger entries.
- Forecasting must report intermediate cash shortages even when the period ends positive.
