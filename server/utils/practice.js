const QUESTION_COUNT = 3;

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (values) => values[rand(0, values.length - 1)];
const signed = (value) => (value < 0 ? `(${value})` : `${value}`);

const GENERATORS = [
  [
    () => { const a = rand(1, 96); return [`${a}, ${a + 1}, ${a + 2}, ?`, a + 3]; },
    () => { const a = rand(1, 6) * 10; return [`${a}, ${a + 10}, ${a + 20}, ?`, a + 30]; },
    () => { const a = rand(0, 10), b = rand(0, 10 - a); return [`${a} + ${b} = ?`, a + b]; },
    () => { const a = rand(0, 10), b = rand(0, a); return [`${a} - ${b} = ?`, a - b]; },
    () => { const a = rand(1, 9); return [`10 + ${a} = ?`, 10 + a]; },
  ],
  [
    () => { const a = rand(1, 19), b = rand(1, 20 - a); return [`${a} + ${b} = ?`, a + b]; },
    () => { const a = rand(1, 20), b = rand(0, a); return [`${a} - ${b} = ?`, a - b]; },
    () => { const a = rand(1, 10), b = rand(a, 20); return [`${a} + ? = ${b}`, b - a]; },
    () => { const a = rand(1, 11) * 10, b = rand(1, 9); return [`${a} + ${b} = ?`, a + b]; },
    () => { const a = rand(10, 110), b = pick([10, -10]); return [`${a} ${b < 0 ? '-' : '+'} 10 = ?`, a + b]; },
  ],
  [
    () => { const a = rand(10, 89), b = rand(1, 100 - a); return [`${a} + ${b} = ?`, a + b]; },
    () => { const a = rand(10, 100), b = rand(1, a); return [`${a} - ${b} = ?`, a - b]; },
    () => { const a = rand(1, 5), b = rand(1, 5); return [`${a} × ${b} = ?`, a * b]; },
    () => { const b = pick([2, 5, 10, 100]), a = b * rand(1, 6); return [`${a}, ${a + b}, ${a + 2 * b}, ?`, a + 3 * b, b]; },
    () => { const a = rand(1, 9) * 100, b = rand(1, 9) * 10, c = rand(1, 9); return [`${a} + ${b} + ${c} = ?`, a + b + c]; },
  ],
  [
    () => { const a = rand(1, 10), b = rand(1, 10); return [`${a} × ${b} = ?`, a * b]; },
    () => { const a = rand(1, 10), b = rand(1, 10); return [`${a * b} ÷ ${a} = ?`, b]; },
    () => { const a = rand(100, 899), b = rand(10, 999 - a); return [`${a} + ${b} = ?`, a + b]; },
    () => { const a = rand(100, 999), b = rand(10, a); return [`${a} - ${b} = ?`, a - b]; },
    () => { const d = pick([2, 3, 4]), n = rand(1, d - 1), k = rand(2, 4); return [`${n}/${d} = ?/${d * k}`, n * k]; },
  ],
  [
    () => { const a = rand(11, 99), b = rand(2, 9); return [`${a} × ${b} = ?`, a * b]; },
    () => { const a = rand(2, 9), b = rand(11, 99); return [`${a * b} ÷ ${a} = ?`, b]; },
    () => { const a = rand(2, 12), b = rand(2, 12); return [`${a} × ? = ${a * b}`, b]; },
    () => { const d = pick([5, 6, 8, 10, 12]), a = rand(1, d - 2), b = rand(1, d - 1 - a); return [`${a}/${d} + ${b}/${d} = ?/${d}`, a + b]; },
    () => { const d = pick([5, 6, 8, 10, 12]), a = rand(2, d - 1), b = rand(1, a - 1); return [`${a}/${d} - ${b}/${d} = ?/${d}`, a - b]; },
    () => { const a = rand(1, 9), b = rand(1, 9); return [`${a / 10} + ${b / 10} = ?`, (a + b) / 10, 0.1]; },
    () => { const a = rand(10, 90) * 100, b = rand(10, 90) * 100; return [`${a} + ${b} = ?`, a + b, 100]; },
  ],
  [
    () => { const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9); return [`(${a} + ${b}) × ${c} = ?`, (a + b) * c]; },
    () => { const a = rand(2, 9), b = rand(2, 9), c = rand(1, b - 1); return [`${a} × (${b} - ${c}) = ?`, a * (b - c)]; },
    () => { const a = rand(11, 30), b = rand(11, 20); return [`${a} × ${b} = ?`, a * b]; },
    () => { const a = rand(101, 999), b = rand(101, 999); return [`${a / 100} + ${b / 100} = ?`, (a + b) / 100, 0.1]; },
    () => { const a = rand(201, 999), b = rand(101, a - 1); return [`${a / 100} - ${b / 100} = ?`, (a - b) / 100, 0.1]; },
    () => { const a = rand(1, 9), b = rand(1, 9); return [`${a / 10} × ${b / 10} = ?`, (a * b) / 100, 0.01]; },
    () => { const d = pick([2, 3, 4, 5]), n = rand(1, d - 1), k = rand(2, 6); return [`${n}/${d} × ${d * k} = ?`, n * k]; },
    () => { const a = rand(2, 9), d = rand(2, 6); return [`${a} ÷ 1/${d} = ?`, a * d]; },
    () => { const a = rand(1, 4), b = rand(a + 1, 6), c = rand(1, 4), d = rand(c + 1, 6); return [`${a}/${b} × ${c}/${d} = ?/${b * d}`, a * c]; },
  ],
  [
    () => { const a = rand(-12, 12), b = rand(-12, 12); return [`${a} + ${signed(b)} = ?`, a + b, 1, true]; },
    () => { const a = rand(-12, 12), b = rand(-12, 12); return [`${a} - ${signed(b)} = ?`, a - b, 1, true]; },
    () => { const a = rand(-9, 9), b = rand(-9, 9); return [`${a} × ${signed(b)} = ?`, a * b, 1, true]; },
    () => { const a = rand(1, 20), x = rand(1, 20); return [`x + ${a} = ${x + a}, x = ?`, x]; },
    () => { const a = rand(2, 12), x = rand(2, 12); return [`${a}x = ${a * x}, x = ?`, x]; },
    () => { const a = rand(2, 9), b = rand(1, 9), x = rand(2, 9); return [`x = ${x}, ${a}x + ${b} = ?`, a * x + b]; },
    () => { const a = rand(1, 6), b = rand(1, 6), k = rand(2, 6); return [`${a}:${b} = ${a * k}:?`, b * k]; },
    () => { const d = rand(2, 5), n = rand(1, d - 1), k = rand(2, 4); return [`${n}/${d} ÷ 1/${d * k} = ?`, n * k]; },
    () => { const a = rand(2, 9), b = rand(1, 9); return [`${(a * b) / 10} ÷ ${a} = ?`, b / 10, 0.1]; },
    () => { const m = rand(3, 12), d = rand(1, m - 1), e = rand(0, d); return [`mean(${m - d}, ${m + e}, ${m + d - e}) = ?`, m]; },
  ],
];

