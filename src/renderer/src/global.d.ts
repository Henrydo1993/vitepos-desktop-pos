export {}

declare global {
  interface Window {
    pos: {
      syncCatalog: () => Promise<{ products: number; categories: number }>
      menu: () => Promise<import('./types').MenuItem[]>
      printers: () => Promise<{ station: string; type: string; address: string }[]>
      price: (
        lines: { price: number; qty: number; taxRate: number }[],
        d: { type: 'flat' | 'percent'; value: number } | null,
      ) => Promise<{ subtotal: number; discount: number; tax: number; total: number }>
      commit: (payload: unknown) => Promise<{ token: number; orderId: number }>
      testPrint: (cfg: { station: string; type: string; address: string }) => Promise<{ ok: boolean }>
    }
  }
}
