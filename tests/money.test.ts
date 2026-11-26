import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPHP, isMoneyInputDraft, moneyPasteText, parsePesoToCentavos, sumCentavos } from '../src/domain/money.ts'

test('parses peso values into integer centavos', () => {
  assert.equal(parsePesoToCentavos('1250.05'), 125005)
  assert.equal(parsePesoToCentavos('0.4'), 40)
  assert.equal(parsePesoToCentavos('18.'), 1800)
})

test('rejects malformed, negative, over-precision, and unsafe amounts', () => {
  assert.equal(parsePesoToCentavos(''), null)
  assert.equal(parsePesoToCentavos('-2.00'), null)
  assert.equal(parsePesoToCentavos('1.234'), null)
  assert.equal(parsePesoToCentavos('1,250.05'), null)
  assert.equal(parsePesoToCentavos('90071992547410'), null)
})

test('formats and sums only safe integer centavo amounts', () => {
  assert.match(formatPHP(125005), /1,250\.05/)
  assert.match(formatPHP(-1), /-.*0\.01/)
  assert.match(formatPHP(Number.MAX_SAFE_INTEGER), /\.91$/)
  assert.equal(sumCentavos([100, 25, 875]), 1000)
  assert.throws(() => sumCentavos([Number.MAX_SAFE_INTEGER, 1]), RangeError)
})

test('money input allows decimal edits and rejects text, excess precision, and unsafe values', () => {
  for (const value of ['', '.', '.50', '18.', '21.05']) assert.ok(isMoneyInputDraft(value))
  for (const value of ['12abc', '1e3', '1.234', '1..2', '90071992547410', '-2']) assert.equal(isMoneyInputDraft(value), false)
  assert.ok(isMoneyInputDraft('-2.50', true))
  assert.equal(parsePesoToCentavos('.50'), 50)
  assert.equal(parsePesoToCentavos('.'), null)
  assert.equal(moneyPasteText('₱1,234.56'), '1234.56')
  assert.equal(moneyPasteText('12abc'), '12abc')
})
