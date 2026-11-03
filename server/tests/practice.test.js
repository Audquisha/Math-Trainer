process.env.ACCESS_TOKEN_SECRET = 'practice-test-secret';

jest.mock('uuid', () => ({ v4: () => 'test-opid' }));
// Jest runs CommonJS; the app shares this ES module with the browser at runtime.
jest.mock('../../client/src/utils/questionTimer.js', () => ({
  getQuestionDuration: jest.fn(() => 10),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../app');
const Practice = require('../model/Practice');
const { createQuestion, generateQuestions } = require('../utils/practice');
const { getQuestionDuration } = require('../../client/src/utils/questionTimer.js');

let now;
let records;
let save;

function token(username = 'student') {
  return jwt.sign({ UserInfo: { username } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

function api(method, path = '', body, username = 'student') {
  return request(app)[method](`/api/practice${path}`)
    .set('Authorization', `Bearer ${token(username)}`).send(body);
}

function answerBody(practice, selectedAnswer) {
  return {
    attemptNumber: practice.attemptNumber,
    questionId: practice.question.id,
    selectedAnswer,
  };
}

beforeEach(() => {
  now = Date.parse('2026-10-28T12:00:00Z');
  records = new Map();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(Practice, 'findOne').mockImplementation(async ({ username }) => {
    const record = records.get(username);
    return record ? Practice.hydrate(record) : null;
  });
  save = jest.spyOn(Practice.prototype, 'save').mockImplementation(async function () {
    await this.validate();
    records.set(this.username, this.toObject());
    return this;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('question generation', () => {
  test('every 0..12 factor pair has four unique, valid neighboring products, including zero and boundary cases', () => {
    for (let first = 0; first <= 12; first++) {
      for (let second = 0; second <= 12; second++) {
        const question = createQuestion(first, second, 10);
        const products = new Set();
        for (let a = Math.max(0, first - 2); a <= Math.min(12, first + 2); a++) {
          for (let b = Math.max(0, second - 2); b <= Math.min(12, second + 2); b++) {
            products.add(a * b);
          }
        }
        expect(question.correctAnswer).toBe(first * second);
        expect(question.choices).toHaveLength(4);
        expect(new Set(question.choices).size).toBe(4);
        expect(question.choices.filter(choice => choice === first * second)).toHaveLength(1);
        expect(question.choices.every(choice => products.has(choice))).toBe(true);
      }
    }
  });

  test('draws three distinct questions and varies the position of the correct answer', () => {
    let seed = 12345;
    jest.spyOn(Math, 'random').mockImplementation(() => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const correctPositions = new Set();
    const factorPairs = new Set();
    for (let attempt = 0; attempt < 50; attempt++) {
      const questions = generateQuestions();
      expect(questions).toHaveLength(3);
      expect(new Set(questions.map(q => `${q.factor1},${q.factor2}`)).size).toBe(3);
      for (const question of questions) {
        expect(question.timeAvailable).toBe(10);
        correctPositions.add(question.choices.indexOf(question.correctAnswer));
        factorPairs.add(`${question.factor1},${question.factor2}`);
      }
    }
    expect(getQuestionDuration).toHaveBeenCalledWith(1);
    expect(correctPositions.size).toBe(4);
    expect(factorPairs.size).toBeGreaterThan(3);
  });
});

describe('practice API', () => {
  test('requires a valid login for every operation', async () => {
    for (const [method, path] of [['get', ''], ['post', '/start'], ['post', '/retry'], ['post', '/answer']]) {
      const result = await request(app)[method](`/api/practice${path}`).send({});
      expect(result.status).toBe(401);
    }
    const expiredToken = jwt.sign({ UserInfo: { username: 'student' } }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -1 });
    expect((await request(app).get('/api/practice').set('Authorization', `Bearer ${expiredToken}`)).status).toBe(401);
    expect((await request(app).get('/api/practice').set('Authorization', 'Bearer invalid')).status).toBe(401);
    expect(Practice.findOne).not.toHaveBeenCalled();
  });

  test('an unattempted practice has no score and creates no record', async () => {
    const result = await api('get');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ attemptNumber: 0, accuracy: null, question: null, answeredCount: 0 });
    expect(save).not.toHaveBeenCalled();
  });

  test('starts three stored questions, withholds answers, and resumes without resetting the timer', async () => {
    const first = await api('post', '/start');
    const saved = records.get('student');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ attemptNumber: 1, accuracy: 0, completed: false, results: [] });
    expect(saved.questions).toHaveLength(3);
    expect(saved.timeStarted.getTime()).toBe(now);
    expect(saved.questions[0]).toMatchObject({ selectedAnswer: null, isCorrect: null, timeSolved: null, timeAvailable: 10 });
    expect(saved.questions[0].timeStarted.getTime()).toBe(now);
    expect(saved.questions[1].timeStarted).toBeNull();
    expect(first.body.question).not.toHaveProperty('correctAnswer');
    expect(first.body).not.toHaveProperty('questions');
    now += 4000;
    const resumed = await api('post', '/start');
    expect(resumed.body.question.id).toBe(first.body.question.id);
    expect(resumed.body.question.expiresAt).toBe(first.body.question.expiresAt);
    expect(resumed.body.serverNow).toBe(now);
    expect(save).toHaveBeenCalledTimes(1);
    expect((await api('get')).body.question.expiresAt).toBe(first.body.question.expiresAt);
  });

  test('saves selected answers, correctness and timing, and computes final accuracy', async () => {
    let practice = (await api('post', '/start')).body;
    const answers = [];
    for (let index = 0; index < 3; index++) {
      const question = records.get('student').questions[index];
      const selectedAnswer = index === 1 ? question.choices.find(choice => choice !== question.correctAnswer) : question.correctAnswer;
      answers.push(selectedAnswer);
      now += 1500;
      const result = await api('post', '/answer', answerBody(practice, selectedAnswer));
      expect(result.status).toBe(200);
      practice = result.body;
    }
    expect(practice).toMatchObject({ accuracy: 66.67, completed: true, answeredCount: 3, question: null });
    expect(practice.results.map(q => q.isCorrect)).toEqual([true, false, true]);
    const saved = records.get('student');
    expect(saved.completedAt.getTime()).toBe(now);
    for (let index = 0; index < 3; index++) {
      expect(saved.questions[index]).toMatchObject({ selectedAnswer: answers[index], isCorrect: index !== 1, elapsedSeconds: 1.5, timedOut: false });
      expect(saved.questions[index].timeSolved.getTime() - saved.questions[index].timeStarted.getTime()).toBe(1500);
    }
    expect((await api('get')).body).toEqual(practice);
    expect((await api('post', '/start')).body).toEqual(practice);
  });

  test('accepts zero as an answer', async () => {
    const first = (await api('post', '/start')).body;
    const question = records.get('student').questions[0];
    Object.assign(question, { factor1: 0, factor2: 0, correctAnswer: 0, choices: [0, 1, 2, 4] });
    const result = await api('post', '/answer', answerBody(first, 0));
    expect(result.status).toBe(200);
    expect(records.get('student').questions[0]).toMatchObject({ selectedAnswer: 0, isCorrect: true });
  });

  test.each([10000, 15000])('late correct answers at %i ms count as timeouts', async (elapsed) => {
    const practice = (await api('post', '/start')).body;
    const answer = records.get('student').questions[0].correctAnswer;
    now += elapsed;
    const result = await api('post', '/answer', answerBody(practice, answer));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ answeredCount: 1, accuracy: 0 });
    expect(records.get('student').questions[0]).toMatchObject({ selectedAnswer: null, isCorrect: false, timedOut: true, elapsedSeconds: 10 });
    expect(records.get('student').questions[0].timeSolved.getTime()).toBe(practice.question.expiresAt);
  });

  test('rejects early timeout submissions and records all three actual timeouts', async () => {
    let practice = (await api('post', '/start')).body;
    expect((await api('post', '/answer', answerBody(practice, null))).status).toBe(409);
    expect(records.get('student').questions[0].timeSolved).toBeNull();
    for (let index = 0; index < 3; index++) {
      now += 10000;
      const result = await api('post', '/answer', answerBody(practice, null));
      expect(result.status).toBe(200);
      practice = result.body;
    }
    expect(practice).toMatchObject({ completed: true, accuracy: 0, answeredCount: 3 });
    expect(records.get('student').questions.every(q => q.timedOut && !q.isCorrect)).toBe(true);
  });

  test('loading after expiry saves a timeout without starting unseen questions', async () => {
    const practice = (await api('post', '/start')).body;
    now += 60000;
    const loaded = await api('get');
    expect(loaded.body).toMatchObject({ answeredCount: 1, question: { number: 2, expiresAt: null } });
    expect(records.get('student').questions[0].timeSolved.getTime()).toBe(practice.question.expiresAt);
    expect(records.get('student').questions[1].timeStarted).toBeNull();
    now += 5000;
    expect((await api('get')).body.answeredCount).toBe(1);
    const resumed = await api('post', '/start');
    expect(resumed.body.question.expiresAt).toBe(now + 10000);
    expect(records.get('student').attemptNumber).toBe(1);
  });

  test('retry replaces all attempt data, increments its number, and rejects old or repeated submissions', async () => {
    let practice = (await api('post', '/start')).body;
    const oldRequest = answerBody(practice, records.get('student').questions[0].correctAnswer);
    for (let index = 0; index < 3; index++) {
      now += 1000;
      practice = (await api('post', '/answer', answerBody(practice, records.get('student').questions[index].correctAnswer))).body;
    }
    const old = records.get('student');
    expect(old.accuracy).toBe(100);
    now += 1000;
    const retry = await api('post', '/retry', { attemptNumber: 1 });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ attemptNumber: 2, accuracy: 0, answeredCount: 0, completed: false, results: [] });
    const saved = records.get('student');
    expect(saved._id).toEqual(old._id);
    expect(saved.timeStarted.getTime()).toBe(now);
    expect(saved.completedAt).toBeNull();
    expect(saved.questions.map(q => q._id)).not.toEqual(old.questions.map(q => q._id));
    for (const question of saved.questions) {
      expect(question).toMatchObject({ selectedAnswer: null, isCorrect: null, timedOut: false, timeSolved: null, elapsedSeconds: null });
    }
    expect(saved.questions[0].timeStarted.getTime()).toBe(now);
    expect(saved.questions.slice(1).every(q => q.timeStarted === null)).toBe(true);
    expect((await api('post', '/answer', oldRequest)).status).toBe(409);
    expect((await api('post', '/retry', { attemptNumber: 1 })).status).toBe(409);
    expect(records.size).toBe(1);
    expect(records.get('student')).toEqual(saved);
  });

  test('retry also resets an unfinished attempt', async () => {
    await api('post', '/start');
    expect((await api('post', '/retry', { attemptNumber: 1 })).body.attemptNumber).toBe(2);
    expect(records.get('student').questions.every(q => q.timeSolved === null)).toBe(true);
  });

  test('rejects invalid choices, missing values, and out-of-order or duplicate answers', async () => {
    const practice = (await api('post', '/start')).body;
    const valid = answerBody(practice, records.get('student').questions[0].correctAnswer);
    for (const body of [undefined, {}, { ...valid, selectedAnswer: 999 }, { ...valid, selectedAnswer: '0' }, { ...valid, attemptNumber: '1' }, { ...valid, selectedAnswer: undefined }]) {
      expect((await api('post', '/answer', body)).status).toBe(400);
    }
    expect((await api('post', '/answer', { ...valid, questionId: records.get('student').questions[1]._id.toString() })).status).toBe(409);
    expect(records.get('student').questions[0].timeSolved).toBeNull();
    expect((await api('post', '/answer', valid)).status).toBe(200);
    expect((await api('post', '/answer', valid)).status).toBe(409);
    expect(records.get('student').questions.filter(q => q.timeSolved)).toHaveLength(1);
  });

  test('keeps users isolated and ignores a username supplied in the request', async () => {
    const first = (await api('post', '/start', { username: 'other' })).body;
    expect(records.has('other')).toBe(false);
    const second = (await api('post', '/start', {}, 'other')).body;
    expect(second.question.id).not.toBe(first.question.id);
    expect((await api('post', '/answer', answerBody(first, records.get('student').questions[0].correctAnswer), 'other')).status).toBe(409);
    expect((await api('post', '/retry', { attemptNumber: 1 }, 'other')).body.attemptNumber).toBe(2);
    expect(records.get('student').attemptNumber).toBe(1);
  });

  test('reports database conflicts and failures without returning false success', async () => {
    save.mockRejectedValueOnce(new mongoose.Error.VersionError(new Practice(), 0, []));
    expect((await api('post', '/start')).status).toBe(409);
    save.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    expect((await api('post', '/start')).status).toBe(409);
    save.mockRejectedValueOnce(new Error('DB unavailable'));
    const failed = await api('post', '/start');
    expect(failed.status).toBe(500);
    expect(failed.body.message).toMatch(/Unable to save or load/);
    expect(records.size).toBe(0);
  });
});
