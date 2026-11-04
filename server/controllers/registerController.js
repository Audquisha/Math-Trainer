const { v4: uuidv4 } = require('uuid');
const User = require('../model/User')
const bcrypt = require('bcrypt')

const handleNewUser = async (req, res) => {
    const {user, pwd, firstName, lastName, role} = req.body;
    if (!user || !pwd || !firstName || !lastName || !role) return res.status(400).json({'message': 'One of the required fields missing'});

    const duplicate = await User.findOne({username: user}).exec();
    if (duplicate) return res.sendStatus(409);

    try {
        const generatedOpid = uuidv4();
        const hashedPwd = await bcrypt.hash(pwd, 10)
        const result = await User.create({
            "opid": generatedOpid, 
            "username": user, 
            "password": hashedPwd,
            "firstName" : firstName,
            "lastName": lastName,
            "role": role 
        })

        console.log(result)
        res.status(201).json({ 'success': `New user ${user} created`})
    } catch (err) {
        res.status(500).json({ 'message': err.message })
    }
    
}   

module.exports = { handleNewUser }
