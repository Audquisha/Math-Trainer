import api from './client'

export async function requestPractice(method = 'get', path = '', data, signal) {
  const response = await api({
    method,
    url: `/practice${path}`,
    data,
    signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken')}` },
  })
  const practice = response.data
  /** This is the actual deadline for the timer we made so it can function properly */
  if (practice?.question && practice.question.expiresAt !== null) {
    practice.question.deadline = Date.now() + Math.max(0, practice.question.expiresAt - practice.serverNow)
  }
  return practice
}
