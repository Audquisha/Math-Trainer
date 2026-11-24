import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestClasses } from '../api/classes'
import Button from '../components/ui/Button'
import RankBadge from '../components/ui/RankBadge'
import { TextField } from '../components/ui/FormFields'
import { rankInfo } from '../utils/rank'

export default function Teacher() {
  const [classes, setClasses] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ className: '', classCode: '' })
  const [errors, setErrors] = useState({ className: '', classCode: '', general: '' })
  const [reload, setReload] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    requestClasses('get', 'teacher', undefined, controller.signal)
      .then(setClasses)
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          navigate('/login', { replace: true })
        } else if (err.response?.status === 403) {
          navigate('/home', { replace: true })
        } else if (err.code !== 'ERR_CANCELED') {
          setError(err.response?.data?.message || 'Unable to load your classes.')
        }
      })
    return () => controller.abort()
  }, [navigate, reload])

  const createClass = async (e) => {
    e.preventDefault()
    if (form.className == '') {
      setErrors({ className: 'Class Name is Required!', classCode: '', general: '' })
      return
    }
    if (form.classCode == '') {
      setErrors({ className: '', classCode: 'Class Code is Required!', general: '' })
      return
    }

    try {
      await requestClasses('post', 'classes/create', { className: form.className, classCode: form.classCode })
      setForm({ className: '', classCode: '' })
      setErrors({ className: '', classCode: '', general: '' })
      setReload(reload + 1)
    } catch (err) {
      if (err.response?.status === 409) {
        setErrors({ className: '', classCode: '', general: 'That Class Code is already taken!' })
      } else {
        setErrors({ className: '', classCode: '', general: err.response?.data?.message || 'Unable to create the class.' })
      }
    }
  }

  const removeStudent = async (classCode, student) => {
    if (!window.confirm(`Remove ${student.firstName} ${student.lastName} from this class?`)) return
    try {
      await requestClasses('post', 'classes/removestudent', { classCode, studentId: student.opid })
      setReload(reload + 1)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to remove the student.')
    }
  }

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="mb-6 text-4xl">Teacher</h1>

      <form noValidate onSubmit={createClass} className="mx-auto mb-8 flex max-w-xs flex-col gap-2.5">
        <TextField
          label="Class Name"
          value={form.className}
          onChange={(e) => setForm({ ...form, className: e.target.value })}
          error={errors.className}
          invalid={Boolean(errors.className || errors.general)}
        />
        <TextField
          label="Class Code"
          value={form.classCode}
          onChange={(e) => setForm({ ...form, classCode: e.target.value })}
          error={errors.classCode}
          invalid={Boolean(errors.classCode || errors.general)}
        />
        {errors.general && <p role="alert" className="text-danger">{errors.general}</p>}
        <Button type="submit">Create class</Button>
      </form>

      {error && <p role="alert" className="text-danger">{error}</p>}
      {!error && !classes && <p>Classes Loading...</p>}
      {!error && classes && classes.length === 0 && <p>You haven't created a class yet.</p>}
      {!error && classes && classes.map((cls) => {
        let attempts = 0
        let totalAccuracy = 0
        cls.students.forEach((student) => {
          attempts += student.attempts
          totalAccuracy += (student.averageAccuracy ?? 0) * student.attempts
        })
        const average = attempts > 0 ? totalAccuracy / attempts : null

        return (
          <section key={cls.classCode} className="mx-auto mb-4 max-w-2xl overflow-hidden rounded-2xl border border-border text-left">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-xl text-heading">{cls.className}</h2>
              <span className="rounded-full bg-accent/15 px-3 py-0.5 text-sm text-accent">Code: {cls.classCode}</span>
            </div>
            <p className="border-b border-border px-4 py-3">
              {cls.students.length} students · {attempts} attempts · {average == null ? '-' : average.toFixed(1) + '%'} average accuracy
            </p>
            {cls.students.length === 0 && <p className="px-4 py-3">No students have joined yet. Share the class code.</p>}
            {cls.students.map((student) => (
              <div key={student.opid} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <RankBadge rank={rankInfo(student.rank)} className="size-8" />
                <span className="flex-1 text-heading">{student.firstName} {student.lastName} (@{student.username})</span>
                <span className="text-sm">
                  {student.passes} perfect · {student.averageAccuracy == null ? '-' : student.averageAccuracy.toFixed(1) + '%'} · {student.attempts} attempts
                </span>
                <Button onClick={() => removeStudent(cls.classCode, student)}>Remove</Button>
              </div>
            ))}
          </section>
        )
      })}
    </main>
  )
}