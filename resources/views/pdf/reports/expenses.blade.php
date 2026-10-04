<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ $businessName ?? 'Business' }} - Expenses Report - {{ now()->format('Y-m-d') }}</title>
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
        .total-row td {
            font-weight: bold;
            background-color: #fef2f2;
            border-top: 2px solid #4f46e5;
        }
    </style>
</head>
<body>

    <div class="header">
        @if(!empty($logoPath))
            <img class="logo" src="{{ $logoPath }}" alt="{{ $businessName ?? 'Business logo' }}">
        @endif
        <div class="title">{{ $businessName ?? 'Business' }}</div>
        <p style="margin: 5px 0 0; font-size: 14px;">Expenses Report{{ $branch?->name ? ' - ' . $branch->name : ' - All Branches' }}</p>
        <p style="margin: 3px 0 0; font-size: 13px;">Approved Expenses</p>
        <p style="margin: 3px 0 0;">
            @if($fromDate && $toDate)
                {{ \Carbon\Carbon::parse($fromDate)->format('M d, Y') }} — {{ \Carbon\Carbon::parse($toDate)->format('M d, Y') }}
            @else
                {{ now()->format('F d, Y') }}
            @endif
        </p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th class="amount">Amount</th>
                <th>Payment</th>
            </tr>
        </thead>
        <tbody>
            @foreach($expenses as $expense)
            <tr>
                <td>{{ $expense->expense_date->format('M d, Y') }}</td>
                <td>{{ $expense->category?->name ?? '—' }}</td>
                <td>{{ $expense->description ?: '—' }}</td>
                <td class="amount">₱{{ number_format($expense->amount, 2) }}</td>
                <td>{{ strtoupper($expense->payment_method) }}</td>
            </tr>
            @endforeach

            <tr class="total-row">
                <td colspan="3" style="text-align: right;">TOTAL EXPENSES</td>
                <td class="amount" style="font-size: 15px; color: #dc2626;">
                    ₱{{ number_format($expenses->sum('amount'), 2) }}
                </td>
                <td></td>
            </tr>
        </tbody>
    </table>

    <div style="margin-top: 35px; text-align: center; font-size: 11px; color: #6b7280;">
        Generated on {{ now()->format('Y-m-d H:i:s') }}
    </div>

</body>
</html>