function createQuestion([prompt, correctAnswer, step = 1, negative = false], timeAvailable) {
  const offsets = [-3, -2, -1, 1, 2, 3];
  if (step === 1 && Math.abs(correctAnswer) >= 20) offsets.push(-10, 10);
  const incorrect = offsets
    .map(offset => Math.round((correctAnswer + offset * step) * 100) / 100)
    .filter(value => negative || value >= 0);

  return {
    prompt,
    correctAnswer,
    choices: shuffle([correctAnswer, ...shuffle(incorrect).slice(0, 3)]),
    timeAvailable,
  };
}

function generateQuestions(rank = 0) {
  // Share the duration calculation with the existing browser timer.
  const { getQuestionDuration } = require('../../client/src/utils/questionTimer.js');
  const timeAvailable = getQuestionDuration(1);
  const generators = GENERATORS[Number.isInteger(rank) ? Math.min(Math.max(rank, 0), GENERATORS.length - 1) : 0];
  const questions = new Map();
  while (questions.size < QUESTION_COUNT) {
    const question = pick(generators)();
    questions.set(question[0], question);
  }
  return [...questions.values()].map(question => createQuestion(question, timeAvailable));
}

function questionPrompt(question) {
  return question.prompt ?? `${question.factor1} × ${question.factor2} = ?`;
}

function currentQuestion(practice) {
  return practice.questions.find(question => !question.timeSolved);
}

function questionDeadline(question) {
  return question.timeStarted.getTime() + question.timeAvailable * 1000;
}

function finishQuestion(practice, question, selectedAnswer, now) {
  question.timedOut = now >= questionDeadline(question);
  question.selectedAnswer = question.timedOut ? null : selectedAnswer;
  question.isCorrect = !question.timedOut && selectedAnswer === question.correctAnswer;
  question.timeSolved = new Date(question.timedOut ? questionDeadline(question) : now);
  question.elapsedSeconds = (question.timeSolved - question.timeStarted) / 1000;
  practice.accuracy = Math.round(practice.questions.filter(item => item.isCorrect).length / QUESTION_COUNT * 10000) / 100;
  if (!currentQuestion(practice)) practice.completedAt = question.timeSolved;
}

function forfeitPractice(practice, now) {
  for (let question = currentQuestion(practice); question; question = currentQuestion(practice)) {
    if (question.timeStarted) {
      finishQuestion(practice, question, null, now);
    } else {
      question.isCorrect = false;
      question.timeSolved = new Date(now);
    }
  }
  practice.completedAt ??= new Date(now);
}

function expireQuestion(practice, now) {
  const question = currentQuestion(practice);
  if (!question?.timeStarted || now < questionDeadline(question)) return false;
  finishQuestion(practice, question, null, now);
  return true;
}

function startQuestion(practice, now) {
  const question = currentQuestion(practice);
  if (!question || question.timeStarted) return false;
  question.timeStarted = new Date(now);
  return true;
}

function practiceResponse(practice, now = Date.now()) {
  const question = practice && currentQuestion(practice);
  return {
    attemptNumber: practice?.attemptNumber ?? 0,
    accuracy: practice?.accuracy ?? null,
    completed: Boolean(practice?.completedAt),
    answeredCount: practice?.questions.filter(item => item.timeSolved).length ?? 0,
    questionCount: QUESTION_COUNT,
    serverNow: now,
    question: question ? {
      id: question._id.toString(),
      number: practice.questions.indexOf(question) + 1,
      prompt: questionPrompt(question),
      choices: question.choices,
      timeAvailable: question.timeAvailable,
      expiresAt: question.timeStarted ? questionDeadline(question) : null,
    } : null,
    // Reveal answers only when the whole practice is finished.
    results: practice?.completedAt ? practice.questions.map(item => ({
      prompt: questionPrompt(item),
      selectedAnswer: item.selectedAnswer,
      correctAnswer: item.correctAnswer,
      isCorrect: item.isCorrect,
      timedOut: item.timedOut,
    })) : [],
  };
}

module.exports = {
  createQuestion, generateQuestions, questionPrompt, currentQuestion, questionDeadline,
  finishQuestion, forfeitPractice, expireQuestion, startQuestion, practiceResponse,
};
