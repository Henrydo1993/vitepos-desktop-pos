import 'dotenv/config'
import axios from 'axios'
import { CookieJar } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { writeFileSync, mkdirSync } from 'node:fs'

// Confirmed live contract (opaldessert.com.au):
//  - /wp-json/ is 404; use the ?rest_route= form.
//  - namespace vitepos/v1; routes are kebab-case.
// Run under Node 20 (see BUILD-NOTES.md): npm run probe
const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const rr = (route: string) => `/?rest_route=/vitepos/v1/${route}`
const jar = new CookieJar()
const http = wrapper(axios.create({ jar, baseURL: BASE, validateStatus: () => true }))

function save(name: string, data: unknown) {
  mkdirSync('fixtures', { recursive: true })
  writeFileSync(`fixtures/${name}.json`, JSON.stringify(data, null, 2))
  console.log(`saved fixtures/${name}.json`)
}

async function main() {
  const login = await http.post(rr('user/login'), {
    user_login: process.env.VITEPOS_POS_USER,
    user_pass: process.env.VITEPOS_POS_PASS,
  })
  save('login', { status: login.status, data: login.data })

  const nonce = login.data?.data?.nonce ?? login.data?.nonce ?? ''
  const outletHeader = `${process.env.VITEPOS_OUTLET}|${process.env.VITEPOS_COUNTER}`
  const h = { 'X-WP-Nonce': nonce, 'vite-outlet': outletHeader }

  save('outlets', (await http.get(rr('outlet/all-outlet-list'), { headers: h })).data)
  save('categories', (await http.post(rr('product/all-categories'), { limit: 100 }, { headers: h })).data)
  save('products', (await http.post(rr('product/list'), { limit: 20, page: 1 }, { headers: h })).data)
  save('taxes', (await http.get(rr('product/all-taxes'), { headers: h })).data)
  save('online_orders', (await http.post(rr('order/online-list'), { limit: 5 }, { headers: h })).data)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
