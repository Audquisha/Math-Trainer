import api from './client'

export async function login({ user, pwd }) {
  const { data } = await api.post('/auth/login', { user, pwd })
  return data
}

export async function register({ firstName, lastName, role, user, pwd }) {
  const { data } = await api.post('/auth/register', { firstName, lastName, role, user, pwd })
  return data
}
