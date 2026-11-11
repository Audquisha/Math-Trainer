const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) =>
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'down' })
);

const limiter = (limit, options) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many requests. Please try again later.' },
  ...options,
});

app.use('/api/auth', limiter(10, { skipSuccessfulRequests: true }));
app.use(['/api/practice', '/api/profile'], limiter(1500));

app.use('/api/auth/register', require('./routes/register'));
app.use('/api/auth/login', require('./routes/login'));
app.use('/api/practice', require('./routes/practice'));
app.use('/api/profile', require('./routes/profile'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : 'Invalid request.' });
});
module.exports = app;
