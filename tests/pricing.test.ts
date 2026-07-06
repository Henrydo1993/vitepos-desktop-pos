import { describe, it, expect } from 'vitest'
import { priceOrder } from '../src/main/order/pricing'

const line = (price: number, qty: number) => ({ price, qty, taxRate: 0.1 })

describe('priceOrder', () => {
  it('sums lines, applies tax after order discount', () => {
    const r = priceOrder([line(5, 2), line(3, 1)], { type: 'flat', value: 3 })
    expect(r).toEqual({ subtotal: 13, discount: 3, tax: 1, total: 11 })
  })
  it('percent discount + rounds to cents', () => {
    const r = priceOrder([line(4.5, 1)], { type: 'percent', value: 10 })
    expect(r).toEqual({ subtotal: 4.5, discount: 0.45, tax: 0.41, total: 4.46 })
  })
  it('no discount', () => {
    expect(priceOrder([line(2, 3)], null)).toEqual({ subtotal: 6, discount: 0, tax: 0.6, total: 6.6 })
  })
})
