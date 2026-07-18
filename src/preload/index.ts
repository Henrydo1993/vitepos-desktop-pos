import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const pos = {
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  menu: () => ipcRenderer.invoke('menu:list'),
  printers: () => ipcRenderer.invoke('printers:list'),
  variations: (productId: number) => ipcRenderer.invoke('product:variations', productId),
  price: (lines: unknown[], d: unknown) => ipcRenderer.invoke('order:price', lines, d),
  commit: (payload: unknown) => ipcRenderer.invoke('order:commit', payload),
  reprint: (orderId: number) => ipcRenderer.invoke('order:reprint', orderId),
  orderGet: (orderId: number) => ipcRenderer.invoke('order:get', orderId),
  voidOrder: (orderId: number, reason: string) => ipcRenderer.invoke('order:void', orderId, reason),
  setPayment: (orderId: number, method: string) => ipcRenderer.invoke('order:setPayment', orderId, method),
  recentOrders: () => ipcRenderer.invoke('orders:recent'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  syncRefresh: () => ipcRenderer.invoke('sync:refresh'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Record<string, string>) => ipcRenderer.invoke('settings:save', patch),
  searchCustomers: (q: string) => ipcRenderer.invoke('customer:search', q),
  createCustomer: (data: unknown) => ipcRenderer.invoke('customer:create', data),
  testPrint: (cfg: unknown) => ipcRenderer.invoke('print:test', cfg),
  appInfo: () => ipcRenderer.invoke('app:info'),
  markSeen: () => ipcRenderer.invoke('app:markSeen'),
  pinStatus: () => ipcRenderer.invoke('pin:status'),
  pinSet: (pin: string) => ipcRenderer.invoke('pin:set', pin),
  pinVerify: (pin: string) => ipcRenderer.invoke('pin:verify', pin),
  staffList: () => ipcRenderer.invoke('staff:list'),
  staffAdd: (name: string, pin: string, role: string) => ipcRenderer.invoke('staff:add', name, pin, role),
  staffVerify: (id: number, pin: string) => ipcRenderer.invoke('staff:verify', id, pin),
  staffRemove: (id: number) => ipcRenderer.invoke('staff:remove', id),
  setStaff: (staff: { id: number; name: string; role: string } | null) => ipcRenderer.invoke('auth:setStaff', staff),
  dashToday: () => ipcRenderer.invoke('dash:today'),
  ordersList: (opts: { scope?: 'today' | 'all'; q?: string }) => ipcRenderer.invoke('orders:list', opts),
  tablesList: () => ipcRenderer.invoke('tables:list'),
  openOrderGet: (id: number) => ipcRenderer.invoke('openorder:get', id),
  openOrderReprintPrepare: (id: number) => ipcRenderer.invoke('openorder:reprintPrepare', id),
  openOrderSave: (p: unknown) => ipcRenderer.invoke('openorder:save', p),
  openOrderSend: (p: unknown) => ipcRenderer.invoke('openorder:send', p),
  openOrderClose: (id: number) => ipcRenderer.invoke('openorder:close', id),
  shiftCurrent: () => ipcRenderer.invoke('shift:current'),
  shiftOpen: (openingFloat: number, staffName?: string) => ipcRenderer.invoke('shift:open', openingFloat, staffName),
  shiftSummary: () => ipcRenderer.invoke('shift:summary'),
  shiftClose: (countedCash: number | null, staffName?: string) => ipcRenderer.invoke('shift:close', countedCash, staffName),
  shiftList: () => ipcRenderer.invoke('shift:list'),
  shiftReport: (id: number) => ipcRenderer.invoke('shift:report', id),
  onOnlineOrder: (cb: (data: { token: number; total: number; items: number }) => void) => {
    const listener = (_e: IpcRendererEvent, data: { token: number; total: number; items: number }) => cb(data)
    ipcRenderer.on('online:new', listener)
    return () => ipcRenderer.removeListener('online:new', listener)
  },
  // Failures on the QR/waiter delivery path — the operator MUST see these (they used to be silent).
  onOpalTrouble: (cb: (data: { kind: 'printfail' | 'pollfail' | 'error'; id?: number; table?: string; error: string }) => void) => {
    const mk = (kind: 'printfail' | 'pollfail' | 'error') => (_e: IpcRendererEvent, data: { id?: number; table?: string; error: string }) => cb({ kind, ...data })
    const l1 = mk('printfail')
    const l2 = mk('pollfail')
    const l3 = mk('error')
    ipcRenderer.on('opal:printfail', l1)
    ipcRenderer.on('opal:pollfail', l2)
    ipcRenderer.on('opal:error', l3)
    return () => {
      ipcRenderer.removeListener('opal:printfail', l1)
      ipcRenderer.removeListener('opal:pollfail', l2)
      ipcRenderer.removeListener('opal:error', l3)
    }
  },
}

contextBridge.exposeInMainWorld('pos', pos)

export type PosApi = typeof pos
