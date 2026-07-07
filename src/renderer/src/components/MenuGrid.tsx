import { useEffect, useState } from 'react'
import type { MenuItem } from '../types'
import { useCart } from '../state/cart'

export function MenuGrid() {
  const [items, setItems] = useState<MenuItem[]>([])
  const add = useCart((s) => s.add)
  useEffect(() => {
    window.pos.menu().then(setItems)
  }, [])
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))',
        gap: 10,
        padding: 12,
        overflow: 'auto',
        alignContent: 'start',
      }}
    >
      {items.length === 0 && <div style={{ color: '#999' }}>No products synced yet.</div>}
      {items.map((m) => (
        <button
          key={m.id}
          onClick={() => add(m)}
          style={{
            height: 96,
            borderRadius: 12,
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
          <span style={{ fontSize: 13, color: '#333' }}>${m.price.toFixed(2)}</span>
        </button>
      ))}
    </div>
  )
}
