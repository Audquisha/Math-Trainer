import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestLeaderboard } from '../api/leaderboard'
import RankBadge from '../components/ui/RankBadge'
import Button from '../components/ui/Button'
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

function LeaderboardList({ entries, error, onHome }) {
  if (error) return <p role="alert" className="text-danger">{error}</p>
  if (!entries) return <p>Loading leaderboard...</p>

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p>No one has completed a practice yet.</p>
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
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    requestLeaderboard('get', '', undefined, controller.signal)
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
  }, [navigate])

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="mb-6 text-4xl">Leaderboard</h1>
      <LeaderboardList entries={entries} error={error} onHome={() => navigate('/home')} />
    </main>
  )
}