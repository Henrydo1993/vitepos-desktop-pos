const ITEMS = [
  { key: 'pos', label: 'POS', ico: '🧾', active: true },
  { key: 'dashboard', label: 'Dashboard', ico: '📊' },
  { key: 'orders', label: 'Orders', ico: '📋' },
  { key: 'category', label: 'Category', ico: '🗂️' },
  { key: 'products', label: 'Products', ico: '📦' },
  { key: 'attribute', label: 'Attribute', ico: '🏷️' },
  { key: 'barcode', label: 'Barcode', ico: '▦' },
  { key: 'customers', label: 'Customers', ico: '👥' },
]

export function Sidebar({ onOrders }: { onOrders: () => void }) {
  return (
    <div className="nav">
      <div className="logo">OPAL</div>
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className={`nav-item${it.active ? ' active' : ''}`}
          onClick={it.key === 'orders' ? onOrders : undefined}
        >
          <span className="ico">{it.ico}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}
