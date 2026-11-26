const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const Class = require('../model/Class');
const Practice = require('../model/Practice');
const User = require('../model/User');
const { PASS_ACCURACY } = require('../utils/rank');

const authenticateTeacher = (req, res, next) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return res.sendStatus(401);
  }

  try {
    const payload = jwt.verify(
      header.slice(7).trim(),
      process.env.ACCESS_TOKEN_SECRET,
      { algorithms: ['HS256'] }
    );
    const user = payload?.UserInfo?.username;
    if (typeof user !== 'string' || !user.trim()) {
      return res.sendStatus(401);
    }
    req.teacherUsername = String(user).trim();
    return next();
  } catch {
    return res.sendStatus(401);
  }
};

const fetchStudentStats = async (usernames) => {
  if (usernames.length === 0) return new Map();

  const pipeline = [
    { $match: { username: { $in: usernames }, completedAt: { $ne: null } } },
    {
      $group: {
        _id: '$username',
        attempts: { $sum: 1 },
        passes: { $sum: { $cond: [{ $gte: ['$accuracy', PASS_ACCURACY] }, 1, 0] } },
        averageAccuracy: { $avg: '$accuracy' },
      },
    },
  ];

  const rows = await Practice.aggregate(pipeline);
  return new Map(rows.map((row) => [row._id, row]));
};

const formatStudentRoster = (student, statMap) => {
  const stat = statMap.get(student.username);
  return {
    opid: student.opid,
    username: student.username,
    firstName: student.firstName,
    lastName: student.lastName,
    rank: student.rank ?? 0,
    attempts: stat?.attempts ?? 0,
    passes: stat?.passes ?? 0,
    averageAccuracy: stat?.averageAccuracy ?? null,
  };
};

router.use(authenticateTeacher);

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

    const statMap = await fetchStudentStats(students.map((s) => s.username));
    const studentByOpid = new Map(students.map((s) => [s.opid, s]));

    const result = classes.map((cls) => ({
      classCode: cls.classCode,
      className: cls.className,
      students: cls.students
        .map((id) => studentByOpid.get(id))
        .filter(Boolean)
        .map((student) => formatStudentRoster(student, statMap)),
    }));

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