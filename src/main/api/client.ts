import type { Session } from './auth'
import type { ReceiptConfig } from '../print/tickets'

const stripHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/﻿/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const yes = (v: unknown) => v === true || v === 'Y' || v === '1' || v === 1

// Pretty-permalink REST is disabled on the target install (/wp-json/ -> 404),
// so use the ?rest_route= form. Vitepos routes are kebab-case (confirmed live).
export const NS = 'vitepos/v1'
export const rr = (route: string) => `/?rest_route=/${NS}/${route}`

export async function fetchCategories(s: Session) {
  // GET (POST returns 404 on this install); returns [{ id, name, slug, parent_id }].
  return (await s.http.get(rr('product/all-categories'))).data?.data
}

export async function fetchProducts(s: Session, page = 1, limit = 100) {
  return (await s.http.post(rr('product/list'), { page, limit })).data?.data
}

export async function fetchTaxes(s: Session) {
  return (await s.http.get(rr('product/all-taxes'))).data?.data
}

// Variations for a variable product. Confirmed shape: data.rowdata[] with id, name, price.
export async function fetchVariations(s: Session, productId: number) {
  const res = await s.http.post(rr('product/list-variation'), { product_id: productId, id: productId, limit: 100 })
  return (res.data?.data?.rowdata ?? res.data?.data ?? []) as any[]
}

// Website orders not created by the POS. Envelope: data.rowdata[] + total.
export async function fetchOnlineOrders(s: Session, limit = 20) {
  const res = await s.http.post(rr('order/online-list'), { limit, page: 1 })
  return (res.data?.data?.rowdata ?? []) as any[]
}

// Floor plan from the opal-pos-connect plugin (public GET /tables — the same
// list the QR/waiter ordering app uses). Different namespace to Vitepos, no auth.
export async function fetchOpalTables(s: Session) {
  const res = await s.http.get('/?rest_route=/opal-pos/v1/tables')
  const rows = (Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.tables ?? [])) as any[]
  return rows
    .map((t) => ({ label: stripHtml(t.label ?? t.name), area: stripHtml(t.area ?? ''), seats: Number(t.seats) || 0 }))
    .filter((t) => t.label)
}


// Per-item availability from the opal-pos-connect plugin (public GET /menu — the same
// list the QR ordering app uses). Keyed by WooCommerce product id (== the POS product id),
// so the POS can grey/badge/block items an admin flagged in the WordPress Products list.
// No auth (public route). Returns { id: { unavailable, special } }.
export async function fetchOpalAvailability(s: Session): Promise<Record<number, { unavailable: boolean; special: boolean }>> {
  const res = await s.http.get('/?rest_route=/opal-pos/v1/menu')
  const items = (res.data?.items ?? (Array.isArray(res.data) ? res.data : [])) as any[]
  const map: Record<number, { unavailable: boolean; special: boolean }> = {}
  for (const it of items) {
    const id = Number(it.id)
    if (id) map[id] = { unavailable: it.unavailable === true, special: it.special === true }
  }
  return map
}

// Ordering-app orders straight from WooCommerce (status active + _opc_source meta).
// Vitepos online-list relays these foreign orders WITHOUT line items, so the POS could
// never print them; wc/v3 returns the full order and the POS app-password authorises it.
// Bounded to the last 3h so a first poll after an update doesn't reprint history.
export async function fetchOpalOrders(s: Session) {
  const after = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  // order=DESC (newest first): with asc, once more than per_page orders existed in the window the
  // NEWEST — i.e. the just-placed, not-yet-printed — orders fell off page 1 and never got polled,
  // so on a busy service new/added orders silently stopped printing. Fetch newest-first with extra
  // headroom, then sort ascending below so the kitchen still prints them oldest-first (FIFO).
  const res = await s.http.get(`/?rest_route=/wc/v3/orders&per_page=50&order=desc&orderby=id&after=${encodeURIComponent(after)}`)
  const orders = (Array.isArray(res.data) ? res.data : []) as any[]
  const active = new Set(['processing', 'on-hold', 'pending'])
  return orders
    .filter((o) => active.has(String(o.status)) && (o.meta_data ?? []).some((m: any) => m.key === '_opc_source'))
    .sort((a, b) => Number(a.id) - Number(b.id)) // FIFO: print the oldest un-seen order first
    .map((o) => {
      const meta = (k: string) => (o.meta_data ?? []).find((m: any) => m.key === k)?.value
      const rawNote = String(o.customer_note ?? '')
      const kitchenNote = rawNote.includes(' · ') ? rawNote.split(' · ').slice(1).join(' · ') : ''
      const guest = meta('_opc_guest_name')
      return {
        id: Number(o.id),
        source: String(meta('_opc_source') ?? ''),
        table: stripHtml(meta('_opc_table') ?? ''),
        note: [guest ? `Guest: ${guest}` : '', kitchenNote].filter(Boolean).join(' · '),
        items: ((o.line_items ?? []) as any[]).map((li) => ({
          name: stripHtml(li.name ?? 'Item'),
          qty: Number(li.quantity ?? 1),
          price: Number(li.price ?? li.total ?? 0),
          station: 'kitchen',
          modifiers: [] as string[],
          productId: Number(li.product_id ?? li.variation_id ?? 0), // for station (category) routing on the POS
        })),
      }
    })
}

