const assert = require('node:assert/strict')
const { test } = require('node:test')
const { generateQuestion, createPractice, answerPractice, practiceResponse, QUESTION_TIME_MS } = require('../services/practice')
const Practice = require('../model/Practice')

test('all 169 factor pairs have four distinct valid products and exactly one correct answer', () => {
    for (let a = 0; a <= 12; a++) {
        for (let b = 0; b <= 12; b++) {
            const question = generateQuestion(a, b)
            assert.equal(question.choices.length, 4)
            assert.equal(new Set(question.choices).size, 4)
            assert.equal(question.choices.filter((choice) => choice === a * b).length, 1)
            for (const choice of question.choices) {
                let valid = false
                for (let x = 0; x <= 12; x++) {
                    for (let y = 0; y <= 12; y++) {
                        if (x * y === choice && (choice === a * b || x !== a || y !== b)) valid = true
                    }
                }
                assert.ok(valid, `${a} x ${b}: invalid choice ${choice}`)
            }
        }
    }
})

test('a practice contains three distinct multiplication facts and one active deadline', () => {
    const practice = createPractice(1000)
    assert.equal(practice.questions.length, 3)
    assert.equal(new Set(practice.questions.map(({ a, b }) => [a, b].sort((x, y) => x - y).join(':'))).size, 3)
    assert.equal(practice.questions[0].expiresAt.getTime(), 1000 + QUESTION_TIME_MS)
    assert.equal(practice.questions[1].expiresAt, null)
    assert.equal(practice.questions[2].status, 'pending')
    assert.equal(practice.accuracy, 0)
})

test('correct, incorrect and unanswered questions are persisted and scored out of three', async () => {
    let practice = createPractice(1000)
    const correctAnswer = practice.questions[0].correctAnswer
    practice = answerPractice(practice, 0, correctAnswer, 2000)
    assert.equal(practice.questions[0].chosenAnswer, correctAnswer)
    assert.equal(practice.questions[0].isCorrect, true)
    const wrongAnswer = practice.questions[1].choices.find((choice) => choice !== practice.questions[1].correctAnswer)
    practice = answerPractice(practice, 1, wrongAnswer, 3000)
    assert.equal(practice.questions[1].chosenAnswer, wrongAnswer)
    assert.equal(practice.questions[1].isCorrect, false)
    practice = answerPractice(practice, 2, null, 3000 + QUESTION_TIME_MS)
    assert.equal(practice.questions[2].status, 'expired')
    assert.equal(practice.questions[2].chosenAnswer, null)
    assert.equal(practice.questions[2].isCorrect, false)
    assert.equal(practice.accuracy, 33.33)
    assert.equal(practice.correctCount, 1)
    assert.equal(practice.status, 'completed')
    const saved = new Practice({ ...practice, userId: '000000000000000000000001' })
    await saved.validate()
    assert.equal(saved.toObject().questions[2].chosenAnswer, null)
})

test('answers at or after the deadline are incorrect even when the value is correct', () => {
    for (const offset of [0, 1, 10000]) {
        const practice = createPractice(1000)
        const result = answerPractice(practice, 0, practice.questions[0].correctAnswer, 1000 + QUESTION_TIME_MS + offset)
        assert.equal(result.correctCount, 0)
        assert.equal(result.questions[0].status, 'expired')
        assert.equal(result.questions[0].isCorrect, false)
    }
})

test('duplicate submissions do not advance again, and invalid selections are rejected', () => {
    const practice = createPractice(1000)
    assert.throws(() => answerPractice(practice, 1, practice.questions[1].correctAnswer, 2000), { status: 409 })
    for (const answer of [undefined, '0', 999, {}, false]) {
        assert.throws(() => answerPractice(practice, 0, answer, 2000), { status: 400 })
    }
    const next = answerPractice(practice, 0, practice.questions[0].correctAnswer, 2000)
    assert.equal(answerPractice(next, 0, null, 3000), next)
})

test('active responses hide solutions and completed responses include all saved results', () => {
    let practice = createPractice(1000)
    const active = practiceResponse(practice, 2000)
    assert.equal(active.question.correctAnswer, undefined)
    assert.equal(active.questions, undefined)
    assert.equal(active.question.expiresAt, 1000 + QUESTION_TIME_MS)
    for (let i = 0; i < 3; i++) practice = answerPractice(practice, i, practice.questions[i].correctAnswer, 2000 + i)
    const completed = practiceResponse(practice)
    assert.equal(completed.accuracy, 100)
    assert.equal(completed.questions.length, 3)
    assert.ok(completed.questions.every((question) => question.chosenAnswer === question.correctAnswer))
})
