const QUESTION_COUNT = 3;

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function createQuestion(factor1, factor2, timeAvailable) {
  const correctAnswer = factor1 * factor2;
  const incorrect = new Set();

  // Expand the factor offsets when zeros or boundary factors produce duplicates.
  for (let offset = 1; incorrect.size < 3; offset++) {
    for (let first = Math.max(0, factor1 - offset); first <= Math.min(12, factor1 + offset); first++) {
      for (let second = Math.max(0, factor2 - offset); second <= Math.min(12, factor2 + offset); second++) {
        const product = first * second;
        if (product !== correctAnswer) incorrect.add(product);
      }
    }
  }

  return {
    factor1,
    factor2,
    correctAnswer,
    choices: shuffle([correctAnswer, ...shuffle([...incorrect]).slice(0, 3)]),
    timeAvailable,
  };
}

function generateQuestions() {
  // Share the duration calculation with the existing browser timer.
  const { getQuestionDuration } = require('../../client/src/utils/questionTimer.js');
  const timeAvailable = getQuestionDuration(1);
  const factors = Array.from({ length: 169 }, (_, index) => [Math.floor(index / 13), index % 13]);
  return shuffle(factors).slice(0, QUESTION_COUNT)
    .map(([first, second]) => createQuestion(first, second, timeAvailable));
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
      factor1: question.factor1,
      factor2: question.factor2,
      choices: question.choices,
      timeAvailable: question.timeAvailable,
      expiresAt: question.timeStarted ? questionDeadline(question) : null,
    } : null,
    // Reveal answers only when the whole practice is finished.
    results: practice?.completedAt ? practice.questions.map(item => ({
      factor1: item.factor1,
      factor2: item.factor2,
      selectedAnswer: item.selectedAnswer,
      correctAnswer: item.correctAnswer,
      isCorrect: item.isCorrect,
      timedOut: item.timedOut,
    })) : [],
  };
}

module.exports = {
  createQuestion, generateQuestions, currentQuestion, questionDeadline,
  finishQuestion, expireQuestion, startQuestion, practiceResponse,
};
