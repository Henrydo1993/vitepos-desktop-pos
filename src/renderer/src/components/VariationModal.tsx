import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MenuItem, Variation } from '../types'
import { useCart } from '../state/cart'

const overlay: CSSProperties = { position: 'fixed', inset: 0, background: '#0007', display: 'grid', placeItems: 'center' }
const sheet: CSSProperties = { background: '#fff', padding: 20, borderRadius: 14, minWidth: 340, maxWidth: 420 }
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', width: '100%', padding: '12px 14px', marginBottom: 8, borderRadius: 10, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 15 }

export function VariationModal({ product, onClose }: { product: MenuItem; onClose: () => void }) {
  const [vars, setVars] = useState<Variation[]>([])
  const add = useCart((s) => s.add)

  useEffect(() => {
    window.pos.variations(product.id).then(setVars)
  }, [product.id])

  const pick = (v: Variation) => {
    add({
      id: v.id,
      name: v.name,
      price: Number(v.price),
      category: product.category,
      taxable: product.taxable,
      tax_rate: product.tax_rate,
      type: 'simple',
    })
    onClose()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{product.name}</h3>
        {vars.length === 0 && <div style={{ color: '#888' }}>Loading options…</div>}
        {vars.map((v) => (
          <button key={v.id} onClick={() => pick(v)} style={row}>
            <span>{v.name}</span>
            <span>${Number(v.price).toFixed(2)}</span>
          </button>
        ))}
        <button onClick={onClose} style={{ marginTop: 4, height: 40, width: '100%', borderRadius: 8, border: '1px solid #ccc', background: '#fff' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
