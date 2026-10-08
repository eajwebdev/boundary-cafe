<?php

use App\Http\Controllers\AiAssistantController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\CashCountController;
use App\Http\Controllers\CashSessionController;
use App\Http\Controllers\Customer;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeliveryZoneController;
use App\Http\Controllers\DiningTableController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\ExpenseCategoryController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\LoginAuthController;
use App\Http\Controllers\LogsController;
use App\Http\Controllers\LoyaltyController;
use App\Http\Controllers\LoyaltyProgramController;
use App\Http\Controllers\OnlineOrderController;
use App\Http\Controllers\PettyCashController;
use App\Http\Controllers\PettyCashFundController;
use App\Http\Controllers\PosController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PromoController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\QuotationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\StockAdjustmentController;
use App\Http\Controllers\StockCountController;
use App\Http\Controllers\StockTransferController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\SystemSettingsController;
use App\Http\Controllers\TableOrderController;
use App\Http\Controllers\TimeClockController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ZReadingController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// ─── PUBLIC STOREFRONT (customer ordering app) ───────────────────────────────
Route::get('/', [Customer\StorefrontController::class, 'index'])->name('home');
Route::get('/loyalty/card/{token}', [LoyaltyController::class, 'card'])->name('loyalty.card');

// Employee time clock (public; employees prove who they are with code + PIN, GPS and face)
Route::get('/time-clock', [TimeClockController::class, 'show'])->name('time-clock');
Route::post('/time-clock/identify', [TimeClockController::class, 'identify'])->middleware('throttle:20,1')->name('time-clock.identify');
Route::post('/time-clock/challenge', [TimeClockController::class, 'challenge'])->middleware('throttle:20,1')->name('time-clock.challenge');
Route::post('/time-clock/punch', [TimeClockController::class, 'punch'])->middleware('throttle:20,1')->name('time-clock.punch');

// Public quotation pages (static files in public/proposal) — shareable, no sign-in.
Route::get('/quotation', fn (Request $request) => redirect('/proposal/boundary-cafe/subscription.html'.($request->getQueryString() ? '?'.$request->getQueryString() : '')))->name('quotation');
Route::get('/quotation/one-time', fn (Request $request) => redirect('/proposal/boundary-cafe/one-time.html'.($request->getQueryString() ? '?'.$request->getQueryString() : '')))->name('quotation.one-time');
Route::get('/quotation/details', [QuotationController::class, 'details'])->name('quotation.details');

// Staff sign-in
Route::get('/login', [LoginAuthController::class, 'getLogin'])->name('login');
Route::post('/login', [LoginAuthController::class, 'postLogin'])->middleware('throttle:20,1')->name('login.post');
Route::post('/login/demo', [LoginAuthController::class, 'postDemoLogin'])->middleware('throttle:20,1')->name('login.demo');

