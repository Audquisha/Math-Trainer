const { randomUUID } = require('node:crypto')

const QUESTION_COUNT = 3
const DIFFICULTY = 1
const QUESTION_TIME_MS = 10000 * DIFFICULTY

function shuffle(values, random = Math.random) {
    const result = [...values]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

function generateQuestion(a, b, random = Math.random) {
    const correctAnswer = a * b
    const wrongAnswers = new Set()
    // Expand the neighborhood when +/- 1 cannot produce enough unique products.
    for (let distance = 1; distance <= 12 && wrongAnswers.size < 3; distance++) {
        const candidates = []
        for (let x = Math.max(0, a - distance); x <= Math.min(12, a + distance); x++) {
            for (let y = Math.max(0, b - distance); y <= Math.min(12, b + distance); y++) {
                if (Math.max(Math.abs(x - a), Math.abs(y - b)) !== distance) continue
                if (x * y !== correctAnswer) candidates.push(x * y)
            }
        }
        for (const answer of shuffle(candidates, random)) {
            wrongAnswers.add(answer)
            if (wrongAnswers.size === 3) break
        }
    }
    return {
        a, b, correctAnswer,
        choices: shuffle([correctAnswer, ...wrongAnswers], random),
        chosenAnswer: null,
        isCorrect: false,
        status: 'pending',
        startedAt: null,
        expiresAt: null,
        answeredAt: null,
    }
}

function createPractice(now = Date.now(), random = Math.random) {
    const pairs = []
    for (let a = 0; a <= 12; a++) {
        for (let b = a; b <= 12; b++) pairs.push([a, b])
    }
    const questions = shuffle(pairs, random).slice(0, QUESTION_COUNT).map(([a, b]) => {
        return random() < 0.5 ? generateQuestion(a, b, random) : generateQuestion(b, a, random)
    })
    questions[0].status = 'active'
    questions[0].startedAt = new Date(now)
    questions[0].expiresAt = new Date(now + QUESTION_TIME_MS)
    return {
        practiceId: randomUUID(), questions, currentIndex: 0,
        correctCount: 0, accuracy: 0, status: 'active',
    }
}

function answerPractice(practice, questionIndex, answer, now = Date.now()) {
    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= QUESTION_COUNT) {
        throw Object.assign(new Error('Invalid question index.'), { status: 400 })
    }
    if (answer !== null && (!Number.isInteger(answer) || !practice.questions[questionIndex].choices.includes(answer))) {
        throw Object.assign(new Error('Choose one of the four answers.'), { status: 400 })
    }
    // Repeated requests cannot score an answer twice or advance another question.
    if (questionIndex < practice.currentIndex) return practice
    if (questionIndex !== practice.currentIndex || practice.status !== 'active') {
        throw Object.assign(new Error('This question is no longer active.'), { status: 409 })
    }
    const questions = practice.questions.map((question) => ({ ...question }))
    const question = questions[questionIndex]
    const expired = now >= new Date(question.expiresAt).getTime() || answer === null
    question.chosenAnswer = answer
    question.status = expired ? 'expired' : 'answered'
    question.isCorrect = !expired && answer === question.correctAnswer
    question.answeredAt = new Date(now)
    const correctCount = practice.correctCount + (question.isCorrect ? 1 : 0)
    const currentIndex = questionIndex + 1
    const completed = currentIndex === QUESTION_COUNT
    if (!completed) {
        questions[currentIndex].status = 'active'
        questions[currentIndex].startedAt = new Date(now)
        questions[currentIndex].expiresAt = new Date(now + QUESTION_TIME_MS)
    }
    return {
        ...practice, questions, currentIndex, correctCount,
        accuracy: Math.round(correctCount / QUESTION_COUNT * 10000) / 100,
        status: completed ? 'completed' : 'active',
    }
}

function practiceResponse(practice, now = Date.now()) {
    if (!practice) return null
    const base = {
        practiceId: practice.practiceId, status: practice.status,
        currentIndex: practice.currentIndex, total: QUESTION_COUNT,
        difficulty: DIFFICULTY, serverNow: now,
    }
    if (practice.status === 'completed') {
        return { ...base, correctCount: practice.correctCount, accuracy: practice.accuracy,
            questions: practice.questions.map(({ a, b, correctAnswer, chosenAnswer, status, isCorrect }) => ({
                a, b, correctAnswer, chosenAnswer, status, isCorrect,
            })) }
    }
    const { a, b, choices, expiresAt } = practice.questions[practice.currentIndex]
    return { ...base, question: { a, b, choices, expiresAt: new Date(expiresAt).getTime() } }
}

module.exports = { generateQuestion, createPractice, answerPractice, practiceResponse, QUESTION_TIME_MS }
