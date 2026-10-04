<?php

use Inertia\Inertia;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\LoginAuthController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\SystemSettingsController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\PosController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PromoController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\ShopController;
use App\Http\Controllers\SalesOrderController;
use App\Http\Controllers\LogsController;
use App\Http\Controllers\CashSessionController;
use App\Http\Controllers\CashCountController;   // ← NEW
use App\Http\Controllers\PettyCashController;
// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC — guest only
// ══════════════════════════════════════════════════════════════════════════════

Route::middleware('guest')->group(function () {
    Route::get('/', fn() => Inertia::render('Login'))->name('login');
    Route::post('/login', [LoginAuthController::class, 'postLogin'])->name('login.post');
});

// ══════════════════════════════════════════════════════════════════════════════
// PROTECTED — authenticated users only
// ══════════════════════════════════════════════════════════════════════════════

Route::middleware('auth')->group(function () {

    Route::post('/logout', [LoginAuthController::class, 'postLogout'])->name('logout.post');

    // ── Dashboard — ID 1 ──────────────────────────────────────────────────────
    Route::middleware('access:1')->get('/dashboard', [
        \App\Http\Controllers\DashboardController::class, 'index',
    ])->name('dashboard');

    // ══════════════════════════════════════════════════════════════════════════
    // SALES
    // ══════════════════════════════════════════════════════════════════════════

    // ── POS / Cashier — ID 2 ──────────────────────────────────────────────────
    Route::middleware('access:2')
        ->prefix('pos')
        ->name('pos.')
        ->controller(PosController::class)
        ->group(function () {
            Route::get('/',               'index')->name('index');
            Route::post('/',              'store')->name('store');
            Route::get('/{sale}/edit',    'edit')->name('edit');
            Route::put('/{sale}',         'update')->name('update');
            Route::post('/{sale}/void',   'void')->name('void');
            Route::get('/{sale}',         'show')->name('show');
            Route::get('/barcode/lookup', 'lookupBarcode')->name('barcode.lookup');
        });

    // ── Sales History — ID 3 ──────────────────────────────────────────────────
    Route::middleware('access:3')
        ->prefix('sales')
        ->name('sales.')
        ->controller(PosController::class)
        ->group(function () {
            Route::get('/history', 'history')->name('history');
        });

    // ── Table Orders — ID 4 ───────────────────────────────────────────────────
    Route::middleware('access:4')
        ->prefix('table-orders')
        ->name('table-orders.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('TableOrders/Index'))->name('index');
        });

    // ── Shop Orders (buyer view) — ID 5 ───────────────────────────────────────
    Route::middleware('access:5')
        ->prefix('shop')
        ->name('shop.')
        ->controller(ShopController::class)
        ->group(function () {
            Route::get('/',                        'index')->name('index');
            Route::post('/',                       'store')->name('store');
            Route::get('/orders',                  'orders')->name('orders');
            Route::patch('/orders/{order}',        'update')->name('orders.update');
            Route::post('/orders/{order}/cancel',  'cancel')->name('orders.cancel');
        });

    // ══════════════════════════════════════════════════════════════════════════
    // INVENTORY — Products module (ID 6, nested)
    // ══════════════════════════════════════════════════════════════════════════

    Route::middleware('access:6')
        ->prefix('products')
        ->name('products.')
        ->group(function () {

            // ── All Products ──────────────────────────────────────────────────
            Route::controller(ProductController::class)->group(function () {
                Route::get('/',            'index')->name('index');
                Route::post('/',           'store')->name('store');
                Route::patch('/{product}', 'update')->name('update');
                Route::delete('/{product}','destroy')->name('destroy');

                // Stock adjust — separate endpoint so it stays clean
                Route::patch('/{product}/stock', 'adjustStock')->name('stock.adjust');
            });

            // ── Categories (nested under /products) ───────────────────────────
            Route::prefix('categories')
                ->name('categories.')
                ->controller(CategoryController::class)
                ->group(function () {
                    Route::get('/',              'index')->name('index');
                    Route::post('/',             'store')->name('store');
                    Route::patch('/{category}',  'update')->name('update');
                    Route::delete('/{category}', 'destroy')->name('destroy');
                });

            // ── Variants (nested under /products) ─────────────────────────────
            Route::prefix('variants')
                ->name('variants.')
                ->group(function () {
                    Route::get('/',            fn() => Inertia::render('Products/Index', ['tab' => 'variants']))->name('index');
                    Route::post('/',           [ProductController::class, 'storeVariant'])->name('store');
                    Route::patch('/{variant}', [ProductController::class, 'updateVariant'])->name('update');
                    Route::delete('/{variant}',[ProductController::class, 'destroyVariant'])->name('destroy');
                });

            // ── Bundles (nested under /products) ──────────────────────────────
            Route::prefix('bundles')
                ->name('bundles.')
                ->controller(ProductController::class)
                ->group(function () {
                    Route::get('/',                            fn() => Inertia::render('Products/Index', ['tab' => 'bundles']))->name('index');

                    // Bundle definition CRUD
                    Route::post('/',                          'storeBundle')->name('store');
                    Route::patch('/{bundle}',                 'updateBundle')->name('update');
                    Route::delete('/{bundle}',                'destroyBundle')->name('destroy');

                    // Bundle items (components)
                    Route::post('/{bundle}/items',            'addBundleItem')->name('items.store');
                    Route::patch('/{bundle}/items/{item}',    'updateBundleItem')->name('items.update');
                    Route::delete('/{bundle}/items/{item}',   'removeBundleItem')->name('items.destroy');

                    // Build action — deducts component stock, writes capital to product_stocks
                    Route::post('/{bundle}/build',            'buildBundle')->name('build');
                });

            // ── Recipes / BOM (nested under /products) ────────────────────────
            Route::prefix('recipes')
                ->name('recipes.')
                ->group(function () {
                    Route::get('/',          fn() => Inertia::render('Products/Index', ['tab' => 'recipes']))->name('index');
                    Route::post('/',         [ProductController::class, 'storeRecipe'])->name('store');
                    Route::delete('/{recipe}',[ProductController::class, 'destroyRecipe'])->name('destroy');
                });

            // ── Stock Management (nested under /products) ─────────────────────
            Route::prefix('stock')
                ->name('stock.')
                ->group(function () {
                    Route::get('/', fn() => Inertia::render('Products/Index', ['tab' => 'stock']))->name('index');
                });
        });

    // ── Categories standalone — ID 7 ─────────────────────────────────────────
    Route::middleware('access:7')
        ->prefix('categories')
        ->name('categories.')
        ->controller(CategoryController::class)
        ->group(function () {
            Route::get('/',              'index')->name('index');
            Route::post('/',             'store')->name('store');
            Route::patch('/{category}',  'update')->name('update');
            Route::delete('/{category}', 'destroy')->name('destroy');
        });

    // ── Product Variants standalone — ID 8 ───────────────────────────────────
    Route::middleware('access:8')
        ->prefix('variants')
        ->name('variants.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('Variants/Index'))->name('index');
        });

    // ── Product Bundles standalone — ID 9 ────────────────────────────────────
    Route::middleware('access:9')
        ->prefix('bundles')
        ->name('bundles.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('Bundles/Index'))->name('index');
        });

    // ── Recipes / BOM standalone — ID 10 ─────────────────────────────────────
    Route::middleware('access:10')
        ->prefix('recipes')
        ->name('recipes.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('Recipes/Index'))->name('index');
        });

    // ── Stock Management standalone — ID 11 ──────────────────────────────────
    Route::middleware('access:11')
        ->prefix('stock')
        ->name('stock.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('Stock/Index'))->name('index');
        });

    // ── Purchase Orders — ID 12 ───────────────────────────────────────────────
    Route::middleware('access:12')
        ->prefix('purchase-orders')
        ->name('purchase-orders.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('PurchaseOrders/Index'))->name('index');
        });

    // ── Goods Received Notes — ID 13 ──────────────────────────────────────────
    Route::middleware('access:13')
        ->prefix('grn')
        ->name('grn.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('Grn/Index'))->name('index');
        });

    // ── Supplier order management (seller view) — access via ID 6 ─────────────
    Route::middleware('access:6')
        ->prefix('supplier')
        ->name('supplier.')
        ->controller(SalesOrderController::class)
        ->group(function () {
            Route::get('/orders',                   'index')->name('orders.index');
            Route::get('/orders/{order}',           'show')->name('orders.show');
            Route::post('/orders/{order}/confirm',  'confirm')->name('orders.confirm');
            Route::post('/orders/{order}/reject',   'reject')->name('orders.reject');
            Route::post('/orders/{order}/shipped',  'shipped')->name('orders.shipped');
            Route::post('/orders/{order}/complete', 'complete')->name('orders.complete');
            Route::get('/orders/{order}/receipt',   'receipt')->name('orders.receipt');
        });

    // ══════════════════════════════════════════════════════════════════════════
    // CASH
    // ══════════════════════════════════════════════════════════════════════════

    // ── Cash Sessions — ID 14 ─────────────────────────────────────────────────
    Route::middleware('access:14')
        ->prefix('cash-sessions')
        ->name('cash-sessions.')
        ->group(function () {
            Route::get('/',           [CashSessionController::class, 'index'])->name('index');
            Route::post('/open',      [CashSessionController::class, 'open'])->name('open');
            Route::post('/{session}/close', [CashSessionController::class, 'close'])->name('close');
            Route::get('/{session}',  [CashSessionController::class, 'show'])->name('show');
        });

    // ── Cash Counts — ID 15 ───────────────────────────────────────────────────
    Route::middleware('access:15')
        ->prefix('cash-counts')
        ->name('cash-counts.')
        ->controller(CashCountController::class)
        ->group(function () {
            Route::get('/',           'index')->name('index');
            Route::post('/',          'store')->name('store');           // create count for session
            Route::get('/{cashCount}', 'show')->name('show');
        });

    // ── Petty Cash — ID 16 ────────────────────────────────────────────────────
    Route::middleware('access:16')
        ->prefix('petty-cash')
        ->name('petty-cash.')
        ->controller(PettyCashController::class)
        ->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::post('/{voucher}/approve', 'approve')->name('approve');
            Route::post('/{voucher}/reject', 'reject')->name('reject');
        });

    // ── Expenses — ID 17 ──────────────────────────────────────────────────────
    Route::middleware('access:17')
        ->prefix('expenses')
        ->name('expenses.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('Expenses/Index'))->name('index');
        });

    // ══════════════════════════════════════════════════════════════════════════
    // REPORTS
    // ══════════════════════════════════════════════════════════════════════════

    Route::middleware('access:18')->get('/reports/daily',     fn() => Inertia::render('Reports/Daily'))->name('reports.daily');
    Route::middleware('access:19')->get('/reports/sales',     fn() => Inertia::render('Reports/Sales'))->name('reports.sales');
    Route::middleware('access:20')->get('/reports/inventory', fn() => Inertia::render('Reports/Inventory'))->name('reports.inventory');
    Route::middleware('access:21')->get('/reports/expenses',  fn() => Inertia::render('Reports/Expenses'))->name('reports.expenses');

    // ── Activity Logs — ID 22 ─────────────────────────────────────────────────
    Route::middleware('access:22')
        ->prefix('logs')
        ->name('logs.')
        ->group(function () {
            Route::get('/', [LogsController::class, 'index'])->name('index');
        });

    // ══════════════════════════════════════════════════════════════════════════
    // MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════════

    // ── User Management — ID 23 ───────────────────────────────────────────────
    Route::middleware('access:23')
        ->prefix('users')
        ->name('users.')
        ->controller(UserController::class)
        ->group(function () {
            Route::get('/',          'index')->name('index');
            Route::post('/',         'store')->name('store');
            Route::patch('/{user}',  'update')->name('update');
            Route::delete('/{user}', 'destroy')->name('destroy');
        });

    // ── Suppliers — ID 24 ─────────────────────────────────────────────────────
    Route::middleware('access:24')
        ->prefix('suppliers')
        ->name('suppliers.')
        ->controller(SupplierController::class)
        ->group(function () {
            Route::get('/',              'index')->name('index');
            Route::post('/',             'store')->name('store');
            Route::patch('/{supplier}',  'update')->name('update');
            Route::delete('/{supplier}', 'destroy')->name('destroy');
        });

    // ── Branches — ID 25 ──────────────────────────────────────────────────────
    Route::middleware('access:25')
        ->prefix('branches')
        ->name('branches.')
        ->controller(BranchController::class)
        ->group(function () {
            Route::get('/',                   'index')->name('index');
            Route::post('/',                  'store')->name('store');
            Route::patch('/{branch}',         'update')->name('update');
            Route::patch('/{branch}/toggle',  'toggleActive')->name('toggle');
            Route::delete('/{branch}',        'destroy')->name('destroy');
        });

    // ── Promos & Discounts — ID 29 ────────────────────────────────────────────
    Route::middleware('access:29')
        ->prefix('promos')
        ->name('promos.')
        ->controller(PromoController::class)
        ->group(function () {
            Route::get('/',             'index')->name('index');
            Route::post('/',            'store')->name('store');
            Route::patch('/{promo}',    'update')->name('update');
            Route::patch('/{promo}/toggle', 'toggle')->name('toggle');
            Route::delete('/{promo}',   'destroy')->name('destroy');
            Route::post('/apply',       'apply')->name('apply');
        });

    // ── Dining Tables — ID 26 ─────────────────────────────────────────────────
    Route::middleware('access:26')
        ->prefix('dining-tables')
        ->name('dining-tables.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('DiningTables/Index'))->name('index');
        });

    // ── Expense Categories — ID 27 ────────────────────────────────────────────
    Route::middleware('access:27')
        ->prefix('expense-categories')
        ->name('expense-categories.')
        ->group(function () {
            Route::get('/', fn() => Inertia::render('ExpenseCategories/Index'))->name('index');
        });

    // ── System Settings — ID 28 ───────────────────────────────────────────────
    Route::middleware('access:28')
        ->prefix('settings')
        ->name('settings.')
        ->controller(SystemSettingsController::class)
        ->group(function () {
            Route::get('/',               'index')->name('index');
            Route::post('/save',          'save')->name('save');
            Route::post('/modules',       'saveModules')->name('modules');
            Route::delete('/{key}/reset', 'reset')->name('reset');
            Route::post('/logo',          'uploadLogo')->name('logo');
        });

});