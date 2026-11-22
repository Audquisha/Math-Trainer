const express = require('express');
const jwt = require('jsonwebtoken');
const Practice = require('../model/Practice');
const { PASS_ACCURACY } = require('../utils/rank');

const router = express.Router();

const LEADERBOARD_SIZE = 50;

router.use((req, res, next) => {
  const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded.UserInfo?.username !== 'string' || !decoded.UserInfo.username) {
      return res.sendStatus(401);
    }
    req.leaderboardUsername = decoded.UserInfo.username;
    next();
  } catch {
    res.sendStatus(401);
  }
});

router.get('/', async (req, res) => {
  const rows = await Practice.aggregate([
    { $match: { completedAt: { $ne: null } } },
    { $group: {
      _id: '$username',
      attempts: { $sum: 1 },
      passes: { $sum: { $cond: [{ $gte: ['$accuracy', PASS_ACCURACY] }, 1, 0] } },
      averageAccuracy: { $avg: '$accuracy' },
    } },
    { $lookup: { from: 'users', localField: '_id', foreignField: 'username', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.role': 'student' } },
    { $sort: { passes: -1, averageAccuracy: -1, attempts: -1, _id: 1 } },
    { $limit: LEADERBOARD_SIZE },
  ]);
  res.json(rows.map((row, i) => ({
    place: i + 1,
    username: row._id,
    rank: row.user.rank ?? 0,
    passes: row.passes,
    averageAccuracy: row.averageAccuracy,
    attempts: row.attempts,
    isYou: row._id === req.leaderboardUsername,
  })));
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Unable to load leaderboard. Please try again.' });
});

module.exports = router;