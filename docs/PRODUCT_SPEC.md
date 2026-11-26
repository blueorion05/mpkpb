# Product requirements

MPKPB? (May Pera Ka Pa Ba?) is a responsive, local-first personal finance app primarily for Filipino users. It should make actual balances, planned money, budgets, debts, and predicted cash flow easy to understand without sacrificing financial accuracy or privacy.

## Principles

- No registration, backend, cloud database, paid API, third-party analytics/telemetry, or external AI service.
- Store monetary values as integer centavos and format Philippine pesos using `en-PH`.
- Make examples customizable and distinguish actual money from projections.
- Prioritize mobile usability, keyboard access, accessible contrast, and reduced motion.
- Use conversational Taglish for navigation and financial labels, with familiar English terms for clarity. Use contextual humor sparingly.
- Never let humor obscure important financial information.

## Primary areas

Dashboard, wallets, transactions, budget plans, forecast, debts, insights, save history, and settings. Mobile navigation prioritizes Home, Wallets, Activity, Aabot pa?, Budget, and More.

## Financial features

The application provides a responsive application shell, skippable first-run wallet onboarding, customizable wallets, protected funds, theme choice, balance visibility, and local IndexedDB persistence. The ledger supports dated income, expenses, transfers and fees, manual balance adjustments, custom categories, transaction edits/deletion, and searchable/filterable/sortable history. Balances derive from opening balances plus posted ledger deltas. Budget plans have customizable inclusive date ranges and expense-category limits. Expected income records due dates, confidence, and recurrence; receipts create linked posted income transactions. Debts support payable and receivable balances, installments, partial settlement, and optional original-transaction links. Upcoming bills support due dates, recurrence, installments, and partial payments. Forecasts model these schedules chronologically with confidence scenarios, wallet-specific balances, shortage/recovery dates, protected funds, and a safety buffer. The forecast includes a hypothetical-purchase simulator that affects projections only, never the ledger. The More area provides an in-app financial calendar, local reminders for near-term/overdue schedules and budget thresholds, and date-filtered income, expense, category, budget, wallet, and debt insights. See the [roadmap](ROADMAP.md) for remaining verification.

## Everyday recording

The Home dashboard shows actual and spendable balances, money expected and due by month-end, the projected remainder, and any projected shortage. Add record opens the same form for completed activity and future income, gastos, bills, payables, and receivables. Future money stays in schedules until the user records payment or receipt. Users can edit schedules and record early or partial settlement from Home. Transfers and adjustments can be posted through today. Budget matching follows expense category and date.

## Personality, recovery, and offline access

- Geng Geng rotates contextual Taglish lines. Humor can be disabled and mild profanity requires opt-in. Financial warnings remain visible independently.
- Save history shows the latest autosave and supports manual snapshots, JSON backup and restore with previews, and wallet and transaction CSV exports. Restore replaces financial records and keeps an atomic safety snapshot. Full reset requires typed confirmation.
- The optional PIN hides the app on reopen or after five minutes of inactivity. Browser storage and backups remain readable outside the app.
- A production visit online primes the installable app for offline use. Updates wait for all existing app windows to close.

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
- Forecasting uses integer-centavo ledger balances and active scheduled events; planned income and bills never change actual balances.
- Conservative forecasts include only high-confidence expected income and no debt collections; expected forecasts include high/medium income and collections; optimistic forecasts include all expected income and collections. All scheduled outflows remain in every scenario.
- Overdue and partially settled occurrences project only their unpaid amounts from today. Same-day outflows are checked before inflows, and wallet-specific shortages must remain visible even if combined balances are positive.
- Protected and archived funds remain in total projections but do not count as spendable money. Safe daily/weekly spending must respect a locally saved safety buffer and projected intermediate headroom.
- What-if purchases are temporary forecast outflows; they are never saved as transactions or included in actual balances.
- Analytics use posted ledger entries only, exclude debt settlements already represented by a linked original transaction, and treat transfer principal as neutral while including transfer fees as expenses.
- Calendar reminders are generated and displayed locally from upcoming/overdue schedules and active budget utilization; they do not use operating-system notifications or transmit financial data.

## Branding and iconography

The supplied geng mascot is the product brand. The visible dashboard or navigation mascot animates. It stays idle between one-shot sequences and remains static with reduced motion. Compact branding and app icons use the original idle artwork. Lucide supplies functional icons, with a curated picker for wallets and financial categories. Existing wallet icon IDs and categories remain valid.

## Everyday refinements

Home shows outstanding debt and bills across all dates separately from month-end dues. Ongoing bills without a fixed count contribute their next unpaid occurrence. Add record starts with four types and suggests whether a record should post or be scheduled. New borrowing and lending require an explicit choice before moving wallet funds. Wallet adjustments post the difference to Activity.

Home shows Net money as the total across all wallets minus all outstanding obligations. It follows the balance visibility setting and uses the same outstanding total as Mga babayaran.

Pages share a typography scale, form-label styles, control heights, and panel spacing. Mobile layouts keep editable input text at 16px or larger and retain keyboard focus indicators.

Utang and receivables can be saved and settled without a due date. Undated payables count toward Mga babayaran and Net money, and dated forecasts leave undated debts and receivables out. Installment schedules require a first due date.

Dialogs use a stable size within the viewport and scroll internally when content expands. Money fields accept decimal amounts up to two places and validate edited or pasted values before submission. Standard pasted peso formatting is supported.

Dialogs keep titles and actions in view while longer forms scroll. Temporary notifications float above the page and dismiss themselves. Form validation stays next to the form so users can correct errors.
