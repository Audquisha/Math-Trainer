process.env.ACCESS_TOKEN_SECRET = 'leaderboard-test-secret';

jest.mock('uuid', () => ({ v4: () => 'test-opid' }));
// Jest runs CommonJS; the app shares this ES module with the browser at runtime.
jest.mock('../../client/src/utils/questionTimer.js', () => ({
  getQuestionDuration: jest.fn(() => 10),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Practice = require('../model/Practice');

function token(username = 'student') {
  return jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

function api(username = 'student') {
  return request(app).get('/api/leaderboard').set('Authorization', `Bearer ${token(username)}`);
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('leaderboard API', () => {
  test('requires a valid login', async () => {
    expect((await request(app).get('/api/leaderboard')).status).toBe(401);
    expect((await request(app).get('/api/leaderboard').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });

  test('is empty when nobody has completed a practice', async () => {
    jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([]);
    expect((await api()).body).toEqual([]);
  });

  test('numbers the places, marks the caller, and returns only safe fields', async () => {
    jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([
      { _id: 'ava', attempts: 4, passes: 3, averageAccuracy: 91.5, user: { rank: 1, firstName: 'Ava', password: 'hash', refreshToken: 'token' } },
      { _id: 'student', attempts: 2, passes: 0, averageAccuracy: 50, user: {} },
    ]);
    expect((await api()).body).toEqual([
      { place: 1, username: 'ava', rank: 1, passes: 3, averageAccuracy: 91.5, attempts: 4, isYou: false },
      { place: 2, username: 'student', rank: 0, passes: 0, averageAccuracy: 50, attempts: 2, isYou: true },
    ]);
  });

  test('only ranks completed attempts by students, most passes first', async () => {
    const aggregate = jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([]);
    await api();
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.completedAt).toEqual({ $ne: null });
    expect(pipeline).toContainEqual({ $match: { 'user.role': 'student' } });
    expect(pipeline.find(stage => stage.$sort).$sort.passes).toBe(-1);
  });

  test('reports database failures without returning false success', async () => {
    jest.spyOn(Practice, 'aggregate').mockRejectedValueOnce(new Error('DB unavailable'));
    const failed = await api();
    expect(failed.status).toBe(500);
    expect(failed.body.message).toMatch(/Unable to load leaderboard/);
  });
});