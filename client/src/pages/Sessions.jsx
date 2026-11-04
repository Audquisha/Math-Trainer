import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPractice } from '../api/practice'
import PracticeResults from '../components/practice/PracticeResults'
import Button from '../components/ui/Button'

function SessionSummary({ practice, error, onHome }) {
  if (error) return <p role="alert" className="text-danger">{error}</p>
  if (!practice) return <p>Loading session...</p>

  if (practice.attemptNumber === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p>You haven't practiced yet.</p>
        <Button onClick={onHome}>Start practicing</Button>
      </div>
    )
  }

  if (!practice.completed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p>Attempt {practice.attemptNumber} is in progress ({practice.answeredCount}/{practice.questionCount} answered).</p>
        <Button onClick={onHome}>Continue on Home</Button>
      </div>
    )
  }

  return (
    <section className="flex flex-col items-center gap-3">
      <p>Attempt {practice.attemptNumber} | Accuracy: {practice.accuracy}%</p>
      <PracticeResults results={practice.results} />
    </section>
  )
}

export default function Sessions() {
  const [practice, setPractice] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    requestPractice('get', '', undefined, controller.signal)
      .then(setPractice)
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        } else if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Unable to load your last session.')
        }
      })
    return () => controller.abort()
  }, [navigate])

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="mb-6 text-4xl">Last session</h1>
      <SessionSummary practice={practice} error={error} onHome={() => navigate('/home')} />
    </main>
  )
}
