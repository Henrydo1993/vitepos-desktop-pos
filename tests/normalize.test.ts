import { describe, it, expect } from 'vitest'
import { normalizeProduct } from '../src/main/sync/catalog'

describe('normalizeProduct', () => {
  it('maps the live product shape (string price, name categories, entity decode)', () => {
    const n = normalizeProduct({
      id: 16,
      name: 'Cha Gio &amp; Rolls',
      price: '13.9',
      sku: '',
      categories: ['Golden &amp; Crispy'],
      taxable: 'N',
      tax_rate: 0,
      is_hidden: 'N',
      type: 'variable',
    })
    expect(n).toEqual({
      id: 16,
      name: 'Cha Gio & Rolls',
      sku: null,
      price: 13.9,
      category: 'Golden & Crispy',
      taxable: 0,
      tax_rate: 0,
      type: 'variable',
      hidden: 0,
    })
  })

  it('flags taxable + hidden products', () => {
    const n = normalizeProduct({
      id: 1,
      name: 'Iced Coffee',
      price: 5,
      categories: ['Drinks'],
      taxable: 'Y',
      tax_rate: 10,
      is_hidden: 'Y',
      type: 'simple',
    })
    expect(n).toMatchObject({ id: 1, category: 'Drinks', price: 5, taxable: 1, tax_rate: 10, hidden: 1 })
  })
})
