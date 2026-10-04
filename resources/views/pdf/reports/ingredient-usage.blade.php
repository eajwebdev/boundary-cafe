<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ $businessName ?? 'Business' }} - Ingredient Usage Report - {{ now()->format('Y-m-d') }}</title>
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
            margin: 0 0 20px;
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
        .ingredient-name {
            font-weight: 600;
        }
        .breakdown-row td {
            background-color: #f9fafb;
            font-size: 12px;
            color: #6b7280;
            padding-left: 24px;
        }
        .section-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6b7280;
            margin: 4px 0 2px;
        }
    </style>
</head>
<body>

    <div class="header">
        @if(!empty($logoPath))
            <img class="logo" src="{{ $logoPath }}" alt="{{ $businessName ?? 'Business logo' }}">
        @endif
        <div class="title">{{ $businessName ?? 'Business' }}</div>
        <p style="margin: 5px 0 0; font-size: 14px;">Ingredient Usage Report{{ $branch?->name ? ' - ' . $branch->name : ' - All Branches' }}</p>
        <p style="margin: 3px 0 0; font-size: 13px;">Ingredient Consumption by Sales</p>
        <p style="margin: 3px 0 0;">
            @if($fromDate && $toDate)
                {{ \Carbon\Carbon::parse($fromDate)->format('M d, Y') }} — {{ \Carbon\Carbon::parse($toDate)->format('M d, Y') }}
            @else
                {{ now()->format('F d, Y') }}
            @endif
        </p>
    </div>

    @if($usage->isEmpty())
        <p style="text-align:center; color:#6b7280; margin-top:40px;">No ingredient usage data for the selected period.</p>
    @else
        <table>
            <thead>
                <tr>
                    <th>Ingredient</th>
                    <th class="amount">Total Used</th>
                    <th>Unit</th>
                    <th>Used In Products</th>
                </tr>
            </thead>
            <tbody>
                @foreach($usage as $item)
                    <tr>
                        <td class="ingredient-name">{{ $item->ingredient_name }}</td>
                        <td class="amount">{{ number_format($item->total_used, 4) }}</td>
                        <td>{{ $item->unit }}</td>
                        <td>
                            @foreach($item->recipes_used_in as $recipe)
                                <div>
                                    <span style="font-weight:500;">{{ $recipe->product_name }}</span>
                                    <span style="color:#6b7280; font-size:11px;">
                                        — {{ number_format($recipe->quantity_per_unit, 4) }} {{ $item->unit }}/unit
                                        × {{ number_format($recipe->total_sold) }} sold
                                    </span>
                                </div>
                            @endforeach
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>

        <p style="font-size:12px; color:#6b7280;">
            Total ingredients tracked: <strong>{{ $usage->count() }}</strong>
        </p>
    @endif

    <div style="margin-top: 35px; text-align: center; font-size: 11px; color: #6b7280;">
        Generated on {{ now()->format('Y-m-d H:i:s') }}
    </div>

</body>
</html>
