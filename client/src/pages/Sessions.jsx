import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPractice } from '../api/practice'
import PracticeResults from '../components/practice/PracticeResults'
import Button from '../components/ui/Button'

const show = (value, suffix = '') => (value === null ? '-' : `${Number(value.toFixed(1))}${suffix}`)

function SessionSummary({ history, stats, error, onHome }) {
  if (error) return <p role="alert" className="text-danger">{error}</p>
  if (!history || !stats) return <p>Loading session...</p>

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p>You haven't completed a practice yet.</p>
        <Button onClick={onHome}>Start practicing</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <section className="flex flex-col items-center gap-1">
        <p>Attempts: {stats.attempts} | Average accuracy: {show(stats.averageAccuracy, '%')} | Best accuracy: {show(stats.bestAccuracy, '%')}</p>
        <p>Seconds per question: {show(stats.averageSecondsPerQuestion, 's')} | Timeouts: {show(stats.timeoutRate && stats.timeoutRate * 100, '%')}</p>
      </section>
      {history.map((attempt) => (
        <section key={attempt.attemptNumber} className="flex flex-col items-center gap-3">
          <p>Attempt {attempt.attemptNumber} | Accuracy: {attempt.accuracy}%</p>
          <PracticeResults results={attempt.results} />
        </section>
      ))}
    </div>
  )
}

export default function Sessions() {
  const [history, setHistory] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    Promise.all([
      requestPractice('get', '/history', undefined, controller.signal),
      requestPractice('get', '/stats', undefined, controller.signal),
    ])
      .then(([historyData, statsData]) => {
        setHistory(historyData)
        setStats(statsData)
      })
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
      <SessionSummary history={history} stats={stats} error={error} onHome={() => navigate('/home')} />
    </main>
  )
}