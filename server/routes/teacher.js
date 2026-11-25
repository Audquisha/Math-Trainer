const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const Class = require('../model/Class');
const Practice = require('../model/Practice');
const User = require('../model/User');
const { PASS_ACCURACY } = require('../utils/rank');


router.use((req, res, next) => {
  const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded.UserInfo?.username !== 'string' || !decoded.UserInfo.username) {
      return res.sendStatus(401);
    }
    req.teacherUsername = decoded.UserInfo.username;
    next();
  } catch {
    res.sendStatus(401);
  }
});

router.get('/', async (req, res) => {
    const teacher = await User.findOne({ username: req.teacherUsername });
    if (!teacher){
        return res.status(404).json({message: "User not found!"});
    }
    if (teacher.role !== 'teacher'){
        return res.status(403).json({message: "Only teachers can view class stats!"});
    }

    const classes = await Class.find({ teacherId: teacher.opid }).lean();
    const opids = classes.flatMap((cls) => cls.students);
    const students = await User.find({ opid: { $in: opids } })
        .select('opid username firstName lastName rank').lean();

    const stats = await Practice.aggregate([
        { $match: { username: { $in: students.map((student) => student.username) }, completedAt: { $ne: null } } },
        { $group: {
            _id: '$username',
            attempts: { $sum: 1 },
            passes: { $sum: { $cond: [{ $gte: ['$accuracy', PASS_ACCURACY] }, 1, 0] } },
            averageAccuracy: { $avg: '$accuracy' },
        } },
    ]);

    const result = classes.map((cls) => {
        const classStudents = students.filter((student) => cls.students.includes(student.opid));
        return {
            classCode: cls.classCode,
            className: cls.className,
            students: classStudents.map((student) => {
                const stat = stats.find((s) => s._id === student.username);
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

    res.json(result);
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  res.status(500).json({ message: 'Unable to load classes. Please try again.' });
});

module.exports = router;