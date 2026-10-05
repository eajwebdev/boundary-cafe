# Boundary Cafe — Customer Ordering App, Table Ordering, Loyalty & Dashboard Overhaul

You are working in the Boundary Cafe codebase: **Laravel 12 + Inertia.js v2 + React 19 + TypeScript + Tailwind v4 + shadcn/ui**, MySQL (`db_posretail`). It is a restaurant/cafe POS with three branches (`BC-TAG`, `BC-MAB`, `BC-MAIN`). Read the existing code before changing it, follow its conventions (controller style, `MenuHelper` menu IDs, `access:<id>` middleware, `SystemSetting::get()` for config, `AdminLayout` sidebar), and work in the phases below. **At the end of each phase, run the checks listed and fix any failure before moving on.**

## Goal in one paragraph

Turn the public landing page (`/`) into a **Foodpanda-style customer ordering app that delivers only within Mabinay, Negros Oriental**. Registered customers log in from that page, order, pay COD, earn and redeem loyalty points, and **track their order live**. Inside the store, staff take **dine-in orders by table number** on a phone or tablet. Saving sends the order to the cashier as a **pending order** to be charged. Remove modules a restaurant/cafe does not need. Seed real products using the photos in `public/uploads`. Rebuild the admin dashboard as **tabs** (Sales first) instead of one long page.

---

## Facts about the current code (verified, do not re-derive)

- `routes/web.php`: `/` renders `Landing/Index` statically. `/login` is **staff** login (`LoginAuthController`, `users` table). There is no customer authentication.
- `resources/js/pages/Landing/Index.tsx` (516 lines) is a marketing page with **hard-coded** `menuGroups` arrays. It must become data-driven.
- The `orders` / `order_items` tables are **supplier purchase orders** (B2B). **Do not reuse them for customer orders.**
- `customers` already has `customer_number`, `loyalty_token`, `loyalty_enabled`, `loyalty_points`, `lifetime_points_*`, `birthday`, `email`, `contact_number`, `address`. It has **no password**.
- `App\Services\LoyaltyService` already has `quote()`, `applyToSale()` and `reverseSale()`, configured by `loyalty.enabled`, `loyalty.spend_per_point`, `loyalty.peso_per_point`, `loyalty.minimum_redeem` and `loyalty.maximum_redeem`. `sales` has `loyalty_points_earned`, `loyalty_points_redeemed` and `loyalty_discount`. **Reuse this service; do not write a second points engine.**
- `/loyalty/card/{token}` (public) and `/loyalty/lookup` exist.
- `TableOrder`, `TableOrderItem`, `DiningTable` (table `tables`), `TableOrderController` and `DiningTableController` exist, **but none of their routes are registered** in `web.php`. `TableOrder::settle()` copies only `served` items and **skips** stock/recipe deduction, the cash session, VAT, promos and loyalty.
- `Promo` model plus `promos`, `promo_products` and `promo_categories` tables exist. `HandleInertiaRequests` shares active promos **only to authenticated staff**.
- `BranchSeeder` creates `BC-MAB` "Boundary Cafe – Mabinay" (restaurant, `use_table_ordering = true`). `BoundaryCafeProductSeeder` seeds 58 menu items with **placeholder SVGs**.
- `DashboardController@index/data` and `pages/Dashboard/Index.tsx` (1,555 lines) render everything on one page.
- Stray duplicate files to delete: `app/Helpers/MenuHelper copy.php`, `app/Helpers/MenuHelper_.php`, `routes/web copy.php`, `resources/js/pages/Shop/Index copy.tsx`.

---

## Phase 1 — Remove modules a restaurant/cafe does not need

Remove each module from **all** of these places: `MenuHelper::all()` / `grouped()`, the `MENU` constant and sidebar in `AdminLayout.tsx` / `CashierLayout.tsx`, `routes/web.php`, the Settings → Modules panel, the role defaults in `User::getAccessibleMenuIds()`, and the controllers and pages themselves.

**Remove:**
- Installments (`InstallmentController`, `Installments/*`, `pos.enable_installments`)
- Services / salon (`ServicesController`, `Services/*`, menu 38)
- Brochure builder (`BrochureController`, `Brochure/*`, menu 37)
- Warehouses (`WarehouseController`, `Warehouses/*`, menu 35)
- B2B Shop / supplier order portal (`ShopController`, `Shop/*`, `Suppliers/Orders.tsx`, the supplier order confirm/ship/complete routes)
- Customer credit / utang payments (`customers/{customer}/payments`, `CustomerPayment` UI)
- Retail-only POS layouts and modes: `grocery`, `salon`, `kiosk` layouts, `laundry_mode`, `WeightAmountModal`, `RetailProductSeeder`
- The non-food business types in `Branch::businessTypes()`. Keep only `cafe`, `restaurant` and `food_stall`.

