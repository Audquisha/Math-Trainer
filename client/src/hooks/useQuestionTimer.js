import { useCallback, useEffect, useRef, useState } from 'react'
import { getQuestionDuration, startQuestionTimer } from '../utils/questionTimer'

/** Call start({ deadline, onExpire }) when a question appears, and stop() when it is answered.
 * Passing a saved deadline resumes that countdown instead of starting a fresh one.
 */
export default function useQuestionTimer(difficulty = 1, initialSeconds) {
  const duration = getQuestionDuration(difficulty)
  const [timeLeft, setTimeLeft] = useState(() => initialSeconds ?? Math.ceil(duration))
  const [isRunning, setIsRunning] = useState(false)
  const cancelRef = useRef(() => {})

  useEffect(() => () => cancelRef.current(), [])

  const stop = useCallback(() => {
    cancelRef.current()
    setIsRunning(false)
  }, [])

  const start = useCallback(({ deadline, onExpire = () => {} } = {}) => {
    cancelRef.current()
    setIsRunning(true)
    cancelRef.current = startQuestionTimer(difficulty, {
      deadline,
      onTick: setTimeLeft,
      onExpire: () => {
        setIsRunning(false)
        onExpire()
      },
    })
  }, [difficulty])

  return { timeLeft, duration, isRunning, start, stop }
}
