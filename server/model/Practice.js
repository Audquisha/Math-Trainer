const mongoose = require('mongoose')

const questionSchema = new mongoose.Schema({
    a: { type: Number, required: true, min: 0, max: 12 },
    b: { type: Number, required: true, min: 0, max: 12 },
    choices: { type: [Number], required: true },
    correctAnswer: { type: Number, required: true },
    chosenAnswer: { type: Number, default: null },
    isCorrect: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'active', 'answered', 'expired'], required: true },
    startedAt: Date,
    expiresAt: Date,
    answeredAt: Date,
}, { _id: false })

const practiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    practiceId: { type: String, required: true },
    questions: { type: [questionSchema], required: true },
    currentIndex: { type: Number, required: true },
    correctCount: { type: Number, required: true },
    accuracy: { type: Number, required: true },
    status: { type: String, enum: ['active', 'completed'], required: true },
}, { timestamps: true })

module.exports = mongoose.model('Practice', practiceSchema)
