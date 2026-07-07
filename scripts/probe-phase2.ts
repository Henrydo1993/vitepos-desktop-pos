import 'dotenv/config'
import axios from 'axios'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const USER = process.env.VITEPOS_POS_USER!
const APP = (process.env.VITEPOS_APP_PASSWORD || '').replace(/\s+/g, '')
const rr = (r: string) => `/?rest_route=/vitepos/v1/${r}`
const token = Buffer.from(`${USER}:${APP}`).toString('base64')
const http = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: { Authorization: `Basic ${token}`, 'vite-outlet': `${process.env.VITEPOS_OUTLET}|${process.env.VITEPOS_COUNTER}` },
})
const save = (n: string, d: unknown) => {
  mkdirSync('fixtures', { recursive: true })
  writeFileSync(`fixtures/${n}.json`, JSON.stringify(d, null, 2))
}

async function main() {
  const details = await http.get(rr('product/details/16'))
  save('product_details', details.data)
  const d = details.data?.data ?? {}
  console.log('details:', details.status, '| keys:', Object.keys(d))
  const vars = d.variations ?? d.product_variations ?? []
  console.log('variations in details:', Array.isArray(vars) ? vars.length : 'n/a', Array.isArray(vars) && vars[0] ? Object.keys(vars[0]) : '')

  const lv = await http.post(rr('product/list-variation'), { product_id: 16, id: 16 })
  save('list_variation', lv.data)
  console.log('list-variation:', lv.status, JSON.stringify(lv.data?.data).slice(0, 160))

  const online = await http.post(rr('order/online-list'), { limit: 5, page: 1 })
  save('online', online.data)
  const od = online.data?.data
  const rows = od?.rowdata ?? []
  console.log('online-list:', online.status, '| total:', od?.total, '| count:', rows.length)
  if (rows[0]) console.log('online order keys:', Object.keys(rows[0]))
}
main().catch((e) => {
  console.error('ERR', e?.message ?? e)
  process.exit(1)
})
