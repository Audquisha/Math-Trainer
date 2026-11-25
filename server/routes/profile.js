const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../model/User');
const { updateRank } = require('../utils/rank');


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

router.get('/', async (req, res) => {
    await updateRank(req.profileUsername);
    const user = await User.findOne({ username: req.profileUsername }, null, { sanitizeFilter: true });
    if (!user){
        return res.status(404).json({message: "User not found!"});
    }

    res.json({

        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        role: user.role,
        rank: user.rank ?? 0,
    
    });
    
});

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  
  res.status(500).json({ message: 'Unable to load profile. Please try again.' });
});

module.exports = router;