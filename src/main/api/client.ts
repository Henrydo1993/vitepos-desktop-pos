import type { Session } from './auth'

const NS = '/wp-json/vitepos/v1'

export async function fetchCategories(s: Session) {
  return (await s.http.post(`${NS}/product/all_categories`, { limit: 500 })).data?.data
}

export async function fetchProducts(s: Session, page = 1, limit = 100) {
  return (await s.http.post(`${NS}/product/product_list`, { page, limit })).data?.data
}

export async function fetchTaxes(s: Session) {
  return (await s.http.get(`${NS}/all_taxes`)).data?.data
}
