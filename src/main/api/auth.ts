import axios, { AxiosInstance } from 'axios'

export interface Session {
  http: AxiosInstance
}

// Headless auth uses a WordPress Application Password over HTTP Basic — the official
// method for non-browser clients. The cookie + wp_rest nonce path (user/login) does NOT
// authenticate REST requests headlessly on this install (WP reports rest_not_logged_in);
// it is designed for same-origin browser JS. See API-NOTES.md.
export function makeSession(baseURL: string, user: string, appPassword: string, outlet: string): Session {
  const root = baseURL.replace(/\/+$/, '')
  const token = Buffer.from(`${user}:${appPassword.replace(/\s+/g, '')}`).toString('base64')
  const http = axios.create({
    baseURL: root,
    validateStatus: () => true,
    headers: {
      Authorization: `Basic ${token}`,
      'vite-outlet': outlet,
    },
  })
  return { http }
}
