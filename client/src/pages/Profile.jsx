import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { requestProfile } from '../api/profile'
import { requestPractice } from '../api/practice'




export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true });
      return;
    }
    const controller = new AbortController();
    Promise.all([
      requestProfile('get', '', undefined, controller.signal),
      requestPractice('get', '/history', undefined, controller.signal),
      requestPractice('get', '/stats', undefined, controller.signal),
    ])
        .then(([profileData, historyData, statsData]) => {
          setProfile(profileData);
          setHistory(historyData);
          setStats(statsData);
      })
        .catch((err) =>{
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
            <dl className="flex flex-col items-center gap-3">
            <p>Username: {profile.username}</p>
            <p>First Name: {profile.firstName} </p>
            <p>Last Name: {profile.lastName} </p>
            <p>Role: {profile.role} </p>

            </dl>

    )}
    
      
    </main>
  )
}
