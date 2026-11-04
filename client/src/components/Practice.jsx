import { useCallback, useEffect, useRef } from 'react'
import useQuestionTimer from '../hooks/useQuestionTimer'
import Button from './ui/Button'

function TimerBar({ timeLeft, total }) {
  const percent = Math.min(100, Math.max(0, (timeLeft / total) * 100))
  const urgent = timeLeft <= 3

  return (
    <div role="timer" aria-label={`${timeLeft} seconds left`} className="mx-auto w-full max-w-sm">
      <p className={`mb-1 text-sm ${urgent ? 'text-danger' : ''}`}>Time left: {timeLeft}s</p>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function Question({ question, attemptNumber, busy, onRequest }) {
  const { timeLeft, start, stop } = useQuestionTimer(1, Math.ceil(question.timeAvailable))
  const submitting = useRef(false)

  const answer = useCallback(async (selectedAnswer) => {
    if (submitting.current) return
    submitting.current = true
    stop()
    try {
      await onRequest('/answer', { attemptNumber, questionId: question.id, selectedAnswer })
    } finally {
      submitting.current = false
    }
  }, [attemptNumber, question.id, onRequest, stop])

  useEffect(() => {
    if (question.expiresAt === null) return
    start({ deadline: question.deadline, onExpire: () => answer(null) })
    return stop
  }, [question.deadline, question.expiresAt, answer, start, stop])

  if (question.expiresAt === null) {
    return <Button disabled={busy} onClick={() => onRequest('/start')}>Continue practice</Button>
  }

  return (
    <section aria-label={`Question ${question.number}`} className="flex flex-col gap-3">
      <p>Question {question.number} of 3</p>
      <TimerBar timeLeft={timeLeft} total={question.timeAvailable} />
      <h2 className="text-2xl">{question.factor1} × {question.factor2} = ?</h2>
      <div className="flex justify-center gap-2.5">
        {question.choices.map((choice) => (
          <Button key={choice} disabled={busy || timeLeft === 0} onClick={() => answer(choice)}>
            {choice}
          </Button>
        ))}
      </div>
    </section>
  )
}

export default function Practice({ practice, busy, onRequest, onClose }) {
  return (
    <section className="flex flex-col gap-3">
      <p>Attempt {practice.attemptNumber} | Accuracy: {practice.accuracy}%</p>
      {practice.completed ? (
        <>
          <h2 className="text-2xl">Practice complete</h2>
          <ol className="list-inside list-decimal">
            {practice.results.map((result, index) => (
              <li key={index}>
                {result.factor1} × {result.factor2} = {result.correctAnswer}.{' '}
                {result.timedOut ? 'Time expired.' : `Your answer: ${result.selectedAnswer}.`}{' '}
                {result.isCorrect ? 'Correct.' : 'Incorrect.'}
              </li>
            ))}
          </ol>
          <div>
            <Button disabled={busy} onClick={() => onRequest('/retry', { attemptNumber: practice.attemptNumber })}>
              Retry
            </Button>
          </div>
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
      <div>
        <Button disabled={busy} onClick={onClose}>Back to home</Button>
      </div>
    </section>
  )
}
