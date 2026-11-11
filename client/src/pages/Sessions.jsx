import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPractice } from '../api/practice'
import PracticeResults from '../components/practice/PracticeResults'
import Button from '../components/ui/Button'
import { rankInfo } from '../utils/rank'

function Attempt({ attempt }) {
  return (
    <details className="rounded-lg border border-border text-left">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-heading hover:text-accent">
        <span>Attempt {attempt.attemptNumber}</span>
        <span className="rounded-full bg-accent/15 px-3 py-0.5 text-sm text-accent">{rankInfo(attempt.rank).label}</span>
      </summary>
      <div className="border-t border-border px-4 py-3">
        <PracticeResults results={attempt.results} />
      </div>
    </details>
  )
}

function SessionSummary({ history, error, onHome }) {
  if (error) return <p role="alert" className="text-danger">{error}</p>
  if (!history) return <p>Loading session...</p>

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p>You haven't completed a practice yet.</p>
        <Button onClick={onHome}>Start practicing</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-2">
      {history.map((attempt) => <Attempt key={attempt.attemptNumber} attempt={attempt} />)}
    </div>
  )
}

export default function Sessions() {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    requestPractice('get', '/history', undefined, controller.signal)
      .then(setHistory)
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        } else if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Unable to load your session history.')
        }
      })
    return () => controller.abort()
  }, [navigate])

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="mb-6 text-4xl">Session history</h1>
      <SessionSummary history={history} error={error} onHome={() => navigate('/home')} />
    </main>
  )
}
