const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const userSchema = new Schema({
    opid: {
        type: String,
        required: [true, 'User opid is required'],
        unique: [true, 'User opid must be unique']
    },
    classCode: {
        type: String,
        required: [true, 'User class code is required'],
        unique: [true, 'User class code must be unique']
    },
    className: {
        type: String,
        required: [true, 'User class name is required'],
    },
    students: {
        type: [String],
        default: []
    }
})

module.exports = mongoose.model('Class', userSchema)