import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../api/auth'
import { hasErrors, requiredFieldErrors } from '../../utils/validation'
import Button from '../ui/Button'
import { TextField } from '../ui/FormFields'

const LABELS = { user: 'Username', pwd: 'Password' }

function loginErrorMessage(err) {
  if (err.response?.status === 404) return 'Login is not available yet!'
  return err.response?.data?.message || 'Invalid username or password'
}

export default function LoginForm({ initialUser = '', onSwitch }) {
  const [form, setForm] = useState({ user: initialUser, pwd: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fieldErrors = requiredFieldErrors(form, LABELS)
    setErrors(fieldErrors)
    if (hasErrors(fieldErrors)) return

    setSubmitting(true)
    try {
      const data = await login(form)
      sessionStorage.setItem('accessToken', data.accessToken)
      navigate('/home')
    } catch (err) {
      setErrors({ general: loginErrorMessage(err) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <TextField
        label={LABELS.user}
        autoComplete="username"
        value={form.user}
        onChange={update('user')}
        error={errors.user}
        invalid={Boolean(errors.user || errors.general)}
      />
      <TextField
        label={LABELS.pwd}
        type="password"
        autoComplete="current-password"
        value={form.pwd}
        onChange={update('pwd')}
        error={errors.pwd}
        invalid={Boolean(errors.pwd || errors.general)}
      />
      {errors.general && <p role="alert" className="text-danger">{errors.general}</p>}

      <Button type="submit" disabled={submitting}>Log in</Button>
      <Button onClick={onSwitch}>Create an account</Button>
    </form>
  )
}