// ─── CUSTOMER ACCOUNTS (separate "customer" guard) ───────────────────────────
Route::prefix('account')->name('customer.')->group(function () {
    Route::get('/login', [Customer\AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [Customer\AuthController::class, 'login'])->middleware('throttle:10,1')->name('login.post');
    Route::get('/register', [Customer\AuthController::class, 'showRegister'])->name('register');
    Route::post('/register', [Customer\AuthController::class, 'register'])->middleware('throttle:6,1')->name('register.post');

    // Public aliases for the quotation pages — no sign-in.
    Route::get('/quote', fn (Request $request) => redirect()->route('quotation', $request->query()))->name('quote');
    Route::get('/quote/one-time', fn (Request $request) => redirect()->route('quotation.one-time', $request->query()))->name('quote.one-time');

    Route::middleware('auth:customer')->group(function () {
        Route::post('/logout', [Customer\AuthController::class, 'logout'])->name('logout');

        Route::get('/', [Customer\AccountController::class, 'show'])->name('account');
        Route::patch('/', [Customer\AccountController::class, 'update'])->name('account.update');
        Route::put('/password', [Customer\AccountController::class, 'updatePassword'])->middleware('throttle:6,1')->name('password.update');
        Route::get('/rewards', [Customer\AccountController::class, 'rewards'])->name('rewards');

        Route::post('/addresses', [Customer\AddressController::class, 'store'])->middleware('throttle:30,1')->name('addresses.store');
        Route::patch('/addresses/{address}', [Customer\AddressController::class, 'update'])->name('addresses.update');
        Route::post('/addresses/{address}/default', [Customer\AddressController::class, 'makeDefault'])->name('addresses.default');
        Route::delete('/addresses/{address}', [Customer\AddressController::class, 'destroy'])->name('addresses.destroy');

        Route::get('/orders', [Customer\OrderController::class, 'index'])->name('orders.index');
        Route::get('/orders/{orderNumber}', [Customer\OrderController::class, 'show'])->name('orders.show');
        Route::get('/orders/{orderNumber}/status', [Customer\OrderController::class, 'status'])->middleware('throttle:120,1')->name('orders.status');
        Route::post('/orders/{orderNumber}/cancel', [Customer\OrderController::class, 'cancel'])->middleware('throttle:10,1')->name('orders.cancel');
    });
});

Route::middleware('auth:customer')->group(function () {
    Route::get('/checkout', [Customer\CheckoutController::class, 'show'])->name('customer.checkout');
    Route::post('/checkout/quote', [Customer\CheckoutController::class, 'quote'])->middleware('throttle:90,1')->name('customer.checkout.quote');
    Route::post('/checkout', [Customer\CheckoutController::class, 'store'])->middleware('throttle:10,1')->name('customer.checkout.store');
    Route::get('/geocode/reverse', [Customer\GeocodeController::class, 'reverse'])->middleware('throttle:40,1')->name('customer.geocode.reverse');
});

// ─── STAFF (web guard) ───────────────────────────────────────────────────────
Route::middleware(['auth:web', 'order-taker'])->group(function () {

    Route::post('/logout', [LoginAuthController::class, 'postLogout'])->name('logout.post');

    // AI Assistant (manager & cashier only — enforced in frontend; backend just requires auth)
    Route::post('/ai/chat', [AiAssistantController::class, 'chat'])->name('ai.chat');

    // Dashboard — ID 1 (tabbed; each tab loads lazily)
    Route::middleware('access:1')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
        Route::get('/dashboard/data', [DashboardController::class, 'data'])->name('dashboard.data');
    });

    // POS — ID 2
    Route::middleware('access:2')->prefix('pos')->name('pos.')->controller(PosController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::post('/session/open', [CashSessionController::class, 'open'])->name('session.open');
        Route::get('/barcode/lookup', 'lookupBarcode')->name('barcode.lookup');

        // Pending dine-in tickets sent by waiters + online pickups ready to collect
        Route::get('/pending-orders', [TableOrderController::class, 'pending'])->name('pending');
        Route::post('/table-orders/{tableOrder}/void', [TableOrderController::class, 'void'])->name('table-orders.void');

        Route::get('/{sale}/edit', 'edit')->whereNumber('sale')->name('edit');
        Route::put('/{sale}', 'update')->whereNumber('sale')->name('update');
        Route::post('/{sale}/void', 'void')->whereNumber('sale')->name('void');
        Route::get('/{sale}', 'show')->whereNumber('sale')->name('show');
    });

    // Sales History — ID 3
    Route::middleware('access:3')->prefix('sales')->name('sales.')->controller(PosController::class)->group(function () {
        Route::get('/history', 'history')->name('history');
    });

    // Online Orders board — ID 40
    Route::middleware('access:40')->prefix('online-orders')->name('online-orders.')->controller(OnlineOrderController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/feed', 'feed')->name('feed');
        Route::get('/pending-count', 'pendingCount')->name('pending-count');
        Route::post('/{onlineOrder}/transition', 'transition')->name('transition');
    });

    // Table Ordering (waiter screen) — ID 41
    Route::middleware('access:41')->prefix('tables')->name('table-orders.')->controller(TableOrderController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/status', 'tables')->name('tables');
        Route::post('/orders', 'store')->name('store');
        Route::get('/customers/find', 'findCustomer')->name('customers.find');
        Route::post('/{diningTable}/available', 'markAvailable')->name('available');
    });

    // Dining Tables setup — ID 42
    Route::middleware('access:42')->prefix('dining-tables')->name('dining-tables.')->controller(DiningTableController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{diningTable}', 'update')->name('update');
        Route::delete('/{diningTable}', 'destroy')->name('destroy');
    });

    // Employees — ID 45
    Route::middleware('access:45')->prefix('employees')->name('employees.')->controller(EmployeeController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{employee}', 'update')->name('update');
        Route::delete('/{employee}', 'destroy')->name('destroy');
        Route::post('/{employee}/face', 'enrollFace')->name('face.store');
        Route::get('/{employee}/face', 'face')->name('face');
        Route::delete('/{employee}/device', 'resetDevice')->name('device.destroy');
    });

    // Attendance log + branch clock-in areas — ID 46
    Route::middleware('access:46')->prefix('attendance')->name('attendance.')->controller(AttendanceController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::patch('/branches/{branch}/location', 'updateLocation')->name('location');
        Route::get('/{attendance}/photo', 'photo')->name('photo');
    });

    // Delivery Zone & online ordering settings — ID 43
    Route::middleware('access:43')->prefix('delivery-zone')->name('delivery-zone.')->controller(DeliveryZoneController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::put('/', 'update')->name('update');
        Route::patch('/barangays/{barangay}', 'toggleBarangay')->name('barangays.toggle');
    });

    // Loyalty Program settings — ID 44
    Route::middleware('access:44')->prefix('loyalty-program')->name('loyalty-program.')->controller(LoyaltyProgramController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::put('/', 'update')->name('update');
    });

    // Products / Inventory — ID 6
    Route::middleware('access:6')->prefix('products')->name('products.')->group(function () {
        Route::controller(ProductController::class)->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::patch('/{product}', 'update')->name('update');
            Route::delete('/{product}', 'destroy')->name('destroy');
            Route::patch('/{product}/stock', 'adjustStock')->name('stock.adjust');
        });
    });

    // Cash Sessions — ID 14
    Route::middleware('access:14')->prefix('cash-sessions')->name('cash-sessions.')->group(function () {
        Route::get('/', [CashSessionController::class, 'index'])->name('index');
        Route::post('/open', [CashSessionController::class, 'open'])->name('open');
        Route::post('/{session}/close', [CashSessionController::class, 'close'])->name('close');
        Route::get('/{session}', [CashSessionController::class, 'show'])->name('show');
    });

    // Cash Counts — ID 15
    Route::middleware('access:15')->prefix('cash-counts')->name('cash-counts.')->controller(CashCountController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{cashCount}', 'show')->name('show');
    });

    // Petty Cash — ID 16
    Route::middleware('access:16')->prefix('petty-cash')->name('petty-cash.')->group(function () {
        Route::get('/', [PettyCashController::class, 'index'])->name('index');
        Route::post('/', [PettyCashController::class, 'store'])->name('store');
        Route::post('/{voucher}/approve', [PettyCashController::class, 'approve'])->name('approve');
        Route::post('/{voucher}/reject', [PettyCashController::class, 'reject'])->name('reject');
        Route::post('/funds', [PettyCashFundController::class, 'store'])->name('funds.store');
        Route::patch('/funds/{fund}/close', [PettyCashFundController::class, 'close'])->name('funds.close');
    });

    // Z-Reading (end of day) — ID 47
    Route::middleware('access:47')->prefix('z-readings')->name('z-readings.')->controller(ZReadingController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{zReading}', 'show')->name('show');
        Route::post('/{zReading}/reprint', 'reprint')->name('reprint');
    });

    // Expenses — ID 17
    Route::middleware('access:17')->prefix('expenses')->name('expenses.')->controller(ExpenseController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{expense}', 'show')->name('show');
        Route::patch('/{expense}', 'update')->name('update');
        Route::delete('/{expense}', 'destroy')->name('destroy');
    });

    // Expense Categories — ID 27
    Route::middleware('access:27')->prefix('expense-categories')->name('expense-categories.')->controller(ExpenseCategoryController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{category}', 'update')->name('update');
        Route::delete('/{category}', 'destroy')->name('destroy');
        Route::patch('/{category}/toggle', 'toggleActive')->name('toggle');
    });

    // Reports — each report checks its own menu permission
    Route::prefix('reports')->name('reports.')->controller(ReportController::class)->group(function () {
        Route::middleware('access:18')->group(function () {
            Route::get('/daily', 'dailySummary')->name('daily');
            Route::get('/daily/pdf', 'dailySummaryPdf')->name('daily.pdf');
        });
        Route::middleware('access:19')->group(function () {
            Route::get('/sales', 'salesReport')->name('sales');
            Route::get('/sales/pdf', 'salesReportPdf')->name('sales.pdf');
        });
        Route::middleware('access:20')->group(function () {
            Route::get('/inventory', 'inventoryReport')->name('inventory');
            Route::get('/inventory/pdf', 'inventoryReportPdf')->name('inventory.pdf');
        });
        Route::middleware('access:21')->group(function () {
            Route::get('/expenses', 'expenseReport')->name('expenses');
            Route::get('/expenses/pdf', 'expenseReportPdf')->name('expenses.pdf');
        });
        Route::middleware('access:30')->group(function () {
            Route::get('/ingredient-usage', 'ingredientUsageReport')->name('ingredient-usage');
            Route::get('/ingredient-usage/pdf', 'ingredientUsageReportPdf')->name('ingredient-usage.pdf');
        });
        Route::middleware('access:31')->group(function () {
            Route::get('/stock-loss', 'stockLossReport')->name('stock-loss');
            Route::get('/stock-loss/pdf', 'stockLossReportPdf')->name('stock-loss.pdf');
        });
    });

    // Activity Logs — ID 22
    Route::middleware('access:22')->prefix('logs')->name('logs.')->group(function () {
        Route::get('/', [LogsController::class, 'index'])->name('index');
    });

    // Users — ID 23
    Route::middleware('access:23')->prefix('users')->name('users.')->controller(UserController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{user}', 'update')->name('update');
        Route::delete('/{user}', 'destroy')->name('destroy');
    });

    // Suppliers — ID 24 (ingredient suppliers; supplier CRUD only)
    Route::middleware('access:24')->prefix('suppliers')->name('suppliers.')->controller(SupplierController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{supplier}', 'update')->name('update');
        Route::delete('/{supplier}', 'destroy')->name('destroy');
    });

    // Purchase Orders — ID 12
    Route::middleware('access:12')->prefix('purchase-orders')->name('purchase-orders.')->controller(PurchaseController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/create', 'create')->name('create');
        Route::post('/', 'store')->name('store');
        Route::get('/{purchase}', 'show')->name('show');
        Route::post('/{purchase}/mark-paid', 'markPaid')->name('mark-paid');
    });

    // Branches — ID 25
    Route::middleware('access:25')->prefix('branches')->name('branches.')->controller(BranchController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{branch}', 'update')->name('update');
        Route::patch('/{branch}/toggle', 'toggleActive')->name('toggle');
        Route::delete('/{branch}', 'destroy')->name('destroy');
    });

    // System Settings — ID 28
    Route::middleware('access:28')->prefix('settings')->name('settings.')->controller(SystemSettingsController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/save', 'save')->name('save');
        Route::post('/modules', 'saveModules')->name('modules');
        Route::delete('/{key}/reset', 'reset')->name('reset');
        Route::post('/logo', 'uploadLogo')->name('logo');
    });

    // Stock Adjustments (Losses / Damages / Expired) — ID 31
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
        Route::get('/', 'index')->name('index');
        Route::post('/start', 'start')->name('start');
        Route::get('/{session}', 'show')->name('show');
        Route::patch('/{session}/save', 'save')->name('save');
        Route::post('/{session}/commit', 'commit')->name('commit');
        Route::delete('/{session}', 'cancel')->name('cancel');
    });

    // Customers — ID 39
    Route::middleware('access:39')->prefix('customers')->name('customers.')->controller(CustomerController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{customer}', 'show')->name('show');
        Route::patch('/{customer}', 'update')->name('update');
        Route::delete('/{customer}', 'destroy')->name('destroy');
        Route::post('/{customer}/loyalty/rotate', [LoyaltyController::class, 'rotate'])->name('loyalty.rotate');
        Route::post('/{customer}/loyalty/adjust', [LoyaltyController::class, 'adjust'])->name('loyalty.adjust');
    });

    Route::post('/loyalty/lookup', [LoyaltyController::class, 'lookup'])->name('loyalty.lookup');

    // Promos — ID 29
    Route::middleware('access:29')->prefix('promos')->name('promos.')->controller(PromoController::class)->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::patch('/{promo}', 'update')->name('update');
        Route::patch('/{promo}/toggle', 'toggle')->name('toggle');
        Route::delete('/{promo}', 'destroy')->name('destroy');
        Route::post('/apply', 'apply')->name('apply');
    });

});
