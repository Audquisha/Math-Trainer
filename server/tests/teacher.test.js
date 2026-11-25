process.env.ACCESS_TOKEN_SECRET = 'teacher-test-secret';

jest.mock('uuid', () => ({ v4: () => 'test-opid' }));
jest.mock('../../client/src/utils/questionTimer.js', () => ({
  getQuestionDuration: jest.fn(() => 10),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Class = require('../model/Class');
const Practice = require('../model/Practice');
const User = require('../model/User');

function token(username = 'teacher') {
  return jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

function api(username = 'teacher') {
  return request(app).get('/api/teacher').set('Authorization', `Bearer ${token(username)}`);
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('teacher API', () => {
  test('requires a valid login', async () => {
    expect((await request(app).get('/api/teacher')).status).toBe(401);
    expect((await request(app).get('/api/teacher').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });

  test('rejects students', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValueOnce({ role: 'student', opid: 's1' });
    expect((await api('student')).status).toBe(403);
  });

  test('returns each class with its students and their stats', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValueOnce({ role: 'teacher', opid: 't1' });
    jest.spyOn(Class, 'find').mockReturnValueOnce({
      lean: async () => [{ classCode: 'MATH1', className: 'Math 1', students: ['s1', 's2'] }],
    });
    jest.spyOn(User, 'find').mockReturnValueOnce({
      select: () => ({
        lean: async () => [
          { opid: 's1', username: 'ava', firstName: 'Ava', lastName: 'Lee', rank: 1 },
          { opid: 's2', username: 'ben', firstName: 'Ben', lastName: 'Ray' },
        ],
      }),
    });
    jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([{ _id: 'ava', attempts: 2, passes: 1, averageAccuracy: 83.5 }]);

    expect((await api()).body).toEqual([{
      classCode: 'MATH1',
      className: 'Math 1',
      students: [
        { opid: 's1', username: 'ava', firstName: 'Ava', lastName: 'Lee', rank: 1, attempts: 2, passes: 1, averageAccuracy: 83.5 },
        { opid: 's2', username: 'ben', firstName: 'Ben', lastName: 'Ray', rank: 0, attempts: 0, passes: 0, averageAccuracy: null },
      ],
    }]);
  });

  test('reports database failures without returning false success', async () => {
    jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('DB unavailable'));
    const failed = await api();
    expect(failed.status).toBe(500);
    expect(failed.body.message).toMatch(/Unable to load classes/);
  });
});