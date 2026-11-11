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
const User = require('../model/User');
const { createQuestion, generateQuestions } = require('../utils/practice');
const { getQuestionDuration } = require('../../client/src/utils/questionTimer.js');

let now;
let records;
let attempts;
let save;
let updateUser;
let storedRank;

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

async function answerAll(practice, username = 'student', { timeouts = false } = {}) {
  for (let i = 0; i < 3; i++) {
    const question = records.get(username).questions[i];
    now += timeouts ? 10000 : 1000;
    practice = (await api('post', '/answer', answerBody(practice, timeouts ? null : question.correctAnswer), username)).body;
  }
  return practice;
}

beforeEach(() => {
  now = Date.parse('2026-10-28T12:00:00Z');
  records = new Map();
  attempts = [];
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(Practice, 'findOne').mockImplementation( ({ username }) => {
    const record = records.get(username);
    const query = Promise.resolve(record ? Practice.hydrate(record) : null);
    query.sort = () => query;
    return query;
  });

  jest.spyOn(Practice, 'find').mockImplementation(({ username }) => {
    let rows = attempts.filter(a => a.username === username && a.completedAt !== null);
    const query = {
      sort: () => { rows = [...rows].sort((a, b) => b.attemptNumber - a.attemptNumber); return query; },
      limit: (n) => { rows = rows.slice(0, n); return query; },
      lean: () => Promise.resolve(rows),
    };
    return query;
  });
  
  jest.spyOn(Practice, 'countDocuments').mockImplementation(async ({ username, accuracy, attemptNumber }) =>
    attempts.filter(a => a.username === username && a.completedAt !== null && a.accuracy >= accuracy.$gte
      && (!attemptNumber || a.attemptNumber < attemptNumber.$lt)).length);
  updateUser = jest.spyOn(User, 'updateOne').mockResolvedValue({});
  storedRank = 0;
  jest.spyOn(User, 'findOne').mockImplementation(() => ({ select: () => ({ lean: async () => ({ rank: storedRank }) }) }));

  save = jest.spyOn(Practice.prototype, 'save').mockImplementation(async function () {
    await this.validate();
    const doc = this.toObject();
    records.set(this.username, doc);
    const brr = attempts.findIndex(a => a.username === doc.username && a.attemptNumber === doc.attemptNumber);
    if(brr >= 0){
      attempts[brr] = doc;
    }
    else{
      attempts.push(doc);
    }
    return this;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('question generation', () => {
  test.each([0, 1, 2, 3, 4, 5, 6])('rank %i draws three distinct questions with four unique choices', (rank) => {
    const correctPositions = new Set();
    for (let attempt = 0; attempt < 300; attempt++) {
      const questions = generateQuestions(rank);
      expect(questions).toHaveLength(3);
      expect(new Set(questions.map(q => q.prompt)).size).toBe(3);
      for (const question of questions) {
        expect(question.prompt).toContain('?');
        expect(question.timeAvailable).toBe(10);
        expect(question.choices).toHaveLength(4);
        expect(new Set(question.choices).size).toBe(4);
        expect(question.choices.every(Number.isFinite)).toBe(true);
        expect(question.choices.filter(choice => choice === question.correctAnswer)).toHaveLength(1);
        if (rank < 6) expect(Math.min(...question.choices)).toBeGreaterThanOrEqual(0);
        correctPositions.add(question.choices.indexOf(question.correctAnswer));
      }
    }
    expect(getQuestionDuration).toHaveBeenCalledWith(1);
    expect(correctPositions.size).toBe(4);
  });

  test('question difficulty follows the rank and falls back to Kindergarten for invalid ranks', () => {
    const answers = (rank) => Array.from({ length: 200 }, () => generateQuestions(rank)).flat().map(q => q.correctAnswer);
    expect(Math.max(...answers(0))).toBeLessThanOrEqual(100);
    expect(Math.max(...answers(4))).toBeGreaterThan(100);
    expect(Math.min(...answers(6))).toBeLessThan(0);
    for (const rank of [undefined, null, -1, 2.5, '3']) {
      expect(Math.max(...answers(rank))).toBeLessThanOrEqual(100);
    }
    expect(createQuestion(['0 + 0 = ?', 0], 10).choices.sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('practice API', () => {
  //history tests cause they wer previously deleted
  test('history is empty for a new user', async () => {
    expect((await api('get', '/history')).body).toEqual([]);
  });

  test('stores the rank on the user when attempts complete and raises it every three perfect attempts', async () => {
    let practice = (await api('post', '/start')).body;
    expect(updateUser).not.toHaveBeenCalled();
    practice = await answerAll(practice);
    expect(updateUser).toHaveBeenLastCalledWith({ username: 'student' }, { rank: 0 });
    for (let attempt = 0; attempt < 2; attempt++) {
      practice = (await api('post', '/retry', { attemptNumber: practice.attemptNumber })).body;
      practice = await answerAll(practice);
    }
    expect(updateUser).toHaveBeenCalledTimes(3);
    expect(updateUser).toHaveBeenLastCalledWith({ username: 'student' }, { rank: 1 });
    practice = (await api('post', '/retry', { attemptNumber: practice.attemptNumber })).body;
    await answerAll(practice, 'student', { timeouts: true });
    expect(updateUser).toHaveBeenLastCalledWith({ username: 'student' }, { rank: 1 });
    const history = (await api('get', '/history')).body;
    expect(history.map(a => [a.attemptNumber, a.rank])).toEqual([[4, 1], [3, 1], [2, 0], [1, 0]]);
    expect(history[0].results[0]).toHaveProperty('prompt', records.get('student').questions[0].prompt);
  });

  test('new attempts use questions for the rank stored on the user', async () => {
    storedRank = 6;
    const generated = [];
    for (let attempt = 1; attempt <= 40; attempt++) {
      await api('post', attempt === 1 ? '/start' : '/retry', { attemptNumber: attempt - 1 });
      generated.push(...records.get('student').questions);
    }
    expect(User.findOne).toHaveBeenCalledWith({ username: 'student' });
    expect(generated.some(q => /x|mean|:/.test(q.prompt))).toBe(true);
  });


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
    Object.assign(question, { prompt: '0 + 0 = ?', correctAnswer: 0, choices: [0, 1, 2, 4] });
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
    expect(saved._id).not.toEqual(old._id);
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
    
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, accuracy: 100 });
    expect(attempts[0].completedAt).not.toBeNull();  
    expect(records.get('student')).toEqual(saved);

  });

  test('retry on an unfinished attempt records it as a loss before starting the next attempt', async () => {
    const first = (await api('post', '/start')).body;
    now += 1000;
    await api('post', '/answer', answerBody(first, records.get('student').questions[0].correctAnswer));
    now += 2000;
    const retry = (await api('post', '/retry', { attemptNumber: 1 })).body;
    expect(retry).toMatchObject({ attemptNumber: 2, accuracy: 0, answeredCount: 0, completed: false });
    expect(records.get('student').questions.every(q => q.timeSolved === null)).toBe(true);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].completedAt.getTime()).toBe(now);
    expect(attempts[0].accuracy).toBe(33.33);
    expect(attempts[0].questions.map(q => q.isCorrect)).toEqual([true, false, false]);
    expect(attempts[0].questions[1]).toMatchObject({ selectedAnswer: null, timedOut: false, elapsedSeconds: 2 });
    expect(attempts[0].questions[2]).toMatchObject({ selectedAnswer: null, timedOut: false, timeStarted: null, elapsedSeconds: null });
    expect(updateUser).toHaveBeenCalledWith({ username: 'student' }, { rank: 0 });
    const history = (await api('get', '/history')).body;
    expect(history.map(a => a.attemptNumber)).toEqual([1]);
  });

  test('stats come from a database aggregation and are empty for a new user', async () => {
    const aggregate = jest.spyOn(Practice, 'aggregate').mockResolvedValueOnce([]);
    expect((await api('get', '/stats')).body).toEqual({
      attempts: 0, averageAccuracy: null, bestAccuracy: null, averageSecondsPerQuestion: null, timeoutRate: null,
    });
    aggregate.mockResolvedValueOnce([{ attempts: 2, averageAccuracy: 50, bestAccuracy: 100, seconds: 12, timed: 4, questions: 6, timeouts: 3 }]);
    expect((await api('get', '/stats')).body).toEqual({
      attempts: 2, averageAccuracy: 50, bestAccuracy: 100, averageSecondsPerQuestion: 3, timeoutRate: 0.5,
    });
    expect(aggregate.mock.calls[0][0][0].$match.username).toBe('student');
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
