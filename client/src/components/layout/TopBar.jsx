import { NavLink, useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import { useEffect, useState } from 'react'
import { requestProfile } from '../../api/profile'

const navLinkClass = ({ isActive }) =>
  `px-3 py-1.5 ${isActive ? 'text-heading underline decoration-accent underline-offset-4' : 'hover:text-heading'}`

export default function TopBar() {
  const navigate = useNavigate()

  const [role, setRole] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    requestProfile('get', '', undefined, controller.signal)
      .then((profile) => setRole(profile.role))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const logout = () => {
    sessionStorage.removeItem('accessToken')
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-5 py-3">
      <span className="font-medium text-heading">Math Trainer</span>
      <div className="flex items-center gap-2">
        <nav aria-label="Main" className="flex items-center">
          <NavLink to="/home" className={navLinkClass}>Home</NavLink>
          <NavLink to="/sessions" className={navLinkClass}>Session</NavLink>
          <NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
          <NavLink to="/leaderboard" className={navLinkClass}>Leaderboard</NavLink>
          {role === 'teacher' && <NavLink to="/teacher" className={navLinkClass}>Teacher</NavLink>}
          
        </nav>
        <Button onClick={logout}>Log out</Button>
      </div>
    </header>
  )
}
