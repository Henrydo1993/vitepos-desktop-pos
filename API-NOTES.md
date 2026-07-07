# Vitepos API — Confirmed Contract (opaldessert.com.au)

Discovered read-only via the public REST namespace index. Authenticated shapes
(login response, product/order JSON) get captured with `npm run probe` once
credentials are in `.env`.

## Access

- Site: WordPress + WooCommerce on LiteSpeed (PHP 8.2).
- **`/wp-json/` returns 404** on this install (pretty-permalink REST off / not rewritten).
- **Use the query form:** `https://opaldessert.com.au/?rest_route=/vitepos/v1/<route>`.
- Namespace: `vitepos/v1` (165 routes). A second namespace `wc/pos/v1/catalog` also exists.
- Routes are **kebab-case** (the PHP method names are snake_case — do not use those as paths).

## Phase 1 routes (confirmed to exist)

| Purpose | Method | Route |
|---|---|---|
| Login | POST | `user/login` |
| Products (paginated) | POST | `product/list` |
| Categories | POST | `product/all-categories` (also `product/categories`, `product/get-all-categories`) |
| Taxes | GET | `product/all-taxes` |
| Product details | GET | `product/details/{id}` |
| Stock | GET | `product/getStock/{id}` |
| Variations | POST | `product/list-variation` |
| Barcode scan | POST | `product/scan-product` |
| Outlets | GET | `outlet/all-outlet-list`, `outlet/list` |
| Make payment | POST | `order/make-payment` |
| Complete order | POST | `order/order-complete`, `order/complete-order` |
| Online orders | POST | `order/online-list` |
| Sync offline order | POST | `order/sync-offline-order` (also `restaurant/sync-offline-order`) |
| Change status | POST | `order/change-status` |
| Kitchen order list | POST | `restaurant/kitchen-order-list` |
| Cash drawer | GET | `outlet/cash-drawer-info`, `outlet/close-drawer`, `outlet/withdraw-cash` |
| Heartbeat | GET | `system/heart-bit` |

## Resolved (verified live)

- **Auth = WordPress Application Password over HTTP Basic** (`Authorization: Basic base64(user:app_pass)`).
  Cookie + `wp_rest` nonce does **not** authenticate headlessly here (WP core `users/me` → `rest_not_logged_in`;
  `user/login` sets no cookie). See `src/main/api/auth.ts` (`makeSession`).
- **Outlet / Counter:** Opal Dessert = `1`, Front Counter = `1` → header `vite-outlet: 1|1`.
- **`user/login`** (body `user_login` / `user_pass`) works and returns `data.wp_rest_nonce` + `data.outlets`
  (the browser/PWA path) — kept for reference, not used for headless auth.
- **Product shape** (`product/list` → `data.rowdata[]`): `id`, `name` (HTML-encoded), `price` (string),
  `sku`, `categories` (array of name strings), `taxable` (`Y`/`N`), `tax_rate`, `is_hidden` (`Y`/`N`),
  `type` (`simple`/`variable`), `addons`. Mapper finalized in `src/main/sync/catalog.ts`.
- **Taxes** (`product/all-taxes`): returns tax *class* names/slugs only (no rates). Price from each product's
  own `taxable` + `tax_rate`.

## Open (Phase 2)

- Variable products (`type: "variable"`) need variation selection + per-variation pricing
  (`product/list-variation` or `product/details/{id}`). The current live menu (e.g. CHA GIO) is variable.
