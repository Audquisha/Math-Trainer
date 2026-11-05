import api from './client'

export async function requestProfile(method = 'get', path = '', data, signal) {
  const response = await api({
    method,
    url: `/profile${path}`,
    data,
    signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken')}` },
  });
  const profile = response.data;
  
  return profile;
}
