<!DOCTYPE html>
<html>
<head>
    <title>Receipt - {{ $order->order_number }}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .info { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f5f5f5; }
        .total { text-align: right; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{ $supplier->name ?? 'Your Shop' }}</h1>
        <p>Official Receipt</p>
    </div>

    <div class="info">
        <p><strong>Order Number:</strong> {{ $order->order_number }}</p>
        <p><strong>Date:</strong> {{ $order->created_at->format('M d, Y h:i A') }}</p>
        <p><strong>Customer:</strong> {{ $order->user?->name ?? 'Guest' }}</p>
        <p><strong>Phone:</strong> {{ $order->user?->phone ?? '—' }}</p>
        <p><strong>Supplier Contact:</strong> {{ $supplier->contact_person ?? '—' }}</p>
        <p><strong>Supplier Phone:</strong> {{ $supplier->phone ?? '—' }}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
            @foreach($order->items as $item)
                <tr>
                    <td>{{ $item->product?->name ?? '(Deleted Product)' }}</td>
                    <td>₱{{ number_format($item->price, 2) }}</td>
                    <td>{{ $item->quantity }}</td>
                    <td>₱{{ number_format($item->total, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="total">
        <p>Subtotal: ₱{{ number_format($order->subtotal, 2) }}</p>
        <p>Grand Total: ₱{{ number_format($order->total, 2) }}</p>
    </div>
</body>
</html>