import 'dotenv/config'
import axios from 'axios'
import { writeFileSync, mkdirSync } from 'node:fs'

// Read-only probe of the Vitepos table + customer endpoints for Batch B.
const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const http = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: {
    Authorization: `Basic ${Buffer.from(`${process.env.VITEPOS_POS_USER}:${(process.env.VITEPOS_APP_PASSWORD || '').replace(/\s+/g, '')}`).toString('base64')}`,
    'vite-outlet': `${process.env.VITEPOS_OUTLET}|${process.env.VITEPOS_COUNTER}`,
  },
})
const rr = (r: string) => `/?rest_route=/vitepos/v1/${r}`
const save = (n: string, d: unknown) => {
  mkdirSync('fixtures', { recursive: true })
  writeFileSync(`fixtures/${n}.json`, JSON.stringify(d, null, 2))
}
const arr = (d: any) => (Array.isArray(d) ? d : (d?.rowdata ?? d?.data ?? []))

async function tryGP(route: string, body: unknown = {}) {
  const g = await http.get(rr(route))
  if (g.status === 200 && g.data?.status !== false) return { m: 'GET', res: g }
  const p = await http.post(rr(route), body)
  return { m: 'POST', res: p }
}

async function main() {
  for (const [name, route, body] of [
    ['tables', 'table/list', {}],
    ['table_orders', 'restaurant/table-order-list', { limit: 20 }],
    ['customers', 'customer/list', { limit: 10, page: 1 }],
  ] as [string, string, any][]) {
    const { m, res } = await tryGP(route, body)
    save(name, res.data)
    const a = arr(res.data?.data ?? res.data)
    console.log(`${name}: ${m} ${route} -> ${res.status} | count ${Array.isArray(a) ? a.length : 'n/a'}`)
    if (Array.isArray(a) && a[0]) console.log('   keys:', Object.keys(a[0]).join(', '))
  }
}
main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