**Keep:** Dashboard, POS, Sales History, Promos, Customers + Loyalty, Products, Categories, Variants, Bundles, Recipes / Ingredient usage, Inventory, Stock Count, Stock Adjustments (losses), Stock Transfers (it has three branches), Purchase Orders + Suppliers (for buying ingredients; supplier CRUD only), Cash Sessions/Counts, Petty Cash, Expenses, Reports, Activity Logs, Users, Branches, Settings.

Rules:
- **Do not drop tables or edit old migrations.** Historical data must survive. Only remove code paths. If a removed model is referenced by a kept relationship, leave the model class in place.
- `grep` for every removed route name, page name and menu ID, and make sure nothing still links to it (`resources/js/routes.ts`, `ziggy.js`, Wayfinder output).
- Add **new** menu IDs for the new modules: `40` Online Orders, `41` Table Ordering (waiter screen), `42` Dining Tables (setup), `43` Delivery Zone settings, `44` Loyalty Program settings. Register them everywhere menu IDs live.

Check: `php artisan route:list` runs clean, `npm run types` passes, and every sidebar link opens without a 404 or 500.

---

## Phase 2 — Customer accounts (login and registration from the landing page)

Customers are **not** staff. Give them a separate auth guard so staff RBAC is untouched.

- Migration on `customers`: `password` (nullable for walk-in customers created at POS), `remember_token`, `email_verified_at` (nullable), `last_login_at`. Add unique indexes on `email` and `contact_number`. Before adding the unique indexes, de-duplicate existing rows and normalize phones to `09XXXXXXXXX`.
- Make `Customer` extend `Authenticatable`. Add a `customer` guard and provider in `config/auth.php`.
- New table `customer_addresses`: `customer_id`, `label` (Home / Work / Other), `barangay`, `street`, `landmark`, `notes_for_rider`, `lat`, `lng`, `is_default`.
- Routes under `/account` with `auth:customer`: register, login, logout, profile, addresses CRUD, order history, loyalty card. Registration requires name, mobile (PH format), email, password and a **Mabinay barangay**. Linking to an existing walk-in customer by phone is allowed, keeping their points.
- Guests **can browse the menu but cannot add to cart or check out**. Tapping "Add" as a guest opens a login/register sheet and resumes the add after login.
- Staff `/login` stays as is. A logged-in customer hitting staff routes is redirected to `/`, and a staff user hitting `/account/*` is redirected to their dashboard or POS. Update the `redirectTo` logic in `bootstrap/app.php` per guard.
- Rate-limit login and registration (`throttle`). Leave SMS OTP out of scope, but keep a `phone_verified_at` column so it can be added later.

---

## Phase 3 — The landing page becomes the customer ordering app (Foodpanda-style)

`/` is no longer just marketing. It is the storefront. Keep the brand hero and story sections short at the top or move them to `/about`. The main experience is the menu and cart.

**Data:** The page gets categories, products (image, price, variants, sold-out flag), active promos and store status **from the database** via Inertia props. Remove the hard-coded `menuGroups`. Only show products that are active and have stock at the **Mabinay branch** (`BC-MAB`); show sold-out items greyed out with a "Sold out" badge.

**Mobile-first UI.** Test at 360px, 390px and 768px widths. These requirements are mandatory:
- Sticky top bar: logo, delivery address chip ("Deliver to: Poblacion, Mabinay ▾"), account icon.
- Search bar plus a sticky, horizontally scrollable category chip row with scroll-spy.
- Product cards with photo, name, price and a large "+" button. Tapping a card opens a bottom sheet with variants, quantity stepper and item note.
- Floating "View cart · 3 items · ₱585" bar at the bottom. The cart is a full-height sheet on mobile and a right sidebar on desktop.
- Promo banner carousel driven by active promos (see Phase 6).
- Store-closed state: show opening hours and disable checkout (setting `online.store_hours`).
- Touch targets at least 44px. No horizontal scroll. `safe-area-inset` padding. Skeleton loaders. Optimized `webp` images with `loading="lazy"`.
- The cart persists across reloads in `localStorage`, keyed per customer, and is re-validated against server prices and stock on checkout.

