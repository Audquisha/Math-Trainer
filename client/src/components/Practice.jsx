import { useCallback, useEffect, useRef, useState } from 'react'
import { startQuestionTimer } from '../utils/questionTimer'

function Question({ question, attemptNumber, busy, onRequest }) {
  const [timeLeft, setTimeLeft] = useState(() => Math.ceil(question.timeAvailable))
  const cancelTimer = useRef(() => {})
  const submitting = useRef(false)

  const answer = useCallback(async (selectedAnswer) => {
    if (submitting.current) return
    submitting.current = true
    cancelTimer.current()
    try {
      await onRequest('/answer', { attemptNumber, questionId: question.id, selectedAnswer })
    } finally {
      submitting.current = false
    }
  }, [attemptNumber, question.id, onRequest])

  useEffect(() => {
    if (question.expiresAt === null) return
    cancelTimer.current = startQuestionTimer(1, {
      deadline: question.deadline,
      onTick: setTimeLeft,
      onExpire: () => answer(null),
    })
    return () => cancelTimer.current()
  }, [question.deadline, question.expiresAt, answer])

  if (question.expiresAt === null) {
    return <button disabled={busy} onClick={() => onRequest('/start')}>Continue practice</button>
  }

  return (
    <section aria-label={`Question ${question.number}`}>
      <p>Question {question.number} of 3</p>
      <p role="timer">Time left: {timeLeft} seconds</p>
      <h2>{question.factor1} × {question.factor2} = ?</h2>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
        {question.choices.map(choice => (
          <button key={choice} disabled={busy || timeLeft === 0} onClick={() => answer(choice)}>
            {choice}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Practice({ practice, busy, onRequest, onClose }) {
  return (
    <section>
      <p>Attempt {practice.attemptNumber} | Accuracy: {practice.accuracy}%</p>
      {practice.completed ? (
        <>
          <h2>Practice complete</h2>
          <ol>
            {practice.results.map((result, index) => (
              <li key={index}>
                {result.factor1} × {result.factor2} = {result.correctAnswer}.{' '}
                {result.timedOut ? 'Time expired.' : `Your answer: ${result.selectedAnswer}.`}{' '}
                {result.isCorrect ? 'Correct.' : 'Incorrect.'}
              </li>
            ))}
          </ol>
          <button disabled={busy} onClick={() => onRequest('/retry', { attemptNumber: practice.attemptNumber })}>
            Retry
          </button>
        </>
      ) : practice.question && (
        <Question
          key={`${practice.attemptNumber}:${practice.question.id}`}
          question={practice.question}
          attemptNumber={practice.attemptNumber}
          busy={busy}
          onRequest={onRequest}
        />
      )}
      <p><button disabled={busy} onClick={onClose}>Back to home</button></p>
    </section>
  )
}
