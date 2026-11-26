const User = require('../model/User')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

const handleLogin = async (req, res) => {
    const rawUser = req.body?.user;
    const rawPwd = req.body?.pwd;

    if (
        typeof rawUser !== 'string' ||
        typeof rawPwd !== 'string' ||
        !rawUser.trim() ||
        !rawPwd
    ) {
        return res.status(400).json({ message: 'Username and password required.' });
    }

    const safeUser = String(rawUser).trim();
    const safePwd = String(rawPwd);

    if (!process.env.ACCESS_TOKEN_SECRET) {
        console.error('Missing ACCESS_TOKEN_SECRET environment variable.');
        return res.status(500).json({ message: 'Internal server configuration error.' });
    }

    try {
        const foundUser = await User.findOne({ username: { $eq: safeUser } }).exec();

        const passwordHash = foundUser ? foundUser.password : DUMMY_HASH;
        const match = await bcrypt.compare(safePwd, passwordHash);

        if (!foundUser || !match) {
            return res.sendStatus(401);
        }

        const accessToken = jwt.sign(
            {
                UserInfo: {
                    username: foundUser.username
                }
            },
            process.env.ACCESS_TOKEN_SECRET,
            {
                algorithm: 'HS256',
                expiresIn: '1h'
            }
        );

        res.clearCookie('jwt', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        return res.status(200).json({ accessToken });
    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ message: 'Unable to process login. Please try again.' });
    }
};

module.exports = { handleLogin }