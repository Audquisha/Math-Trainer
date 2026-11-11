import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestProfile } from '../api/profile'
import { requestPractice } from '../api/practice'
import RankBadge from '../components/ui/RankBadge'
import { rankInfo } from '../utils/rank'

const show = (value, suffix = '') => (value == null ? '-' : `${Number(value.toFixed(1))}${suffix}`)

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-4">
      <dd className="text-2xl font-medium text-heading">{value}</dd>
      <dt className="text-xs uppercase tracking-wider">{label}</dt>
    </div>
  )
}

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const rank = rankInfo(profile?.rank)

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    Promise.all([
      requestProfile('get', '', undefined, controller.signal),
      requestPractice('get', '/stats', undefined, controller.signal),
    ])
      .then(([profileData, statsData]) => {
        setProfile(profileData)
        setStats(statsData)
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        } else if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Unable to load your profile.')
        }
      })
    return () => controller.abort()
  }, [navigate])

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="mb-6 text-4xl">Profile</h1>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!error && !profile && <p>Profile Loading...</p>}
      {!error && profile && (
        <section className="mx-auto max-w-md overflow-hidden rounded-2xl border border-border shadow-sm">
          <div className="h-20 bg-accent/15" />
          <div className="-mt-12 flex flex-col items-center gap-2 px-6 pb-6">
            <RankBadge rank={rank} className="size-24" />
            <h2 className="text-2xl">{profile.firstName} {profile.lastName}</h2>
            <p>@{profile.username}</p>
            <div className="flex gap-2 text-sm">
              <span className="rounded-full bg-accent/15 px-3 py-0.5 capitalize text-accent">{profile.role}</span>
              <span className="rounded-full border border-border px-3 py-0.5">{rank.label}</span>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-border border-t border-border">
            <Stat label="Attempts" value={stats.attempts} />
            <Stat label="Avg accuracy" value={show(stats.averageAccuracy, '%')} />
            <Stat label="Best" value={show(stats.bestAccuracy, '%')} />
          </dl>
        </section>
      )}
    </main>
  )
}
