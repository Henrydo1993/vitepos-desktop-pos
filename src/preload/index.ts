import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const pos = {
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  menu: () => ipcRenderer.invoke('menu:list'),
  printers: () => ipcRenderer.invoke('printers:list'),
  variations: (productId: number) => ipcRenderer.invoke('product:variations', productId),
  price: (lines: unknown[], d: unknown) => ipcRenderer.invoke('order:price', lines, d),
  commit: (payload: unknown) => ipcRenderer.invoke('order:commit', payload),
  reprint: (orderId: number) => ipcRenderer.invoke('order:reprint', orderId),
  voidOrder: (orderId: number, reason: string) => ipcRenderer.invoke('order:void', orderId, reason),
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
  dashToday: () => ipcRenderer.invoke('dash:today'),
  ordersList: (opts: { scope?: 'today' | 'all'; q?: string }) => ipcRenderer.invoke('orders:list', opts),
  onOnlineOrder: (cb: (data: { token: number; total: number; items: number }) => void) => {
    const listener = (_e: IpcRendererEvent, data: { token: number; total: number; items: number }) => cb(data)
    ipcRenderer.on('online:new', listener)
    return () => ipcRenderer.removeListener('online:new', listener)
  },
}

contextBridge.exposeInMainWorld('pos', pos)

export type PosApi = typeof pos
