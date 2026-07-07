import 'dotenv/config'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { writeFileSync, mkdirSync } from 'node:fs'

// Read-only live discovery: login + list outlets/counters to resolve their numeric IDs.
// Runs under any Node (no native deps). Full responses saved to gitignored fixtures/.
const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const rr = (r: string) => `/?rest_route=/vitepos/v1/${r}`
const jar = new CookieJar()
const http = wrapper(axios.create({ jar, baseURL: BASE, validateStatus: () => true }))
const save = (n: string, d: unknown) => {
  mkdirSync('fixtures', { recursive: true })
  writeFileSync(`fixtures/${n}.json`, JSON.stringify(d, null, 2))
}

async function tryLogin(body: Record<string, string>) {
  const r = await http.post(rr('user/login'), body)
  return r
}

async function main() {
  // Try the two most likely field-name conventions.
  let login = await tryLogin({ user_login: process.env.VITEPOS_POS_USER!, user_pass: process.env.VITEPOS_POS_PASS! })
  if (login.data?.status !== true) {
    const alt = await tryLogin({ username: process.env.VITEPOS_POS_USER!, password: process.env.VITEPOS_POS_PASS! })
    if (alt.data?.status === true) login = alt
  }
  save('login', { status: login.status, data: login.data })
  const d: any = login.data
  console.log('login HTTP', login.status, '| ok:', d?.status, '| msg:', d?.msg ?? d?.message ?? '')
  console.log('response keys:', Object.keys(d ?? {}), '| data keys:', d?.data ? Object.keys(d.data) : '(none)')
  const nonce = d?.data?.nonce ?? d?.nonce ?? ''
  console.log('nonce found:', !!nonce, '| len:', String(nonce).length)
  if (!nonce) {
    console.log('No nonce — inspect fixtures/login.json for the real field names.')
    return
  }

  const h = { 'X-WP-Nonce': nonce }
  const outlets = await http.get(rr('outlet/all-outlet-list'), { headers: h })
  save('outlets', { status: outlets.status, data: outlets.data })
  console.log('outlets HTTP', outlets.status)
  const arr: any = outlets.data?.data ?? outlets.data
  const list: any[] = Array.isArray(arr) ? arr : (arr?.rowdata ?? arr?.outlets ?? arr?.list ?? [])
  console.log('outlet count:', list.length)
  for (const o of list) {
    const counters = o.counters ?? o.counter_list ?? o.counter ?? []
    console.log(
      ' OUTLET id=', o.id ?? o.outlet_id, 'name=', JSON.stringify(o.name ?? o.outlet_name),
      '| counters=', JSON.stringify((Array.isArray(counters) ? counters : []).map((c: any) => ({ id: c.id ?? c.counter_id, name: c.name ?? c.counter_name }))),
    )
  }
}
main().catch((e) => {
  console.error('ERR', e?.response?.status ?? '', e?.message ?? e)
  process.exit(1)
})