// Read one WooCommerce order (used to settle a QR/waiter table onto its original order).
export async function getWcOrder(s: Session, id: number) {
  const res = await s.http.get(`/?rest_route=/wc/v3/orders/${id}`)
  return res.data
}

// Update one WooCommerce order in place — settle (complete + paid + final items) or cancel.
// Targets a known order id, so it can never spawn a new/blank order (unlike a create).
// Uses POST + method-override, not a raw PUT: nginx 405s a PUT to the ?rest_route form, and
// ?rest_route keeps this working whether or not pretty permalinks are enabled.
export async function updateWcOrder(s: Session, id: number, patch: Record<string, unknown>) {
  const res = await s.http.post(`/?rest_route=/wc/v3/orders/${id}`, patch, { headers: { 'X-HTTP-Method-Override': 'PUT' } })
  return { ok: !!res.data?.id, data: res.data }
}

// POS orders currently live on the store (WooCommerce, _is_vitepos). Used to
// reconcile local orders against the store (drop ones deleted on the store).
export async function fetchOrderList(s: Session, limit = 100) {
  const res = await s.http.post(rr('order/order-list'), { limit, page: 1 })
  const ok = res.data?.status === true
  const rows = (res.data?.data?.rowdata ?? []) as any[]
  const ids = rows.map((r) => Number(r.id ?? r.order_id ?? r.ID ?? r.order_number ?? 0)).filter((n) => n > 0)
  return { ok, rowCount: rows.length, ids }
}

// Push a locally-created order to WooCommerce.
export async function syncOfflineOrder(s: Session, payload: unknown) {
  const res = await s.http.post(rr('order/sync-offline-order'), payload)
  return { status: res.status, ok: res.data?.status === true, data: res.data }
}

export async function searchCustomers(s: Session, search = '') {
  const res = await s.http.post(rr('customer/list'), { search, keyword: search, limit: 20, page: 1 })
  return (res.data?.data?.rowdata ?? res.data?.data ?? []) as any[]
}

export async function createCustomer(s: Session, data: Record<string, unknown>) {
  const res = await s.http.post(rr('customer/create'), data)
  return { ok: res.data?.status === true, data: res.data?.data ?? res.data }
}

// Receipt/invoice template from Vitepos settings, mapped to our ReceiptConfig so
// the printed receipt matches what the owner configured in the Vitepos admin.
export async function fetchReceiptConfig(s: Session): Promise<ReceiptConfig> {
  const res = await s.http.get(rr('basic/settings'))
  const st = res.data?.data?.settings ?? {}
  const b = st.basic_settings ?? {}
  const iv = st.inv_settings ?? {}
  return {
    shopName: stripHtml(b.shop_name) || 'Receipt',
    currency: stripHtml(b.currency_symbol) || '$',
    header: stripHtml(iv.header),
    showHeader: yes(iv.show_header),
    vatReg: stripHtml(iv.vat_reg_no),
    vatRegLabel: stripHtml(iv.vat_reg_no_label) || 'Vat No',
    showVatReg: yes(iv.show_vat_reg),
    showOutletInfo: yes(iv.show_outlet_info),
    showOutletPhone: yes(iv.show_outlet_phone),
    showOutletAddress: yes(iv.show_outlet_address),
    outletPhone: '',
    outletAddress: '',
    showCounter: yes(iv.show_counter_info),
    counterLabel: stripHtml(iv.counter_operator_label) || 'Processed By',
    showCustomer: yes(iv.show_customer_info),
    showCustomerName: yes(iv.show_customer_name),
    showCustomerPhone: yes(iv.show_customer_phone),
    customerLabel: stripHtml(iv.customer_info_label) || 'Customer',
    customerPhoneLabel: stripHtml(iv.customer_phone_label) || 'Phone',
    showOrderNo: yes(iv.show_order_no),
    orderNoLabel: stripHtml(iv.order_no_label) || 'Order No',
    showOrderType: yes(iv.show_order_type),
    showTable: yes(iv.show_table_info),
    showWaiter: yes(iv.show_waiter_info),
    showDiscount: yes(iv.show_discount),
    taxLabel: stripHtml(iv.unit_tax_label) || 'Tax',
    footer: stripHtml(iv.footer),
    showFooter: yes(iv.show_footer),
    footerExtra: stripHtml(iv.footer_extra),
    pageWidth: Number(iv.page_width) || 80,
  }
}
