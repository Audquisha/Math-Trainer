// Opt-in test against the configured MongoDB. Creates and removes only its own test user/data.
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env'), quiet: true })
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { once } = require('node:events')
const { test } = require('node:test')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = require('../app')
const User = require('../model/User')
const Practice = require('../model/Practice')

test('authenticated practice persists answers, rejects late/duplicate answers, resumes, and resets on retry', async () => {
    await mongoose.connect(process.env.MONGO_URI)
    let server
    const userId = new mongoose.Types.ObjectId()
    try {
        await Practice.init()
        const username = `practice-test-${randomUUID()}`
        const password = randomUUID()
        await User.create({
            _id: userId, opid: randomUUID(), username,
            password: await bcrypt.hash(password, 10),
            firstName: 'Practice', lastName: 'Test', role: 'student',
        })
        server = app.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const base = `http://127.0.0.1:${server.address().port}`
        let token
        async function request(path, method = 'GET', data, authorization = token) {
            const response = await fetch(`${base}/api${path}`, {
                method,
                headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
                ...(data === undefined ? {} : { body: JSON.stringify(data) }),
            })
            return { status: response.status, body: await response.json() }
        }
        assert.equal((await request('/practice')).status, 401)
        const login = await request('/auth/login', 'POST', { user: username, pwd: password })
        assert.equal(login.status, 200)
        token = login.body.accessToken
        assert.equal(jwt.verify(token, process.env.ACCESS_TOKEN_SECRET).sub, userId.toString())
        assert.equal((await request('/practice')).body, null)
        let result = await request('/practice', 'POST')
        assert.equal(result.status, 200)
        const practiceId = result.body.practiceId
        assert.equal(result.body.question.choices.length, 4)
        assert.equal(result.body.question.correctAnswer, undefined)
        assert.equal((await request('/practice', 'POST')).body.practiceId, practiceId)
        let stored = await Practice.findOne({ userId }).lean()
        const path = `/practice/${practiceId}/answers`
        const foreignToken = jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, process.env.ACCESS_TOKEN_SECRET)
        assert.equal((await request(path, 'POST', { questionIndex: 0, answer: null }, foreignToken)).status, 404)
        assert.equal((await request(path, 'POST', { questionIndex: 0, answer: 999 })).status, 400)

        const duplicateResults = await Promise.all([
            request(path, 'POST', { questionIndex: 0, answer: stored.questions[0].correctAnswer }),
            request(path, 'POST', { questionIndex: 0, answer: stored.questions[0].correctAnswer }),
        ])
        assert.ok(duplicateResults.some((response) => response.status === 200))
        assert.ok(duplicateResults.every((response) => [200, 409].includes(response.status)))
        stored = await Practice.findOne({ userId }).lean()
        assert.equal(stored.currentIndex, 1)
        assert.equal(stored.correctCount, 1)
        const wrongAnswer = stored.questions[1].choices.find((choice) => choice !== stored.questions[1].correctAnswer)
        result = await request(path, 'POST', { questionIndex: 1, answer: wrongAnswer })
        assert.equal(result.status, 200)
        await Practice.updateOne({ userId }, { $set: { 'questions.2.expiresAt': new Date(Date.now() - 1) } })
        // Loading saved progress reconciles a timeout even if the browser never submitted it.
        result = await request('/practice')
        assert.equal(result.body.status, 'completed')
        assert.equal(result.body.accuracy, 33.33)
        assert.equal(result.body.questions[1].chosenAnswer, wrongAnswer)
        assert.equal(result.body.questions[2].chosenAnswer, null)
        assert.equal(result.body.questions[2].isCorrect, false)
        assert.equal(result.body.questions[2].status, 'expired')
        stored = await Practice.findOne({ userId }).lean()
        assert.equal(stored.accuracy, 33.33)
        assert.equal((await request(path, 'POST', { questionIndex: 0, answer: null })).body.accuracy, 33.33)

        result = await request('/practice/retry', 'POST', { practiceId })
        assert.equal(result.status, 200)
        assert.notEqual(result.body.practiceId, practiceId)
        assert.equal(result.body.currentIndex, 0)
        stored = await Practice.findOne({ userId }).lean()
        assert.equal(stored.accuracy, 0)
        assert.ok(stored.questions.every((question) => question.chosenAnswer === null))
        assert.equal(await Practice.countDocuments({ userId }), 1)
        assert.equal((await request(path, 'POST', { questionIndex: 0, answer: null })).status, 404)
        const newId = result.body.practiceId
        await Practice.updateOne({ userId }, { $set: { 'questions.0.expiresAt': new Date(Date.now() - 1) } })
        result = await request(`/practice/${newId}/answers`, 'POST', { questionIndex: 0, answer: stored.questions[0].correctAnswer })
        assert.equal(result.status, 200)
        stored = await Practice.findOne({ userId }).lean()
        assert.equal(stored.questions[0].isCorrect, false)
        assert.equal(stored.questions[0].status, 'expired')
    } finally {
        if (server) await new Promise((resolve) => server.close(resolve))
        await Practice.deleteOne({ userId })
        await User.deleteOne({ _id: userId })
        await mongoose.disconnect()
    }
})
