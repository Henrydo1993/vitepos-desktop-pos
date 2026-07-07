import { useEffect, useState } from 'react'
import type { MenuItem, Variation } from '../types'
import { useCart } from '../state/cart'

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
      image: product.image,
      taxable: product.taxable,
      tax_rate: product.tax_rate,
      type: 'simple',
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{product.name}</h3>
        {vars.length === 0 && <div style={{ color: 'var(--vt-text-2)' }}>Loading options…</div>}
        {vars.map((v) => (
          <button key={v.id} className="opt-row" onClick={() => pick(v)}>
            <span>{v.name}</span>
            <span style={{ fontWeight: 800, color: 'var(--vt-main)' }}>${Number(v.price).toFixed(2)}</span>
          </button>
        ))}
        <button className="btn" style={{ width: '100%', marginTop: 4 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
