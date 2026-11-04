// Unit/integration tests for the auth

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

jest.mock('uuid', () => ({ v4: () => 'test-opid' })); 
jest.mock('../model/User');

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../model/User');


const mockFindOne = (value) => User.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(value) });

const validUser = { user: 'chris', pwd: 'Passw0rd!', firstName: 'Chris', lastName: 'Taylor', role: 'student' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {}); 
});

describe('POST /api/auth/register', () => {
  test('201 – creates a new user with valid input', async () => {
    mockFindOne(null);
    User.create.mockResolvedValue({ username: 'chris' });

    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe('New user chris created');
    expect(User.create).toHaveBeenCalledTimes(1);
  });

  test('passwords are stored as hashes', async () => {
    mockFindOne(null);
    User.create.mockResolvedValue({});

    await request(app).post('/api/auth/register').send(validUser);

    const saved = User.create.mock.calls[0][0];
    expect(saved.password).not.toBe(validUser.pwd);
    expect(await bcrypt.compare(validUser.pwd, saved.password)).toBe(true);
    expect(saved.opid).toBe('test-opid');
  });

  test.each(['user', 'pwd', 'firstName', 'lastName', 'role'])(
    '400 – rejects request missing "%s"',
    async (field) => {
      const body = { ...validUser };
      delete body[field];

      const res = await request(app).post('/api/auth/register').send(body);

      expect(res.status).toBe(400);
      expect(User.create).not.toHaveBeenCalled();
    }
  );

  test('409 – rejects a duplicate username', async () => {
    mockFindOne({ username: 'chris' });

    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(409);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('500 – returns an error if the database write fails', async () => {
    mockFindOne(null);
    User.create.mockRejectedValue(new Error('DB down'));

    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('DB down');
  });
});

describe('POST /api/auth/login', () => {
  test('400 – rejects missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ user: 'chris' });
    expect(res.status).toBe(400);
  });

  test('401 – rejects an unknown username', async () => {
    mockFindOne(null);
    const res = await request(app).post('/api/auth/login').send({ user: 'ghost', pwd: 'x' });
    expect(res.status).toBe(401);
  });

  test('401 – rejects a wrong password', async () => {
    mockFindOne({ username: 'chris', password: await bcrypt.hash('right', 4), save: jest.fn() });
    const res = await request(app).post('/api/auth/login').send({ user: 'chris', pwd: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('200 – returns a valid access token and sets refresh cookie', async () => {
    const save = jest.fn().mockResolvedValue({});
    mockFindOne({ username: 'chris', password: await bcrypt.hash('Passw0rd!', 4), save });

    const res = await request(app).post('/api/auth/login').send({ user: 'chris', pwd: 'Passw0rd!' });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.accessToken, process.env.ACCESS_TOKEN_SECRET);
    expect(decoded.UserInfo.username).toBe('chris');
    expect(res.headers['set-cookie'][0]).toMatch(/^jwt=.*HttpOnly/);
    expect(save).toHaveBeenCalled();
  });
});
