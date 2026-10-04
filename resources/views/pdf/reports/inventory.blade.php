<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ $businessName ?? 'Business' }} - Inventory Report - {{ now()->format('Y-m-d') }}</title>
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
        .low { color: #dc2626; font-weight: 600; }
        .near { color: #d97706; font-weight: 600; }
    </style>
</head>
<body>

    <div class="header">
        @if(!empty($logoPath))
            <img class="logo" src="{{ $logoPath }}" alt="{{ $businessName ?? 'Business logo' }}">
        @endif
        <div class="title">{{ $businessName ?? 'Business' }}</div>
        <p style="margin: 5px 0 0; font-size: 14px;">Inventory Report{{ $branch?->name ? ' - ' . $branch->name : ' - All Branches' }}</p>
        <p style="margin: 3px 0 0; font-size: 13px;">Current Stock Levels</p>
        <p style="margin: 3px 0 0;">{{ now()->format('l, F d, Y') }}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th>Type</th>
                <th class="text-right">Current Stock</th>
                <th>Expiry Date</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            @foreach($stocks as $item)
            <tr>
                <td>{{ $item->name }}</td>
                <td>{{ $item->category?->name ?? '—' }}</td>
                <td>
                    @if($item->product_type === 'made_to_order')
                        Made to Order
                    @elseif($item->product_type === 'bundle')
                        Bundle
                    @elseif($item->product_type === 'variant')
                        Variant
                    @else
                        Standard
                    @endif
                </td>
                <td class="text-right">{{ $item->stock }} {{ $item->unit ?? 'pcs' }}</td>
                <td>{{ $item->expiry_date ? $item->expiry_date->format('M d, Y') : '—' }}</td>
                <td>
                    @if($item->stock > 0 && $item->stock <= 5)
                        <span class="low">LOW STOCK</span>
                    @elseif($item->expiry_date && $item->expiry_date->diffInDays(now()) <= 30)
                        <span class="near">NEAR EXPIRY</span>
                    @else
                        Normal
                    @endif
                </td>
            </tr>
            @endforeach
        </tbody>
    </table>

    <div style="margin-top: 35px; text-align: center; font-size: 11px; color: #6b7280;">
        Generated on {{ now()->format('Y-m-d H:i:s') }}
    </div>

</body>
</html>
