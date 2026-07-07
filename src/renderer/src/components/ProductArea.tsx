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
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()

export function ProductArea() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [variable, setVariable] = useState<MenuItem | null>(null)
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const add = useCart((s) => s.add)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const cached = await window.pos.menu()
      if (alive) setItems(cached)
      try {
        await window.pos.syncCatalog()
      } catch {
        /* offline — cached menu stays */
      }
      const fresh = await window.pos.menu()
      if (alive) setItems(fresh)
    })()
    return () => {
      alive = false
    }
  }, [])

  const cats = useMemo(
    () => ['All', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[]))],
    [items],
  )
  const shown = items.filter(
    (i) => (cat === 'All' || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())),
  )
  const onTap = (m: MenuItem) => (m.type === 'variable' ? setVariable(m) : add(m))

  return (
    <div className="prod">
      <div className="prod-top">
        <div className="search">
          <span>🔍</span>
          <input placeholder="Scan barcode or search product…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">
            <button className="on">Product</button>
          </div>
        </div>
        <div className="status">
          <div className="s" title="Sync">⟳</div>
          <div className="s" title="Online">📶</div>
          <div className="s" title="Cash drawer">🗄️</div>
          <div className="s avatar" title="User">H</div>
        </div>
      </div>

      <div className="cat-tabs">
        {cats.map((c) => (
          <button key={c} className={`cat-tab${c === cat ? ' active' : ''}`} onClick={() => setCat(c)}>
            <span className="ico">⊞</span>
            <span>{c === 'All' ? 'All Categories' : c}</span>
          </button>
        ))}
      </div>

      <div className="grid">
        {shown.length === 0 && <div style={{ color: 'var(--vt-text-2)' }}>No products.</div>}
        {shown.map((m) => (
          <div key={m.id} className="card" onClick={() => onTap(m)}>
            <div
              className="img"
              style={isPhoto(m.image) ? { backgroundImage: `url("${m.image}")` } : { background: tint(m.name) }}
            >
              {!isPhoto(m.image) && initials(m.name)}
              <span className="badge">new</span>
              <span className="add">{m.type === 'variable' ? '⊞' : '+'}</span>
            </div>
            <div className="cbody">
              <div className="cname">{m.name}</div>
              <div className="cprice">
                ${m.price.toFixed(2)}
                {m.type === 'variable' ? '+' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      {variable && <VariationModal product={variable} onClose={() => setVariable(null)} />}
    </div>
  )
}
