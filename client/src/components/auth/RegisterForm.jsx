import { useState } from 'react'
import { register } from '../../api/auth'
import { hasErrors, requiredFieldErrors } from '../../utils/validation'
import Button from '../ui/Button'
import { SelectField, TextField } from '../ui/FormFields'

const LABELS = { firstName: 'First name', lastName: 'Last name', role: 'Role', user: 'Username', pwd: 'Password' }
const EMPTY_FORM = { firstName: '', lastName: '', role: '', user: '', pwd: '' }
const ROLE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
]

function registerErrors(err) {
  if (err.response?.status === 409) return { user: 'Username already taken!' }
  return { general: err.response?.data?.message || 'Something went wrong' }
}

export default function RegisterForm({ onRegistered, onSwitch }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const fieldProps = (field) => ({
    label: LABELS[field],
    value: form[field],
    onChange: (e) => setForm((prev) => ({ ...prev, [field]: e.target.value })),
    error: errors[field],
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fieldErrors = requiredFieldErrors(form, LABELS)
    setErrors(fieldErrors)
    if (hasErrors(fieldErrors)) return

    setSubmitting(true)
    try {
      const data = await register(form)
      onRegistered(form.user, data.success || 'Account created. Please log in.')
    } catch (err) {
      setErrors(registerErrors(err))
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <TextField {...fieldProps('firstName')} autoComplete="given-name" />
      <TextField {...fieldProps('lastName')} autoComplete="family-name" />
      <SelectField {...fieldProps('role')} options={ROLE_OPTIONS} placeholder="Select a role" />
      <TextField {...fieldProps('user')} autoComplete="username" />
      <TextField {...fieldProps('pwd')} type="password" autoComplete="new-password" />
      {errors.general && <p role="alert" className="text-danger">{errors.general}</p>}

      <Button type="submit" disabled={submitting}>Register</Button>
      <Button onClick={onSwitch}>Back to login</Button>
    </form>
  )
}
