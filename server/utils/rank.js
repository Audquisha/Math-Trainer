const Practice = require('../model/Practice');
const User = require('../model/User');

const MAX_RANK = 6;
const PASS_ACCURACY = 100;
const PASSES_PER_RANK = 3;

const rankFromPasses = (passes) => {
  if (!Number.isFinite(passes) || passes < 0) return 0;
  return Math.min(MAX_RANK, Math.floor(passes / PASSES_PER_RANK));
};

async function updateRank(username) {
  if (typeof username !== 'string' || !username.trim()) {
    throw new Error('A valid username is required to update rank.');
  }

  const safeUsername = String(username).trim();

  const passes = await Practice.countDocuments({
    username: { $eq: safeUsername },
    completedAt: { $ne: null },
    accuracy: { $gte: PASS_ACCURACY },
  }).exec();

  const rank = rankFromPasses(passes);

  await User.updateOne(
    { username: { $eq: safeUsername } },
    { $max: { rank } }
  ).exec();

  return rank;
};

module.exports = { MAX_RANK, PASS_ACCURACY, PASSES_PER_RANK, rankFromPasses, updateRank };