process.env.ACCESS_TOKEN_SECRET = 'classes-test-secret';

jest.mock('uuid', () => ({ v4: () => 'class-opid' }));
jest.mock('../model/User');
jest.mock('../model/Class');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../model/User');
const Class = require('../model/Class');

const teacher = { username: 'teacher', opid: 't1', role: 'teacher' };
const student = { username: 'student', opid: 's1', role: 'student' };
const classroom = { _id: 'class-id', classCode: 'MATH1', className: 'Math 1', teacherId: 't1', students: ['s1'] };
const queryResult = (value) => ({ exec: jest.fn().mockResolvedValue(value) });
const token = (username) => jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET);
const api = (path, body, username = 'teacher') => request(app).post(`/api/classes/${path}`)
  .set('Authorization', `Bearer ${token(username)}`).send(body);

beforeEach(() => {
  jest.resetAllMocks();
  User.findOne.mockImplementation(({ username }) => queryResult(username === 'teacher' ? teacher : student));
  Class.findOne.mockReturnValue(queryResult(classroom));
});

describe('class input and authorization', () => {
  test.each(['create', 'join', 'removestudent'])('%s requires authentication', async (path) => {
    expect((await request(app).post(`/api/classes/${path}`).send({ classCode: 'MATH1' })).status).toBe(401);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test.each([
    undefined, null, '', '   ', 123, ['MATH1'], { $ne: null }, { $regex: '.*' }, 'x'.repeat(51),
  ])('rejects invalid class code %p before accessing the database', async (classCode) => {
    for (const path of ['create', 'join', 'removestudent']) {
      const response = await api(path, { classCode, className: 'Math 1', studentId: 's1' });
      expect(response.status).toBe(400);
    }
    expect(User.findOne).not.toHaveBeenCalled();
    expect(Class.findOne).not.toHaveBeenCalled();
    expect(Class.updateOne).not.toHaveBeenCalled();
    expect(Class.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Class.create).not.toHaveBeenCalled();
  });

  test.each(['create', 'join', 'removestudent'])('%s handles a missing body as bad input', async (path) => {
    expect((await api(path)).status).toBe(400);
  });

  test.each([null, ' ', {}, ['Math'], 10, 'x'.repeat(101)])('rejects invalid class name %p', async (className) => {
    expect((await api('create', { classCode: 'MATH1', className })).status).toBe(400);
    expect(Class.create).not.toHaveBeenCalled();
  });

  test('students cannot create classes and teachers cannot enroll themselves', async () => {
    expect((await api('create', { classCode: 'MATH1', className: 'Math 1' }, 'student')).status).toBe(403);
    expect((await api('join', { classCode: 'MATH1' })).status).toBe(403);
    expect(Class.create).not.toHaveBeenCalled();
    expect(Class.updateOne).not.toHaveBeenCalled();
  });

  test('a missing user cannot create or join a class', async () => {
    User.findOne.mockReturnValue(queryResult(null));
    expect((await api('create', { classCode: 'MATH1', className: 'Math 1' })).status).toBe(404);
    expect((await api('join', { classCode: 'MATH1' }, 'student')).status).toBe(404);
    expect(Class.create).not.toHaveBeenCalled();
    expect(Class.updateOne).not.toHaveBeenCalled();
  });
});

describe('class creation and enrollment', () => {
  test('creates a class with the authenticated teacher as its owner', async () => {
    Class.create.mockResolvedValue(classroom);
    const response = await api('create', { classCode: 'MATH1', className: 'Math 1', teacherId: 'attacker' });
    expect(response.status).toBe(201);
    expect(Class.create).toHaveBeenCalledWith({
      opid: 'class-opid', classCode: 'MATH1', className: 'Math 1', teacherId: 't1', students: [],
    });
  });

  test.each([false, true])('duplicate class codes return JSON even when wrapped by Mongoose (%s)', async (wrapped) => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    Class.create.mockRejectedValue(wrapped ? new Error('Class code must be unique', { cause: duplicate }) : duplicate);
    const response = await api('create', { classCode: 'MATH1', className: 'Math 1' });
    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.message).toBe('Class code must be unique. A class with this code already exists.');
  });

  test('a new enrollment returns the class and uses only the authenticated student', async () => {
    Class.updateOne.mockReturnValue(queryResult({ matchedCount: 1, modifiedCount: 1 }));
    const response = await api('join', { classCode: 'MATH1', studentId: 'other-student' }, 'student');
    expect(response.status).toBe(201);
    expect(response.body.class.students).toEqual(['s1']);
    expect(Class.updateOne).toHaveBeenCalledWith(
      { classCode: 'MATH1' }, { $addToSet: { students: 's1' } },
      { runValidators: true, sanitizeFilter: true }
    );
  });

  test.each([
    [{ matchedCount: 0, modifiedCount: 0 }, 404],
    [{ matchedCount: 1, modifiedCount: 0 }, 409],
  ])('reports missing or already joined classes (%j)', async (result, status) => {
    Class.updateOne.mockReturnValue(queryResult(result));
    expect((await api('join', { classCode: 'MATH1' }, 'student')).status).toBe(status);
    expect(Class.findOne).not.toHaveBeenCalled();
  });

  test('database failures do not report a successful enrollment', async () => {
    Class.updateOne.mockReturnValue({ exec: jest.fn().mockRejectedValue(new Error('DB unavailable')) });
    const response = await api('join', { classCode: 'MATH1' }, 'student');
    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/Unable to join/);
  });
});

describe('class removal', () => {
  test('a different teacher cannot remove a student', async () => {
    Class.findOne.mockReturnValue(queryResult({ ...classroom, teacherId: 'other-teacher' }));
    expect((await api('removestudent', { classCode: 'MATH1', studentId: 's1' })).status).toBe(403);
    expect(Class.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([undefined, null, '', ' ', ['s1'], { $ne: null }, 'x'.repeat(51)])(
    'teachers must provide a valid scalar student ID (%p)', async (studentId) => {
      expect((await api('removestudent', { classCode: 'MATH1', studentId })).status).toBe(400);
      expect(Class.findOneAndUpdate).not.toHaveBeenCalled();
    }
  );

  test('students can only remove themselves even if they supply another ID', async () => {
    Class.findOneAndUpdate.mockReturnValue(queryResult({ ...classroom, students: [] }));
    expect((await api('removestudent', { classCode: 'MATH1', studentId: 's2' }, 'student')).status).toBe(200);
    expect(Class.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'class-id', students: 's1' }, { $pull: { students: 's1' } },
      { returnDocument: 'after', runValidators: true, sanitizeFilter: true }
    );
  });

  test('an owning teacher can remove a student and receives the updated roster', async () => {
    Class.findOneAndUpdate.mockReturnValue(queryResult({ ...classroom, students: [] }));
    const response = await api('removestudent', { classCode: 'MATH1', studentId: 's1' });
    expect(response.status).toBe(200);
    expect(response.body.class.students).toEqual([]);
  });

  test('a student already removed by another request returns 404', async () => {
    Class.findOneAndUpdate.mockReturnValue(queryResult(null));
    expect((await api('removestudent', { classCode: 'MATH1', studentId: 's1' })).status).toBe(404);
  });
});