import { useEffect, useState } from 'react'
import type { MenuItem } from '../types'
import { useCart } from '../state/cart'
import { VariationModal } from './VariationModal'

export function MenuGrid() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [variable, setVariable] = useState<MenuItem | null>(null)
  const add = useCart((s) => s.add)

  useEffect(() => {
    window.pos.menu().then(setItems)
  }, [])

  const onTap = (m: MenuItem) => (m.type === 'variable' ? setVariable(m) : add(m))

  return (
    <>
      <div className="menu-grid">
        {items.length === 0 && <div style={{ color: 'var(--vt-text-2)' }}>No products synced yet.</div>}
        {items.map((m) => (
          <button key={m.id} className="product-tile" onClick={() => onTap(m)}>
            <span className="name">{m.name}</span>
            <span className="price">
              ${m.price.toFixed(2)}
              {m.type === 'variable' ? '+' : ''}
            </span>
          </button>
        ))}
      </div>
      {variable && <VariationModal product={variable} onClose={() => setVariable(null)} />}
    </>
  )
}
