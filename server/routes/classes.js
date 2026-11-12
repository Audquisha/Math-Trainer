const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const classController = require('../controllers/classController')

router.use((req, res, next) => {
  const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded.UserInfo?.username !== 'string' || !decoded.UserInfo.username) {
      return res.sendStatus(401);
    }
    req.profileUsername = decoded.UserInfo.username;
    next();
  } catch {
    res.sendStatus(401);
  }
});

router.post('/create', classController.handleCreateClass)
router.post('/join', classController.handleJoinClass);

module.exports = router;