const { v4: uuidv4 } = require('uuid');
const User = require('../model/User')
const bcrypt = require('bcrypt')

const ALLOWED_ROLES = ['student', 'teacher']
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/


const handleNewUser = async (req, res) => {
    const rawUser = req.body?.user;
    const rawPwd = req.body?.pwd;
    const rawFirstName = req.body?.firstName;
    const rawLastName = req.body?.lastName;
    const rawRole = req.body?.role;

    if (!rawUser || !rawPwd || !rawFirstName || !rawLastName || !rawRole) {
        return res.status(400).json({ message: 'One of the required fields missing' });
    }

    if (typeof rawRole !== 'string' || !ALLOWED_ROLES.includes(rawRole)) {
        return res.status(400).json({ message: 'Role must be either student or teacher' });
    }
    if (typeof rawUser !== 'string' || !USERNAME_PATTERN.test(rawUser)) {
        return res.status(400).json({ message: 'Username must be 3-30 letters, numbers, dots, dashes or underscores' });
    }
    if (typeof rawPwd !== 'string' || rawPwd.length < 8 || Buffer.byteLength(rawPwd) > 72) {
        return res.status(400).json({ message: 'Password must be 8-72 characters' });
    }
    if (
        typeof rawFirstName !== 'string' ||
        typeof rawLastName !== 'string' ||
        rawFirstName.trim().length === 0 ||
        rawFirstName.trim().length > 50 ||
        rawLastName.trim().length === 0 ||
        rawLastName.trim().length > 50
    ) {
        return res.status(400).json({ message: 'Names must be 1-50 characters' });
    }

    const safeUser = String(rawUser).trim();
    const safePwd = String(rawPwd);
    const safeFirstName = String(rawFirstName).trim();
    const safeLastName = String(rawLastName).trim();
    const safeRole = String(rawRole);

    try {
        const duplicate = await User.findOne({ username: { $eq: safeUser } }).exec();
        if (duplicate) {
            return res.sendStatus(409);
        }

        const generatedOpid = uuidv4();
        const hashedPwd = await bcrypt.hash(safePwd, 10);

        await User.create({
            opid: generatedOpid,
            username: safeUser,
            password: hashedPwd,
            firstName: safeFirstName,
            lastName: safeLastName,
            role: safeRole
        });

        return res.status(201).json({ success: `New user ${safeUser} created` });
    } catch (err) {
        if (err.code === 11000 || err.cause?.code === 11000) {
            return res.sendStatus(409);
        }
        console.error('Registration Error:', err);
        return res.status(500).json({ message: 'Unable to create the account. Please try again.' });
    }
};

module.exports = { handleNewUser }
