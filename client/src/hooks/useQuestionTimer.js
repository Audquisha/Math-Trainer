import { useCallback, useEffect, useRef, useState } from 'react'
import { getQuestionDuration, startQuestionTimer } from '../utils/questionTimer'

/** Call start(onExpire) when a question appears, and stop() when it is answered.
 * Pass a local-clock deadline as start's second argument to resume saved time.
 * Changes to difficulty apply on the next start, which also restarts an active timer.
 */
export default function useQuestionTimer(difficulty = 1) {
  const duration = getQuestionDuration(difficulty)
  const [timeLeft, setTimeLeft] = useState(Math.ceil(duration))
  const [isRunning, setIsRunning] = useState(false)
  const cancelRef = useRef(() => {})

  useEffect(() => () => cancelRef.current(), [])

  const stop = useCallback(() => {
    cancelRef.current()
    setIsRunning(false)
  }, [])

  const start = useCallback((onExpire = () => {}, deadline) => {
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

  return { timeLeft, isRunning, start, stop }
}
