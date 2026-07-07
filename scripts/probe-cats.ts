import 'dotenv/config'
import axios from 'axios'

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

async function tryRoute(method: 'get' | 'post', route: string) {
  const res = method === 'get' ? await http.get(rr(route)) : await http.post(rr(route), { limit: 100 })
  const d = res.data?.data
  const arr = Array.isArray(d) ? d : (d?.rowdata ?? d?.categories ?? [])
  console.log(`${method.toUpperCase()} ${route} -> ${res.status} | ${Array.isArray(arr) ? `array(${arr.length})` : typeof d}`, Array.isArray(arr) && arr[0] ? `| e.g. ${JSON.stringify(arr[0]).slice(0, 90)}` : '')
}

async function main() {
  for (const route of ['product/categories', 'product/get-all-categories', 'product/all-categories']) {
    await tryRoute('post', route)
    await tryRoute('get', route)
  }
}
main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
