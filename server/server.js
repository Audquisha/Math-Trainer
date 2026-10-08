require('dotenv').config({ path: '../.env' });
const app = require('./app');
const connectDB = require('./config/db');
const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`API on ${PORT}`)))
  .catch((err) => { console.error(err); process.exit(1); });