import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPractice } from '../api/practice'
import Practice from '../components/practice/Practice'
import Button from '../components/ui/Button'

export default function Home() {
  const [practice, setPractice] = useState(null)
  const [showPractice, setShowPractice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestPending = useRef(false)
  const navigate = useNavigate()

  const handleError = useCallback((err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('accessToken')
      navigate('/login', { replace: true })
    } else if (err.code !== 'ERR_CANCELED') {
      setError(err.response?.data?.message || 'Unable to load practice. Please try again.')
    }
  }, [navigate])

  useEffect(() => {
    if (!sessionStorage.getItem('accessToken')) {
      navigate('/login', { replace: true })
      return
    }
    const controller = new AbortController()
    requestPractice('get', '', undefined, controller.signal).then(setPractice).catch(handleError)
    return () => controller.abort()
  }, [handleError, navigate])

  const updatePractice = useCallback(async (path, data) => {
    if (requestPending.current) return null
    requestPending.current = true
    setBusy(true)
    setError('')
    try {
      let next
      try {
        next = await requestPractice(path ? 'post' : 'get', path, data)
      } catch (err) {
        if (err.response?.status !== 409) throw err
        next = await requestPractice()
      }
      setPractice(next)
      return next
    } catch (err) {
      handleError(err)
      return null
    } finally {
      requestPending.current = false
      setBusy(false)
    }
  }, [handleError])

  const openPractice = async () => {
    const next = await updatePractice('/start')
    if (next) setShowPractice(true)
  }

  const inProgress = practice?.attemptNumber > 0 && !practice.completed

  const startOver = async () => {
    const next = await updatePractice('/retry', { attemptNumber: practice.attemptNumber })
    if (next) setShowPractice(true)
  }

  return (
    <main className="mx-auto max-w-[1126px] p-5 text-center">
      <h1 className="my-8 text-[56px] tracking-[-1.68px] max-lg:my-5 max-lg:text-4xl">Math practice</h1>
      {error && (
        <div role="alert" className="mb-4 flex flex-col items-center gap-2 text-danger">
          <p>{error}</p>
          <Button disabled={busy} onClick={() => updatePractice('')}>Reload practice</Button>
        </div>
      )}
      {!practice && !error && <p>Loading practice...</p>}
      {practice && !showPractice && (
        <div className="flex flex-col items-center gap-2">
          <Button disabled={busy} onClick={openPractice}>{inProgress ? `Continue attempt ${practice.attemptNumber}` : 'Practice'}</Button>
          {inProgress && <Button disabled={busy} onClick={startOver}>Start over (counts as a loss)</Button>}
        </div>
      )}
      {practice && showPractice && (
        <Practice
          practice={practice}
          busy={busy}
          onRequest={updatePractice}
          onClose={() => setShowPractice(false)}
        />
      )}
    </main>
  )
}
