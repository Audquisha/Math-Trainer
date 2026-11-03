import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestPractice } from '../api/practice'
import Practice from '../components/Practice'

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

  const openPractice = async (retry = false) => {
    const next = await updatePractice(retry ? '/retry' : '/start', retry ? { attemptNumber: practice.attemptNumber } : undefined)
    if (next) setShowPractice(true)
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Math practice</h1>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button disabled={busy} onClick={() => updatePractice('')}>Reload practice</button>
        </div>
      )}
      {!practice && !error && <p>Loading practice...</p>}
      {practice && !showPractice && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <button disabled={busy} onClick={() => openPractice()}>Practice</button>
          {practice.attemptNumber > 0 && (
            <>
              <span>Accuracy: {practice.accuracy}% ({practice.answeredCount}/3 answered)</span>
              <button disabled={busy} onClick={() => openPractice(true)}>Retry</button>
            </>
          )}
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
