@extends('pdf.reports.layout')

@use('App\Services\Reports\ReportLabels', 'L')
@use('Illuminate\Support\Carbon')
@php($s = $report['summary'])

@section('meta')
    @if ($paymentMethod)
        <tr><td class="k">Register filter</td><td class="v">{{ L::paymentMethod($paymentMethod) }} only</td></tr>
    @endif
@endsection

@section('content')
    <table class="figures">
        <tr>
            <td><div class="k">Net sales</div><div class="v">{{ L::money($s['net_sales']) }}</div><div class="s">{{ number_format($s['transactions']) }} transactions</div></td>
            <td><div class="k">Average sale</div><div class="v">{{ L::money($s['average_sale']) }}</div><div class="s">per transaction</div></td>
            <td><div class="k">Cash received</div><div class="v">{{ L::money($s['cash_in']) }}</div><div class="s">sales + collections</div></td>
            <td><div class="k">Outstanding</div><div class="v">{{ L::money($s['outstanding']) }}</div><div class="s">unpaid credit</div></td>
            <td><div class="k">Voided</div><div class="v">{{ L::money($s['void_amount']) }}</div><div class="s">{{ $s['void_count'] }} sale(s)</div></td>
        </tr>
    </table>

    <table class="two-col"><tr>
        <td>
            <h2><span class="no">1</span>Summary</h2>
            <table class="data">
                <tr><td>Gross sales</td><td class="num">{{ L::money($s['gross_sales']) }}</td></tr>
                <tr><td>Less: discounts, promos &amp; loyalty</td><td class="num">({{ L::money($s['discounts']) }})</td></tr>
                <tr class="subtotal"><td>Net sales</td><td class="num">{{ L::money($s['net_sales']) }}</td></tr>
                <tr><td>Collected on these sales</td><td class="num">{{ L::money($s['collected']) }}</td></tr>
                <tr><td>Add: collections on account ({{ $s['collections_count'] }})</td><td class="num">{{ L::money($s['collections']) }}</td></tr>
                <tr class="total"><td>Total cash received</td><td class="num">{{ L::money($s['cash_in']) }}</td></tr>
                <tr class="sub"><td class="indent">Unpaid balances on these sales</td><td class="num">{{ L::money($s['outstanding']) }}</td></tr>
            </table>
        </td>
        <td>
            <h2><span class="no">2</span>By payment method</h2>
            <table class="data">
                <tr><th>Method</th><th class="num">Count</th><th class="num">Sales</th><th class="num">Collected</th></tr>
                @forelse ($report['by_method'] as $m)
                    <tr><td>{{ L::paymentMethod($m['key']) }}</td><td class="num">{{ $m['count'] }}</td><td class="num">{{ L::money($m['amount']) }}</td><td class="num">{{ L::money($m['collected']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="4">No sales in this period.</td></tr>
                @endforelse
                <tr class="total"><td>Total</td><td class="num">{{ $s['transactions'] }}</td><td class="num">{{ L::money($s['net_sales']) }}</td><td class="num">{{ L::money($s['collected']) }}</td></tr>
            </table>

            <h2><span class="no">3</span>By channel</h2>
            <table class="data">
                <tr><th>Channel</th><th class="num">Count</th><th class="num">Sales</th></tr>
                @forelse ($report['by_channel'] as $c)
                    <tr><td>{{ L::channel($c['key']) }}</td><td class="num">{{ $c['count'] }}</td><td class="num">{{ L::money($c['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No sales in this period.</td></tr>
                @endforelse
            </table>
        </td>
    </tr></table>

    <table class="two-col"><tr>
        <td>
            <h2><span class="no">4</span>By cashier</h2>
            <table class="data">
                <tr><th>Cashier</th><th class="num">Count</th><th class="num">Net sales</th></tr>
                @forelse ($report['by_cashier'] as $c)
                    <tr><td>{{ $c['name'] }}</td><td class="num">{{ $c['count'] }}</td><td class="num">{{ L::money($c['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No sales in this period.</td></tr>
                @endforelse
            </table>
        </td>
        <td>
            <h2><span class="no">5</span>Best sellers</h2>
            <table class="data">
                <tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr>
                @forelse ($report['top_items'] as $item)
                    <tr><td>{{ $item['name'] }}</td><td class="num">{{ L::quantity($item['quantity']) }}</td><td class="num">{{ L::money($item['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No items sold.</td></tr>
                @endforelse
            </table>
            <p class="note">Item amounts are line totals before order-level discounts.</p>
        </td>
    </tr></table>

    <h2><span class="no">6</span>Daily sales</h2>
    <table class="data">
        <tr><th>Date</th><th class="num">Transactions</th><th class="num">Average sale</th><th class="num">Discounts</th><th class="num">Net sales</th><th class="num">Share</th></tr>
        @forelse ($report['by_day'] as $d)
            <tr>
                <td>{{ Carbon::parse($d['date'])->format('D, M j, Y') }}</td>
                <td class="num">{{ $d['count'] }}</td>
                <td class="num">{{ L::money($d['count'] ? $d['amount'] / $d['count'] : 0) }}</td>
                <td class="num">{{ L::money($d['discounts']) }}</td>
                <td class="num">{{ L::money($d['amount']) }}</td>
                <td class="num">{{ $s['net_sales'] > 0 ? number_format($d['amount'] / $s['net_sales'] * 100, 1).'%' : '—' }}</td>
            </tr>
        @empty
            <tr class="empty"><td colspan="6">No sales in this period.</td></tr>
        @endforelse
        @if (count($report['by_day']) > 1)
            <tr class="total"><td>Total</td><td class="num">{{ $s['transactions'] }}</td><td class="num">{{ L::money($s['average_sale']) }}</td><td class="num">{{ L::money($s['discounts']) }}</td><td class="num">{{ L::money($s['net_sales']) }}</td><td class="num">100.0%</td></tr>
        @endif
    </table>

    <h2><span class="no">7</span>Transaction register{{ $paymentMethod ? ' — '.L::paymentMethod($paymentMethod).' only' : '' }}</h2>
    <table class="data">
        <tr>
            <th>Receipt</th><th>Date &amp; time</th><th>Cashier</th><th>Customer</th><th>Channel</th><th>Payment</th>
            <th class="num">Discount</th><th class="num">Total</th><th class="num">Collected</th><th class="num">Balance</th>
        </tr>
        @forelse ($register as $row)
            <tr>
                <td class="mono">{{ $row['receipt_number'] }}</td>
                <td>{{ Carbon::parse($row['created_at'])->format('M j, Y g:i A') }}</td>
                <td>{{ $row['cashier'] }}</td>
                <td>{{ $row['customer'] ?: 'Walk-in' }}</td>
                <td>{{ $row['channel'] }}</td>
                <td>{{ $row['payment_label'] }}</td>
                <td class="num">{{ $row['discount'] > 0 ? L::money($row['discount']) : '—' }}</td>
                <td class="num">{{ L::money($row['total']) }}</td>
                <td class="num">{{ L::money($row['collected']) }}</td>
                <td class="num">{{ $row['balance'] > 0 ? L::money($row['balance']) : '—' }}</td>
            </tr>
        @empty
            <tr class="empty"><td colspan="10">No sales in this period.</td></tr>
        @endforelse
        <tr class="total">
            <td colspan="6">{{ number_format(count($register)) }} transaction(s)</td>
            <td class="num">{{ L::money(collect($register)->sum('discount')) }}</td>
            <td class="num">{{ L::money(collect($register)->sum('total')) }}</td>
            <td class="num">{{ L::money(collect($register)->sum('collected')) }}</td>
            <td class="num">{{ L::money(collect($register)->sum('balance')) }}</td>
        </tr>
    </table>
    <p class="note">Voided sales are excluded from every figure except the "Voided" total.</p>
@endsection
