process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_SECRET = 'classes-integration-secret';

const assert = require('node:assert/strict');
const { describe, test, before, beforeEach, after, afterEach, mock } = require('node:test');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Class = require('../model/Class');
const User = require('../model/User');
const Practice = require('../model/Practice');

describe('class and query safety with real MongoDB', { skip: !process.env.TEST_MONGO_URI }, () => {
  before(async () => {
    assert.match(process.env.TEST_MONGO_URI, /^mongodb:\/\/127\.0\.0\.1:\d+\//,
      'Integration tests require a disposable MongoDB on 127.0.0.1.');
    await mongoose.connect(process.env.TEST_MONGO_URI, {
      dbName: `math_trainer_classes_${randomUUID().replaceAll('-', '')}`,
      serverSelectionTimeoutMS: 5000,
    });
    await Promise.all([Class.init(), User.init(), Practice.init()]);
  }, { timeout: 30000 });

  beforeEach(async () => {
    await Promise.all([Class.deleteMany({}), User.deleteMany({}), Practice.deleteMany({})]);
    await User.create([
      { username: 'teacher', role: 'teacher', opid: 't1' },
      { username: 'other-teacher', role: 'teacher', opid: 't2' },
      { username: 'student', role: 'student', opid: 's1' },
      { username: 'other-student', role: 'student', opid: 's2' },
    ].map(user => ({ ...user, firstName: 'Test', lastName: 'User', password: 'unused' })));
    await Class.create({ opid: randomUUID(), teacherId: 't1', classCode: 'MATH1', className: 'Math 1', students: [] });
  });

  afterEach(() => {
    mock.restoreAll();
    app.set('query parser', 'simple');
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const token = username => jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
  const api = (method, path, username = 'student', body) => request(app)[method](`/api/${path}`)
    .set('Authorization', `Bearer ${token(username)}`).send(body);
  const join = (username = 'student') => api('post', 'classes/join', username, { classCode: 'MATH1' });

  test('operator payloads cannot create, join, or modify a class', async () => {
    for (const classCode of [{ $ne: null }, { $regex: '.*' }, { $gt: '' }, ['MATH1']]) {
      for (const path of ['create', 'join', 'removestudent']) {
        const response = await api('post', `classes/${path}`, path === 'join' ? 'student' : 'teacher', {
          classCode, className: 'Injected', studentId: 's1',
        });
        assert.equal(response.status, 400, `${path}: ${JSON.stringify(classCode)}`);
      }
    }
    assert.equal(await Class.countDocuments(), 1);
    assert.deepEqual((await Class.findOne({ classCode: 'MATH1' })).students.toObject(), []);
  });

  test('operator-looking strings remain literal class codes', async () => {
    const classCode = '{"$ne":null}';
    assert.equal((await api('post', 'classes/join', 'student', { classCode })).status, 404);
    assert.equal((await api('get', `leaderboard?classCode=${encodeURIComponent(classCode)}`)).status, 403);
    assert.deepEqual((await Class.findOne({ classCode: 'MATH1' })).students.toObject(), []);
  });

  test('concurrent creation returns one success and one JSON conflict', async () => {
    const create = () => api('post', 'classes/create', 'teacher', { classCode: 'NEW', className: 'New class' });
    const responses = await Promise.all([create(), create()]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    const conflict = responses.find(response => response.status === 409);
    assert.match(conflict.headers['content-type'], /application\/json/);
    assert.match(conflict.body.message, /Class code must be unique/);
    assert.equal(await Class.countDocuments({ classCode: 'NEW' }), 1);
  });

  test('simultaneous joins enroll the same student exactly once', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => join()));
    assert.equal(responses.filter(response => response.status === 201).length, 1);
    assert.equal(responses.filter(response => response.status === 409).length, 7);
    const classroom = await Class.findOne({ classCode: 'MATH1' });
    assert.deepEqual(classroom.students.toObject(), ['s1']);
    const roster = await api('get', 'classes/roster', 'teacher');
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.classes[0].students.map(student => student.opid), ['s1']);
  });

  test('simultaneous joins by different students retain both memberships', async () => {
    const responses = await Promise.all([join(), join('other-student')]);
    assert.deepEqual(responses.map(response => response.status), [201, 201]);
    assert.deepEqual((await Class.findOne({ classCode: 'MATH1' })).students.toObject().sort(), ['s1', 's2']);
  });

  test('removing from an older roster cannot erase a concurrent enrollment', { timeout: 10000 }, async () => {
    assert.equal((await join()).status, 201);
    const originalFindOne = Class.collection.findOne.bind(Class.collection);
    let snapshotRead;
    let releaseRemoval;
    const read = new Promise(resolve => { snapshotRead = resolve; });
    const resume = new Promise(resolve => { releaseRemoval = resolve; });
    mock.method(Class.collection, 'findOne', async (...args) => {
      const snapshot = await originalFindOne(...args);
      snapshotRead();
      await resume;
      return snapshot;
    }, { times: 1 });
    const removal = api('post', 'classes/removestudent', 'teacher', { classCode: 'MATH1', studentId: 's1' }).then(response => response);
    await read;
    try {
      assert.equal((await join('other-student')).status, 201);
    } finally {
      releaseRemoval();
    }
    assert.equal((await removal).status, 200);
    assert.deepEqual((await Class.findOne({ classCode: 'MATH1' })).students.toObject(), ['s2']);
  });

  test('removals retain ownership checks and students can only remove themselves', async () => {
    await Promise.all([join(), join('other-student')]);
    const remove = (username, studentId) => api('post', 'classes/removestudent', username, { classCode: 'MATH1', studentId });
    assert.equal((await remove('other-teacher', 's1')).status, 403);
    assert.equal((await remove('teacher', { $ne: null })).status, 400);
    assert.equal((await remove('student', 's2')).status, 200);
    assert.deepEqual((await Class.findOne({ classCode: 'MATH1' })).students.toObject(), ['s2']);
    assert.equal((await remove('teacher', 's2')).status, 200);
    assert.equal((await remove('teacher', 's2')).status, 404);
  });

  test('concurrent removals preserve changes to different students', async () => {
    await Promise.all([join(), join('other-student')]);
    const responses = await Promise.all(['s1', 's2'].map(studentId =>
      api('post', 'classes/removestudent', 'teacher', { classCode: 'MATH1', studentId })));
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual((await Class.findOne({ classCode: 'MATH1' })).students.toObject(), []);
  });

  test('leaderboard rejects nested query operators and JWT username objects', async () => {
    app.set('query parser', 'extended');
    for (const query of ['classCode[$ne]=', 'classCode[$regex]=.*', 'classCode[]=MATH1']) {
      assert.equal((await api('get', `leaderboard?${query}`)).status, 400);
    }
    for (const path of ['leaderboard', 'leaderboard/classes', 'leaderboard?classCode=MATH1']) {
      assert.equal((await api('get', path, { $ne: null })).status, 401);
    }
    assert.equal((await api('get', 'leaderboard/classes', '{"$ne":null}')).status, 404);
  });

  test('sanitized queries preserve valid class leaderboards and class lists', async () => {
    await join();
    for (const username of ['student', 'other-student']) {
      await Practice.create({
        username, attemptNumber: 1, timeStarted: new Date(), completedAt: new Date(), accuracy: 100,
        questions: Array.from({ length: 3 }, (_, index) => ({
          prompt: `${index} + 1 = ?`, choices: [0, 1, 2, 3], correctAnswer: index + 1,
          selectedAnswer: index + 1, isCorrect: true, timeAvailable: 10,
          timeStarted: new Date(), timeSolved: new Date(), elapsedSeconds: 1,
        })),
      });
    }
    for (const username of ['student', 'teacher']) {
      const response = await api('get', 'leaderboard?classCode=MATH1', username);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.map(entry => entry.username), ['student']);
      const classes = await api('get', 'leaderboard/classes', username);
      assert.equal(classes.status, 200);
      assert.deepEqual(classes.body, [{ classCode: 'MATH1', className: 'Math 1' }]);
    }
    assert.equal((await api('get', 'leaderboard?classCode=MATH1', 'other-student')).status, 403);
    assert.deepEqual((await api('get', 'leaderboard/classes', 'other-student')).body, []);
    assert.equal((await api('get', 'leaderboard', 'other-student')).body.length, 2);
    const teacher = await api('get', 'teacher', 'teacher');
    assert.equal(teacher.status, 200);
    assert.equal(teacher.body[0].students[0].passes, 1);
  });
});