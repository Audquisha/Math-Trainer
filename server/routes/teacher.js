const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const Class = require('../model/Class');
const Practice = require('../model/Practice');
const User = require('../model/User');
const { PASS_ACCURACY } = require('../utils/rank');

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
    req.teacherUsername = String(username).trim();
    return next();
  } catch {
    return res.sendStatus(401);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rawUsername = req.teacherUsername;
    if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
      return res.sendStatus(401);
    }
    const safeUsername = String(rawUsername).trim();

    const teacher = await User.findOne({ username: { $eq: safeUsername } }).exec();
    if (!teacher) {
      return res.status(404).json({ message: 'User not found!' });
    }
    if (teacher.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can view class stats!' });
    }

    const classes = await Class.find({ teacherId: { $eq: teacher.opid } }).lean().exec();
    const opids = [...new Set(classes.flatMap((cls) => cls.students))];

    const students = await User.find({ opid: { $in: opids } })
      .select('opid username firstName lastName rank')
      .lean()
      .exec();

    const stats = await Practice.aggregate([
      {
        $match: {
          username: { $in: students.map((student) => student.username) },
          completedAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$username',
          attempts: { $sum: 1 },
          passes: { $sum: { $cond: [{ $gte: ['$accuracy', PASS_ACCURACY] }, 1, 0] } },
          averageAccuracy: { $avg: '$accuracy' },
        },
      },
    ]);

    const statMap = new Map(stats.map((s) => [s._id, s]));

    const result = classes.map((cls) => {
      const classStudents = students.filter((student) => cls.students.includes(student.opid));
      return {
        classCode: cls.classCode,
        className: cls.className,
        students: classStudents.map((student) => {
          const stat = statMap.get(student.username);
          return {
            opid: student.opid,
            username: student.username,
            firstName: student.firstName,
            lastName: student.lastName,
            rank: student.rank ?? 0,
            attempts: stat ? stat.attempts : 0,
            passes: stat ? stat.passes : 0,
            averageAccuracy: stat ? stat.averageAccuracy : null,
          };
        }),
      };
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Teacher Router Error:', err);
  return res.status(500).json({ message: 'Unable to load classes. Please try again.' });
});

module.exports = router;