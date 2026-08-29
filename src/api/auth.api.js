import axios from 'axios';

export const login = (email, password) =>
  axios.post('/auth/login', { email, password });

export const logout = (refreshToken) =>
  axios.post('/auth/logout', { refreshToken });

export const refresh = (refreshToken) =>
  axios.post('/auth/refresh', { refreshToken });