const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  factor1: { type: Number, required: true, min: 0, max: 12 },
  factor2: { type: Number, required: true, min: 0, max: 12 },
  choices: {
    type: [Number],
    required: true,
    validate: choices => choices.length === 4 && new Set(choices).size === 4,
  },
  correctAnswer: { type: Number, required: true },
  selectedAnswer: { type: Number, default: null },
  isCorrect: { type: Boolean, default: null },
  timedOut: { type: Boolean, default: false },
  timeStarted: { type: Date, default: null },
  timeAvailable: { type: Number, required: true }, // Seconds, at difficulty 1.
  timeSolved: { type: Date, default: null }, // Resolution time, including timeouts.
  elapsedSeconds: { type: Number, default: null },
});

const practiceSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  attemptNumber: { type: Number, required: true, min: 1 },
  accuracy: { type: Number, default: 0, min: 0, max: 100 },
  timeStarted: { type: Date, required: true },
  completedAt: { type: Date, default: null },
  questions: {
    type: [questionSchema],
    validate: questions => questions.length === 3,
  },
}, { optimisticConcurrency: true });

module.exports = mongoose.model('Practice', practiceSchema);
