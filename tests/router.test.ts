import { describe, it, expect } from 'vitest'
import { routeByStation } from '../src/main/print/router'

describe('routeByStation', () => {
  it('splits food to kitchen, drink to bar', () => {
    const items = [
      { name: 'Burger', qty: 1, station: 'kitchen' },
      { name: 'Cola', qty: 2, station: 'bar' },
      { name: 'Fries', qty: 1, station: 'kitchen' },
    ]
    expect(routeByStation(items)).toEqual({
      kitchen: [
        { name: 'Burger', qty: 1, station: 'kitchen' },
        { name: 'Fries', qty: 1, station: 'kitchen' },
      ],
      bar: [{ name: 'Cola', qty: 2, station: 'bar' }],
    })
  })
})
