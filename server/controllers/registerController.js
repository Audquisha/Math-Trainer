const { v4: uuidv4 } = require('uuid');
const User = require('../model/User')
const bcrypt = require('bcrypt')
const ALLOWED_ROLES = ['student', 'teacher']
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/
const validName = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 50


const handleNewUser = async (req, res) => {
    const {user, pwd, firstName, lastName, role} = req.body;
    if (!user || !pwd || !firstName || !lastName || !role) return res.status(400).json({'message': 'One of the required fields missing'});

    if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ 'message': 'Role must be either student or teacher' });
    }
    if (typeof user !== 'string' || !USERNAME_PATTERN.test(user)) {
        return res.status(400).json({ 'message': 'Username must be 3-30 letters, numbers, dots, dashes or underscores' });
    }
    if (typeof pwd !== 'string' || pwd.length < 8 || Buffer.byteLength(pwd) > 72) {
        return res.status(400).json({ 'message': 'Password must be 8-72 characters' });
    }
    if (!validName(firstName) || !validName(lastName)) {
        return res.status(400).json({ 'message': 'Names must be 1-50 characters' });
    }
    const duplicate = await User.findOne({username: user}, null, { sanitizeFilter: true }).exec();
    if (duplicate) return res.sendStatus(409);

    try {
        const generatedOpid = uuidv4();
        const hashedPwd = await bcrypt.hash(pwd, 10)
        await User.create({
            "opid": generatedOpid, 
            "username": user, 
            "password": hashedPwd,
            "firstName" : firstName,
            "lastName": lastName,
            "role": role 
        })

        res.status(201).json({ 'success': `New user ${user} created`})
    } catch (err) {
        if (err.code === 11000) return res.sendStatus(409);
        res.status(500).json({ 'message': 'Unable to create the account. Please try again.' })
    }
    
}   

module.exports = { handleNewUser }
