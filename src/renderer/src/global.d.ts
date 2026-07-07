import type { MenuItem, Variation } from './types'

declare global {
  interface Window {
    pos: {
      syncCatalog: () => Promise<{ products: number; categories: number }>
      menu: () => Promise<MenuItem[]>
      printers: () => Promise<{ station: string; type: string; address: string }[]>
      variations: (productId: number) => Promise<Variation[]>
      price: (
        lines: { price: number; qty: number; taxRate: number }[],
        d: { type: 'flat' | 'percent'; value: number } | null,
      ) => Promise<{ subtotal: number; discount: number; tax: number; total: number }>
      commit: (payload: unknown) => Promise<{ token: number; orderId: number }>
      reprint: (orderId: number) => Promise<{ ok: boolean }>
      voidOrder: (orderId: number, reason: string) => Promise<{ ok: boolean }>
      recentOrders: () => Promise<
        {
          id: number
          token: number
          total: number
          payment_method: string
          voided: number
          synced: number
          sync_error: string | null
          created_at: string
        }[]
      >
      syncNow: () => Promise<{ pending: number; pushed: number }>
      getSettings: () => Promise<Record<string, string>>
      saveSettings: (patch: Record<string, string>) => Promise<{ ok: boolean }>
      searchCustomers: (q: string) => Promise<
        { id: number; first_name?: string; last_name?: string; username?: string; email?: string; contact_no?: string }[]
      >
      createCustomer: (data: Record<string, unknown>) => Promise<{ ok: boolean; data: any }>
      testPrint: (cfg: { station: string; type: string; address: string }) => Promise<{ ok: boolean }>
      appInfo: () => Promise<{ version: string; lastSeen: string }>
      markSeen: () => Promise<{ ok: boolean }>
      onOnlineOrder: (cb: (data: { token: number; total: number; items: number }) => void) => () => void
    }
  }
}
