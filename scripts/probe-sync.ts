import 'dotenv/config'
import axios from 'axios'
import { buildOfflinePayload } from '../src/main/sync/orders'

// Verify the offline-order push payload against the live endpoint.
// DRY RUN by default (prints the payload). Set VITEPOS_SYNC_CONFIRM=1 to actually POST —
// which creates a REAL WooCommerce order (use a test product/category, then delete it).
const BASE = process.env.VITEPOS_BASE_URL!.replace(/\/+$/, '')
const USER = process.env.VITEPOS_POS_USER!
const APP = (process.env.VITEPOS_APP_PASSWORD || '').replace(/\s+/g, '')
const rr = (r: string) => `/?rest_route=/vitepos/v1/${r}`
const http = axios.create({
  baseURL: BASE,
  validateStatus: () => true,
  headers: {
    Authorization: `Basic ${Buffer.from(`${USER}:${APP}`).toString('base64')}`,
    'vite-outlet': `${process.env.VITEPOS_OUTLET}|${process.env.VITEPOS_COUNTER}`,
  },
})

const order = {
  id: 9999,
  token: 999,
  subtotal: 13.9,
  tax: 0,
  discount: 0,
  total: 13.9,
  tender: 20,
  change: 6.1,
  payment_method: 'cash',
  voided: 0,
  void_reason: null,
  order_type: 'takeaway',
  note: null,
  created_at: new Date().toISOString(),
}
const items = [{ product_id: 16, name: 'CHA GIO (POS test)', qty: 1, price: 13.9 }]

async function main() {
  const payload = buildOfflinePayload(order, items, process.env.VITEPOS_OUTLET!, process.env.VITEPOS_COUNTER!)
  console.log('payload:\n', JSON.stringify(payload, null, 2))
  if (process.env.VITEPOS_SYNC_CONFIRM !== '1') {
    console.log('\nDry run. Set VITEPOS_SYNC_CONFIRM=1 to POST (creates a real order).')
    return
  }
  const res = await http.post(rr('order/sync-offline-order'), payload)
  console.log('sync result:', res.status, JSON.stringify(res.data).slice(0, 400))
}
main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(1)
})
