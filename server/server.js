require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./config/db');
const PORT = process.env.PORT || 5000;
for (const name of ['MONGO_URI', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET']) {
  if (!process.env[name]) {
    console.error(`${name} is missing from .env`);
    process.exit(1);
  }
}
connectDB()
  .then(() => app.listen(PORT, () => console.log(`API on ${PORT}`)))
  .catch((err) => { console.error(err); process.exit(1); });
