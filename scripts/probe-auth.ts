import 'dotenv/config'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'

// Diagnose WP REST auth for the headless client. Prints cookie NAMES only (never values).
const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const USER = process.env.VITEPOS_POS_USER!
const PASS = process.env.VITEPOS_POS_PASS!
const rr = (r: string) => `/?rest_route=/vitepos/v1/${r}`
const names = (sc?: string[]) => (sc ?? []).map((s) => s.split('=')[0])
const TAX = (h: any, http: any) => http.get(rr('product/all-taxes'), { headers: h })

async function main() {
  // --- Approach A: nonce + cookies from the Vitepos user/login endpoint ---
  const jarA = new CookieJar()
  const A = wrapper(axios.create({ jar: jarA, baseURL: BASE, validateStatus: () => true }))
  const loginA = await A.post(rr('user/login'), { user_login: USER, user_pass: PASS })
  console.log('[A] login', loginA.status, '| set-cookie:', names(loginA.headers['set-cookie'] as string[]))
  console.log('[A] jar:', (await jarA.getCookies(BASE + '/')).map((c) => c.key))
  const nonceA = loginA.data?.data?.wp_rest_nonce
  const ta = await TAX({ 'X-WP-Nonce': nonceA, 'vite-outlet': '1|1' }, A)
  console.log('[A] taxes:', ta.status, JSON.stringify(ta.data).slice(0, 90))

  // --- Approach B: wp-login.php session cookie, then Vitepos nonce for that session ---
  const jarB = new CookieJar()
  const B = wrapper(axios.create({ jar: jarB, baseURL: BASE, validateStatus: () => true, maxRedirects: 0 }))
  await B.get('/wp-login.php')
  const form = new URLSearchParams({ log: USER, pwd: PASS, 'wp-submit': 'Log In', redirect_to: `${BASE}/wp-admin/`, testcookie: '1' })
  const wpl = await B.post('/wp-login.php', form.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  console.log('[B] wp-login', wpl.status, '| set-cookie:', names(wpl.headers['set-cookie'] as string[]))
  console.log('[B] jar:', (await jarB.getCookies(BASE + '/')).map((c) => c.key))
  const loginB = await B.post(rr('user/login'), { user_login: USER, user_pass: PASS })
  const nonceB = loginB.data?.data?.wp_rest_nonce
  const tb = await TAX({ 'X-WP-Nonce': nonceB, 'vite-outlet': '1|1' }, B)
  console.log('[B] taxes (cookie+nonce):', tb.status, JSON.stringify(tb.data).slice(0, 90))
  const me = await B.get('/?rest_route=/wp/v2/users/me', { headers: { 'X-WP-Nonce': nonceB } })
  console.log('[B] core users/me:', me.status, JSON.stringify(me.data).slice(0, 90))
  const tb2 = await B.get(rr('product/all-taxes'), { headers: { 'vite-outlet': '1|1' } })
  console.log('[B] taxes (cookie, no nonce):', tb2.status, JSON.stringify(tb2.data).slice(0, 90))
}
main().catch((e) => {
  console.error('ERR', e?.response?.status ?? '', e?.message ?? e)
  process.exit(1)
})
