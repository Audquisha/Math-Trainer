import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({ username: '', pwd: '', firstname: '', lastname: '', role: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const submit = async () => {
    setError('')
    const body = isRegister ? form : { username: form.username, pwd: form.pwd }
    try {
      const { data } = await axios.post(`/api/auth/${isRegister ? 'register' : 'login'}`, body)
      localStorage.setItem('token', data.token)
      navigate('/home')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong with registration/login')
    }
  }

  return (
    <div style={{ maxWidth: 300, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: '0 0 10px' }}>{isRegister ? 'Create account' : 'Login'}</h1>
      {isRegister && (
        <>
          <input placeholder="First name" value={form.firstname} onChange={update('firstname')} />
          <input placeholder="Last name" value={form.lastname} onChange={update('lastname')} />
          <input placeholder="Role" value={form.role} onChange={update('role')} />
        </>
      )}
      <input placeholder="Username" value={form.username} onChange={update('username')} />
      <input type="password" placeholder="Password" value={form.pwd} onChange={update('pwd')} />
      <button onClick={submit}>{isRegister ? 'Register' : 'Log in'}</button>
      <button onClick={() => { setIsRegister(!isRegister); setError('') }}>
        {isRegister ? 'Back to login' : 'Create an account'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
