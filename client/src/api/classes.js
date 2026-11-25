import api from './client'

export async function requestClasses(method = 'get', path = '', data, signal) {
  const response = await api({
    method,
    url: `/${path}`,
    data,
    signal,
    headers: { Authorization: `Bearer ${sessionStorage.getItem('accessToken')}` },
  });
  const classes = response.data;
  
  return classes;
}