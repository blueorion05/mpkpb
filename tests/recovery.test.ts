import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateBackup, type LocalBackup } from '../src/db/database.ts'
import { GENG_PUNCHLINES, getGengMessage } from '../src/domain/humor.ts'

const timestamp = '2026-03-01T00:00:00.000Z'

function fixture(): LocalBackup {
  return {
    format: 'mpkpb', version: 1, createdAt: timestamp,
    records: {
      wallets: ['cash', 'bank'].map((id) => ({
        id, name: id, type: 'Cash', icon: 'cash', color: 'green',
        openingBalanceCentavos: 5000, protected: false, archived: false,
        createdAt: timestamp, updatedAt: timestamp,
      })),
      transactions: [{
        id: '1', kind: 'transfer', occurredOn: '2026-03-01', walletId: 'cash',
        toWalletId: 'bank', description: 'Deposit', amountCentavos: 1000, feeCentavos: 25,
        createdAt: timestamp, updatedAt: timestamp,
      }],
      categories: [], budgets: [], debts: [], scheduledEvents: [], preferences: [],
    },
  }
}

test('round-trips a backup with an exact transfer and fee', () => {
  const backup = fixture()
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))), backup)
})

test('rejects backups with duplicate IDs and missing wallet references', () => {
  const duplicate = fixture()
  duplicate.records.wallets.push(duplicate.records.wallets[0])
  assert.throws(() => validateBackup(duplicate), /duplicate record IDs/)
  const missingWallet = fixture()
  missingWallet.records.wallets.pop()
  assert.throws(() => validateBackup(missingWallet), /missing wallet/)
})

test('rejects an imported ledger with an orphaned receipt', () => {
  const backup = fixture()
  backup.records.transactions = [{
    id: 'orphan', kind: 'income', occurredOn: '2026-03-01', walletId: 'cash',
    description: 'Expected', amountCentavos: 100, createdAt: timestamp, updatedAt: timestamp,
    expectedIncomeId: 'missing', expectedIncomeDueOn: '2026-03-01',
  }]
  assert.throws(() => validateBackup(backup), /missing expected-income schedule/)
})

test('Geng rotates within context and respects both preferences', () => {
  assert.ok(new Set(GENG_PUNCHLINES.map((line) => line.text)).size > 100)
  const cleanLedger = new Set(GENG_PUNCHLINES.filter((line) =>
    line.context === 'ledger' && !line.mildProfanity).map((line) => line.text))
  const selected = Array.from({ length: 40 }, (_, index) =>
    getGengMessage('ledger', { humorEnabled: true, profanityEnabled: false }, String(index)))
  assert.ok(selected.every((line) => cleanLedger.has(line)))
  assert.ok(new Set(selected).size > 1)
  assert.notEqual(
    getGengMessage('ledger', { humorEnabled: false, profanityEnabled: true }, '1'),
    getGengMessage('ledger', { humorEnabled: true, profanityEnabled: true }, '1'),
  )
})
