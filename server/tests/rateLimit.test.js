process.env.ACCESS_TOKEN_SECRET = 'rate-limit-test-secret';

jest.mock('uuid', () => ({ v4: () => 'test-opid' }));
jest.mock('../model/User');

const request = require('supertest');
const bcrypt = require('bcrypt');
const originalEnvironment = process.env.NODE_ENV;
let app;
let User;

const registration = {
  user: 'student', pwd: 'Passw0rd!', firstName: 'Test', lastName: 'Student', role: 'student',
};

beforeEach(() => {
  jest.resetModules();
  process.env.NODE_ENV = 'development';
  User = require('../model/User');
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