import type { Session } from './auth'

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
