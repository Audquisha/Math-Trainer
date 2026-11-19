import api from './client.js'

export async function requestPractice(method = 'get', path = '', data, signal, retryTimeout = true) {
  const requestStarted = performance.now()
  const config = {
    method,
    url: `/practice${path}`,
    data,
    signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken')}` },
  }
  let response
  try {
    response = await api(config)
  } catch (err) {
    const retryAfterMs = err.response?.data?.retryAfterMs
    if (!retryTimeout || path !== '/answer' || data?.selectedAnswer !== null || err.response?.status !== 409
        || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) throw err
    await new Promise(resolve => setTimeout(resolve, Math.ceil(retryAfterMs)))
    return requestPractice(method, path, data, signal, false)
  }
  const practice = response.data
  if (practice?.question && practice.question.expiresAt !== null) {
    const networkMs = Math.max(0, performance.now() - requestStarted - (practice.serverProcessingMs ?? 0))
    practice.question.deadline = Date.now() + Math.max(0, practice.question.expiresAt - practice.serverNow - networkMs)
  }
  return practice
}