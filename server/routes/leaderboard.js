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
    req.leaderboardUsername = String(username).trim();
    return next();
  } catch {
    return res.sendStatus(401);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rawUsername = req.leaderboardUsername;
    if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
      return res.sendStatus(401);
    }
    const safeUsername = String(rawUsername).trim();

    const match = { completedAt: { $ne: null } };

    const rawClassCode = req.query?.classCode;
    if (rawClassCode !== undefined) {
      if (typeof rawClassCode !== 'string' || !isValidClassCode(rawClassCode)) {
        return res.status(400).json({ message: 'A valid class code is required.' });
      }
      const safeClassCode = String(rawClassCode).trim();

      const user = await User.findOne({ username: { $eq: safeUsername } }).exec();
      const cls = await Class.findOne({ classCode: { $eq: safeClassCode } }).exec();

      if (!user || !cls || (cls.teacherId !== user.opid && !cls.students.includes(user.opid))) {
        return res.status(403).json({ message: 'You are not in that class.' });
      }

      const members = await User.find({ opid: { $in: cls.students } })
        .select('username')
        .lean()
        .exec();
      match.username = { $in: members.map((member) => member.username) };
    }

    const rows = await Practice.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$username',
          attempts: { $sum: 1 },
          passes: { $sum: { $cond: [{ $gte: ['$accuracy', PASS_ACCURACY] }, 1, 0] } },
          averageAccuracy: { $avg: '$accuracy' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: 'username', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.role': 'student' } },
      { $sort: { passes: -1, averageAccuracy: -1, attempts: -1, _id: 1 } },
      { $limit: LEADERBOARD_SIZE },
    ]);

    return res.json(
      rows.map((row, i) => ({
        place: i + 1,
        username: row._id,
        rank: row.user.rank ?? 0,
        passes: row.passes,
        averageAccuracy: row.averageAccuracy,
        attempts: row.attempts,
        isYou: row._id === safeUsername,
      }))
    );
  } catch (err) {
    return next(err);
  }
});

router.get('/classes', async (req, res, next) => {
  try {
    const rawUsername = req.leaderboardUsername;
    if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
      return res.sendStatus(401);
    }
    const safeUsername = String(rawUsername).trim();

    const user = await User.findOne({ username: { $eq: safeUsername } }).exec();
    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    const filter =
      user.role === 'teacher'
        ? { teacherId: { $eq: user.opid } }
        : { students: { $eq: user.opid } };

    const classes = await Class.find(filter).select('classCode className -_id').lean().exec();
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