**Checkout** (`/checkout`, `auth:customer`):
1. Fulfillment: **Delivery** or **Pickup** at the Mabinay branch.
2. Address: pick a saved address or add one on the map (below).
3. Order summary, promo code field, and a loyalty points redeem toggle with a live peso preview from `LoyaltyService::quote()`.
4. Payment: **Cash on Delivery / Pay at pickup** only. Leave a `payment_method` enum so GCash can be added later.
5. Delivery fee and minimum order come from settings (`online.delivery_fee`, `online.free_delivery_min`, `online.min_order`).
6. The server **recomputes every price, discount, fee and point**. Never trust client totals. Wrap creation in a DB transaction.

**Map — must feel like Foodpanda:**
- Use `leaflet` + `react-leaflet` with OpenStreetMap tiles (add them to `package.json`). Lazy-load the map component.
- A **fixed pin in the centre of the map**: the customer drags the map under the pin, and the address text updates on move-end. Include a "Use my current location" button (browser geolocation) and a recenter button.
- Reverse geocoding goes through a **server-side endpoint** that calls Nominatim with a proper `User-Agent`, caches results and is rate-limited. If it fails, fall back to the selected barangay.
- Draw the **delivery zone** on the map. Outside the zone, the pin turns red, a message reads "Sorry, we only deliver within Mabinay", and Confirm is disabled.
- After confirming, the customer fills in barangay (dropdown), street/purok, landmark and notes for the rider, and saves the address.

**Delivery zone — Mabinay only:**
- Store the zone in settings: Mabinay centre (approx. `9.7333, 122.9167`, Poblacion; verify) and **either** a GeoJSON polygon of the Mabinay municipal boundary (preferred; obtain it from the OSM relation for Mabinay, Negros Oriental and save it as a seed file) **or** a fallback radius in km. Admins can edit both on the Delivery Zone settings page (menu 43).
- Seed the 32 Mabinay barangays in a `barangays` table or config, verified against the official PSGC list. Admins can toggle which barangays are deliverable.
- Validate **on the server** at checkout: the point is inside the polygon (or radius) **and** the barangay is in the deliverable list. Reject otherwise.

---

## Phase 4 — Online orders and live tracking

**Schema (new tables; do not use `orders`):**
- `online_orders`: `order_number` (e.g. `BC-ONL-YYMMDD-####`), `customer_id`, `branch_id` (Mabinay), `fulfillment_type` (delivery / pickup), `status`, `payment_method`, `payment_status`, `subtotal`, `promo_id`, `promo_discount`, `loyalty_points_redeemed`, `loyalty_discount`, `delivery_fee`, `total`, a snapshot of the address (`barangay`, `street`, `landmark`, `notes_for_rider`, `lat`, `lng`), `customer_note`, `estimated_ready_at`, `accepted_at`, `preparing_at`, `ready_at`, `out_for_delivery_at`, `completed_at`, `cancelled_at`, `cancel_reason`, `cancelled_by` (customer / staff), `handled_by` (user), `sale_id` (nullable FK).
- `online_order_items`: `product_id`, `product_variant_id`, snapshots of name and price, `quantity`, `total`, `note`.
- `online_order_status_logs`: `online_order_id`, `from_status`, `to_status`, `user_id`, `note`, `created_at`. This is the tracking timeline.

**Status machine** (enforce allowed transitions in one place on the model, and log each one):
`pending → accepted → preparing → ready → out_for_delivery → completed`. Pickup orders skip `out_for_delivery`. `cancelled` is reachable from `pending` (customer or staff) and from `accepted` (staff only, reason required). `rejected` is reachable from `pending` (staff, reason required).

**Customer tracking** (`/account/orders/{order_number}`):
- Show only the customer's own orders (use a policy and return 404 for anyone else's).
- Foodpanda-style stepper with timestamps, ETA, item list, totals, points earned, the delivery address with a small static map, and the branch phone number with a tap-to-call link.
- Live updates by **polling** a lightweight JSON endpoint every 10s while the order is active; stop polling when it is completed or cancelled (broadcasting is `log` in `.env`, so no websockets). Pause polling when the tab is hidden.
- A "Cancel order" button appears only while the status is `pending`.
- Show an "Active order" pill on the landing page whenever the logged-in customer has an order in progress.

