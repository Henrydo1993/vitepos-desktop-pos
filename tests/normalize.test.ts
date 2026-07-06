import { describe, it, expect } from 'vitest'
import { normalizeProduct } from '../src/main/sync/catalog'

describe('normalizeProduct', () => {
  it('normalizes a product from live shape', () => {
    const n = normalizeProduct({ id: 7, name: 'Flat White', price: '4.50', categories: [{ id: 3 }] })
    expect(n).toEqual({ id: 7, name: 'Flat White', sku: null, price: 4.5, category_id: 3, tax_class: null, hidden: 0 })
  })
})
