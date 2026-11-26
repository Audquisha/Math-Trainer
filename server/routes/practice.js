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

const sanitizeUsername = (username) => {
  if (typeof username !== 'string' || !username.trim()) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  return String(username).trim();
};

const latestPractice = (username) => {
  const safeUsername = sanitizeUsername(username);
  return Practice.findOne({ username: { $eq: safeUsername } }).sort({ attemptNumber: -1 });
};

const completed = (username) => {
  const safeUsername = sanitizeUsername(username);
  return { username: { $eq: safeUsername }, completedAt: { $ne: null } };
};

const userRank = async (username) => {
  const safeUsername = sanitizeUsername(username);
  const userDoc = await User.findOne({ username: { $eq: safeUsername } })
    .select('rank')
    .lean()
    .exec();
  return userDoc?.rank ?? 0;
};

const savePractice = async (practice) => {
  await practice.save();
  if (practice.completedAt) {
    await updateRank(practice.username);
  }
};

const sendPractice = (req, res, practice) => {
  const now = Date.now();
  return res.json({
    ...practiceResponse(practice, now),
    serverProcessingMs: now - req.practiceRequestStarted,
  });
};

router.use((req, res, next) => {
  req.practiceRequestStarted = Date.now();

  const authHeader = req.get('Authorization');
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.sendStatus(401);
  }

  const token = authHeader.slice(7).trim();
  if (!token || !process.env.ACCESS_TOKEN_SECRET) {
    return res.sendStatus(401);
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
      algorithms: ['HS256'],
    });
    const username = decoded?.UserInfo?.username;
    if (typeof username !== 'string' || !username.trim()) {
      return res.sendStatus(401);
    }
    req.practiceUsername = String(username).trim();
    return next();
  } catch {
    return res.sendStatus(401);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const safeUsername = sanitizeUsername(req.practiceUsername);
    const practice = await latestPractice(safeUsername);

    if (practice && expireQuestion(practice, Date.now())) {
      await savePractice(practice);
    } else if (practice?.completedAt) {
      await updateRank(practice.username);
    }

    return sendPractice(req, res, practice);
  } catch (err) {
    return next(err);
  }
});

router.post('/start', async (req, res, next) => {
  try {
    const safeUsername = sanitizeUsername(req.practiceUsername);
    let practice = await latestPractice(safeUsername);
    const now = Date.now();

    if (!practice) {
      practice = new Practice({
        username: safeUsername,
        attemptNumber: 1,
        timeStarted: new Date(now),
        questions: generateQuestions(await userRank(safeUsername)),
      });
      startQuestion(practice, now);
      await practice.save();
    } else {
      const expired = expireQuestion(practice, now);
      const started = startQuestion(practice, now);
      if (expired || started) {
        await savePractice(practice);
      } else if (practice.completedAt) {
        await updateRank(practice.username);
      }
    }

    return sendPractice(req, res, practice);
  } catch (err) {
    return next(err);
  }
});

router.post('/retry', async (req, res, next) => {
  try {
    const safeUsername = sanitizeUsername(req.practiceUsername);
    const rawAttemptNumber = req.body?.attemptNumber;

    if (!Number.isInteger(rawAttemptNumber) || rawAttemptNumber < 1) {
      return res.status(400).json({ message: 'An attempt number is required.' });
    }
    const safeAttemptNumber = Number(rawAttemptNumber);

    const latest = await latestPractice(safeUsername);
    if (!latest) {
      return res.status(404).json({ message: 'Start a practice first.' });
    }
    if (latest.attemptNumber !== safeAttemptNumber) {
      return res.status(409).json({ message: 'This practice has already been retried.' });
    }

    const now = Date.now();
    if (!latest.completedAt) {
      forfeitPractice(latest, now);
      await savePractice(latest);
    } else {
      await updateRank(safeUsername);
    }

    const practice = new Practice({
      username: safeUsername,
      attemptNumber: latest.attemptNumber + 1,
      timeStarted: new Date(now),
      questions: generateQuestions(await userRank(safeUsername)),
    });
    startQuestion(practice, now);
    await practice.save();

    return sendPractice(req, res, practice);
  } catch (err) {
    return next(err);
  }
});