**Staff side** (menu 40, "Online Orders"):
- Kanban/board view by status: a mobile-friendly list on phones and columns on desktop. Each card shows order #, customer, phone, barangay, elapsed time, items and total.
- One-tap buttons for the next status, with Reject/Cancel requiring a reason. Includes a printable kitchen ticket.
- A new-order badge in the sidebar, an audible chime and a toast, driven by polling every 15s.
- **Completing** an order creates a `Sale` through the **same service the POS uses**. This means stock and recipe ingredient deduction, cash-session attachment, VAT, promo usage count, and loyalty `applyToSale()`. Link `sale_id`. Cancelling after points were reserved must release them. Make completion idempotent: completing twice must not create two sales or double-award points.

---

## Phase 5 — Table ordering by staff → pending at cashier

**Waiter screen** (menu 41, `/tables`, phone-first):
- A grid of the branch's tables showing table # and a colour for status (available / occupied / has pending order).
- Tap a table to open a menu picker (search, categories, variants, qty, kitchen note) with a cart, then **"Send to cashier"**.
- **Only the table # is required.** Covers, customer name and loyalty customer are optional. If a table already has an open order, new items are **appended** to it as a new round.
- Saving creates or updates a `TableOrder` (status `open`) with items in `pending`. It does **not** create a sale and does **not** take payment.

**Cashier side** (inside `/pos`):
- Add a **"Pending Orders"** tab/drawer to the POS with a count badge, polling every 10s. It lists table-order and online pickup tickets with **Table #**, item count, total, age and who took it.
- Tapping one loads its items into the POS cart, tagged with `table_order_id`. The cashier can edit items, attach a loyalty customer (existing `/loyalty/lookup`), apply promos and redeem points, then charge as normal.
- On payment, create the `Sale` through the **existing POS store logic** (not `TableOrder::settle()` as it is now). Close the table order, set `sale_id`, and set the table to `cleaning`. Rewrite or remove `settle()` so there is only one sale-creation path.
- The cashier can void a pending order (reason required). Two cashiers opening the same ticket must not double-charge: lock the row and reject if it is already closed.

**Setup** (menu 42): Dining Tables CRUD (number, section, capacity, active) using the existing `DiningTableController`. Register its routes. Update `DiningTableSeeder` to give `BC-MAB` tables 1–12.

Add a `waiter` role to `User::roles()` whose default access is only `41` (and `2` if allowed by settings). Make it selectable in Users.

---

## Phase 6 — Promos and loyalty reach the customer app

- When an admin creates or edits a promo in `/promos`, it **must show on the landing page immediately**. Add a `show_on_storefront` flag, a `banner_image`, and `channels` (`pos`, `online`, `both`). Active storefront promos appear in the banner carousel, auto-applicable promos (no code) apply in the cart, and coded promos work in the checkout promo field. Validation (dates, min purchase, max uses, product/category scope) reuses `Promo::isValid()` / `computeDiscount()` on the server. Increment `uses_count` only when an order is completed.
- Share active storefront promos with the landing page for **guests too** (a separate prop; do not expose staff-only data).
- Loyalty (menu 44 settings page): edit the existing `loyalty.*` settings. Add optional **tiers** (e.g. Bronze / Silver / Gold by lifetime points, with an earn multiplier) and a **birthday bonus**.
- Customers see their points balance, tier, progress to the next tier, transaction history and their QR loyalty card in `/account/loyalty`. Points are earned once, on completion, for online, dine-in and counter sales alike, and reversed on void via `LoyaltyService::reverseSale()`.

---

## Phase 7 — Seed data from `public/uploads`

Update `BoundaryCafeProductSeeder` so products with a matching photo use `/uploads/optimized/<file>.webp`. Keep the SVG fallback for the rest.

| File | Product |
|---|---|
| `1_chicken_meal` | Chicken Meal |
| `avocado` | Avocado (Frappes) |
| `bacon_meal` | Bacon Meal |
| `barkada_burgers` | Barkada Burgers |
| `blueberry_sparkle` | Blueberry Sparkle |
| `boundary_burger` | Boundary Burger |
| `burger_and_fries_combo` | Burger & Fries Combo |
| `chicken_burger` | Chicken Burger |
| `cookies_n_cream` | Cookies n' Cream |
| `dark_chocolate` | Dark Chocolate (Non-Coffee) |
| `fiesta_meal_a` / `fiesta_meal_b` | Fiesta Meal A / B |
| `fresh_calamansi` | Fresh Calamansi |
| `hungarian_sausage_meal` | Hungarian Sausage Meal |
| `matcha_latte` | Matcha Latte |
| `strawberry_frappe` | Strawberry (Frappes) |
| `strawberry_latte` | Strawberry Latte |
| `strawberry_sparkle` | Strawberry Sparkle |
| `taro` | Taro |
| `tocino_meal` | Tocino Meal |
| `ultimate_burger` | Ultimate Burger |

