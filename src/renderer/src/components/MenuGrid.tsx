import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MenuItem } from '../types'
import { useCart } from '../state/cart'
import { VariationModal } from './VariationModal'

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))',
  gap: 10,
  padding: 12,
  overflow: 'auto',
  alignContent: 'start',
}
const tile: CSSProperties = {
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
}

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
      <div style={grid}>
        {items.length === 0 && <div style={{ color: '#999' }}>No products synced yet.</div>}
        {items.map((m) => (
          <button key={m.id} onClick={() => onTap(m)} style={tile}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
            <span style={{ fontSize: 13, color: '#333' }}>
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
