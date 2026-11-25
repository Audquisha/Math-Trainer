const express = require('express');
const jwt = require('jsonwebtoken');
const Practice = require('../model/Practice');
const { PASS_ACCURACY } = require('../utils/rank');
const Class = require('../model/Class');
const User = require('../model/User');
const { isValidClassCode } = require('../utils/validation');

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
  const match = { completedAt: { $ne: null } };

  const classCode = req.query.classCode;
  if (classCode !== undefined) {
    if (!isValidClassCode(classCode)) {
      return res.status(400).json({ message: 'A valid class code is required.' });
    }
    const user = await User.findOne({ username: req.leaderboardUsername }, null, { sanitizeFilter: true });
    const cls = await Class.findOne({ classCode }, null, { sanitizeFilter: true });
    if (!user || !cls || (cls.teacherId !== user.opid && !cls.students.includes(user.opid))) {
      return res.status(403).json({ message: 'You are not in that class.' });
    }
    const members = await User.find({ opid: { $in: cls.students } }).select('username').lean();
    match.username = { $in: members.map((member) => member.username) };
  }

  const rows = await Practice.aggregate([
    { $match: match },
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

router.get('/classes', async (req, res) => {
  const user = await User.findOne({ username: req.leaderboardUsername }, null, { sanitizeFilter: true });
  if (!user) {
    return res.status(404).json({ message: 'User not found!' });
  }
  const filter = user.role === 'teacher' ? { teacherId: user.opid } : { students: user.opid };
  const classes = await Class.find(filter).select('classCode className -_id').lean();
  res.json(classes);
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Unable to load leaderboard. Please try again.' });
});

module.exports = router;