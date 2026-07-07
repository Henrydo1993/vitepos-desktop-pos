import { contextBridge, ipcRenderer } from 'electron'

const pos = {
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  menu: () => ipcRenderer.invoke('menu:list'),
  printers: () => ipcRenderer.invoke('printers:list'),
  price: (lines: unknown[], d: unknown) => ipcRenderer.invoke('order:price', lines, d),
  commit: (payload: unknown) => ipcRenderer.invoke('order:commit', payload),
  testPrint: (cfg: unknown) => ipcRenderer.invoke('print:test', cfg),
}

contextBridge.exposeInMainWorld('pos', pos)

export type PosApi = typeof pos
