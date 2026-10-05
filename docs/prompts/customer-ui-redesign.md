# Boundary Café — Customer Ordering UI Redesign (premium, mobile-first)

## Role

You are a **senior product designer and front-end engineer**. You have shipped consumer food-ordering apps (think the polish of Foodpanda, Grab and Uber Eats, but with a local café's personality). Before you design anything, **load the UI/UX skills available in this environment**: `ui-ux-pro-max`, `ui-styling` and `design-system`. Use them to choose type, colour, spacing and motion on purpose instead of by default.

Your job is to **redesign the customer side of the ordering app** so that it:
- feels premium, calm and fast;
- is effortless on a phone;
- is unmistakably Boundary Café, and not a generic AI-made template.

## Scope and hard constraints

**In scope:** these files, and only these files.
- `resources/js/layouts/CustomerLayout.tsx`
- `resources/js/pages/Landing/Index.tsx` (the storefront at `/`)
- `resources/js/components/storefront/*` (`ProductSheet`, `CartSheet`, `AddressPicker`, `AuthForms`)
- `resources/js/pages/Customer/*` (`Auth`, `Checkout`, `OrderTrack`, `Orders`, `Rewards`, `Account`)
- `resources/js/lib/customer.ts` (UI helpers only)
- Any new shared customer-UI components under `resources/js/components/storefront/`.

**Do not change:**
- Any Laravel route, controller, Inertia prop name or shape, or the JSON endpoints (`/checkout/quote`, `/account/orders/{n}/status`, `/geocode/reverse`).
- The cart's `localStorage` format, the polling intervals, or the "server recomputes prices" behaviour.
- Staff/admin pages. Leave them alone.

**Stack:** stay on the existing stack: React 19, Inertia v2, Tailwind v4, shadcn/ui, `lucide-react`, Leaflet / `react-leaflet` with OpenStreetMap tiles (no CARTO, it needs a key), and `tw-animate-css`. **Do not add Framer Motion or other heavy UI libraries.** Use CSS transitions and Tailwind animation.

**Must stay green:** `npm run types` must show no new errors in the files you touch, `npm run build` must pass, and `php artisan test` (23 tests) must pass.

## Brand foundation: use these, don't invent a new identity

| Element | Value |
|---|---|
| Brand orange (primary action) | `#ff5a0a` |
| Brand navy (logo) | `#062581` / dark surface `#07143d` |
| Warm canvas | cream `#fff9f2` |
| Ink | near-black `#0f172a` |
| Assets | logo `public/uploads/optimized/logo.webp`, hero/banner `banner.webp`, real food photos `public/uploads/optimized/*.webp`, placeholder illustrations for items without photos `public/images/products/boundary/*.svg` |
| Story | "Taste of Negros". The banner shows the road route between the Tagukon and Mabinay branches. That route line is the signature motif. |

Define everything as **semantic tokens** in `resources/css/app.css`, inside a customer scope (e.g. `.bc-shop`). Do not let these tokens leak into the staff theme. Define tokens for:
- surfaces: `--shop-bg`, `--shop-surface`, `--shop-surface-raised`;
- text: `--shop-ink`, `--shop-ink-muted`;
- `--shop-line`, `--shop-accent`, `--shop-accent-ink`;
- status colours: success, warning, danger;
- radii, shadows and motion durations.

Provide a **designed dark mode**. Choose dark values on purpose rather than inverting colours: the navy `#07143d` family as the base, with orange kept as the accent. Make it work under both `prefers-color-scheme` and the existing `class="dark"`.

## Typography: deliberate, not default

- **Display font:** a characterful grotesk such as **Bricolage Grotesque** (600–800), from Bunny Fonts like the existing `instrument-sans` link in `resources/views/app.blade.php`. Use it for headings, prices on cards, and the big status line on tracking.
- **Body/UI font:** **Instrument Sans** (already loaded).
- **Type scale:** fluid with `clamp()`. On mobile, the base size is 16px and inputs are at least 16px so iOS doesn't zoom. Use `tabular-nums` for every price, quantity and timer.
- **No all-caps paragraphs.** Use small-caps or letter-spaced eyebrow labels sparingly.

## Signature details (this is what keeps it from looking AI-generic)

Use **all** of these:

1. **Route-line motif.** A thin dashed orange line, drawn from the Tagukon→Mabinay route, appears in three places:
   - the hero;
   - the order-tracking progress (as an SVG path that fills as the status advances);
   - as a subtle divider in the cart.

   Don't use it anywhere else.
2. **Ticket edge.** The cart summary, the checkout summary and the receipt on the tracking page use a **perforated receipt edge** (a CSS radial-gradient notch) with a monospace order number. It should feel like a café chit.
3. **Photo-first cards.** Every product image sits on a warm tinted tile with a consistent 1:1 crop (or 4:3 on desktop), `object-cover`, and a 1px inner ring. Items without photos use the SVG illustrations on a tinted tile, so they look intentional rather than broken.
4. **Calm motion.**
   - The "+" button morphs into a −/qty/+ stepper once an item is in the cart.
   - The cart bar slides up with a gentle spring-like `cubic-bezier`.
   - The cart count does a tiny scale bump.
   - Every animation respects `prefers-reduced-motion`.
5. **Voice.** Write short, warm copy in English with light Filipino touches ("Salamat!", "Hatid na!"). No emoji walls and no "Delicious food awaits you!" filler.

**Avoid these** (each one makes it look generic):
- purple/blue gradients;
- glassmorphism on everything;
- floating blob backgrounds;
- identical drop-shadowed cards with 24px+ radius everywhere;
- centred hero text over a dark overlay as the only idea;
- Inter as the only font;
- icon-plus-heading-plus-paragraph feature grids;
- fake 5-star ratings;
- stock "fast delivery" badges.

## Layout by breakpoint

### Phones (≤ 767px) — the primary target. Design at 360 and 390 widths first.

- **Header** (56px, sticky, solid background, no blur behind content):
  - logo mark;
  - "Deliver to" address chip (barangay, Mabinay; tap it to change the address or log in);
  - points pill when logged in.
- **Status strip** (only when relevant):
  - store closed, with the opening time;
  - or an **active-order pill** with a live pulse that links to tracking.
- **Compact hero** (max ~40% of the viewport): a greeting with the customer's first name, the ETA range, and the delivery fee or "free from ₱X". **No giant hero.** The food should show above the fold.
- **Deals rail:** horizontal snap scroller of promo cards. Coded promos have a tap-to-copy code chip; auto-applied ones say so.
- **Search and category chips:** sticky directly under the header.
  - Search expands to full width on focus.
  - Chips scroll horizontally with hidden scrollbars.
  - The active chip follows the scroll position, and the chip row auto-scrolls the active chip into view.
- **Menu list:**
  - One item per row: text on the left (name, 2-line description, price), square photo on the right with a 44px "+".
  - Sold-out items are greyed and labelled, with the button disabled.
  - Section headers are sticky inside their section.
- **Floating cart bar:** sits above the bottom nav and its safe area. It shows the count, the "View cart" label and the subtotal, and is hidden when the cart is empty.
- **Bottom navigation:** Menu, Orders, Rewards, Account. Guests tapping a protected tab get the login sheet.
- **Product detail:** a bottom sheet that snaps to ~90% height.
  - Large photo; name in the display font; price.
  - Required option group with a "Required" badge.
  - Special-instructions field.
  - A sticky footer with the qty stepper and an "Add · ₱total" button.
- **Cart:** a bottom sheet on phones, showing lines with the inline stepper, the minimum-order progress bar ("₱25 more to order"), free-delivery progress, and a checkout button.

### Tablets (768–1023px)

- Two-column product grid with vertical cards (photo on top).
- Categories stay as sticky chips.
- The cart opens as a right-side sheet.

### Desktop (≥ 1024px): three-column ordering workspace, max width ~1280px

- **Left rail (≈ 220px, sticky):**
  - A **vertical category list** with item counts and an active indicator: an orange bar plus bold text.
  - Scroll-spy highlights the category in view, and clicking scrolls smoothly to it.
  - Below the list: the store-hours card and a small Boundary Rewards teaser.
- **Centre:**
  - Search bar at the top.
  - Deals rail.
  - Category sections in a 2–3 column card grid.
- **Right rail (≈ 360px, sticky):** the **persistent cart panel**, not a sheet.
  - Fulfilment toggle (delivery/pickup).
  - Line items.
  - Promo hint, fees, total, and the checkout button.
  - Empty state with an illustration.
- **Product detail:** a centred dialog (image on the left, options on the right) instead of a bottom sheet.
- **Hover states:** card lift of 2px, image scale 1.03, and visible focus rings for keyboard use.

## Other customer screens

- **Login / register:**
  - Mobile: a sheet. Desktop: a split layout with brand imagery on the left and the form on the right.
  - Two clear modes (tabs).
  - Phone number auto-formats as `0917 123 4567`.
  - Show/hide password; inline validation; friendly errors.
  - After login, resume the item the guest tried to add (the existing `bc-pending-add` behaviour).
- **Checkout:** sections as numbered steps, in this order:
  1. Fulfilment
  2. Address (map preview thumbnail of the pinned spot, plus "Change")
  3. Contact
  4. Items
  5. Promo
  6. Points (slider with a live peso value)
  7. Note
  8. Payment

  Layout:
  - **Phones:** a sticky bottom bar with the total and "Place order".
  - **Desktop:** a two-column layout with a sticky ticket-style summary.
  - Show server errors next to the section that caused them.
- **Map picker:** keep the Foodpanda pattern of a fixed centre pin while the map moves underneath, but polish it:
  - the pin lifts while dragging and drops with a small shadow;
  - the zone outline is dashed orange;
  - a "Use my location" pill;
  - a bottom card with the reverse-geocoded address and a "Confirm location" button;
  - a clear out-of-zone state.
- **Order tracking:**
  - A big status headline in the display font, with the ETA time.
  - The route-line progress fills as the status advances.
  - Vertical stepper with times.
  - "Call the café" and "Cancel" (only while pending).
  - Ticket-style receipt.
  - Points-earned callout.
  - A subtle live indicator. Polling stays exactly as it is.
- **Orders, Rewards, Account:**
  - Clean lists; active orders on top.
  - The rewards card is a premium "membership card": navy with an orange route line, QR code, tier and a progress bar.
  - Address management reuses the map picker.

## Every state must be designed

For each screen, design these states. None of them may be left as a blank screen.
- **Loading:** skeletons that match the final layout, so nothing jumps.
- **Empty:** cart, orders, search with no results.
- **Error:** the quote failed, or the user is offline. Show a retry action.
- **Store closed:** you can browse, but checkout is disabled with the reason.
- **Sold out**, both whole items and individual options.
- **Below the minimum order.**
- **Out of the delivery zone.**
- **Guest trying to order.**
- **Slow network:** buttons show a spinner and are disabled while a request is in flight.

## Accessibility and quality bar

- Contrast at WCAG AA or better in both themes.
- Touch targets of at least 44×44px.
- Visible `:focus-visible` rings.
- Correct roles and labels:
  - tablist for categories;
  - dialog for the sheets, with focus trap and Escape to close;
  - `aria-live` for cart updates and the tracking status.
- Safe-area insets respected for the notch and home bar.
- No horizontal scroll at 320px.
- Performance:
  - the hero/LCP image is preloaded and correctly sized;
  - all other images use `loading="lazy"` with fixed aspect ratios, so the layout doesn't shift (CLS < 0.05);
  - the map stays lazy-loaded.
- Lighthouse mobile targets: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95.

## Deliverables and verification

1. Before coding, write a short design rationale (≤ 15 lines) covering the token set, the type pairing, and the three signature details.
2. Implement it. Split large files into focused components, and keep the existing logic (cart hook, quote fetching, polling) intact.
3. Take screenshots with real device emulation (Chrome DevTools protocol or Playwright, **not** `--window-size`, which can't go below 500px):
   - widths 360, 390, 768, 1024 and 1440;
   - light and dark;
   - screens: storefront, product detail, cart, checkout, map picker, tracking, rewards.

   Look at each screenshot. Fix any clipping, overlap, overflow or off-brand detail before you finish.
4. Run `npm run types`, `npm run build` and `php artisan test`. Report the results honestly.
5. Finish with:
   - a before/after summary;
   - the list of files changed;
   - anything you deliberately didn't do.
