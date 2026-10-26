const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')

module.exports = function requireAuth(req, res, next) {
    const authorization = req.headers.authorization || ''
    if (!authorization.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Please log in to practice.' })
    }
    try {
        const payload = jwt.verify(authorization.slice(7), process.env.ACCESS_TOKEN_SECRET, { algorithms: ['HS256'] })
        if (typeof payload.sub !== 'string' || !mongoose.isObjectIdOrHexString(payload.sub)) {
            return res.status(401).json({ message: 'Please log in again.' })
        }
        req.userId = payload.sub
        next()
    } catch {
        return res.status(401).json({ message: 'Your session expired. Please log in again.' })
    }
}
