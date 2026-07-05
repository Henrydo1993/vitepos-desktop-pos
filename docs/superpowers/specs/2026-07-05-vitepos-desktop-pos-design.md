# Vitepos Desktop POS — Design Spec

**Date:** 2026-07-05
**Status:** Approved design, pre-implementation
**Working name:** `vitepos-desktop-pos` (renameable)

## 1. Goal

A custom **Windows desktop POS** for a fast-paced quick-service restaurant, replacing the Vitepos PWA. It runs as a single front-counter terminal, talks to an existing **Vitepos Pro + WooCommerce** backend over its REST API, and prioritises: rock-solid fast printing (counter + kitchen + bar), high-throughput order entry, uninterrupted operation on slow/dead internet, full ownership of the UI, and ingesting online (website) orders straight to the kitchen.

## 2. Context & constraints

- Vitepos Pro is a licensed WooCommerce POS plugin. Its PWA is a compiled Vue bundle (not editable) and its core helper logic is encrypted (`pdata.so`/`pdata.dll`). **We do not decrypt or modify the plugin.** We build a new client *around* its readable REST API and WordPress hook system.
- WooCommerce remains the system of record. The plugin already exposes offline-order sync endpoints and a Pusher-based real-time channel, which we consume.
- Backend extensions (only where the stock API is insufficient) live in a **companion WordPress plugin** using Vitepos/WordPress hooks — no core edits, upgrade-safe.

## 3. Requirements

1. Reliable, fast printing to multiple stations (counter receipt, kitchen, bar) — no printing issues.
2. Fast order entry for high volume.
3. Never interrupted by slow/down internet (local-first).
4. Full UI ownership (our own frontend).
5. Online/website orders flow into the POS and print to the kitchen.
6. Single front-counter terminal; pay-first / token workflow.

## 4. Architecture

Single Electron app on the counter terminal.

- **Renderer** — React + TypeScript (Vite). Fast touch order UI. No business-critical logic; talks to main over IPC.
- **Main process (Node)** — owns the three reliability-critical subsystems:
  - **Local database** (SQLite via `better-sqlite3`) — local source of truth: mirrored catalog, open orders, sync queue, printer config.
  - **Print engine** — raw ESC/POS to network/USB printers.
  - **Sync engine** — background, network-aware: pulls catalog, pushes offline orders, subscribes to online-order push.

```
Front-Counter Terminal (Windows · Electron)
┌───────────────────────────────────────────────┐
│  Renderer (React/TS) — fast touch order UI     │
│        ▲ IPC ▼                                 │
│  Main process (Node)                           │
│   • SQLite  — local source of truth            │
│   • Print engine → raw ESC/POS                 │
│   • Sync engine  — background, network-aware   │
└──────┬───────────────┬──────────────┬───────────┘
       │ LAN ESC/POS    │ Internet REST │ Pusher (online-order push)
       ▼                ▼               ▼
 Counter·Kitchen·Bar   Vitepos/WooCommerce (+ companion plugin)
   thermal printers
```

## 5. Backend integration

- **Auth:** WordPress login (`user_login` endpoint) → session cookie + nonce, stored securely in the main process (Electron `safeStorage`). Every request sends the `Vite-Outlet: <outlet_id>|<counter_id>` header (as the PWA does).
- **Endpoints used:** products/categories/attributes/variations, taxes, customers, orders (create/update/complete/refund), `online_order_list`, `sync_offline_order`, `sync_offline_payment`, user/auth, reports as needed.
- **Companion WordPress plugin** (separate, small): adds a **bulk/delta catalog endpoint** (mirror the whole menu in one call + fetch changes since timestamp) and is the home for future custom features. Pure hooks; no core edits.

## 6. Printing subsystem (top priority)

- **Raw ESC/POS, direct connection** (TCP for network printers, USB for counter) — bypasses the Windows print spooler entirely → sub-second prints. Library: `node-thermal-printer` (Epson TM + Star TSP).
- **Recommended hardware:** network (Ethernet) thermal printers (Epson TM-T88 / TM-T20 or Star TSP) with static IPs. USB acceptable for a single counter printer.
- **Printer registry + routing:** each printer defined (Counter / Kitchen / Bar, IP or USB); each product category mapped to a station. On order confirm: receipt → counter, food lines → kitchen, drink lines → bar, fired together.
- **Guaranteed delivery:** every ticket goes through a queue with retry and a **loud on-screen alert if a printer fails to ACK** — never silently drop a kitchen ticket. Test-print + reprint-last.
- **Cash drawer** opens via the receipt printer's ESC/POS kick command.
- **Barcode scanner:** USB HID keyboard-wedge — no driver, treated as keyboard input.

