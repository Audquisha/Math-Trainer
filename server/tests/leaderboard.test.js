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
const Class = require('../model/Class');
const User = require('../model/User');

function token(username = 'student') {
  return jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

function classApi(path = '', username = 'student') {
  return request(app).get(`/api/leaderboard${path}`).set('Authorization', `Bearer ${token(username)}`);
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

describe('class leaderboard', () => {
  test('only ranks the students in the class', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValueOnce({ opid: 's1', role: 'student' });
    jest.spyOn(Class, 'findOne').mockResolvedValueOnce({ teacherId: 't1', students: ['s1', 's2'] });
    jest.spyOn(User, 'find').mockReturnValueOnce({
      select: () => ({ lean: async () => [{ username: 'student' }, { username: 'ben' }] }),
    });
    const aggregate = jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([]);
    expect((await classApi('?classCode=MATH1')).status).toBe(200);
    expect(aggregate.mock.calls[0][0][0].$match.username).toEqual({ $in: ['student', 'ben'] });
  });

  test('lets the class teacher view it', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValueOnce({ opid: 't1', role: 'teacher' });
    jest.spyOn(Class, 'findOne').mockResolvedValueOnce({ teacherId: 't1', students: [] });
    jest.spyOn(User, 'find').mockReturnValueOnce({ select: () => ({ lean: async () => [] }) });
    jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([]);
    expect((await classApi('?classCode=MATH1', 'teacher')).status).toBe(200);
  });

  test('rejects people who are not in the class and unknown classes', async () => {
    const aggregate = jest.spyOn(Practice, 'aggregate');
    jest.spyOn(User, 'findOne').mockResolvedValue({ opid: 's9', role: 'student' });
    jest.spyOn(Class, 'findOne').mockResolvedValueOnce({ teacherId: 't1', students: ['s1'] });
    expect((await classApi('?classCode=MATH1')).status).toBe(403);
    Class.findOne.mockResolvedValueOnce(null);
    expect((await classApi('?classCode=NOPE')).status).toBe(403);
    expect(aggregate).not.toHaveBeenCalled();
  });

  test('rejects a class code that is not a single string', async () => {
    expect((await classApi('?classCode=a&classCode=b')).status).toBe(400);
  });

  test('lists the classes a student is in and the classes a teacher owns', async () => {
    const find = jest.spyOn(Class, 'find').mockReturnValue({
      select: () => ({ lean: async () => [{ classCode: 'MATH1', className: 'Math 1' }] }),
    });
    jest.spyOn(User, 'findOne')
      .mockResolvedValueOnce({ opid: 's1', role: 'student' })
      .mockResolvedValueOnce({ opid: 't1', role: 'teacher' });
    expect((await classApi('/classes')).body).toEqual([{ classCode: 'MATH1', className: 'Math 1' }]);
    expect(find).toHaveBeenLastCalledWith({ students: 's1' });
    await classApi('/classes', 'teacher');
    expect(find).toHaveBeenLastCalledWith({ teacherId: 't1' });
  });
});