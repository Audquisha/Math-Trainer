export const BASE_TIME_SECONDS = 10

export function getQuestionDuration(difficulty = 1) {
  if (!Number.isFinite(difficulty) || difficulty <= 0 || !Number.isFinite(difficulty * BASE_TIME_SECONDS * 1000)) {
    throw new RangeError('Difficulty must be a positive, finite number.')
  }
  return BASE_TIME_SECONDS * difficulty
}

/** Starts a countdown and returns a function that cancels it without expiring. */
export function startQuestionTimer(difficulty = 1, { onTick, onExpire = () => {} }) {
  const duration = getQuestionDuration(difficulty)
  const deadline = Date.now() + duration * 1000
  let previousSeconds = Math.ceil(duration)
  onTick(previousSeconds)

  const interval = setInterval(() => {
    // Use elapsed time so delayed browser callbacks do not extend the question.
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (seconds === 0) clearInterval(interval)
    if (seconds !== previousSeconds) {
      previousSeconds = seconds
      onTick(seconds)
    }
    if (seconds === 0) onExpire()
  }, 100)

  return () => clearInterval(interval)
}
