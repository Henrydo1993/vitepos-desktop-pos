import type { Session } from './auth'

// Pretty-permalink REST is disabled on the target install (/wp-json/ -> 404),
// so use the ?rest_route= form. Vitepos routes are kebab-case (confirmed against
// the live namespace index at https://opaldessert.com.au/?rest_route=/vitepos/v1).
export const NS = 'vitepos/v1'
export const rr = (route: string) => `/?rest_route=/${NS}/${route}`

export async function fetchCategories(s: Session) {
  return (await s.http.post(rr('product/all-categories'), { limit: 500 })).data?.data
}

export async function fetchProducts(s: Session, page = 1, limit = 100) {
  return (await s.http.post(rr('product/list'), { page, limit })).data?.data
}

export async function fetchTaxes(s: Session) {
  return (await s.http.get(rr('product/all-taxes'))).data?.data
}
