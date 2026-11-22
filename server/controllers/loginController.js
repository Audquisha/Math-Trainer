const User = require('../model/User')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const handleLogin = async (req, res) => {
    const { user, pwd } = req.body
    if (typeof user !== 'string' || typeof pwd !== 'string' || !user || !pwd) return res.status(400).json({ 'message': 'Username and password required.' })
    const foundUser = await User.findOne({ username: user }, null, { sanitizeFilter: true }).exec()
    if (!foundUser) return res.sendStatus(401)
    
    const match = await bcrypt.compare(pwd, foundUser.password)
    if (match) {
        const accessToken = jwt.sign(
            { "UserInfo": {
                "username": foundUser.username,
                }
            },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '1h' }
        )
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
        res.json({ accessToken })
    } else {
        res.sendStatus(401)
    }
}

module.exports = { handleLogin }