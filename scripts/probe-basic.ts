import 'dotenv/config'
import axios from 'axios'
import { writeFileSync, mkdirSync } from 'node:fs'

// Verify WordPress Application Password (HTTP Basic) auth against core + Vitepos routes.
const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const USER = process.env.VITEPOS_POS_USER!
const APP = (process.env.VITEPOS_APP_PASSWORD || '').replace(/\s+/g, '')
const OUTLET = `${process.env.VITEPOS_OUTLET}|${process.env.VITEPOS_COUNTER}`
const rr = (r: string) => `/?rest_route=/vitepos/v1/${r}`
const token = Buffer.from(`${USER}:${APP}`).toString('base64')
const http = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: { Authorization: `Basic ${token}`, 'vite-outlet': OUTLET },
})

function save(name: string, data: unknown) {
  mkdirSync('fixtures', { recursive: true })
  writeFileSync(`fixtures/${name}.json`, JSON.stringify(data, null, 2))
}

async function main() {
  if (!APP) {
    console.log('Set VITEPOS_APP_PASSWORD in .env first (WP > Users > Profile > Application Passwords).')
    return
  }
  const me = await http.get('/?rest_route=/wp/v2/users/me')
  console.log('core users/me:', me.status, '| user:', me.data?.name ?? me.data?.slug ?? me.data?.code)
  const tax = await http.get(rr('product/all-taxes'))
  save('taxes', tax.data)
  console.log('taxes:', tax.status, JSON.stringify(tax.data).slice(0, 120))
  const prod = await http.post(rr('product/list'), { limit: 3, page: 1 })
  save('products', prod.data)
  const p = prod.data?.data
  const rows = p?.rowdata ?? p
  console.log('products:', prod.status, '| count:', Array.isArray(rows) ? rows.length : 'n/a')
  if (Array.isArray(rows) && rows[0]) console.log('first product keys:', Object.keys(rows[0]))
}
main().catch((e) => {
  console.error('ERR', e?.response?.status ?? '', e?.message ?? e)
  process.exit(1)
})
