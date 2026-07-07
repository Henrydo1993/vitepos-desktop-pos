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

## Not yet built (later phases)

- Phase 2: offline order queue + WooCommerce push, online-orders-to-kitchen (Pusher),
  card terminal, variable-product variation picker, real per-category station mapping.
- Phase 3: kiosk lockdown, auto-update, Windows installer (electron-builder).
