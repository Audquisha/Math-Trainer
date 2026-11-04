const express = require('express');
const jwt = require('jsonwebtoken');
const Practice = require('../model/Practice');
const {
  generateQuestions, currentQuestion, questionDeadline,
  finishQuestion, expireQuestion, startQuestion, practiceResponse,
} = require('../utils/practice');

const router = express.Router();

router.use((req, res, next) => {
  const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded.UserInfo?.username !== 'string' || !decoded.UserInfo.username) {
      return res.sendStatus(401);
    }
    req.practiceUsername = decoded.UserInfo.username;
    next();
  } catch {
    res.sendStatus(401);
  }
});

router.get('/', async (req, res) => {
  const practice = await Practice.findOne({ username: req.practiceUsername });
  if (practice && expireQuestion(practice, Date.now())) await practice.save();
  res.json(practiceResponse(practice));
});

router.post('/start', async (req, res) => {
  let practice = await Practice.findOne({ username: req.practiceUsername });
  const now = Date.now();
  if (!practice) {
    practice = new Practice({
      username: req.practiceUsername,
      attemptNumber: 1,
      timeStarted: new Date(now),
      questions: generateQuestions(),
    });
    startQuestion(practice, now);
    await practice.save();
  } else {
    const expired = expireQuestion(practice, now);
    const started = startQuestion(practice, now);
    if (expired || started) await practice.save();
  }
  res.json(practiceResponse(practice));
});

router.post('/retry', async (req, res) => {
  if (!Number.isInteger(req.body?.attemptNumber) || req.body.attemptNumber < 1) {
    return res.status(400).json({ message: 'An attempt number is required.' });
  }
  const practice = await Practice.findOne({ username: req.practiceUsername });
  if (!practice) return res.status(404).json({ message: 'Start a practice first.' });
  if (practice.attemptNumber !== req.body.attemptNumber) {
    return res.status(409).json({ message: 'This practice has already been retried.' });
  }

  const now = Date.now();
  practice.attemptNumber += 1;
  practice.accuracy = 0;
  practice.timeStarted = new Date(now);
  practice.completedAt = null;
  practice.questions = generateQuestions();
  startQuestion(practice, now);
  await practice.save();
  res.json(practiceResponse(practice));
});

router.post('/answer', async (req, res) => {
  const { attemptNumber, questionId, selectedAnswer } = req.body ?? {};
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || typeof questionId !== 'string'
      || !(selectedAnswer === null || Number.isInteger(selectedAnswer))) {
    return res.status(400).json({ message: 'An attempt, question, and answer choice are required.' });
  }

  const practice = await Practice.findOne({ username: req.practiceUsername });
  if (!practice) return res.status(404).json({ message: 'Start a practice first.' });
  const question = currentQuestion(practice);
  if (practice.attemptNumber !== attemptNumber || question?._id.toString() !== questionId || !question?.timeStarted) {
    return res.status(409).json({ message: 'This question is no longer active. Reload the practice.' });
  }
  if (selectedAnswer !== null && !question.choices.includes(selectedAnswer)) {
    return res.status(400).json({ message: 'Select one of the four answer choices.' });
  }

  const now = Date.now();
  if (selectedAnswer === null && now < questionDeadline(question)) {
    return res.status(409).json({ message: 'The question still has time remaining.' });
  }
  finishQuestion(practice, question, selectedAnswer, now);
  startQuestion(practice, now);
  await practice.save();
  res.json(practiceResponse(practice));
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'VersionError' || err.code === 11000) {
    return res.status(409).json({ message: 'The practice changed in another request. Reload it to continue.' });
  }
  res.status(500).json({ message: 'Unable to save or load practice. Please try again.' });
});

module.exports = router;
