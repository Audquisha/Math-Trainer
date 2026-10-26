import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getQuestionDuration, startQuestionTimer } from '../src/utils/questionTimer.js'

test('duration uses a ten-second base and positive difficulty multiplier', () => {
  assert.equal(getQuestionDuration(), 10)
  assert.equal(getQuestionDuration(3), 30)
  assert.equal(getQuestionDuration(0.5), 5)
  for (const value of [0, -1, NaN, Infinity, '2', Number.MAX_VALUE]) {
    assert.throws(() => getQuestionDuration(value), RangeError)
  }
})

test('counts down to zero and expires only once', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'] })
  const ticks = []
  let expired = 0
  startQuestionTimer(1, { onTick: (value) => ticks.push(value), onExpire: () => expired++ })
  assert.deepEqual(ticks, [10])
  context.mock.timers.tick(1000)
  assert.equal(ticks.at(-1), 9)
  context.mock.timers.tick(9000)
  assert.equal(ticks.at(-1), 0)
  context.mock.timers.tick(5000)
  assert.equal(expired, 1)
  assert.ok(ticks.every((value) => value >= 0))
})

test('cancelling prevents future ticks and expiration', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'] })
  const ticks = []
  const cancel = startQuestionTimer(2, {
    onTick: (value) => ticks.push(value),
    onExpire: () => assert.fail('Cancelled timer expired'),
  })
  cancel()
  context.mock.timers.tick(30000)
  assert.deepEqual(ticks, [20])
})

test('a delayed callback catches up to the deadline', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 0 })
  const ticks = []
  let expired = 0
  startQuestionTimer(1, { onTick: (value) => ticks.push(value), onExpire: () => expired++ })
  context.mock.timers.setTime(15000)
  context.mock.timers.tick(100)
  assert.deepEqual(ticks, [10, 0])
  assert.equal(expired, 1)
})

test('a supplied deadline resumes remaining time instead of granting a new duration', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 7000 })
  const ticks = []
  let expired = 0
  startQuestionTimer(1, { deadline: 10000, onTick: (value) => ticks.push(value), onExpire: () => expired++ })
  assert.deepEqual(ticks, [3])
  context.mock.timers.tick(3000)
  assert.equal(ticks.at(-1), 0)
  assert.equal(expired, 1)
})

test('an already expired deadline immediately reports zero and expires once', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 20000 })
  const ticks = []
  let expired = 0
  startQuestionTimer(1, { deadline: 10000, onTick: (value) => ticks.push(value), onExpire: () => expired++ })
  context.mock.timers.tick(10000)
  assert.deepEqual(ticks, [0])
  assert.equal(expired, 1)
})