`banner` is the storefront hero and default promo banner; `logo` is the brand logo. They are not products.

Also seed:
- Mabinay barangays and the delivery zone settings.
- Online-ordering settings (fee, minimum order, store hours).
- Three demo **registered customers** with password `password`, a Mabinay address and some points.
- One storefront promo using `banner.webp`.
- A few online orders in different statuses with status logs.
- A waiter user.
- Mabinay tables 1–12.

Wire everything into `DatabaseSeeder` and make it idempotent (`updateOrCreate`). `php artisan migrate:fresh --seed` must succeed on a clean MySQL database.

---

## Phase 8 — Dashboard as tabs

Replace the single long view with tabs: shadcn `Tabs`, horizontally scrollable on mobile. Store the active tab in the URL (`/dashboard?tab=inventory`) so it survives reloads and can be shared. **Sales is the default.** Each tab loads its own data lazily from `/dashboard/data?tab=…&from=…&to=…&branch=…`, so switching tabs does not refetch everything. Keep the shared date-range and branch filters plus auto-refresh. Hide any tab the user lacks access to.

1. **Sales** (default): revenue, transactions, average ticket, gross profit, discounts given, VAT; trend vs the previous period; hourly heatmap; channel split (counter / dine-in / online); payment mix.
2. **Orders**: live counts of online orders by status, pending table orders, average prep and delivery time, cancellation/rejection rate with reasons, orders by barangay.
3. **Menu performance**: top and bottom items by quantity and revenue, category mix, items never sold in the period.
4. **Inventory**: stock health, low-stock and out-of-stock lists (with links), ingredient usage vs sales, stock losses by type, pending purchase orders.
5. **Customers & Loyalty**: new vs returning customers, top customers, points issued vs redeemed, liability (outstanding points × peso value), tier distribution, promo usage and the revenue it drove.
6. **Cash & Expenses**: open cash sessions, over/short history, expenses by category, petty cash balance, net income.

Every number must come from real queries. No placeholder or random data. Every KPI shows an empty state when it has no data, and every chart has loading skeletons. Split `Dashboard/Index.tsx` into one component per tab under `pages/Dashboard/tabs/`, and the controller into per-tab query methods or a `DashboardService`.

---

## Non-negotiables

- **Security:** the server recomputes all money. Policies cover customer-owned data. CSRF stays on. Login, register, checkout and geocode endpoints are rate-limited. Validate lat/lng and barangay server-side. Never expose staff-only shared props to the customer app.
- **Reliability:** checkout, order completion, table-order charging and loyalty movements happen in DB transactions with row locks. Status changes are idempotent. The cart survives reloads and is re-validated.
- **Responsive:** test every customer page and the waiter screen at 360px width. Check there is no horizontal scroll, the bottom bars do not cover content, and input fonts are at least 16px so iOS does not zoom.
- **Consistency:** all sales (counter, dine-in, online) flow through **one** sale-creation service, so stock, recipes, VAT, promos, loyalty and reports stay correct.

## Verification (run before saying you are done)

1. `php artisan migrate:fresh --seed` succeeds.
2. `php artisan route:list` has no removed-module routes.
3. `npm run types` and `npm run build` pass. `./vendor/bin/pint --test` passes.
4. Feature tests (PHPUnit) covering:
   - a guest cannot add to cart or check out (redirect or 401);
   - checkout outside the Mabinay zone or with a non-Mabinay barangay is rejected;
   - client-tampered prices are ignored;
   - a customer cannot view another customer's order (404);
   - the status machine rejects invalid transitions;
   - completing an online order creates exactly one sale and awards points once;
   - a waiter's table order appears in the cashier's pending list with the table #, and charging it closes the order and frees the table;
   - a promo created as `show_on_storefront` appears in the landing-page props for guests;
   - each dashboard tab endpoint returns 200 with the expected keys and respects access.
5. Manual run-through at 360px: register → set address on the map → order → staff accepts and progresses the order → the customer's tracking page updates → complete → points shown. Then: waiter sends Table 5 → cashier sees "Table 5" pending → charges it.

Finish with a short summary listing what changed, the new menu IDs, the new settings keys, the new routes, and anything left as a follow-up (e.g. SMS OTP, GCash).
