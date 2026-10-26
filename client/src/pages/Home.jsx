import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { requestPractice } from '../api/practice'
import useQuestionTimer from '../hooks/useQuestionTimer'
import './Practice.css'

export default function Home() {
  if (!sessionStorage.getItem('accessToken')) return <Navigate to="/login" replace />
  return <PracticePage />
}

function PracticePage() {
  const [practice, setPractice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reloadVersion, setReloadVersion] = useState(0)
  const requestPending = useRef(false)
  const navigate = useNavigate()

  const handleError = useCallback((err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('accessToken')
      navigate('/login', { replace: true })
      return
    }
    setError(err.response?.data?.message || 'Could not reach the server. Please try again.')
  }, [navigate])

  useEffect(() => {
    const controller = new AbortController()
    requestPractice('get', '', undefined, controller.signal)
      .then(setPractice)
      .catch((err) => { if (!controller.signal.aborted) handleError(err) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [handleError])

  const runRequest = async (method, path = '', data) => {
    if (requestPending.current) return
    requestPending.current = true
    setBusy(true)
    setError('')
    try {
      setPractice(await requestPractice(method, path, data))
      if (method === 'get') setReloadVersion((version) => version + 1)
    } catch (err) {
      handleError(err)
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }

  return (
    <main className="practice">
      <header className="practice-header">
        <span>Math Trainer</span>
        <button className="secondary" onClick={() => {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        }}>Log out</button>
      </header>
      <h1>Multiplication practice (3 questions)</h1>
      {loading ? <p role="status">Loading saved practice…</p> : (
        <>
          {!practice && <section className="practice-card">
            <h2>Ready to practice?</h2>
            <p>Multiply numbers from 0 to 12. Unanswered questions count as incorrect.</p>
            <button disabled={busy} onClick={() => runRequest('post')}>Start practice</button>
          </section>}
          {practice?.status === 'active' && <PracticeQuestion
            key={`${practice.practiceId}:${practice.currentIndex}:${reloadVersion}`}
            practice={practice}
            busy={busy}
            error={error}
            onAnswer={(answer) => runRequest('post', `/${practice.practiceId}/answers`, {
              questionIndex: practice.currentIndex, answer,
            })}
          />}
          {practice?.status === 'completed' && <section className="practice-card">
            <h2>Practice complete</h2>
            <p className="accuracy">{practice.accuracy}% accuracy</p>
            <p>{practice.correctCount} of {practice.total} correct. Results saved.</p>
            <ol className="results">
              {practice.questions.map((question, index) => <li key={index}>
                <strong>{question.a} × {question.b} = {question.correctAnswer}</strong>
                <span>Your answer: {question.chosenAnswer ?? 'No answer'}</span>
                <span>{question.status === 'expired'
                  ? 'Incorrect — time expired'
                  : question.isCorrect ? 'Correct' : 'Incorrect'}</span>
              </li>)}
            </ol>
            <button disabled={busy} onClick={() => runRequest('post', '/retry', { practiceId: practice.practiceId })}>
              Retry practice
            </button>
            <p className="practice-hint">Retry resets your practice progress.</p>
          </section>}
        </>
      )}
      {error && <div className="practice-error" role="alert">
        <p>{error}</p>
        <button className="secondary" disabled={busy} onClick={() => runRequest('get')}>Reload saved practice</button>
      </div>}
    </main>
  )
}

function PracticeQuestion({ practice, busy, error, onAnswer }) {
  const { timeLeft, start, stop } = useQuestionTimer(practice.difficulty)
  const [selection, setSelection] = useState(undefined)
  const submitted = useRef(false)
  const { question } = practice

  const expire = useEffectEvent(() => {
    if (submitted.current) return
    submitted.current = true
    setSelection(null)
    onAnswer(null)
  })

  useEffect(() => {
    start(() => expire(), question.deadline)
    return stop
  }, [start, stop, question.deadline])

  const choose = (answer) => {
    if (submitted.current || busy || timeLeft === 0) return
    submitted.current = true
    setSelection(answer)
    stop()
    onAnswer(answer)
  }

  return <section className="practice-card">
    <div className="question-meta">
      <span>Question {practice.currentIndex + 1} of {practice.total}</span>
      <span role="timer" aria-label="Time remaining">{timeLeft} seconds</span>
    </div>
    <h2 className="question-prompt">{question.a} × {question.b} = ?</h2>
    <div className="answer-choices" aria-label="Answer choices">
      {question.choices.map((answer) => <button key={answer}
        disabled={busy || selection !== undefined || timeLeft === 0}
        aria-pressed={selection === answer}
        onClick={() => choose(answer)}>{answer}</button>)}
    </div>
    <p role="status">{busy ? 'Saving answer…' : selection === null ? 'Time’s up! This question counts as incorrect.' : ''}</p>
    {error && selection !== undefined && <button disabled={busy} onClick={() => onAnswer(selection)}>
      Retry saving answer
    </button>}
  </section>
}
