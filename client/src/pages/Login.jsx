import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const emptyForm = { user: '', pwd: '', firstName: '', lastName: '', role: '' }

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const toggleMode = () => {
    setIsRegister(!isRegister)
    setError('')
    setSuccess('')
  }

  const register = async () => {
    try {
      const { data } = await axios.post('/api/auth/register', form)
      setForm({ ...emptyForm, user: form.user })
      setIsRegister(false)
      setSuccess(data.success || 'Account created. Please log in.')
    } catch (err) {
      if (err.response?.status === 409) setError('Username already taken')
      else setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const login = async () => {
    try {
      const { data } = await axios.post('/api/auth/login', { user: form.user, pwd: form.pwd })
      sessionStorage.setItem('accessToken', data.accessToken)
      navigate('/home')
    } catch (err) {
      if (err.response?.status === 404) setError('Login is not available yet')
      else setError(err.response?.data?.message || 'Invalid username or password')
    }
  }

  const submit = () => {
    setError('')
    setSuccess('')
    isRegister ? register() : login()
  }

  return (
    <div style={{ maxWidth: 300, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: '0 0 10px' }}>{isRegister ? 'Create account' : 'Login'}</h1>
      {isRegister && (
        <>
          <input placeholder="First name" value={form.firstName} onChange={update('firstName')} />
          <input placeholder="Last name" value={form.lastName} onChange={update('lastName')} />
          <input placeholder="Role" value={form.role} onChange={update('role')} />
        </>
      )}
      <input placeholder="Username" value={form.user} onChange={update('user')} />
      <input type="password" placeholder="Password" value={form.pwd} onChange={update('pwd')} />
      <button onClick={submit}>{isRegister ? 'Register' : 'Log in'}</button>
      <button onClick={toggleMode}>{isRegister ? 'Back to login' : 'Create an account'}</button>
      {success && <p style={{ color: 'green' }}>{success}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
