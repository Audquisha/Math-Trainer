process.env.ACCESS_TOKEN_SECRET = 'rate-limit-test-secret';

jest.mock('uuid', () => ({ v4: () => 'test-opid' }));
jest.mock('../model/User');
jest.mock('../model/Class');

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const originalEnvironment = process.env.NODE_ENV;
let app;
let User;
let Class;

const registration = {
  user: 'student', pwd: 'Passw0rd!', firstName: 'Test', lastName: 'Student', role: 'student',
};

beforeEach(() => {
  jest.resetModules();
  process.env.NODE_ENV = 'development';
  User = require('../model/User');
  Class = require('../model/Class');
  User.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  User.create.mockResolvedValue({});
  app = require('../app');
});

afterEach(() => {
  process.env.NODE_ENV = originalEnvironment;
});

async function allowLogin() {
  const user = { username: 'student', password: await bcrypt.hash(registration.pwd, 4), save: jest.fn() };
  User.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });
}

test('successful registrations exhaust their own limit without blocking login', async () => {
  for (let index = 0; index < 10; index++) {
    const response = await request(app).post('/api/auth/register').send({ ...registration, user: `student-${index}` });
    expect(response.status).toBe(201);
  }
  const blocked = await request(app).post('/api/auth/register').send({ ...registration, user: 'student-11' });
  expect(blocked.status).toBe(429);
  expect(blocked.headers['retry-after']).toBeDefined();
  expect(User.create).toHaveBeenCalledTimes(10);

  await allowLogin();
  expect((await request(app).post('/api/auth/login').send(registration)).status).toBe(200);
});

test('unsuccessful registrations also consume the registration limit', async () => {
  for (let index = 0; index < 10; index++) {
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(400);
  }
  expect((await request(app).post('/api/auth/register').send(registration)).status).toBe(429);
  expect(User.create).not.toHaveBeenCalled();
});

test('successful logins do not consume the failed-login budget', async () => {
  await allowLogin();
  for (let index = 0; index < 12; index++) {
    expect((await request(app).post('/api/auth/login').send(registration)).status).toBe(200);
  }
});

test('repeated login failures are still throttled', async () => {
  await allowLogin();
  for (let index = 0; index < 10; index++) {
    expect((await request(app).post('/api/auth/login').send({ ...registration, pwd: 'wrong' })).status).toBe(401);
  }
  expect((await request(app).post('/api/auth/login').send(registration)).status).toBe(429);
});

const classRequest = (path, body) => request(app).post(`/api/classes/${path}`)
  .set('Authorization', `Bearer ${jwt.sign({ UserInfo: { username: 'student' } }, process.env.ACCESS_TOKEN_SECRET)}`)
  .send(body);

test('class-code guessing is throttled without exhausting the login budget', async () => {
  User.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ opid: 's1', role: 'student' }) });
  Class.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }) });
  for (let index = 0; index < 30; index++) {
    expect((await classRequest('join', { classCode: `GUESS${index}` })).status).toBe(404);
  }
  const blocked = await classRequest('join', { classCode: 'MATH1' });
  expect(blocked.status).toBe(429);
  expect(blocked.headers['retry-after']).toBeDefined();
  expect(Class.updateOne).toHaveBeenCalledTimes(30);
  await allowLogin();
  expect((await request(app).post('/api/auth/login').send(registration)).status).toBe(200);
});

test('successful joins do not consume the failed-code budget on a shared IP', async () => {
  User.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ opid: 's1', role: 'student' }) });
  Class.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }) });
  Class.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ students: ['s1'] }) });
  for (let index = 0; index < 31; index++) {
    expect((await classRequest('join', { classCode: `CLASS${index}` })).status).toBe(201);
  }
});

test('successful class creation is bounded', async () => {
  User.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ opid: 't1', role: 'teacher' }) });
  Class.create.mockResolvedValue({});
  for (let index = 0; index < 30; index++) {
    expect((await classRequest('create', { classCode: `CLASS${index}`, className: 'Math' })).status).toBe(201);
  }
  const blocked = await classRequest('create', { classCode: 'EXTRA', className: 'Math' });
  expect(blocked.status).toBe(429);
  expect(blocked.headers['retry-after']).toBeDefined();
  expect(Class.create).toHaveBeenCalledTimes(30);
});

test.each([['get', '/api/classes/roster'], ['post', '/api/classes/removestudent']])(
  'the general API limit also covers %s %s', async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(response.headers['ratelimit-policy']).toBe('1500;w=900');
    expect(response.headers.ratelimit).toContain('limit=1500');
  }
);