const Class = require('../model/Class');
const User = require('../model/User');
const { v4: uuidv4 } = require('uuid');
const { isNonEmptyString, isValidClassCode } = require('../utils/validation');

const getAuthorizedUser = async (req, res, allowedRoles = []) => {
    const rawUsername = req.profileUsername;
    if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
        res.status(401).json({ message: 'Invalid user authentication context.' });
        return null;
    }

    const safeUsername = String(rawUsername).trim();
    const foundUser = await User.findOne({ username: { $eq: safeUsername } }).exec();
    if (!foundUser) {
        res.status(404).json({ message: 'User not found.' });
        return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(foundUser.role)) {
        res.status(403).json({
            message: `Only ${allowedRoles.join(' or ')}s can perform this action.`
        });
        return null;
    }

    return foundUser;
};

const parseClassCode = (rawClassCode, res) => {
    if (typeof rawClassCode !== 'string' || !isValidClassCode(rawClassCode)) {
        res.status(400).json({ message: 'Class code must be a non-empty string of at most 50 characters.' });
        return null;
    }
    return String(rawClassCode).trim();
};

const findClassByCode = async (classCode) => {
    if (typeof classCode !== 'string' || !classCode.trim()) return null;
    const safeCode = String(classCode).trim();
    return Class.findOne({ classCode: { $eq: safeCode } }).exec();
};

const handleCreateClass = async (req, res) => {
    const rawClassName = req.body?.className;
    const safeClassCode = parseClassCode(req.body?.classCode, res);
    if (!safeClassCode) return;

    if (typeof rawClassName !== 'string' || !isNonEmptyString(rawClassName, 100)) {
        return res.status(400).json({ message: 'Class name must be 1-100 characters.' });
    }
    const safeClassName = String(rawClassName).trim();

    try {
        const foundUser = await getAuthorizedUser(req, res, ['teacher']);
        if (!foundUser) return;

        const newClass = await Class.create({
            opid: uuidv4(),
            classCode: safeClassCode,
            className: safeClassName,
            teacherId: foundUser.opid,
            students: []
        });
        return res.status(201).json({ success: `New class ${safeClassCode} created`, class: newClass });
    } catch (err) {
        if (err.code === 11000 || err.cause?.code === 11000) {
            return res.status(409).json({ message: 'Class code must be unique. A class with this code already exists.' });
        }
        return res.status(500).json({ message: 'Unable to create the class. Please try again.' });
    }
};

const handleJoinClass = async (req, res) => {
    const safeClassCode = parseClassCode(req.body?.classCode, res);
    if (!safeClassCode) return;

    try {
        const foundUser = await getAuthorizedUser(req, res, ['student']);
        if (!foundUser) return;

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

        const foundClass = await findClassByCode(safeClassCode);
        return res.status(201).json({ success: `Student enrolled in class ${safeClassCode}`, class: foundClass });
    } catch (err) {
        return res.status(500).json({ message: 'Unable to join the class. Please try again.' });
    }
};

const handleRemoveStudentFromClass = async (req, res) => {
    const rawStudentId = req.body?.studentId;
    const safeClassCode = parseClassCode(req.body?.classCode, res);
    if (!safeClassCode) return;

    try {
        const foundUser = await getAuthorizedUser(req, res, ['teacher', 'student']);
        if (!foundUser) return;

        const foundClass = await findClassByCode(safeClassCode);
        if (!foundClass) {
            return res.status(404).json({ message: 'Class not found.' });
        }

        let targetStudentId = String(foundUser.opid);
        if (foundUser.role === 'teacher') {
            if (foundClass.teacherId !== foundUser.opid) {
                return res.status(403).json({ message: 'You are not authorized to modify this class.' });
            }
            if (typeof rawStudentId !== 'string' || !isNonEmptyString(rawStudentId, 50)) {
                return res.status(400).json({ message: 'A valid student ID (opid) is required when removing a student as a teacher.' });
            }
            targetStudentId = String(rawStudentId).trim();
        }

        const updatedClass = await Class.findOneAndUpdate(
            { _id: foundClass._id, students: { $eq: targetStudentId } },
            { $pull: { students: targetStudentId } },
            { returnDocument: 'after', runValidators: true }
        ).exec();

        if (!updatedClass) {
            return res.status(404).json({ message: 'Student is not enrolled in this class.' });
        }

        return res.status(200).json({
            success: `Student removed from class ${safeClassCode}`,
            class: updatedClass
        });
    } catch (err) {
        return res.status(500).json({ message: 'Unable to remove the student from the class. Please try again.' });
    }
};

const getAllStudentsInClass = async (req, res) => {
    try {
        const foundUser = await getAuthorizedUser(req, res, ['teacher']);
        if (!foundUser) return;

        const teacherClasses = await Class.find({ teacherId: { $eq: foundUser.opid } }).lean().exec();
        if (!teacherClasses || teacherClasses.length === 0) {
            return res.status(200).json({ classes: [] });
        }

        const allStudentOpids = [...new Set(teacherClasses.flatMap((cls) => cls.students))];
        const studentDocs = await User.find({ opid: { $in: allStudentOpids } })
            .select('opid username firstName lastName email -_id')
            .lean()
            .exec();

        const studentMap = new Map(studentDocs.map((student) => [student.opid, student]));
        const classesWithStudents = teacherClasses.map((cls) => ({
            ...cls,
            students: cls.students
                .map((studentOpid) => studentMap.get(studentOpid))
                .filter(Boolean)
        }));

        return res.status(200).json({ classes: classesWithStudents });
    } catch (err) {
        console.error('Get Teacher Classes Error:', err);
        return res.status(500).json({ message: 'Unable to load classes and students. Please try again.' });
    }
};

module.exports = { handleCreateClass, handleJoinClass, handleRemoveStudentFromClass, getAllStudentsInClass };