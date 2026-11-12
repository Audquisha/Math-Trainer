const Class = require('../model/Class');
const User = require('../model/User');
const { v4: uuidv4 } = require('uuid');

const handleCreateClass = async (req, res) => {
    const { classCode, className } = req.body;
    const username = req.profileUsername;

    if (!classCode || !className) {
        return res.status(400).json({ message: 'Class code and class name are required.' });
    }

    try {
        const foundUser = await User.findOne({ username: username }).exec();
        if (!foundUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (foundUser.role !== 'teacher') {
            return res.status(403).json({ message: 'Only teachers can create classes.' });
        }

        const generatedOpid = uuidv4();
        const newClass = await Class.create({
            opid: generatedOpid,
            classCode: classCode,
            className: className,
            teacherId: foundUser.opid,
            students: []
        });
        res.status(201).json({ 'success': `New class ${classCode} created`, 'class': newClass });
    } catch (err) {
        if (err.code === 11000) return res.sendStatus(409).json({ 'message': 'Class code must be unique. A class with this code already exists.' });
        res.status(500).json({ 'message': 'Unable to create the class. Please try again.' });
    }
};

const handleJoinClass = async (req, res) => {
    const { classCode } = req.body;
    const username = req.profileUsername;

    if (!classCode ) {
        return res.status(400).json({ message: 'Class code is required.' });
    }

    try {
        const foundUser = await User.findOne({ username: username }).exec();
        if (!foundUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (foundUser.role !== 'student') {
            return res.status(403).json({ message: 'Only students can join classes.' });
        }

        const foundClass = await Class.findOne({ classCode: classCode }).exec();
        if (!foundClass) {
            return res.status(404).json({ message: 'Class not found.' });
        }

        if (foundClass.students.includes(foundUser.opid)) {
            return res.status(409).json({ message: 'Student is already enrolled in this class.' });
        }

        foundClass.students.push(foundUser.opid);
        const result = await foundClass.save();

        res.status(201).json({ 'success': `Student enrolled in class ${classCode}`, 'class': foundClass });
    } catch (err) {
        res.status(500).json({ 'message': 'Unable to join the class. Please try again.' });
    }
};

module.exports = { handleCreateClass, handleJoinClass };    