router.post('/answer', async (req, res, next) => {
  try {
    const safeUsername = sanitizeUsername(req.practiceUsername);
    const rawAttemptNumber = req.body?.attemptNumber;
    const rawQuestionId = req.body?.questionId;
    const rawSelectedAnswer = req.body?.selectedAnswer;

    if (
      !Number.isInteger(rawAttemptNumber) ||
      rawAttemptNumber < 1 ||
      typeof rawQuestionId !== 'string' ||
      !rawQuestionId.trim() ||
      !(rawSelectedAnswer === null || Number.isFinite(rawSelectedAnswer))
    ) {
      return res.status(400).json({ message: 'An attempt, question, and answer choice are required.' });
    }

    const safeAttemptNumber = Number(rawAttemptNumber);
    const safeQuestionId = String(rawQuestionId).trim();
    const safeSelectedAnswer = rawSelectedAnswer === null ? null : Number(rawSelectedAnswer);

    const practice = await latestPractice(safeUsername);
    if (!practice) {
      return res.status(404).json({ message: 'Start a practice first.' });
    }

    const question = currentQuestion(practice);
    if (
      practice.attemptNumber !== safeAttemptNumber ||
      question?._id.toString() !== safeQuestionId ||
      !question?.timeStarted
    ) {
      return res.status(409).json({ message: 'This question is no longer active. Reload the practice.' });
    }

    if (safeSelectedAnswer !== null && !question.choices.includes(safeSelectedAnswer)) {
      return res.status(400).json({ message: 'Select one of the four answer choices.' });
    }

    const now = Date.now();
    if (safeSelectedAnswer === null && now < questionDeadline(question)) {
      return res.status(409).json({
        message: 'The question still has time remaining.',
        retryAfterMs: questionDeadline(question) - now,
      });
    }

    finishQuestion(practice, question, safeSelectedAnswer, now);
    startQuestion(practice, now);
    await savePractice(practice);

    return sendPractice(req, res, practice);
  } catch (err) {
    return next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const safeUsername = sanitizeUsername(req.practiceUsername);
    const baseFilter = completedFilter(safeUsername);

    const attempts = await Practice.find(baseFilter)
      .sort({ attemptNumber: -1 })
      .limit(50)
      .lean()
      .exec();

    let passes = attempts.length
      ? await Practice.countDocuments({
          ...baseFilter,
          accuracy: { $gte: PASS_ACCURACY },
          attemptNumber: { $lt: attempts.at(-1).attemptNumber },
        }).exec()
      : 0;

    const ranks = new Map();
    for (const a of attempts.toReversed()) {
      if (a.accuracy >= PASS_ACCURACY) passes++;
      ranks.set(a.attemptNumber, rankFromPasses(passes));
    }

    return res.json(
      attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        rank: ranks.get(a.attemptNumber),
        accuracy: a.accuracy,
        completedAt: a.completedAt,
        results: a.questions.map((question) => {
          const { selectedAnswer, correctAnswer, isCorrect, timedOut, elapsedSeconds } = question;
          return {
            prompt: questionPrompt(question),
            selectedAnswer,
            correctAnswer,
            isCorrect,
            timedOut,
            elapsedSeconds,
          };
        }),
      }))
    );
  } catch (err) {
    return next(err);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const safeUsername = sanitizeUsername(req.practiceUsername);
    const [stats] = await Practice.aggregate([
      { $match: completedFilter(safeUsername) },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          averageAccuracy: { $avg: '$accuracy' },
          bestAccuracy: { $max: '$accuracy' },
          seconds: { $sum: { $sum: '$questions.elapsedSeconds' } },
          timed: {
            $sum: {
              $size: {
                $filter: { input: '$questions', cond: { $isNumber: '$$this.elapsedSeconds' } },
              },
            },
          },
          questions: { $sum: { $size: '$questions' } },
          timeouts: {
            $sum: {
              $size: { $filter: { input: '$questions', cond: '$$this.timedOut' } },
            },
          },
        },
      },
    ]);

    return res.json({
      attempts: stats?.attempts ?? 0,
      averageAccuracy: stats?.averageAccuracy ?? null,
      bestAccuracy: stats?.bestAccuracy ?? null,
      averageSecondsPerQuestion: stats?.timed ? stats.seconds / stats.timed : null,
      timeoutRate: stats?.questions ? stats.timeouts / stats.questions : null,
    });
  } catch (err) {
    return next(err);
  }
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.status === 401) {
    return res.sendStatus(401);
  }
  if (err.name === 'VersionError' || err.code === 11000 || err.cause?.code === 11000) {
    return res.status(409).json({ message: 'The practice changed in another request. Reload it to continue.' });
  }
  console.error('Practice Router Error:', err);
  return res.status(500).json({ message: 'Unable to save or load practice. Please try again.' });
});

module.exports = router;