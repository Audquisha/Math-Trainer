const express = require('express');
const jwt = require('jsonwebtoken');
const Practice = require('../model/Practice');
const User = require('../model/User');
const {
  generateQuestions, questionPrompt, currentQuestion, questionDeadline,
  finishQuestion, forfeitPractice, expireQuestion, startQuestion, practiceResponse,
} = require('../utils/practice');
const { PASS_ACCURACY, rankFromPasses, updateRank } = require('../utils/rank');

const router = express.Router();

const latestPractice = (username) => Practice.findOne({ username }).sort({ attemptNumber: -1 });

const completed = (username) => ({ username, completedAt: { $ne: null } });

const userRank = async (username) => (await User.findOne({ username }).select('rank').lean())?.rank ?? 0;

const savePractice = async (practice) => {
  await practice.save();
  if (practice.completedAt) await updateRank(practice.username);
};

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
  const practice = await latestPractice(req.practiceUsername);
  if (practice && expireQuestion(practice, Date.now())) await savePractice(practice);
  res.json(practiceResponse(practice));
});

router.post('/start', async (req, res) => {
  let practice = await latestPractice(req.practiceUsername);
  const now = Date.now();
  if (!practice) {
    practice = new Practice({
      username: req.practiceUsername,
      attemptNumber: 1,
      timeStarted: new Date(now),
      questions: generateQuestions(await userRank(req.practiceUsername)),
    });
    startQuestion(practice, now);
    await practice.save();
  } else {
    const expired = expireQuestion(practice, now);
    const started = startQuestion(practice, now);
    if (expired || started) await savePractice(practice);
  }
  res.json(practiceResponse(practice));
});

router.post('/retry', async (req, res) => {
  if (!Number.isInteger(req.body?.attemptNumber) || req.body.attemptNumber < 1) {
    return res.status(400).json({ message: 'An attempt number is required.' });
  }
  const latest =  await latestPractice(req.practiceUsername);
  if (!latest) return res.status(404).json({ message: 'Start a practice first.' });
  if (latest.attemptNumber !== req.body.attemptNumber) {
    return res.status(409).json({ message: 'This practice has already been retried.' });
  }

  const now = Date.now();
  if (!latest.completedAt) {
    forfeitPractice(latest, now);
    await savePractice(latest);
  }
  const practice = new Practice({
    username: req.practiceUsername,
    attemptNumber: latest.attemptNumber + 1,
    timeStarted: new Date(now),
    questions: generateQuestions(await userRank(req.practiceUsername)),
  });
  startQuestion(practice, now);
  await practice.save();
  res.json(practiceResponse(practice));
});

router.post('/answer', async (req, res) => {
  const { attemptNumber, questionId, selectedAnswer } = req.body ?? {};
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || typeof questionId !== 'string'
      || !(selectedAnswer === null || Number.isFinite(selectedAnswer))) {
    return res.status(400).json({ message: 'An attempt, question, and answer choice are required.' });
  }

  const practice = await latestPractice(req.practiceUsername);
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
  await savePractice(practice);
  res.json(practiceResponse(practice));
});




router.get('/history', async (req, res) => {
  const attempts = await Practice.find(completed(req.practiceUsername))
    .sort({ attemptNumber: -1 }).limit(50).lean();
  let passes = attempts.length ? await Practice.countDocuments({
    ...completed(req.practiceUsername),
    accuracy: { $gte: PASS_ACCURACY },
    attemptNumber: { $lt: attempts.at(-1).attemptNumber },
  }) : 0;
  const ranks = new Map();
  for (const a of attempts.toReversed()) {
    if (a.accuracy >= PASS_ACCURACY) passes++;
    ranks.set(a.attemptNumber, rankFromPasses(passes));
  }
  res.json(attempts.map(a => ({
    attemptNumber: a.attemptNumber,
    rank: ranks.get(a.attemptNumber),
    accuracy: a.accuracy,
    completedAt: a.completedAt,
    results: a.questions.map((question) => {
      const { selectedAnswer, correctAnswer, isCorrect, timedOut, elapsedSeconds } = question;
      return { prompt: questionPrompt(question), selectedAnswer, correctAnswer, isCorrect, timedOut, elapsedSeconds };
    }),
  })));
});

router.get('/stats', async (req, res) => {
  const [stats] = await Practice.aggregate([
    { $match: completed(req.practiceUsername) },
    { $group: {
      _id: null,
      attempts: { $sum: 1 },
      averageAccuracy: { $avg: '$accuracy' },
      bestAccuracy: { $max: '$accuracy' },
      seconds: { $sum: { $sum: '$questions.elapsedSeconds' } },
      timed: { $sum: { $size: { $filter: { input: '$questions', cond: { $isNumber: '$$this.elapsedSeconds' } } } } },
      questions: { $sum: { $size: '$questions' } },
      timeouts: { $sum: { $size: { $filter: { input: '$questions', cond: '$$this.timedOut' } } } },
    } },
  ]);
  res.json({
    attempts: stats?.attempts ?? 0,
    averageAccuracy: stats?.averageAccuracy ?? null,
    bestAccuracy: stats?.bestAccuracy ?? null,
    averageSecondsPerQuestion: stats?.timed ? stats.seconds / stats.timed : null,
    timeoutRate: stats?.questions ? stats.timeouts / stats.questions : null,
  });
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'VersionError' || err.code === 11000) {
    return res.status(409).json({ message: 'The practice changed in another request. Reload it to continue.' });
  }
  res.status(500).json({ message: 'Unable to save or load practice. Please try again.' });
});
module.exports = router;
