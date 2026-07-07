# Running Vitepos Desktop POS

The app is code-complete for Phase 1: Application-Password login → menu sync →
touch order entry → cash payment → receipt + kitchen/bar tickets, all local-first.

## Requirements

- **Node 20 LTS** (`better-sqlite3` ships prebuilt binaries for it — avoids the native
  compile that fails on this Mac; see `BUILD-NOTES.md`).
- Target platform is the **Windows counter terminal**; it also runs on macOS/Linux with Node 20.

## First run

```bash
nvm install 20 && nvm use 20
npm install
npx electron-rebuild -f -w better-sqlite3   # rebuild native module for Electron's ABI
npm run dev
```

On launch the app authenticates via the Application Password in `.env`, syncs the menu
from opaldessert.com.au, and shows the order screen (Opal Dessert · Front Counter).

`.env` must contain (already set except printers):

```
VITEPOS_BASE_URL=https://opaldessert.com.au
VITEPOS_POS_USER=henrydo
VITEPOS_APP_PASSWORD=<application password>
VITEPOS_OUTLET=1
VITEPOS_COUNTER=1
PRINTER_COUNTER=tcp://<ip>:9100
PRINTER_KITCHEN=tcp://<ip>:9100
PRINTER_BAR=tcp://<ip>:9100
POS_KIOSK=0            # 1 = fullscreen kiosk lockdown (ignored in dev)
SYNC_INTERVAL_MS=15000 # background WC-sync + online-order poll cadence
```

## Printers

Printer IPs are read from `.env` and seeded into the local DB on first run:

- **counter** → receipt + cash-drawer kick
- **kitchen** → food lines (kitchen ticket, no prices)
- **bar** → drink lines

Routing is by product category/name keyword (Phase 1 heuristic). Network ESC/POS
printers (Epson TM / Star TSP) listen on port **9100**. To change IPs later, edit the
`printers` table or delete `pos.db` (in the app's userData dir) to re-seed from `.env`.

## Verify (checklists)

```bash
npm test                          # unit tests: pricing, routing, tickets, mapper
npm run probe:basic               # confirm live API auth + product fetch
npx tsc -p tsconfig.json --noEmit # typecheck main/preload
npx tsc -p tsconfig.web.json --noEmit
```

## Phase 2 + 3 (now included)

- **Offline queue → WooCommerce push**: orders save locally and push in the background
  with retries (`order/sync-offline-order`); the Orders panel shows ✓ synced / ⏳ pending.
- **Online orders → kitchen**: polls `order/online-list` (~every 15s) and auto-prints new
  website orders to the kitchen/bar with an on-screen toast.
- **Variable products**: tapping one opens a variation picker with real per-variation price.
- **Card tender**: external terminal (records the method; the app is not the card processor).
- **Void (with reason) + reprint** from the Orders panel.
- **Kiosk lockdown**: `POS_KIOSK=1` → fullscreen, no menu. Single-instance enforced.
- **Auto-update** via electron-updater (needs a publish feed set in the `build` config).

> ⚠️ The **offline-sync and online-order payload field names are inferred** (no offline
> order or website order existed live to confirm against). Verify on-site:
> `npm run probe:sync` prints the payload (dry run); `VITEPOS_SYNC_CONFIRM=1 npm run probe:sync`
> creates one real test order. Adjust `src/main/sync/orders.ts` / `online.ts` if rejected.

## Build the Windows installer

```bash
npm run dist   # electron-vite build + electron-builder --win (NSIS) → dist/
```

Run on Windows (native modules rebuild for Electron there). For auto-update, add a
`publish` target under `build` in package.json.
