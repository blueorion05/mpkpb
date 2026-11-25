import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mascotFrame, mascotIdleMs, MASCOT_PLAY_MS } from '../src/domain/mascot.ts'
import { isTransactionCategory } from '../src/domain/ledger.ts'

test('mascot idle waits range from eight to fifteen seconds', () => {
  assert.equal(mascotIdleMs(0), 8000)
  assert.equal(mascotIdleMs(0.999999), 15000)
})

test('plays all nine 180 ms source frames before blending to idle', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, index) => mascotFrame(index * 180).index),
    [0, 1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(mascotFrame(MASCOT_PLAY_MS + 60), { index: 8, blend: 0.5 })
})

test('legacy categories remain valid and optional icon IDs are checked', () => {
  const category = {
    id: 'category', kind: 'expense', name: 'Food', normalizedName: 'food',
    createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z',
  }
  assert.ok(isTransactionCategory(category))
  assert.ok(isTransactionCategory({ ...category, icon: 'food' }))
  assert.equal(isTransactionCategory({ ...category, icon: 'missing-icon' }), false)
})
