import axios from 'axios'

export async function requestPractice(method = 'get', path = '', data, signal) {
  const response = await axios({
    method,
    url: `/api/practice${path}`,
    data,
    signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken')}` },
  })
  const practice = response.data
  if (practice?.question) {
    // Convert the server's remaining duration to a local deadline (clock offset safe).
    // The server independently rejects answers received after its actual deadline.
    practice.question.deadline = Date.now() + Math.max(0, practice.question.expiresAt - practice.serverNow)
  }
  return practice
}
