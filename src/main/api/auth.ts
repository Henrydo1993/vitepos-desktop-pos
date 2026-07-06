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
  const http = wrapper(axios.create({ jar, baseURL, validateStatus: () => true }))
  const res = await http.post('/wp-json/vitepos/v1/user/user_login', { user_login: user, user_pass: pass })
  if (res.status !== 200 || !res.data?.status) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.data)}`)
  }
  const nonce: string = res.data?.data?.nonce ?? ''
  http.defaults.headers.common['X-WP-Nonce'] = nonce
  http.defaults.headers.common['vite-outlet'] = outlet
  return { http, nonce }
}