## 7. Local-first data & offline sync

- SQLite mirrors the catalog (products, categories, modifiers/addons, taxes, prices) so the menu is instant and never waits on the network.
- Orders are written locally with an offline id, print immediately, and enter a **sync queue**. The sync engine pushes them via `sync_offline_order` / `sync_offline_payment` when connectivity is available; the offline id maps to the WooCommerce order id on success.
- **No conflict resolution needed** (single terminal): catalog is server→local (server wins, delta by modified timestamp); orders are local→server (push only).
- Slow/down internet blocks nothing local — order entry, kitchen firing, printing, and cash all continue. Backlog flushes automatically on reconnect.

## 8. Online orders → kitchen

- **Ingestion (hybrid):** subscribe to Pusher (channel `_vtpos_info`, event `vtoutlet`/`vtoutlet_<outlet>`) for instant new-order signals **and** poll `online_order_list` on an interval as the guaranteed fallback (works even if Pusher is not configured).
- New online orders land in an on-screen **Online Orders queue** with a chime and, by default, **auto-print to the kitchen/bar** through the same print engine (configurable to manual-accept). Pay-first online orders are already paid, so auto-fire is correct.
- Accepting/completing calls the existing order-status endpoints.
- **Inherent limit:** online orders arrive over the internet; if the connection is fully down, new website orders reach the terminal only once it reconnects (then the poll pulls the backlog). Counter orders are unaffected.

## 9. Payments

- **Cash** — fully offline-capable.
- **Card** — via a payment terminal that owns its own connection (Stripe Terminal, already supported by Vitepos, or a standalone EFTPOS machine). The app records the result. Pure online card gateways cannot authorise while the POS is offline — out of scope by design.

## 10. Pricing authority

- **Offline:** a simple, fully-tested local calc — menu price + manual line/order discount + tax. This is the only money math that runs without the server.
- **Online-only:** coupons (Vite Coupon), Vite Rewards, role-wise discounts, and other complex promotions — the server computes the authoritative total. We do not replicate these offline (risk of money bugs; some logic lives in the encrypted core).

## 11. POS workflow & UX

- Modelled on Vitepos **Restaurant Pay-First / Basic (centralized cashier)** mode + **Token system** (order number).
- Fast menu grid (categories, items, modifiers/addons), build and **hold multiple open orders** at once, fire to kitchen/bar, receipt print + reprint, void with reason.

## 12. Kiosk & updates

Auto-launch on boot, fullscreen kiosk, single-instance, dev-tools off in production, silent auto-updates via `electron-updater`.

## 13. Testing

- **Unit:** pricing/tax/cart math; ESC/POS ticket builder.
- **Integration:** API client + sync round-trip against a staging Vitepos.
- **Hardware:** printer harness (mock ESC/POS target + real-printer smoke test).
- **E2E:** order → offline → reconnect → sync.

## 14. Out of scope (v1)

Floor table-map / waiter assignment; customer-facing display; scales; loyalty/promotions UI (beyond online-computed totals); multi-terminal / LAN hub. Each can be added later without re-architecting.

## 15. Phasing / milestones

- **Phase 1 (first usable):** Electron skeleton + auth + catalog sync + menu UI + take counter order + **print to counter/kitchen/bar** + cash payment, local-first. → running on the counter.
- **Phase 2:** offline queue + background WooCommerce sync + online-orders-to-kitchen (Pusher + poll) + card terminal + reprint/void.
- **Phase 3:** kiosk lockdown + auto-update + hardware edge cases + polish.
- **Phase 4+:** additional features/modules as needed (goals 2 & 3), each as its own small spec.

## 16. Open decisions (defaults chosen; user can override)

- Frontend framework: **React + TS** (default). Vue is viable if preferred.
- Online-order handling: **auto-print to kitchen** (default) vs manual-accept.
- Card payment method: **Stripe Terminal** vs standalone EFTPOS — user to confirm.
- App name/branding — user to provide.

## 17. Prerequisites the user must provide

1. A **test/staging Vitepos site** (WordPress + WooCommerce + Vitepos Pro, licensed) with sample menu data.
2. A **POS WordPress user** (POS role) and a configured **Outlet + Counter** in Vitepos admin.
3. A **Pusher** account (free tier) with key/secret/cluster set in Vitepos push settings (optional; enables real-time).
4. **Printer hardware + static IPs** (counter/kitchen/bar) — at least one to start — plus cash drawer and USB barcode scanner.
5. The target **Windows terminal** machine for the counter.
