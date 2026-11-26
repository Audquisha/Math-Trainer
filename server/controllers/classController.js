const Class = require('../model/Class');
const User = require('../model/User');
const { v4: uuidv4 } = require('uuid');
const { isNonEmptyString, isValidClassCode } = require('../utils/validation');

const handleCreateClass = async (req, res) => {
    const rawClassCode = req.body?.classCode;
    const rawClassName = req.body?.className;
    const username = req.profileUsername;

    if (typeof username !== 'string' || !username.trim()) {
        return res.status(401).json({ message: 'Invalid user authentication context.' });
    }

    if (
        typeof rawClassCode !== 'string' ||
        typeof rawClassName !== 'string' ||
        !isValidClassCode(rawClassCode) ||
        !isNonEmptyString(rawClassName, 100)
    ) {
        return res.status(400).json({ message: 'Class code must be 1-50 characters and class name must be 1-100 characters.' });
    }

    const safeClassCode = String(rawClassCode).trim();
    const safeClassName = String(rawClassName).trim();
    const safeUsername = String(username).trim();

    try {
        const foundUser = await User.findOne({ username: { $eq: safeUsername } }).exec();
        if (!foundUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (foundUser.role !== 'teacher') {
            return res.status(403).json({ message: 'Only teachers can create classes.' });
        }

        const generatedOpid = uuidv4();
        const newClass = await Class.create({
            opid: generatedOpid,
            classCode: safeClassCode,
            className: safeClassName,
            teacherId: foundUser.opid,
            students: []
        });
        res.status(201).json({ success: `New class ${safeClassCode} created`, class: newClass });
    } catch (err) {
        if (err.code === 11000 || err.cause?.code === 11000) {
            return res.status(409).json({ message: 'Class code must be unique. A class with this code already exists.' });
        }
        res.status(500).json({ message: 'Unable to create the class. Please try again.' });
    }
};

const handleJoinClass = async (req, res) => {
    const rawClassCode = req.body?.classCode;
    const username = req.profileUsername;

    if (typeof username !== 'string' || !username.trim()) {
        return res.status(401).json({ message: 'Invalid user authentication context.' });
    }

    if (typeof rawClassCode !== 'string' || !isValidClassCode(rawClassCode)) {
        return res.status(400).json({ message: 'Class code must be a non-empty string of at most 50 characters.' });
    }

    const safeClassCode = String(rawClassCode).trim();
    const safeUsername = String(username).trim();

    try {
        const foundUser = await User.findOne({ username: { $eq: safeUsername } }).exec();
        if (!foundUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (foundUser.role !== 'student') {
            return res.status(403).json({ message: 'Only students can join classes.' });
        }

        const enrollment = await Class.updateOne(
            { classCode: { $eq: safeClassCode } },
            { $addToSet: { students: foundUser.opid } },
            { runValidators: true }
        ).exec();

        if (!enrollment.matchedCount) {
            return res.status(404).json({ message: 'Class not found.' });
        }

        if (!enrollment.modifiedCount) {
            return res.status(409).json({ message: 'Student is already enrolled in this class.' });
        }

        const foundClass = await Class.findOne({ classCode: { $eq: safeClassCode } }).exec();

        res.status(201).json({ success: `Student enrolled in class ${safeClassCode}`, class: foundClass });
    } catch (err) {
        res.status(500).json({ message: 'Unable to join the class. Please try again.' });
    }
};

const handleRemoveStudentFromClass = async (req, res) => {
    const rawClassCode = req.body?.classCode;
    const rawStudentId = req.body?.studentId;
    const username = req.profileUsername;

    if (typeof username !== 'string' || !username.trim()) {
        return res.status(401).json({ message: 'Invalid user authentication context.' });
    }

    if (typeof rawClassCode !== 'string' || !isValidClassCode(rawClassCode)) {
        return res.status(400).json({ message: 'Class code must be a non-empty string of at most 50 characters.' });
    }

    const safeClassCode = String(rawClassCode).trim();
    const safeUsername = String(username).trim();

    try {
        const foundUser = await User.findOne({ username: { $eq: safeUsername } }).exec();
        if (!foundUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const foundClass = await Class.findOne({ classCode: { $eq: safeClassCode } }).exec();
        if (!foundClass) {
            return res.status(404).json({ message: 'Class not found.' });
        }

        let targetStudentId;

        if (foundUser.role === 'teacher') {
            if (foundClass.teacherId !== foundUser.opid) {
                return res.status(403).json({ message: 'You are not authorized to modify this class.' });
            }
            if (typeof rawStudentId !== 'string' || !isNonEmptyString(rawStudentId, 50)) {
                return res.status(400).json({ message: 'A valid student ID (opid) is required when removing a student as a teacher.' });
            }
            targetStudentId = String(rawStudentId).trim();
        } else if (foundUser.role === 'student') {
            targetStudentId = String(foundUser.opid);
        } else {
            return res.status(403).json({ message: 'Unauthorized role.' });
        }

        const updatedClass = await Class.findOneAndUpdate(
            { _id: foundClass._id, students: { $eq: targetStudentId } },
            { $pull: { students: targetStudentId } },
            { returnDocument: 'after', runValidators: true }
        ).exec();

        if (!updatedClass) {
            return res.status(404).json({ message: 'Student is not enrolled in this class.' });
        }

        res.status(200).json({
            success: `Student removed from class ${safeClassCode}`,
            class: updatedClass
        });
    } catch (err) {
        res.status(500).json({ message: 'Unable to remove the student from the class. Please try again.' });
    }
};

const getAllStudentsInClass = async (req, res) => {
    const username = req.profileUsername;

    if (typeof username !== 'string' || !username.trim()) {
        return res.status(401).json({ message: 'Invalid user authentication context.' });
    }

    const safeUsername = String(username).trim();

    try {
        const foundUser = await User.findOne({ username: { $eq: safeUsername } }).exec();
        if (!foundUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (foundUser.role !== 'teacher') {
            return res.status(403).json({ message: 'Only teachers can view class rosters.' });
        }

        const teacherClasses = await Class.find({ teacherId: { $eq: foundUser.opid } }).lean().exec();

        if (!teacherClasses || teacherClasses.length === 0) {
            return res.status(200).json({ classes: [] });
        }

        const allStudentOpids = [
            ...new Set(teacherClasses.flatMap((cls) => cls.students))
        ];

        const studentDocs = await User.find({ opid: { $in: allStudentOpids } })
            .select('opid username firstName lastName email -_id')
            .lean()
            .exec();

        const studentMap = new Map(
            studentDocs.map((student) => [student.opid, student])
        );

        const classesWithStudents = teacherClasses.map((cls) => ({
            ...cls,
            students: cls.students
                .map((studentOpid) => studentMap.get(studentOpid))
                .filter(Boolean)
        }));

        res.status(200).json({ classes: classesWithStudents });
    } catch (err) {
        console.error('Get Teacher Classes Error:', err);
        res.status(500).json({ message: 'Unable to load classes and students. Please try again.' });
    }
};

module.exports = { handleCreateClass, handleJoinClass, handleRemoveStudentFromClass, getAllStudentsInClass };