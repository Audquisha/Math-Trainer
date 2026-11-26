const express = require('express');
const jwt = require('jsonwebtoken');
const Practice = require('../model/Practice');
const { PASS_ACCURACY } = require('../utils/rank');
const Class = require('../model/Class');
const User = require('../model/User');
const { isValidClassCode } = require('../utils/validation');

const router = express.Router();
const LEADERBOARD_SIZE = 50;

const authenticateLeaderboard = (req, res, next) => {
  const authValue = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authValue !== 'string' || !authValue.startsWith('Bearer ')) {
    return res.sendStatus(401);
  }

  const jwtSecret = process.env.ACCESS_TOKEN_SECRET;
  const bearerToken = authValue.slice(7).trim();
  if (!bearerToken || !jwtSecret) {
    return res.sendStatus(401);
  }

  try {
    const claims = jwt.verify(bearerToken, jwtSecret, { algorithms: ['HS256'] });
    const subject = claims?.UserInfo?.username;
    if (typeof subject !== 'string' || !subject.trim()) {
      return res.sendStatus(401);
    }
    req.leaderboardUsername = String(subject).trim();
    return next();
  } catch {
    return res.sendStatus(401);
  }
};

const resolveAuthenticatedUser = async (req, res) => {
  const rawUsername = req.leaderboardUsername;
  if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
    res.sendStatus(401);
    return null;
  }

  const safeUsername = String(rawUsername).trim();
  const user = await User.findOne({ username: { $eq: safeUsername } }).exec();
  if (!user) {
    res.status(404).json({ message: 'User not found!' });
    return null;
  }

  return { user, safeUsername };
};

const getClassMemberFilter = async (rawClassCode, user, res) => {
  if (typeof rawClassCode !== 'string' || !isValidClassCode(rawClassCode)) {
    res.status(400).json({ message: 'A valid class code is required.' });
    return null;
  }

  const safeClassCode = String(rawClassCode).trim();
  const cls = await Class.findOne({ classCode: { $eq: safeClassCode } }).exec();
  if (!cls || (cls.teacherId !== user.opid && !cls.students.includes(user.opid))) {
    res.status(403).json({ message: 'You are not in that class.' });
    return null;
  }

  const members = await User.find({ opid: { $in: cls.students } })
    .select('username')
    .lean()
    .exec();

  return { $in: members.map((member) => member.username) };
};

const buildLeaderboardPipeline = (matchStage) => [
  { $match: matchStage },
  {
    $group: {
      _id: '$username',
      totalAttempts: { $sum: 1 },
      totalPasses: { $sum: { $cond: [{ $gte: ['$accuracy', PASS_ACCURACY] }, 1, 0] } },
      avgScore: { $avg: '$accuracy' },
    },
  },
  { $lookup: { from: 'users', localField: '_id', foreignField: 'username', as: 'user' } },
  { $unwind: '$user' },
  { $match: { 'user.role': 'student' } },
  { $sort: { totalPasses: -1, avgScore: -1, totalAttempts: -1, _id: 1 } },
  { $limit: LEADERBOARD_SIZE },
];

router.use(authenticateLeaderboard);

router.get('/', async (req, res, next) => {
  try {
    const authContext = await resolveAuthenticatedUser(req, res);
    if (!authContext) return;

    const matchStage = { completedAt: { $ne: null } };
    const rawClassCode = req.query?.classCode;

    if (rawClassCode !== undefined) {
      const usernameFilter = await getClassMemberFilter(rawClassCode, authContext.user, res);
      if (!usernameFilter) return;
      matchStage.username = usernameFilter;
    }

    const rows = await Practice.aggregate(buildLeaderboardPipeline(matchStage));

    return res.json(
      rows.map((row, index) => ({
        place: index + 1,
        username: row._id,
        rank: row.user.rank ?? 0,
        passes: row.totalPasses,
        averageAccuracy: row.avgScore,
        attempts: row.totalAttempts,
        isYou: row._id === authContext.safeUsername,
      }))
    );
  } catch (err) {
    return next(err);
  }
});

router.get('/classes', async (req, res, next) => {
  try {
    const authContext = await resolveAuthenticatedUser(req, res);
    if (!authContext) return;

    const { user } = authContext;
    const classFilter =
      user.role === 'teacher'
        ? { teacherId: { $eq: user.opid } }
        : { students: { $eq: user.opid } };

    const classes = await Class.find(classFilter).select('classCode className -_id').lean().exec();
    return res.json(classes);
  } catch (err) {
    return next(err);
  }
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Leaderboard Router Error:', err);
  return res.status(500).json({ message: 'Unable to load leaderboard. Please try again.' });
});

module.exports = router;