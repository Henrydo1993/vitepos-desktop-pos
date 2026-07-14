import { describe, it, expect } from 'vitest'
import { fetchOpalAvailability } from '../src/main/api/client'

// Mocks a Session whose http.get returns the given /menu payload.
const session = (data: unknown) => ({ http: { get: async () => ({ data }) } }) as any

describe('fetchOpalAvailability', () => {
  it('maps /menu items to a flags map keyed by product id', async () => {
    const map = await fetchOpalAvailability(
      session({
        ok: true,
        items: [
          { id: 35, name: 'Trà chanh', unavailable: false, special: true },
          { id: 37, name: 'Trà thảo dược', unavailable: true, special: false },
          { id: 40, name: 'Chè thái', unavailable: false, special: false },
        ],
      }),
    )
    expect(map[35]).toEqual({ unavailable: false, special: true })
    expect(map[37]).toEqual({ unavailable: true, special: false })
    expect(map[40]).toEqual({ unavailable: false, special: false })
  })

  it('coerces missing/truthy flags to strict booleans and skips id-less rows', async () => {
    const map = await fetchOpalAvailability(
      session({ items: [{ id: 1 }, { id: 0, unavailable: true }, { name: 'no id' }] }),
    )
    expect(map[1]).toEqual({ unavailable: false, special: false })
    expect(map[0]).toBeUndefined() // id 0 is falsy → skipped
    expect(Object.keys(map)).toEqual(['1'])
  })

  it('returns an empty map when the endpoint has no items (offline/empty → keep last-known)', async () => {
    expect(await fetchOpalAvailability(session({}))).toEqual({})
    expect(await fetchOpalAvailability(session(null))).toEqual({})
  })
})
