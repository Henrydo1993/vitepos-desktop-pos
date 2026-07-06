import axios, { AxiosInstance } from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'

export interface Session {
  http: AxiosInstance
  nonce: string
}

// NOTE: exact login field names + nonce location are confirmed against fixtures/login.json (plan Task 1).
export async function login(baseURL: string, user: string, pass: string, outlet: string): Promise<Session> {
  const jar = new CookieJar()
  const root = baseURL.replace(/\/+$/, '')
  const http = wrapper(axios.create({ jar, baseURL: root, validateStatus: () => true }))
  // This install's /wp-json/ is 404; the ?rest_route= form works. Routes are kebab-case.
  // Login body field names (user_login/user_pass) confirmed on first real login via `npm run probe`.
  const res = await http.post('/?rest_route=/vitepos/v1/user/login', { user_login: user, user_pass: pass })
  if (res.status !== 200 || !res.data?.status) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.data)}`)
  }
  const nonce: string = res.data?.data?.nonce ?? ''
  http.defaults.headers.common['X-WP-Nonce'] = nonce
  http.defaults.headers.common['vite-outlet'] = outlet
  return { http, nonce }
}
