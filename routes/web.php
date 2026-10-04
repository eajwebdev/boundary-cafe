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
use App\Http\Controllers\CashCountController;
use App\Http\Controllers\PettyCashController;
use App\Http\Controllers\PettyCashFundController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\ExpenseCategoryController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\StockAdjustmentController;
use App\Http\Controllers\AiAssistantController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\StockTransferController;
use App\Http\Controllers\WarehouseController;
use App\Http\Controllers\StockCountController;
use App\Http\Controllers\BrochureController;
use App\Http\Controllers\ServicesController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\LoyaltyController;

// PUBLIC
Route::get('/', fn () => Inertia::render('Landing/Index'))->name('home');
Route::get('/login', [LoginAuthController::class, 'getLogin'])->name('login');
Route::post('/login', [LoginAuthController::class, 'postLogin'])->name('login.post');
Route::get('/loyalty/card/{token}', [LoyaltyController::class, 'card'])->name('loyalty.card');

// PROTECTED
Route::middleware('auth')->group(function () {

    Route::post('/logout', [LoginAuthController::class, 'postLogout'])->name('logout.post');

    // AI Assistant (manager & cashier only — enforced in frontend; backend just requires auth)
    Route::post('/ai/chat', [AiAssistantController::class, 'chat'])->name('ai.chat');

    // Dashboard
    Route::middleware('access:1')->group(function () {
        Route::get('/dashboard', [\App\Http\Controllers\DashboardController::class, 'index'])->name('dashboard');
        Route::get('/dashboard/data', [\App\Http\Controllers\DashboardController::class, 'data'])->name('dashboard.data');
    });

    // POS
    Route::middleware('access:2')->prefix('pos')->name('pos.')->controller(PosController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::post('/session/open', [CashSessionController::class, 'open'])->name('session.open');
        Route::get('/{sale}/edit', 'edit')->name('edit');
        Route::put('/{sale}', 'update')->name('update');
        Route::post('/{sale}/void', 'void')->name('void');
        Route::get('/{sale}', 'show')->name('show');
        Route::get('/barcode/lookup', 'lookupBarcode')->name('barcode.lookup');
    });

    // Sales History
    Route::middleware('access:3')->prefix('sales')->name('sales.')->controller(PosController::class)->group(function () {
        Route::get('/history', 'history')->name('history');
    });

    // Shop Orders
    // Products / Inventory
    Route::middleware('access:6')->prefix('products')->name('products.')->group(function () {
        Route::controller(ProductController::class)->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::patch('/{product}', 'update')->name('update');
            Route::delete('/{product}', 'destroy')->name('destroy');
            Route::patch('/{product}/stock', 'adjustStock')->name('stock.adjust');
        });
    });

    // Cash Sessions
    Route::middleware('access:14')->prefix('cash-sessions')->name('cash-sessions.')->group(function () {
        Route::get('/', [CashSessionController::class, 'index'])->name('index');
        Route::post('/open', [CashSessionController::class, 'open'])->name('open');
        Route::post('/{session}/close', [CashSessionController::class, 'close'])->name('close');
        Route::get('/{session}', [CashSessionController::class, 'show'])->name('show');
    });

    // Cash Counts
    Route::middleware('access:15')->prefix('cash-counts')->name('cash-counts.')->controller(CashCountController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{cashCount}', 'show')->name('show');
    });

    // Petty Cash
    Route::middleware('access:16')->prefix('petty-cash')->name('petty-cash.')->group(function () {
        Route::get('/', [PettyCashController::class, 'index'])->name('index');
        Route::post('/', [PettyCashController::class, 'store'])->name('store');
        Route::post('/{voucher}/approve', [PettyCashController::class, 'approve'])->name('approve');
        Route::post('/{voucher}/reject', [PettyCashController::class, 'reject'])->name('reject');
        Route::post('/funds', [PettyCashFundController::class, 'store'])->name('funds.store');
        Route::patch('/funds/{fund}/close', [PettyCashFundController::class, 'close'])->name('funds.close');
    });

    // Expenses
    Route::middleware('access:17')->prefix('expenses')->name('expenses.')->controller(ExpenseController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{expense}', 'show')->name('show');
        Route::patch('/{expense}', 'update')->name('update');
        Route::delete('/{expense}', 'destroy')->name('destroy');
    });

    // Expense Categories
    Route::middleware('access:27')->prefix('expense-categories')->name('expense-categories.')->controller(ExpenseCategoryController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{category}', 'update')->name('update');
        Route::delete('/{category}', 'destroy')->name('destroy');
        Route::patch('/{category}/toggle', 'toggleActive')->name('toggle');
    });

    // Reports (IDs 18–21)
    Route::middleware('access:18')->prefix('reports')->name('reports.')->controller(ReportController::class)->group(function () {

        // HTML Views
        Route::get('/daily', 'dailySummary')->name('daily');
        Route::get('/sales', 'salesReport')->name('sales');
        Route::get('/inventory', 'inventoryReport')->name('inventory');
        Route::get('/expenses', 'expenseReport')->name('expenses');
        Route::get('/ingredient-usage', 'ingredientUsageReport')->name('ingredient-usage');
        Route::get('/stock-loss', 'stockLossReport')->name('stock-loss');

        // Live PDF Previews (opens in new tab)
        Route::get('/daily/pdf', 'dailySummaryPdf')->name('daily.pdf');
        Route::get('/sales/pdf', 'salesReportPdf')->name('sales.pdf');
        Route::get('/inventory/pdf', 'inventoryReportPdf')->name('inventory.pdf');
        Route::get('/expenses/pdf', 'expenseReportPdf')->name('expenses.pdf');
        Route::get('/ingredient-usage/pdf', 'ingredientUsageReportPdf')->name('ingredient-usage.pdf');
    });

    // Activity Logs
    Route::middleware('access:22')->prefix('logs')->name('logs.')->group(function () {
        Route::get('/', [LogsController::class, 'index'])->name('index');
    });

    // Users
    Route::middleware('access:23')->prefix('users')->name('users.')->controller(UserController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{user}', 'update')->name('update');
        Route::delete('/{user}', 'destroy')->name('destroy');
    });

    // Suppliers
    Route::middleware('access:24')->prefix('suppliers')->name('suppliers.')->controller(SupplierController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{supplier}', 'update')->name('update');
        Route::delete('/{supplier}', 'destroy')->name('destroy');

        // Supplier order management
        Route::get('/{supplier}/orders', 'orders')->name('orders');
        Route::prefix('orders')->name('orders.')->group(function () {
            Route::post('/{order}/confirm',  'confirmOrder')->name('confirm');
            Route::post('/{order}/reject',   'rejectOrder')->name('reject');
            Route::post('/{order}/shipped',  'markShipped')->name('shipped');
            Route::post('/{order}/complete', 'completeOrder')->name('complete');
            Route::get('/{order}/receipt',   'orderReceipt')->name('receipt');
        });
    });

    // Purchase Orders
    Route::middleware('access:12')->prefix('purchase-orders')->name('purchase-orders.')->controller(PurchaseController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/create', 'create')->name('create');
        Route::post('/', 'store')->name('store');
        Route::get('/{purchase}', 'show')->name('show');
        Route::post('/{purchase}/mark-paid', 'markPaid')->name('mark-paid');
    });

    // Branches
    Route::middleware('access:25')->prefix('branches')->name('branches.')->controller(BranchController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{branch}', 'update')->name('update');
        Route::patch('/{branch}/toggle', 'toggleActive')->name('toggle');
        Route::delete('/{branch}', 'destroy')->name('destroy');
    });

    // System Settings
    Route::middleware('access:28')->prefix('settings')->name('settings.')->controller(SystemSettingsController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/save', 'save')->name('save');
        Route::post('/modules', 'saveModules')->name('modules');
        Route::delete('/{key}/reset', 'reset')->name('reset');
        Route::post('/logo', 'uploadLogo')->name('logo');
    });

    // Stock Adjustments (Losses / Damages / Expired)
    Route::middleware('access:31')->prefix('stock-adjustments')->name('stock-adjustments.')->controller(StockAdjustmentController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::delete('/{stockAdjustment}', 'destroy')->name('destroy');
    });

    // Inventory — ID 33
    Route::middleware('access:33')->prefix('inventory')->name('inventory.')->group(function () {
        Route::get('/', [InventoryController::class, 'index'])->name('index');
    });

    // Stock Transfers — ID 34
    Route::middleware('access:34')->prefix('stock-transfers')->name('stock-transfers.')->controller(StockTransferController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::post('/{stockTransfer}/complete', 'complete')->name('complete');
        Route::post('/{stockTransfer}/cancel', 'cancel')->name('cancel');
    });

    // Stock Count (Physical Inventory) — ID 36
    Route::middleware('access:36')->prefix('stock-count')->name('stock-count.')->controller(StockCountController::class)->group(function () {
        Route::get('/',                      'index')->name('index');
        Route::post('/start',                'start')->name('start');
        Route::get('/{session}',             'show')->name('show');
        Route::patch('/{session}/save',      'save')->name('save');
        Route::post('/{session}/commit',     'commit')->name('commit');
        Route::delete('/{session}',          'cancel')->name('cancel');
    });

    // Warehouses — ID 35 (Premium)
    // Brochure Builder — ID 37
    // Services — ID 38
    Route::middleware('access:39')->prefix('customers')->name('customers.')->controller(CustomerController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{customer}', 'show')->name('show');
        Route::patch('/{customer}', 'update')->name('update');
        Route::delete('/{customer}', 'destroy')->name('destroy');
        Route::post('/{customer}/payments', 'pay')->name('payments.store');
        Route::post('/{customer}/loyalty/rotate', [LoyaltyController::class, 'rotate'])->name('loyalty.rotate');
        Route::post('/{customer}/loyalty/adjust', [LoyaltyController::class, 'adjust'])->name('loyalty.adjust');
    });

    Route::post('/loyalty/lookup', [LoyaltyController::class, 'lookup'])->name('loyalty.lookup');

    // Promos
    Route::middleware('access:29')->prefix('promos')->name('promos.')->controller(PromoController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{promo}', 'update')->name('update');
        Route::patch('/{promo}/toggle', 'toggle')->name('toggle');
        Route::delete('/{promo}', 'destroy')->name('destroy');
        Route::post('/apply', 'apply')->name('apply');
    });

});
