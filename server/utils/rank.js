const Practice = require('../model/Practice');
const User = require('../model/User');

const MAX_RANK = 6;
const PASS_ACCURACY = 100;
const PASSES_PER_RANK = 3;

const rankFromPasses = (passes) => Math.min(MAX_RANK, Math.floor(passes / PASSES_PER_RANK));

async function updateRank(username) {
  const passes = await Practice.countDocuments({
    username,
    completedAt: { $ne: null },
    accuracy: { $gte: PASS_ACCURACY },
  });
  const rank = rankFromPasses(passes);
  await User.updateOne({ username }, { rank });
  return rank;
}

module.exports = { MAX_RANK, PASS_ACCURACY, PASSES_PER_RANK, rankFromPasses, updateRank };
