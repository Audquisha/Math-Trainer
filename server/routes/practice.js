const express = require('express')
const Practice = require('../model/Practice')
const requireAuth = require('../middleware/requireAuth')
const { createPractice, answerPractice, practiceResponse } = require('../services/practice')

// Injectable model keeps route tests independent of an external MongoDB service.
function createPracticeRouter(Model = Practice) {
    const router = express.Router()
    router.use(requireAuth)

    router.get('/', async (req, res) => {
        let practice = await Model.findOne({ userId: req.userId }).lean()
        // Persist an expired question even if the browser was closed at the deadline.
        if (practice?.status === 'active' && Date.now() >= new Date(practice.questions[practice.currentIndex].expiresAt).getTime()) {
            const next = answerPractice(practice, practice.currentIndex, null)
            practice = await Model.findOneAndUpdate(
                { userId: req.userId, practiceId: practice.practiceId, __v: practice.__v },
                { $set: {
                    questions: next.questions, currentIndex: next.currentIndex,
                    correctCount: next.correctCount, accuracy: next.accuracy, status: next.status,
                }, $inc: { __v: 1 } },
                { returnDocument: 'after', runValidators: true },
            ).lean() || await Model.findOne({ userId: req.userId }).lean()
        }
        res.json(practiceResponse(practice))
    })

    router.post('/', async (req, res) => {
        let practice
        try {
            practice = await Model.findOneAndUpdate(
                { userId: req.userId },
                { $setOnInsert: { ...createPractice(), userId: req.userId, __v: 0 } },
                { upsert: true, returnDocument: 'after', runValidators: true },
            ).lean()
        } catch (error) {
            if (error.code !== 11000) throw error
            practice = await Model.findOne({ userId: req.userId }).lean()
        }
        res.json(practiceResponse(practice))
    })

    router.post('/retry', async (req, res) => {
        if (typeof req.body?.practiceId !== 'string') return res.status(400).json({ message: 'Practice ID required.' })
        const practice = await Model.findOneAndUpdate(
            { userId: req.userId, practiceId: req.body.practiceId, status: 'completed' },
            { $set: createPractice(), $inc: { __v: 1 } },
            { returnDocument: 'after', runValidators: true },
        ).lean()
        if (!practice) return res.status(409).json({ message: 'Practice changed. Reload your saved practice.' })
        res.json(practiceResponse(practice))
    })

    router.post('/:practiceId/answers', async (req, res) => {
        const practice = await Model.findOne({ userId: req.userId, practiceId: req.params.practiceId }).lean()
        if (!practice) return res.status(404).json({ message: 'Practice not found. Reload your saved practice.' })
        const next = answerPractice(practice, req.body?.questionIndex, req.body?.answer)
        if (next === practice) return res.json(practiceResponse(practice))
        const updated = await Model.findOneAndUpdate(
            { userId: req.userId, practiceId: practice.practiceId, __v: practice.__v },
            { $set: {
                questions: next.questions, currentIndex: next.currentIndex,
                correctCount: next.correctCount, accuracy: next.accuracy, status: next.status,
            }, $inc: { __v: 1 } },
            { returnDocument: 'after', runValidators: true },
        ).lean()
        if (!updated) return res.status(409).json({ message: 'Practice changed. Reload your saved practice.' })
        res.json(practiceResponse(updated))
    })

    router.use((error, req, res, next) => {
        if (res.headersSent) return next(error)
        if (error.status) return res.status(error.status).json({ message: error.message })
        console.error('Practice request failed:', error.message)
        res.status(500).json({ message: 'Could not save practice. Please try again.' })
    })
    return router
}

module.exports = createPracticeRouter
