const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth/register', require('./routes/register'));
app.use('/api/auth/login', require('./routes/login'));
app.use('/api/practice', require('./routes/practice')());

app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'down' })
);

module.exports = app;
