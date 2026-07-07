import { useEffect, useMemo, useState } from 'react'
import type { MenuItem } from '../types'
import { useCart } from '../state/cart'
import { VariationModal } from './VariationModal'

const isPhoto = (img: string | null) => !!img && !/placeholder/i.test(img)

function tint(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `linear-gradient(135deg, hsl(${h} 62% 58%), hsl(${(h + 40) % 360} 64% 46%))`
}
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()

export function MenuGrid() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [variable, setVariable] = useState<MenuItem | null>(null)
  const [cat, setCat] = useState('All')
  const add = useCart((s) => s.add)

  useEffect(() => {
    window.pos.menu().then(setItems)
  }, [])

  const cats = useMemo(
    () => ['All', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[]))],
    [items],
  )
  const shown = cat === 'All' ? items : items.filter((i) => i.category === cat)
  const onTap = (m: MenuItem) => (m.type === 'variable' ? setVariable(m) : add(m))

  return (
    <>
      {cats.length > 1 && (
        <div className="cat-bar">
          {cats.map((c) => (
            <button key={c} className={`chip${c === cat ? ' active' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="menu-grid">
        {shown.length === 0 && <div style={{ color: 'var(--vt-text-2)' }}>No products.</div>}
        {shown.map((m) => (
          <button key={m.id} className="product-tile" onClick={() => onTap(m)}>
            {isPhoto(m.image) ? (
              <div className="thumb" style={{ backgroundImage: `url("${m.image}")` }} />
            ) : (
              <div className="thumb ph" style={{ background: tint(m.name) }}>
                {initials(m.name)}
              </div>
            )}
            <div className="body">
              <span className="name">{m.name}</span>
              <span className="price">
                ${m.price.toFixed(2)}
                {m.type === 'variable' ? '+' : ''}
              </span>
            </div>
          </button>
        ))}
      </div>
      {variable && <VariationModal product={variable} onClose={() => setVariable(null)} />}
    </>
  )
}
