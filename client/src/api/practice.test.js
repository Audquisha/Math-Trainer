import assert from 'node:assert/strict'
import { test } from 'node:test'
import api from './client.js'
import { requestPractice } from './practice.js'

function setup(context, adapter) {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true, value: { getItem: () => 'test-access-token' },
  })
  const originalAdapter = api.defaults.adapter
  api.defaults.adapter = adapter
  context.after(() => {
    api.defaults.adapter = originalAdapter
    if (storage) Object.defineProperty(globalThis, 'sessionStorage', storage)
    else delete globalThis.sessionStorage
  })
}

for (const scenario of [
  { name: 'instant response', transit: 0, processing: 0, remaining: 10000 },
  { name: 'two-second response delay', transit: 2000, processing: 0, remaining: 8000 },
  { name: 'server processing is not charged twice', transit: 2000, processing: 3000, remaining: 5000 },
  { name: 'response arrives after the deadline', transit: 12000, processing: 0, remaining: 0 },
]) {
  test(`timer accounts for ${scenario.name} despite different client and server clocks`, async context => {
    let elapsed = 0
    context.mock.method(performance, 'now', () => elapsed)
    context.mock.method(Date, 'now', () => 500000 + elapsed)
    setup(context, async config => {
      assert.equal(config.headers.Authorization, 'Bearer test-access-token')
      elapsed = scenario.transit + scenario.processing
      return {
        data: {
          serverNow: 100000 + scenario.processing,
          serverProcessingMs: scenario.processing,
          question: { expiresAt: 110000 },
        },
      }
    })
    const response = await requestPractice()
    assert.equal(response.question.deadline - Date.now(), scenario.remaining)
  })
}

test('an unstarted question never receives a client deadline', async context => {
  setup(context, async () => ({ data: { serverNow: 100000, question: { expiresAt: null } } }))
  const response = await requestPractice()
  assert.equal(Object.hasOwn(response.question, 'deadline'), false)
})

test('history and completed practice responses are preserved', async context => {
  const responses = [[{ attemptNumber: 1 }], { completed: true, question: null }]
  const queue = [...responses]
  setup(context, async () => ({ data: queue.shift() }))
  for (const data of responses) {
    assert.equal(await requestPractice(), data)
  }
})

test('an early timeout waits for the server deadline and retries the same question once', async context => {
  const sent = []
  setup(context, async config => {
    sent.push(JSON.parse(config.data))
    if (sent.length === 1) {
      throw { response: { status: 409, data: { retryAfterMs: 1 } } }
    }
    return { data: { completed: true, question: null } }
  })
  const answer = { attemptNumber: 1, questionId: 'question-1', selectedAnswer: null }
  assert.equal((await requestPractice('post', '/answer', answer)).completed, true)
  assert.deepEqual(sent, [answer, answer])
})

test('stale questions and failed selected answers are not silently retried', async context => {
  let calls = 0
  const error = { response: { status: 409, data: { message: 'Question is no longer active.' } } }
  setup(context, async () => { calls++; throw error })
  await assert.rejects(requestPractice('post', '/answer', { selectedAnswer: null }), thrown => thrown === error)
  error.response.data.retryAfterMs = 1
  await assert.rejects(requestPractice('post', '/answer', { selectedAnswer: 3 }), thrown => thrown === error)
  assert.equal(calls, 2)
})

test('a second early-timeout conflict is returned instead of retrying indefinitely', async context => {
  let calls = 0
  const error = { response: { status: 409, data: { retryAfterMs: 1 } } }
  setup(context, async () => { calls++; throw error })
  await assert.rejects(requestPractice('post', '/answer', { selectedAnswer: null }), thrown => thrown === error)
  assert.equal(calls, 2)
})