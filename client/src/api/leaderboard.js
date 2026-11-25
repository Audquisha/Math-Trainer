import api from './client'

export async function requestLeaderboard(method = 'get', path = '', data, signal) {
  const response = await api({
    method,
    url: `/leaderboard${path}`,
    data,
    signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken')}` },
  });
  const leaderboard = response.data;

  return leaderboard;
}