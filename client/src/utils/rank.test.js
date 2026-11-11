import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RANKS, rankInfo } from './rank.js'

test('ranks run from Kindergarten to 6th grade', () => {
  assert.equal(RANKS.length, 7)
  assert.equal(rankInfo(0).label, 'Kindergarten')
  assert.equal(rankInfo(6).label, '6th Grade')
})

test('missing or out-of-range ranks fall back to Kindergarten', () => {
  for (const rank of [undefined, null, -1, 7, 1.5, '3', 'length']) {
    assert.equal(rankInfo(rank), RANKS[0])
  }
})
