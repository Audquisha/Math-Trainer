import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getQuestionDuration, startQuestionTimer } from './questionTimer.js'

test('difficulty 1 supplies ten seconds and expires exactly once', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 })
  const ticks = []
  let expired = 0
  assert.equal(getQuestionDuration(1), 10)
  startQuestionTimer(1, { onTick: value => ticks.push(value), onExpire: () => expired++ })
  assert.deepEqual(ticks, [10])
  context.mock.timers.tick(9900)
  assert.equal(expired, 0)
  assert.equal(ticks.at(-1), 1)
  context.mock.timers.tick(100)
  assert.equal(expired, 1)
  assert.equal(ticks.at(-1), 0)
  context.mock.timers.tick(5000)
  assert.equal(expired, 1)
})

test('resuming uses the remaining deadline instead of another ten seconds', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 7000 })
  const ticks = []
  let expired = false
  startQuestionTimer(1, { deadline: 10000, onTick: value => ticks.push(value), onExpire: () => { expired = true } })
  assert.deepEqual(ticks, [3])
  context.mock.timers.tick(3000)
  assert.equal(expired, true)
  assert.equal(ticks.at(-1), 0)
})

test('a deadline in the past expires without displaying negative time', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 20000 })
  const ticks = []
  let expired = false
  startQuestionTimer(1, { deadline: 10000, onTick: value => ticks.push(value), onExpire: () => { expired = true } })
  context.mock.timers.tick(100)
  assert.deepEqual(ticks, [0])
  assert.equal(expired, true)
})

test('cancelling prevents expiry and further countdown updates', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 })
  const ticks = []
  let expired = false
  const cancel = startQuestionTimer(1, { onTick: value => ticks.push(value), onExpire: () => { expired = true } })
  cancel()
  context.mock.timers.tick(20000)
  assert.deepEqual(ticks, [10])
  assert.equal(expired, false)
})
