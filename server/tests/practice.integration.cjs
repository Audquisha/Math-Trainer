process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_SECRET = 'integration-test-secret';

const assert = require('node:assert/strict');
const { describe, test, before, beforeEach, after, afterEach, mock } = require('node:test');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../model/User');
const Practice = require('../model/Practice');
const { updateRank } = require('../utils/rank');

describe('real MongoDB regression tests', { skip: !process.env.TEST_MONGO_URI }, () => {
  before(async () => {
    assert.match(process.env.TEST_MONGO_URI, /^mongodb:\/\/127\.0\.0\.1:\d+\//,
      'Integration tests require a disposable MongoDB on 127.0.0.1.');
    await mongoose.connect(process.env.TEST_MONGO_URI, {
      dbName: `math_trainer_test_${randomUUID().replaceAll('-', '')}`,
      serverSelectionTimeoutMS: 5000,
    });
    await Promise.all([User.init(), Practice.init()]);
  }, { timeout: 30000 });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Practice.deleteMany({})]);
    await User.create({ opid: randomUUID(), username: 'student', firstName: 'Test', lastName: 'Student', password: 'unused', role: 'student' });
  });

  afterEach(() => mock.restoreAll());
  after(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const token = username => jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
  const api = (method, path = '', body) => request(app)[method](`/api/practice${path}`)
    .set('Authorization', `Bearer ${token('student')}`).send(body);

  async function answer(practice) {
    const stored = await Practice.findOne({ username: 'student', attemptNumber: practice.attemptNumber });
    return {
      attemptNumber: practice.attemptNumber,
      questionId: practice.question.id,
      selectedAnswer: stored.questions.id(practice.question.id).correctAnswer,
    };
  }

  async function complete(practice) {
    for (let i = 0; i < 3; i++) {
      const response = await api('post', '/answer', await answer(practice));
      assert.equal(response.status, 200);
      practice = response.body;
    }
    return practice;
  }

  test('registers and logs in with a real password hash and isolates profile data', async () => {
    const user = { user: 'new-student', pwd: 'Passw0rd!', firstName: 'New', lastName: 'Student', role: 'student' };
    assert.equal((await request(app).post('/api/auth/register').send(user)).status, 201);
    assert.equal((await request(app).post('/api/auth/register').send(user)).status, 409);
    const login = await request(app).post('/api/auth/login').send(user);
    assert.equal(login.status, 200);
    const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${login.body.accessToken}`);
    assert.deepEqual(profile.body, { firstName: 'New', lastName: 'Student', username: 'new-student', role: 'student', rank: 0 });
    const history = await request(app).get('/api/practice/history').set('Authorization', `Bearer ${login.body.accessToken}`);
    assert.deepEqual(history.body, []);
  });

  test('keeps untimed question content hidden until it is started', async () => {
    const started = (await api('post', '/start')).body;
    await Practice.updateOne({ username: 'student' }, { $set: { 'questions.0.timeStarted': new Date(Date.now() - 11000) } });
    const waiting = (await api('get')).body;
    assert.equal(waiting.question.number, 2);
    assert.equal(waiting.question.expiresAt, null);
    assert.equal(Object.hasOwn(waiting.question, 'prompt'), false);
    assert.equal(Object.hasOwn(waiting.question, 'choices'), false);
    assert.equal((await api('post', '/answer', await answer(waiting))).status, 409);
    const resumed = (await api('post', '/start')).body;
    assert.equal(resumed.attemptNumber, started.attemptNumber);
    assert.equal(typeof resumed.question.prompt, 'string');
    assert.equal(resumed.question.choices.length, 4);
    assert.ok(resumed.question.expiresAt > Date.now());
    assert.equal(Object.hasOwn(resumed.question, 'correctAnswer'), false);
  });

  for (const recovery of ['reload', 'start', 'retry', 'profile']) {
    test(`recovers a failed rank write through ${recovery} using persisted completions`, async () => {
      let practice = (await api('post', '/start')).body;
      for (let i = 0; i < 2; i++) {
        practice = await complete(practice);
        practice = (await api('post', '/retry', { attemptNumber: practice.attemptNumber })).body;
      }
      for (let i = 0; i < 2; i++) practice = (await api('post', '/answer', await answer(practice))).body;
      mock.method(User, 'updateOne', async () => { throw new Error('Simulated rank write failure'); }, { times: 1 });
      assert.equal((await api('post', '/answer', await answer(practice))).status, 500);
      assert.equal(await Practice.countDocuments({ username: 'student', completedAt: { $ne: null }, accuracy: 100 }), 3);
      assert.equal((await User.findOne({ username: 'student' })).rank, 0);

      const response = recovery === 'profile'
        ? await request(app).get('/api/profile').set('Authorization', `Bearer ${token('student')}`)
        : await api(recovery === 'reload' ? 'get' : 'post', recovery === 'reload' ? '' : `/${recovery}`, { attemptNumber: 3 });
      assert.equal(response.status, 200);
      assert.equal((await User.findOne({ username: 'student' })).rank, 1);
      assert.equal(await Practice.countDocuments({ completedAt: { $ne: null } }), 3);
      const history = (await api('get', '/history')).body;
      assert.deepEqual(history.map(attempt => attempt.rank), [1, 0, 0]);
      const stats = (await api('get', '/stats')).body;
      assert.equal(stats.attempts, 3);
      assert.equal(stats.averageAccuracy, 100);
      assert.equal(stats.bestAccuracy, 100);
      assert.equal(stats.timeoutRate, 0);
    });
  }

  test('concurrent answers and retries persist only one result and one new attempt', async () => {
    let practice = (await api('post', '/start')).body;
    for (let i = 0; i < 2; i++) practice = (await api('post', '/answer', await answer(practice))).body;
    const finalAnswer = await answer(practice);
    const answered = await Promise.all([api('post', '/answer', finalAnswer), api('post', '/answer', finalAnswer)]);
    assert.deepEqual(answered.map(response => response.status).sort(), [200, 409]);
    assert.equal(await Practice.countDocuments({ completedAt: { $ne: null }, accuracy: 100 }), 1);
    const retries = await Promise.all([api('post', '/retry', { attemptNumber: 1 }), api('post', '/retry', { attemptNumber: 1 })]);
    assert.deepEqual(retries.map(response => response.status).sort(), [200, 409]);
    assert.equal(await Practice.countDocuments({ username: 'student' }), 2);
  });

  test('a stale rank write cannot undo a newer promotion in MongoDB', async () => {
    const passes = [3, 6];
    mock.method(Practice, 'countDocuments', async () => passes.shift());
    const originalUpdate = User.updateOne.bind(User);
    let releaseOlder;
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const pending = new Promise(resolve => { releaseOlder = resolve; });
    mock.method(User, 'updateOne', async (...args) => {
      signalStarted();
      await pending;
      return originalUpdate(...args);
    }, { times: 1 });
    const older = updateRank('student');
    await started;
    await updateRank('student');
    releaseOlder();
    await older;
    assert.equal((await User.findOne({ username: 'student' })).rank, 2);
  });
});