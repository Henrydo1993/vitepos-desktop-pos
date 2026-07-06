import { describe, it, expect } from 'vitest'
import { buildKitchenTicket } from '../src/main/print/tickets'

describe('buildKitchenTicket', () => {
  it('lists qty x name + token, no prices', () => {
    const t = buildKitchenTicket({
      token: 42,
      station: 'KITCHEN',
      items: [{ name: 'Burger', qty: 2, station: 'kitchen', modifiers: ['no onion'] }],
    })
    expect(t).toContain('TOKEN #42')
    expect(t).toContain('2 x Burger')
    expect(t).toContain('no onion')
    expect(t).not.toContain('$')
  })
})
