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

## Open items (need credentials to confirm)

- Login request field names (`user_login`/`user_pass` assumed) and where the nonce sits in the response.
- Auth mechanism specifics (WP cookie + `X-WP-Nonce`) end-to-end.
- Product/category/tax JSON field names → finalize `normalizeProduct` in `src/main/sync/catalog.ts`.
- Real `outlet_id` / `counter_id` values (from `outlet/all-outlet-list` or Vitepos admin).
