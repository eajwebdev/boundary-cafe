/*
 * Boundary Café quotation — interactive plan & add-on calculator.
 * Each page sets window.QUOTE (prices, labels, terms) before loading this file.
 * Plan features and add-on descriptions are shared by both pages and live here.
 */
(function () {
  'use strict';

  var Q = window.QUOTE;
  var MAX_BRANCHES = 20;
  var MAX_MONTHS = 36;
  var DISCOUNT_PERCENT = Math.max(0, Math.min(100, Number(Q.discountPercent) || 0));
  var HTML2PDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

  var PLAN_INFO = {
    standard: {
      name: 'Standard',
      tagline: 'For a single café that needs a fast counter and clean books.',
      chips: ['Unlimited staff accounts', 'Email & chat support'],
      groups: [
        ['Point of sale', [
          'POS for dine-in & take-out, split tender and receipts',
          'Sales history, voids and reprints',
          'Customers with Boundary Rewards loyalty',
        ]],
        ['Menu, inventory & purchasing', [
          'Products & categories with photos',
          'Inventory, stock levels and stock count',
          'Purchase orders, goods receiving (GRN) and suppliers',
        ]],
        ['Cash & reports', [
          'Cash sessions, cash counts and petty cash',
          'Expenses and expense categories',
          'Daily summary, sales, inventory and expense reports',
          'Tabbed analytics dashboard',
        ]],
        ['Administration', [
          'Users, roles and module access',
          'System settings and activity logs',
          'Custom domain & branding',
        ]],
      ],
    },
    advance: {
      name: 'Advance',
      tagline: 'For a growing restaurant that needs to track food costs and run promotions.',
      chips: ['Unlimited staff accounts', 'Priority support'],
      recommended: true,
      plus: [
        'Recipes & ingredient costing, with automatic stock deduction',
        'Ingredient usage report',
        'Product variants, add-ons and bundles / meal sets',
        'Losses & damages, and stock transfers between branches',
        'Promos & discounts, shown on the POS and storefront',
        'Loyalty tiers and birthday bonus points',
        'Priority support with daily backups',
      ],
    },
  };

  var ADDON_INFO = {
    storefront: {
      name: 'Online Storefront',
      desc: 'Customer ordering website with sign-up and login, Mabinay delivery-zone map, live order tracking, and an online orders board for staff.',
    },
    table: {
      name: 'Table Ordering',
      desc: 'Waiters take orders on a phone by table number. Orders go to the cashier as pending, and you manage the dining-table layout.',
    },
    epayment: {
      name: 'E-Payment Integration (PayMongo)',
      desc: 'Accept GCash, Maya, cards and QR Ph online and at the counter through PayMongo. Payments are confirmed automatically on the order.',
    },
    promos: {
      name: 'Promos & Discounts',
      desc: 'Percentage, fixed and item promos with schedules. Promos appear automatically on the POS and the storefront.',
    },
    recipes: {
      name: 'Recipe & Ingredient Costing',
      desc: 'Recipes, automatic ingredient deduction on every sale, an ingredient usage report, and losses & damages.',
    },
    support: {
      name: 'Priority Support & Daily Backup',
      desc: 'Same-day response during business hours and daily off-site backups. Standard plans get weekly backups.',
    },
  };

  var FREE_MODULES = [
    ['Loyalty Rewards', 'Points on every purchase, redeemable at the POS and online.'],
    ['Custom Domain & Branding', 'Your own web address, SSL, and your logo and colours.'],
    ['Analytics Dashboard Pro', 'Tabbed dashboard for sales, inventory, customers and orders, plus the expense report.'],
    ['Purchasing & Suppliers', 'Purchase orders, goods receiving (GRN) and a supplier directory.'],
  ];

  Object.keys(Q.addonText || {}).forEach(function (id) { Object.assign(ADDON_INFO[id], Q.addonText[id]); });
  if (Q.freeModules) FREE_MODULES = Q.freeModules;

  function featureText(feature) {
    return (Q.featureText && Q.featureText[feature]) || feature;
  }

  // ── Client & project (System Settings → Quotation) ─────
  // Start from the text written in the page, then replace it with the admin's values when the app is reachable.
  var DETAILS_URL = Q.detailsUrl || '../../quotation/details';
  var details = {};
  document.querySelectorAll('[data-q]').forEach(function (node) { details[node.dataset.q] = node.textContent; });
  var pageTitleClient = details.client_name;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function applyDetails(data) {
    var incoming = {
      client_name: data.client_name,
      client_address: data.client_address,
      project_name: data.project_name,
      project_note: data.project_note && data.project_note[Q.detailsKey],
    };
    Object.keys(incoming).forEach(function (key) {
      if (typeof incoming[key] === 'string' && incoming[key].trim()) details[key] = incoming[key].trim();
    });
    document.querySelectorAll('[data-q]').forEach(function (node) { node.textContent = details[node.dataset.q]; });
    document.title = document.title.replace(pageTitleClient, details.client_name);
    pageTitleClient = details.client_name;
    renderTerms();
  }

  function loadDetails() {
    if (!window.fetch) return;
    fetch(DETAILS_URL, { headers: { Accept: 'application/json' } })
      .then(function (response) { return response.ok ? response.json() : Promise.reject(response.status); })
      .then(applyDetails)
      .catch(function () { /* app not reachable (e.g. opened as a plain file): keep the page's own text */ });
  }

  function termText(text) {
    return escapeHtml(text).replace(/\{client\}/g, escapeHtml(details.client_name));
  }

  var ICONS = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2M6 14h12v7H6z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/></svg>',
  };

  // ── State ──────────────────────────────────────────────
  var state = { plan: 'advance', branches: 1, months: Q.hasMonths ? (Q.defaultMonths || 12) : 1, addons: new Set() };

  function readStateFromUrl() {
    var params = new URLSearchParams(window.location.search);
    if (PLAN_INFO[params.get('plan')]) state.plan = params.get('plan');
    var branches = parseInt(params.get('branches'), 10);
    if (branches >= 1) state.branches = Math.min(branches, MAX_BRANCHES);
    var months = parseInt(params.get('months'), 10);
    if (Q.hasMonths && months >= 1) state.months = Math.min(months, MAX_MONTHS);
    (params.get('addons') || '').split(',').forEach(function (id) {
      if (findAddon(id)) state.addons.add(id);
    });
  }

  function writeStateToUrl() {
    var params = new URLSearchParams();
    params.set('plan', state.plan);
    params.set('branches', String(state.branches));
    if (Q.hasMonths) params.set('months', String(state.months));
    if (state.addons.size) params.set('addons', Array.from(state.addons).join(','));
    history.replaceState(null, '', window.location.pathname + '?' + params.toString());
  }

  function shareUrl() {
    return window.location.origin + window.location.pathname + window.location.search;
  }

  // ── Pricing ────────────────────────────────────────────
  function findAddon(id) {
    return Q.addons.filter(function (addon) { return addon.id === id; })[0];
  }

  function isIncluded(addon) {
    return addon.includedIn.indexOf(state.plan) !== -1;
  }

  function computeQuote() {
    var planPrice = Q.plans[state.plan];
    var paid = [];
    var included = [];
    Q.addons.forEach(function (addon) {
      if (isIncluded(addon)) included.push(addon);
      else if (state.addons.has(addon.id)) paid.push(addon);
    });
    var addonsTotal = paid.reduce(function (sum, addon) { return sum + addon.price; }, 0);
    var includedValue = included.reduce(function (sum, addon) { return sum + addon.price; }, 0);
    var perBranch = planPrice + addonsTotal;
    // The discount is applied to each payment (each month, or the one-time fee) so every invoice is a whole peso.
    var periodGross = perBranch * state.branches;
    var periodNet = Math.round(periodGross * (1 - DISCOUNT_PERCENT / 100));
    var subtotal = periodGross * state.months;
    var total = periodNet * state.months;
    return {
      planPrice: planPrice,
      paid: paid,
      included: included,
      addonsTotal: addonsTotal,
      includedValue: includedValue,
      perBranch: perBranch,
      branches: state.branches,
      months: state.months,
      periodNet: periodNet,
      subtotal: subtotal,
      discountPercent: DISCOUNT_PERCENT,
      discount: subtotal - total,
      total: total,
    };
  }

  // Rows between the line items and the total: per branch, branches, months, subtotal, discount.
  function calcRows(quote) {
    var rows = [
      [Q.perBranchLabel, peso(quote.perBranch)],
      ['Branches', '× ' + quote.branches],
    ];
    if (Q.hasMonths) rows.push(['Months', '× ' + quote.months]);
    if (quote.discount) {
      rows.push(['Subtotal', peso(quote.subtotal)]);
      rows.push(['Discount (' + quote.discountPercent + '%)', '−' + peso(quote.discount), 'is-discount']);
    }
    return rows;
  }

  function monthsLabel(months) {
    return months + ' month' + (months === 1 ? '' : 's');
  }

  function peso(amount) {
    return '₱' + Math.round(amount).toLocaleString('en-PH');
  }

  // ── Rendering ──────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function renderMasthead() {
    el('meta').innerHTML = metaRows();
  }

  function metaRows() {
    return [
      ['Quotation no.', Q.number],
      ['Date issued', Q.issued],
      ['Valid until', Q.validUntil],
      [Q.billingKey, Q.billingValue],
    ].map(function (row) { return '<dt>' + row[0] + '</dt><dd>' + row[1] + '</dd>'; }).join('');
  }

  function featureGroupsHtml(planId) {
    var info = PLAN_INFO[planId];
    if (info.plus) {
      return '<div class="feature-group"><h4>Everything in Standard, plus</h4><ul class="feature-list plus">' +
        info.plus.map(function (f) { return '<li>' + featureText(f) + '</li>'; }).join('') + '</ul></div>';
    }
    return info.groups.map(function (group) {
      return '<div class="feature-group"><h4>' + group[0] + '</h4><ul class="feature-list">' +
        group[1].map(function (f) { return '<li>' + featureText(f) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }

  function renderPlans() {
    el('plans').innerHTML = Object.keys(PLAN_INFO).map(function (planId) {
      var info = PLAN_INFO[planId];
      var chips = info.chips.concat(Q.extraChips || []);
      return '<label class="plan" data-plan="' + planId + '">' +
        '<input type="radio" name="plan" value="' + planId + '">' +
        '<div class="plan-head"><span class="radio" aria-hidden="true"></span>' +
          '<h3 class="plan-name">' + info.name + '</h3>' +
          (info.recommended ? '<span class="badge-rec">Recommended</span>' : '') +
        '</div>' +
        '<p class="plan-tagline">' + info.tagline + '</p>' +
        '<p class="plan-price"><strong class="tabular">' + peso(Q.plans[planId]) + '</strong><span>' + Q.planSuffix + '</span></p>' +
        '<ul class="chips">' + chips.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' +
        '<div class="plan-features" id="features-' + planId + '">' + featureGroupsHtml(planId) + '</div>' +
        '<button type="button" class="plan-toggle" data-toggle="' + planId + '" aria-controls="features-' + planId + '"></button>' +
      '</label>';
    }).join('');

    el('plans').addEventListener('change', function (event) {
      if (event.target.name !== 'plan') return;
      state.plan = event.target.value;
      update();
    });

    // Collapse feature lists on small screens so the add-ons stay close to the plans.
    var collapsed = window.matchMedia('(max-width: 720px)').matches;
    document.querySelectorAll('.plan-toggle').forEach(function (button) {
      var features = el('features-' + button.dataset.toggle);
      setFeaturesOpen(button, features, !collapsed);
      button.addEventListener('click', function (event) {
        event.preventDefault();
        setFeaturesOpen(button, features, features.hidden);
      });
    });
  }

  function setFeaturesOpen(button, features, open) {
    features.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Hide features' : 'Show all features';
  }

  function renderFreeModules() {
    el('free-modules').innerHTML = FREE_MODULES.map(function (mod) {
      return '<div class="free-card"><p class="free-tag">FREE</p><strong>' + mod[0] + '</strong><p>' + mod[1] + '</p></div>';
    }).join('');
  }

  function renderAddons() {
    el('addons').innerHTML = Q.addons.map(function (addon) {
      var info = ADDON_INFO[addon.id];
      return '<label class="addon" data-addon="' + addon.id + '">' +
        '<input type="checkbox" value="' + addon.id + '" aria-describedby="desc-' + addon.id + '">' +
        '<span class="switch" aria-hidden="true"></span>' +
        '<div><p class="addon-name">' + info.name + '</p><p class="addon-desc" id="desc-' + addon.id + '">' + info.desc + '</p></div>' +
        '<div class="addon-price tabular"></div>' +
      '</label>';
    }).join('');

    el('addons').addEventListener('change', function (event) {
      var id = event.target.value;
      if (!findAddon(id) || isIncluded(findAddon(id))) return;
      if (event.target.checked) state.addons.add(id);
      else state.addons.delete(id);
      update();
    });
  }

  function syncControls() {
    document.querySelectorAll('.plan').forEach(function (card) {
      var selected = card.dataset.plan === state.plan;
      card.classList.toggle('is-selected', selected);
      card.querySelector('input').checked = selected;
    });

    document.querySelectorAll('.addon').forEach(function (row) {
      var addon = findAddon(row.dataset.addon);
      var included = isIncluded(addon);
      var on = !included && state.addons.has(addon.id);
      var input = row.querySelector('input');
      input.checked = included || on;
      input.disabled = included;
      row.classList.toggle('is-included', included);
      row.classList.toggle('is-on', on);
      row.querySelector('.addon-price').innerHTML = included
        ? '<s>' + peso(addon.price) + ' ' + Q.addonSuffix + '</s><span class="pill pill-inc">Included in ' + PLAN_INFO[state.plan].name + '</span>'
        : '<strong>' + peso(addon.price) + ' ' + Q.addonSuffix + '</strong><span class="pill ' + (on ? 'pill-on">Added' : 'pill-add">Add-on') + '</span>';
    });
  }

  function renderSummary() {
    var quote = computeQuote();
    var planName = PLAN_INFO[state.plan].name;

    var lines = '<li class="is-plan"><span>' + planName + ' plan</span><span class="tabular">' + peso(quote.planPrice) + '</span></li>';
    lines += quote.paid.length
      ? quote.paid.map(function (addon) {
          return '<li><span>' + ADDON_INFO[addon.id].name + '</span><span class="tabular">' + peso(addon.price) + '</span></li>';
        }).join('')
      : '<li class="is-empty"><span>No paid add-ons selected</span><span></span></li>';
    lines += quote.included.map(function (addon) {
      return '<li class="is-included"><span>' + ADDON_INFO[addon.id].name + '</span><span>Included</span></li>';
    }).join('');
    lines += '<li class="is-muted"><span>' + FREE_MODULES.length + ' free modules</span><span>Free</span></li>';

    el('summary-lines').innerHTML = lines;
    el('summary-calc').innerHTML = calcRows(quote).map(function (row) {
      return '<li class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span class="tabular">' + row[1] + '</span></li>';
    }).join('');
    el('total-label').textContent = Q.totalLabel(quote);
    el('total-value').textContent = peso(quote.total);
    el('total-note').textContent = Q.totalNote(quote, peso);
    el('discount-badge').hidden = !quote.discount;
    el('discount-badge').textContent = quote.discountPercent + '% discount applied';
    el('summary-extras').innerHTML = Q.extras(quote).map(function (row) {
      return '<li><span>' + row[0] + '</span><span class="tabular">' + peso(row[1]) + '</span></li>';
    }).join('');
    el('savings').textContent = quote.includedValue
      ? planName + ' includes ' + peso(quote.includedValue * state.branches) + ' worth of add-ons' +
        (Q.savingsSuffix ? ' ' + Q.savingsSuffix : '') + ' at no extra cost.'
      : '';

    el('mobile-total').textContent = peso(quote.total);
    el('mobile-label').textContent = Q.totalLabel(quote) + ' · ' + planName;

    el('branch-count').value = state.branches;
    el('branch-minus').disabled = state.branches <= 1;
    el('branch-plus').disabled = state.branches >= MAX_BRANCHES;
    if (Q.hasMonths) {
      el('month-count').value = state.months;
      el('month-minus').disabled = state.months <= 1;
      el('month-plus').disabled = state.months >= MAX_MONTHS;
      document.querySelectorAll('[data-months]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(Number(chip.dataset.months) === state.months));
      });
    }
  }

  function renderTerms() {
    el('terms').innerHTML = Q.terms.map(function (term) {
      return '<li><span><b>' + escapeHtml(term[0]) + '</b> ' + termText(term[1]) + '</span></li>';
    }).join('');
  }

  function update() {
    syncControls();
    renderSummary();
    writeStateToUrl();
  }

  // ── Branch stepper ─────────────────────────────────────
  function setBranches(count) {
    state.branches = Math.max(1, Math.min(MAX_BRANCHES, count || 1));
    update();
  }

  function setMonths(count) {
    state.months = Math.max(1, Math.min(MAX_MONTHS, count || 1));
    update();
  }

  function bindBranches() {
    el('branch-minus').addEventListener('click', function () { setBranches(state.branches - 1); });
    el('branch-plus').addEventListener('click', function () { setBranches(state.branches + 1); });
    el('branch-count').addEventListener('change', function (event) { setBranches(parseInt(event.target.value, 10)); });
    if (!Q.hasMonths) return;
    el('month-minus').addEventListener('click', function () { setMonths(state.months - 1); });
    el('month-plus').addEventListener('click', function () { setMonths(state.months + 1); });
    el('month-count').addEventListener('change', function (event) { setMonths(parseInt(event.target.value, 10)); });
    document.querySelectorAll('[data-months]').forEach(function (chip) {
      chip.addEventListener('click', function () { setMonths(Number(chip.dataset.months)); });
    });
  }

  // ── Downloadable document ──────────────────────────────
  function buildDocument() {
    var quote = computeQuote();
    var info = PLAN_INFO[state.plan];
    var branchWord = state.branches === 1 ? 'branch' : 'branches';

    var rows = '<tr><td><div class="doc-item">' + info.name + ' plan</div><div class="doc-desc">' + info.tagline + '</div></td>' +
      '<td>Base plan</td><td>' + peso(quote.planPrice) + '</td></tr>';
    rows += quote.paid.map(function (addon) {
      return '<tr><td><div class="doc-item">' + ADDON_INFO[addon.id].name + '</div><div class="doc-desc">' + ADDON_INFO[addon.id].desc + '</div></td>' +
        '<td>Add-on</td><td>' + peso(addon.price) + '</td></tr>';
    }).join('');
    rows += quote.included.map(function (addon) {
      return '<tr><td><div class="doc-item">' + ADDON_INFO[addon.id].name + '</div><div class="doc-desc">' + ADDON_INFO[addon.id].desc + '</div></td>' +
        '<td class="doc-inc">Included</td><td class="doc-inc">' + peso(0) + '</td></tr>';
    }).join('');
    rows += '<tr><td><div class="doc-item">Free modules</div><div class="doc-desc">' +
      FREE_MODULES.map(function (mod) { return mod[0]; }).join(' · ') + '</div></td><td class="doc-inc">Free</td><td class="doc-inc">' + peso(0) + '</td></tr>';

    var features = state.plan === 'advance'
      ? PLAN_INFO.standard.groups.reduce(function (all, g) { return all.concat(g[1]); }, [])
          .map(function (f) { return '<li>' + featureText(f) + '</li>'; }).join('') +
        info.plus.map(function (f) { return '<li class="plus">' + featureText(f) + '</li>'; }).join('')
      : info.groups.reduce(function (all, g) { return all.concat(g[1]); }, [])
          .map(function (f) { return '<li>' + featureText(f) + '</li>'; }).join('');

    var extras = Q.extras(quote).map(function (row) {
      return '<div><span>' + row[0] + '</span><span>' + peso(row[1]) + '</span></div>';
    }).join('');

    var terms = Q.terms.map(function (term, i) {
      return '<li><em>' + String(i + 1).padStart(2, '0') + '</em><span><b>' + escapeHtml(term[0]) + '</b> ' + termText(term[1]) + '</span></li>';
    }).join('');

    var doc = document.createElement('div');
    doc.className = 'doc';
    doc.innerHTML =
      '<div class="doc-head"><img src="' + Q.assetBase + 'eaj-logo.png" alt="EAJ Web Development Services">' +
        '<div class="masthead-quote"><p class="quote-word">QUOTE<span>.</span></p><dl class="meta">' + metaRows() + '</dl></div></div>' +
      '<div class="doc-accent"></div>' +
      '<div class="doc-parties">' +
        '<div><p class="party-label">Prepared for</p><strong>' + escapeHtml(details.client_name) + '</strong><span>' + escapeHtml(details.client_address) + '</span></div>' +
        '<div><p class="party-label">Prepared by</p><strong>EAJ Web Development Services</strong><span>Software development & hosting</span></div>' +
        '<div><p class="party-label">Project</p><strong>' + escapeHtml(details.project_name) + '</strong><span>' + escapeHtml(details.project_note) + '</span></div>' +
      '</div>' +
      '<div class="doc-section avoid-break"><p class="eyebrow doc-eyebrow">01 · Your selection · ' + Q.docTitle + '</p>' +
        '<div class="doc-selection"><div><h3>' + info.name + ' plan</h3><p>' + state.branches + ' ' + branchWord + ' · ' +
          (Q.hasMonths ? monthsLabel(state.months) + ' · ' : '') +
          (quote.paid.length + quote.included.length) + ' add-on' + ((quote.paid.length + quote.included.length) === 1 ? '' : 's') + ' · ' + Q.billingValue + '</p></div>' +
        '<div class="doc-big">' + peso(quote.total) + '<small>' + Q.totalLabel(quote) +
          (quote.discount ? ' · ' + quote.discountPercent + '% off' : '') + '</small></div></div></div>' +
      '<div class="doc-section"><p class="eyebrow doc-eyebrow">02 · Breakdown · price per branch</p>' +
        '<table class="doc-table"><thead><tr><th>Item</th><th>Type</th><th>' + Q.priceColumn + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="doc-totals avoid-break">' +
          calcRows(quote).map(function (row) {
            return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + row[1] + '</span></div>';
          }).join('') +
          '<div class="doc-grand"><span>' + Q.totalLabel(quote) + '</span><span>' + peso(quote.total) + '</span></div>' +
          extras +
        '</div></div>' +
      '<div class="doc-section doc-page-break"><p class="eyebrow">03 · What\'s included</p><h2>' + info.name + ' plan features</h2><ul class="doc-features">' + features + '</ul></div>' +
      '<div class="doc-section"><p class="eyebrow">04 · Terms</p><h2>Terms & conditions</h2><ul class="doc-terms">' + terms + '</ul></div>' +
      '<div class="doc-section"><p class="eyebrow">05 · Acceptance</p><h2>Conforme</h2>' +
        '<p style="color:var(--muted);margin:0">Please sign below to confirm the selected plan and add-ons. We will schedule setup and staff training after we receive your signed copy.</p>' +
        '<div class="doc-sign"><div><strong>EAJ Web Development Services</strong><span>Authorized representative · Date</span></div>' +
        '<div><strong>' + escapeHtml(details.client_name) + '</strong><span>Owner / authorized representative · Date</span></div></div>' +
        '<div class="doc-foot"><img src="' + Q.assetBase + 'eaj-mark.png" alt=""><span>Thank you for choosing EAJ Web Development Services.</span></div>' +
      '</div>';
    return doc;
  }

  function fileName() {
    var clientSlug = details.client_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Client';
    return clientSlug + '-Quote-' + Q.fileTag + '-' + PLAN_INFO[state.plan].name + '-' + state.branches + 'br' +
      (Q.hasMonths ? '-' + state.months + 'mo' : '') + '.pdf';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.html2pdf) return resolve();
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function downloadPdf(button) {
    var label = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Preparing PDF…';
    // html2canvas measures against the viewport, so a visible scrollbar shifts the capture and clips the right edge.
    var rootStyle = document.documentElement.style;
    var previousOverflow = rootStyle.overflow;
    var restore = function () { rootStyle.overflow = previousOverflow; button.disabled = false; button.innerHTML = label; };

    Promise.all([loadScript(HTML2PDF_SRC), document.fonts ? document.fonts.ready : null])
      .then(function () {
        rootStyle.overflow = 'hidden';
        return window.html2pdf().set({
          margin: [10, 10, 12, 10],
          filename: fileName(),
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break', 'tr'] },
        }).from(buildDocument()).save();
      })
      .then(function () { toast('PDF downloaded'); restore(); })
      .catch(function () { restore(); printQuote(); });
  }

  function printQuote() {
    var root = el('print-root');
    root.innerHTML = '';
    root.appendChild(buildDocument());
    var previousTitle = document.title;
    document.title = fileName().replace(/\.pdf$/, '');
    window.print();
    document.title = previousTitle;
  }

  function copyLink() {
    var url = shareUrl();
    var done = function () { toast('Link copied — it opens with this selection'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
    } else {
      window.prompt('Copy this link:', url);
    }
  }

  var toastTimer;
  function toast(message) {
    var node = el('toast');
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 2400);
  }

  function bindActions() {
    el('btn-download').innerHTML = ICONS.download + ' Download PDF';
    el('btn-print').innerHTML = ICONS.print + ' Print';
    el('btn-link').innerHTML = ICONS.link + ' Copy link';
    el('btn-download').addEventListener('click', function () { downloadPdf(this); });
    el('mobile-download').addEventListener('click', function () { downloadPdf(this); });
    el('btn-print').addEventListener('click', printQuote);
    el('btn-link').addEventListener('click', copyLink);
    window.addEventListener('beforeprint', function () {
      if (!el('print-root').firstChild) el('print-root').appendChild(buildDocument());
    });
    window.addEventListener('afterprint', function () { el('print-root').innerHTML = ''; });
  }

  // ── Boot ───────────────────────────────────────────────
  readStateFromUrl();
  renderMasthead();
  renderPlans();
  renderFreeModules();
  renderAddons();
  renderTerms();
  bindBranches();
  bindActions();
  update();
  loadDetails();
})();
