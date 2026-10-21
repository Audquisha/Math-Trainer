const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const userSchema = new Schema({
    opid: {
        type: String,
        required: [true, 'User opid is required'],
        unique: [true, 'User opid must be unique']
    },
    role: {
        type: String,
        required: [true, 'User roles is required'],
    },
    firstName: {
        type: String,
        required: [true, 'First name required']
    },
    lastName: {
        type: String,
        required: [true, 'Last name required']
    },
    username: {
        type: String,
        required: [true, 'Username required'],
        unique: [true, 'Username must be unique']
    }
})

module.exports = mongoose.model('User', userSchema)