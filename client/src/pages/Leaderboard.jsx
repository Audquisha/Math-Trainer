import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestLeaderboard } from '../api/leaderboard'
import RankBadge from '../components/ui/RankBadge'
import Button from '../components/ui/Button'
import { SelectField } from '../components/ui/FormFields'
import { rankInfo } from '../utils/rank'

function Entry({ entry }) {
  return (
    <li className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left ${entry.isYou ? 'border-accent bg-accent/15' : 'border-border'}`}>
      <span className="w-6 text-heading">{entry.place}</span>
      <RankBadge rank={rankInfo(entry.rank)} className="size-8" />
      <span className="flex-1 text-heading">@{entry.username}{entry.isYou && ' (you)'}</span>
      <span className="text-sm">{entry.passes} perfect · {Number(entry.averageAccuracy.toFixed(1))}%</span>
    </li>
  )
}

function LeaderboardList({ entries, error, emptyMessage, onHome }) {
  if (error) return <p role="alert" className="text-danger">{error}</p>
  if (!entries) return <p>Loading leaderboard...</p>

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p>{emptyMessage}</p>
        <Button onClick={onHome}>Start practicing</Button>
      </div>
    )
  }

  return (
    <ol className="mx-auto flex max-w-md flex-col gap-2">
      {entries.map((entry) => <Entry key={entry.username} entry={entry} />)}
    </ol>
  )
}

export default function Leaderboard() {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')
  const [scope, setScope] = useState('everyone')
  const [classes, setClasses] = useState(null)
  const [classCode, setClassCode] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    requestLeaderboard('get', '/classes', undefined, controller.signal)
      .then((data) => {
        setClasses(data)
        if (data.length > 0) setClassCode(data[0].classCode)
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        } else if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Unable to load your classes.')
        }
      })
    return () => controller.abort()
  }, [navigate])

  useEffect(() => {
    if (scope === 'class' && !classCode) return
    const controller = new AbortController()
    const path = scope === 'class' ? `?classCode=${encodeURIComponent(classCode)}` : ''
    requestLeaderboard('get', path, undefined, controller.signal)
      .then(setEntries)
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        } else if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Unable to load the leaderboard.')
        }
      })
    return () => controller.abort()
  }, [navigate, scope, classCode])

  const chooseScope = (next) => {
    setEntries(null)
    setError('')
    setScope(next)
  }

  const chooseClass = (next) => {
    setEntries(null)
    setError('')
    setClassCode(next)
  }

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="mb-6 text-4xl">Leaderboard</h1>
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex gap-2">
          <Button
            aria-pressed={scope === 'everyone'}
            className={scope === 'everyone' ? 'border-accent' : ''}
            onClick={() => chooseScope('everyone')}
          >
            Everyone
          </Button>
          <Button
            aria-pressed={scope === 'class'}
            className={scope === 'class' ? 'border-accent' : ''}
            onClick={() => chooseScope('class')}
          >
            My class
          </Button>
        </div>
        {scope === 'class' && classes && classes.length > 1 && (
          <div className="w-64">
            <SelectField
              label="Class"
              value={classCode}
              onChange={(e) => chooseClass(e.target.value)}
              options={classes.map((cls) => ({ value: cls.classCode, label: cls.className }))}
              placeholder="Select a class"
            />
          </div>
        )}
      </div>
      {scope === 'class' && classes && classes.length === 0
        ? <p>You aren't in a class yet. Students join with a class code on the Profile page, and teachers create classes on the Teacher tab.</p>
        : (
          <LeaderboardList
            entries={entries}
            error={error}
            emptyMessage={scope === 'class' ? 'No one in this class has completed a practice yet.' : 'No one has completed a practice yet.'}
            onHome={() => navigate('/home')}
          />
        )}
    </main>
  )
}