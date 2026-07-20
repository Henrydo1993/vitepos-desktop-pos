import type { MenuItem, Variation, CartLine } from './types'

declare global {
  interface Shift {
    id: number
    opened_at: string
    opened_by: string | null
    opening_float: number
    closed_at?: string | null
    closed_by?: string | null
    counted_cash?: number | null
    status: string
  }
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
      orderGet: (orderId: number) => Promise<{
        id: number
        token: number
        status: string
        subtotal: number
        tax: number
        discount: number
        total: number
        tender: number
        change: number
        fee: number
        payment_method: string
        order_type: string
        table_label: string | null
        note: string | null
        customer_name: string | null
        staff_name: string | null
        voided: number
        void_reason: string | null
        created_at: string
        items: { name: string; qty: number; price: number; station: string; modifiers: string[] }[]
      } | null>
      voidOrder: (orderId: number, reason: string) => Promise<{ ok: boolean }>
      setPayment: (orderId: number, method: string) => Promise<{ ok: boolean }>
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
      syncRefresh: () => Promise<{ products: number; productsRemoved: number; pushed: number; removed: number }>
      tablesList: () => Promise<
        { label: string; area?: string; seats?: number; open: { id: number; items: number; total: number; updatedAt: string } | null }[]
      >
      openOrderGet: (
        id: number,
      ) => Promise<{ id: number; tableLabel: string; lines: CartLine[]; note: string; customerId: number | null; customerName: string | null } | null>
      openOrderReprintPrepare: (id: number) => Promise<{ ok: boolean; stations: string[] }>
      openOrderSave: (p: {
        id?: number
        tableLabel?: string
        orderType?: string
        note?: string
        customerId?: number | null
        customerName?: string | null
        staffName?: string | null
        lines?: CartLine[]
      }) => Promise<{ id: number }>
      openOrderSend: (p: { id?: number; tableLabel?: string; note?: string; staffName?: string | null; lines?: CartLine[] }) => Promise<{ id: number; printed: number }>
      openOrderClose: (id: number) => Promise<{ ok: boolean }>
      shiftCurrent: () => Promise<Shift | null>
      shiftOpen: (openingFloat: number, staffName?: string) => Promise<Shift>
      shiftSummary: () => Promise<{
        shift: Shift
        orders: number
        gross: number
        byMethod: { method: string; n: number; amt: number }[]
        cashSales: number
        cashExpected: number
      } | null>
      shiftClose: (countedCash: number | null, staffName?: string) => Promise<{ ok: boolean }>
      shiftList: () => Promise<
        { id: number; openedAt: string; closedAt: string | null; orders: number; gross: number; openingFloat: number; countedCash: number | null }[]
      >
      shiftReport: (id: number) => Promise<{ ok: boolean; printed?: boolean }>
      getSettings: () => Promise<Record<string, string>>
      saveSettings: (patch: Record<string, string>) => Promise<{ ok: boolean }>
      searchCustomers: (q: string) => Promise<
        { id: number; first_name?: string; last_name?: string; username?: string; email?: string; contact_no?: string }[]
      >
      createCustomer: (data: Record<string, unknown>) => Promise<{ ok: boolean; data: any }>
      testPrint: (cfg: { station: string; type: string; address: string }) => Promise<{ ok: boolean }>
      appInfo: () => Promise<{ version: string; lastSeen: string }>
      markSeen: () => Promise<{ ok: boolean }>
      pinStatus: () => Promise<{ set: boolean }>
      pinSet: (pin: string) => Promise<{ ok: boolean }>
      pinVerify: (pin: string) => Promise<{ ok: boolean }>
      staffList: () => Promise<{ id: number; name: string; role: string }[]>
      staffAdd: (name: string, pin: string, role: string) => Promise<{ ok: boolean; id: number }>
      staffVerify: (id: number, pin: string) => Promise<{ ok: boolean; staff?: { id: number; name: string; role: string } }>
      staffRemove: (id: number) => Promise<{ ok: boolean }>
      setStaff: (staff: { id: number; name: string; role: string } | null) => Promise<{ ok: boolean }>
      dashToday: () => Promise<{
        orders: number
        gross: number
        byMethod: { method: string; n: number; amt: number }[]
        top: { name: string; qty: number; amt: number }[]
        byStaff: { staff: string; n: number; amt: number }[]
      }>
      ordersList: (opts: { scope?: 'today' | 'all'; q?: string }) => Promise<
        {
          id: number
          token: number
          total: number
          payment_method: string
          order_type: string
          table_label: string | null
          customer_name: string | null
          staff_name: string | null
          voided: number
          synced: number
          sync_error: string | null
          created_at: string
        }[]
      >
      onOnlineOrder: (cb: (data: { token: number; total: number; items: number }) => void) => () => void
      onOpalTrouble: (
        cb: (data: { kind: 'printfail' | 'pollfail' | 'error'; id?: number; table?: string; error: string }) => void,
      ) => () => void
    }
  }
}
