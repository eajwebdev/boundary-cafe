<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ $businessName ?? 'Business' }} - Daily Summary - {{ $date->format('Y-m-d') }}</title>
    <style>
        @page { margin: 25px; }
        body { 
            font-family: DejaVu Sans, Arial, sans-serif; 
            margin: 0; 
            padding: 0; 
            font-size: 13px; 
            color: #1f2937;
        }
        .header { 
            text-align: center; 
            margin-bottom: 20px; 
            padding-bottom: 15px; 
            border-bottom: 3px solid #4f46e5; 
        }
        .logo {
            max-height: 58px;
            max-width: 180px;
            margin-bottom: 8px;
        }
        .title { 
            font-size: 20px; 
            font-weight: bold; 
            color: #1e3a8a; 
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 15px 0; 
        }
        th, td { 
            padding: 8px 10px; 
            border: 1px solid #e5e7eb; 
            text-align: left; 
        }
        th { 
            background-color: #f8fafc; 
            font-weight: 600; 
        }
        .amount { 
            text-align: right; 
            font-family: 'DejaVu Sans Mono', 'Courier New', monospace; 
        }
        .net-income { 
            font-size: 26px; 
            font-weight: bold; 
            color: #16a34a; 
            text-align: center; 
            margin: 25px 0; 
            padding: 15px; 
            background: #f0fdf4; 
            border-radius: 8px; 
        }
        .section-title { 
            font-size: 15px; 
            font-weight: 600; 
            margin: 20px 0 8px; 
            color: #374151; 
        }
    </style>
</head>
<body>

    <div class="header">
        @if(!empty($logoPath))
            <img class="logo" src="{{ $logoPath }}" alt="{{ $businessName ?? 'Business logo' }}">
        @endif
        <div class="title">{{ $businessName ?? 'Business' }}</div>
        <p style="margin: 5px 0 0; font-size: 14px;">Daily Summary Report{{ $branch?->name ? ' - ' . $branch->name : '' }}</p>
        <p style="margin: 3px 0 0;">{{ $date->format('l, F d, Y') }}</p>
    </div>

    <div class="net-income">
        Net Income: ₱{{ number_format($summary->net_income, 2) }}
    </div>

    <div class="section-title">Sales Summary</div>
    <table>
        <tr><th>Description</th><th class="amount">Amount</th></tr>
        <tr><td>Gross Sales</td><td class="amount">₱{{ number_format($summary->gross_sales, 2) }}</td></tr>
        <tr><td>Total Refunds</td><td class="amount">-₱{{ number_format($summary->total_refunds, 2) }}</td></tr>
        <tr><td><strong>Net Sales</strong></td><td class="amount"><strong>₱{{ number_format($summary->gross_sales - $summary->total_refunds, 2) }}</strong></td></tr>
    </table>

    <div class="section-title">Payment Breakdown</div>
    <table>
        <tr><th>Method</th><th class="amount">Amount</th></tr>
        <tr><td>Cash</td><td class="amount">₱{{ number_format($summary->cash_sales, 2) }}</td></tr>
        <tr><td>GCash</td><td class="amount">₱{{ number_format($summary->gcash_sales, 2) }}</td></tr>
        <tr><td>Card</td><td class="amount">₱{{ number_format($summary->card_sales, 2) }}</td></tr>
        <tr><td>Other</td><td class="amount">₱{{ number_format($summary->other_sales, 2) }}</td></tr>
    </table>

    <div class="section-title">Cash Management</div>
    <table>
        <tr><th>Description</th><th class="amount">Amount</th></tr>
        <tr><td>Opening Cash</td><td class="amount">₱{{ number_format($summary->opening_cash, 2) }}</td></tr>
        <tr><td>Expected Cash</td><td class="amount">₱{{ number_format($summary->expected_cash, 2) }}</td></tr>
        <tr><td>Counted Cash</td><td class="amount">{{ $summary->counted_cash ? '₱' . number_format($summary->counted_cash, 2) : '—' }}</td></tr>
        <tr><td><strong>Over / Short</strong></td><td class="amount"><strong>{{ $summary->over_short >= 0 ? '+' : '' }}₱{{ number_format(abs($summary->over_short), 2) }}</strong></td></tr>
    </table>

    <div style="margin-top: 35px; text-align: center; font-size: 11px; color: #6b7280;">
        Generated on {{ now()->format('Y-m-d H:i:s') }}
    </div>

</body>
</html>
