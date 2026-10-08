@extends('pdf.reports.layout')

@use('App\Services\Reports\ReportLabels', 'L')
@php($f = $report['figures'])

@section('meta')
    <tr><td class="k">Z-reading</td><td class="v">{{ $report['z_reading'] ? 'Z-'.str_pad($report['z_reading']['z_number'], 4, '0', STR_PAD_LEFT) : 'Day not yet closed' }}</td></tr>
@endsection

@section('content')
    <table class="figures">
        <tr>
            <td><div class="k">Net sales</div><div class="v">{{ L::money($f['net_sales']) }}</div><div class="s">{{ number_format($f['transaction_count']) }} transactions</div></td>
            <td><div class="k">Expenses</div><div class="v">{{ L::money($report['expenses']['total']) }}</div><div class="s">{{ $report['expenses']['count'] }} approved</div></td>
            <td><div class="k">Sales less expenses</div><div class="v">{{ L::money($report['sales_less_expenses']) }}</div><div class="s">before cost of goods</div></td>
            <td><div class="k">Cash over / short</div><div class="v">{{ count($f['sessions']) ? L::overShort($f['over_short']) : '—' }}</div><div class="s">{{ count($f['sessions']) }} session(s)</div></td>
        </tr>
    </table>

    <table class="two-col"><tr>
        <td>
            <h2><span class="no">1</span>Sales</h2>
            <table class="data">
                <tr><td>Gross sales</td><td class="num">{{ L::money($f['gross_sales']) }}</td></tr>
                <tr><td>Less: discounts &amp; promos</td><td class="num">({{ L::money($f['discount_total']) }})</td></tr>
                @if ($f['loyalty_discount_total'] > 0)
                    <tr><td>Less: loyalty points redeemed</td><td class="num">({{ L::money($f['loyalty_discount_total']) }})</td></tr>
                @endif
                <tr class="total"><td>Net sales</td><td class="num">{{ L::money($f['net_sales']) }}</td></tr>
                @if ($f['delivery_fees'] > 0)
                    <tr class="sub"><td class="indent">Includes delivery fees</td><td class="num">{{ L::money($f['delivery_fees']) }}</td></tr>
                @endif
                <tr><td>Transactions</td><td class="num">{{ number_format($f['transaction_count']) }}</td></tr>
                <tr><td>Average sale</td><td class="num">{{ L::money($f['transaction_count'] ? $f['net_sales'] / $f['transaction_count'] : 0) }}</td></tr>
                <tr><td>Items sold</td><td class="num">{{ L::quantity($f['items_sold']) }}</td></tr>
                <tr><td>Voided sales ({{ $f['void_count'] }})</td><td class="num">{{ L::money($f['void_amount']) }}</td></tr>
                @if ($f['first_receipt'])
                    <tr><td>Receipt range</td><td class="num mono">{{ $f['first_receipt'] }} – {{ $f['last_receipt'] }}</td></tr>
                @endif
            </table>

            @if ($f['vat_enabled'])
                <h2><span class="no">1a</span>VAT ({{ rtrim(rtrim(number_format($f['vat_rate'], 2), '0'), '.') }}%)</h2>
                <table class="data">
                    <tr><td>VATable sales</td><td class="num">{{ L::money($f['vatable_sales']) }}</td></tr>
                    <tr><td>VAT amount</td><td class="num">{{ L::money($f['vat_amount']) }}</td></tr>
                    <tr><td>VAT-exempt sales</td><td class="num">{{ L::money($f['vat_exempt_sales']) }}</td></tr>
                </table>
            @endif
        </td>
        <td>
            <h2><span class="no">2</span>Payments</h2>
            <table class="data">
                <tr><th>Method</th><th class="num">Count</th><th class="num">Amount</th></tr>
                @forelse ($f['payments'] as $p)
                    <tr><td>{{ L::paymentMethod($p['method']) }}</td><td class="num">{{ $p['count'] }}</td><td class="num">{{ L::money($p['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No sales recorded.</td></tr>
                @endforelse
                <tr class="total"><td>Total</td><td class="num">{{ $f['transaction_count'] }}</td><td class="num">{{ L::money($f['net_sales']) }}</td></tr>
                @if ($f['unpaid_total'] > 0)
                    <tr class="sub"><td colspan="2" class="indent">Still unpaid (on credit)</td><td class="num">{{ L::money($f['unpaid_total']) }}</td></tr>
                @endif
                @if ($f['collections_count'] > 0)
                    <tr class="sub"><td colspan="2" class="indent">Collections on account ({{ $f['collections_count'] }})</td><td class="num">{{ L::money($f['collections_total']) }}</td></tr>
                @endif
            </table>

            <h2><span class="no">3</span>Sales by channel</h2>
            <table class="data">
                <tr><th>Channel</th><th class="num">Count</th><th class="num">Amount</th></tr>
                @forelse ($f['channels'] as $c)
                    <tr><td>{{ L::channel($c['channel']) }}</td><td class="num">{{ $c['count'] }}</td><td class="num">{{ L::money($c['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No sales recorded.</td></tr>
                @endforelse
            </table>
        </td>
    </tr></table>

    <h2><span class="no">4</span>Cash drawer</h2>
    <table class="data">
        <tr>
            <th>Session</th><th>Cashier</th><th>Opened</th><th>Closed</th>
            <th class="num">Opening</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Over / short</th>
        </tr>
        @forelse ($f['sessions'] as $s)
            <tr>
                <td class="mono">{{ $s['session_number'] }}</td>
                <td>{{ $s['cashier'] }}</td>
                <td>{{ $s['opened_at'] ? \Illuminate\Support\Carbon::parse($s['opened_at'])->format('g:i A') : '—' }}</td>
                <td>{{ $s['closed_at'] ? \Illuminate\Support\Carbon::parse($s['closed_at'])->format('g:i A') : 'Still open' }}</td>
                <td class="num">{{ L::money($s['opening_cash']) }}</td>
                <td class="num">{{ L::money($s['expected_cash']) }}</td>
                <td class="num">{{ $s['status'] === 'open' ? '—' : L::money($s['counted_cash']) }}</td>
                <td class="num {{ abs($s['over_short']) >= 0.005 ? 'flag' : '' }}">{{ $s['status'] === 'open' ? '—' : L::overShort($s['over_short']) }}</td>
            </tr>
        @empty
            <tr class="empty"><td colspan="8">No cash sessions on this day.</td></tr>
        @endforelse
        @if (count($f['sessions']) > 1)
            <tr class="total">
                <td colspan="4">Total</td>
                <td class="num">{{ L::money($f['opening_cash']) }}</td>
                <td class="num">{{ L::money($f['expected_cash']) }}</td>
                <td class="num">{{ L::money($f['counted_cash']) }}</td>
                <td class="num">{{ L::overShort($f['over_short']) }}</td>
            </tr>
        @endif
    </table>
    @if ($report['open_sessions'] > 0)
        <p class="note">{{ $report['open_sessions'] }} session(s) still open — cash figures are not final until every session is counted and closed.</p>
    @endif

    <table class="two-col"><tr>
        <td>
            <h2><span class="no">5</span>Expenses</h2>
            <table class="data">
                <tr><th>Category</th><th class="num">Count</th><th class="num">Amount</th></tr>
                @forelse ($report['expenses']['by_category'] as $e)
                    <tr><td>{{ $e['name'] }}</td><td class="num">{{ $e['count'] }}</td><td class="num">{{ L::money($e['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No approved expenses.</td></tr>
                @endforelse
                <tr class="total"><td>Total</td><td class="num">{{ $report['expenses']['count'] }}</td><td class="num">{{ L::money($report['expenses']['total']) }}</td></tr>
            </table>
        </td>
        <td>
            <h2><span class="no">6</span>Best sellers</h2>
            <table class="data">
                <tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr>
                @forelse ($report['top_items'] as $item)
                    <tr><td>{{ $item['name'] }}</td><td class="num">{{ L::quantity($item['quantity']) }}</td><td class="num">{{ L::money($item['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No items sold.</td></tr>
                @endforelse
            </table>
            <p class="note">Item amounts are before order-level discounts.</p>
        </td>
    </tr></table>

    @if (count($report['by_hour']))
        <h2><span class="no">7</span>Sales by hour</h2>
        <table class="data">
            <tr><th>Hour</th><th class="num">Transactions</th><th class="num">Net sales</th><th class="num">Share</th></tr>
            @foreach ($report['by_hour'] as $h)
                <tr>
                    <td>{{ \Illuminate\Support\Carbon::createFromTime($h['hour'])->format('g A') }} – {{ \Illuminate\Support\Carbon::createFromTime(($h['hour'] + 1) % 24)->format('g A') }}</td>
                    <td class="num">{{ $h['count'] }}</td>
                    <td class="num">{{ L::money($h['amount']) }}</td>
                    <td class="num">{{ $f['net_sales'] > 0 ? number_format($h['amount'] / $f['net_sales'] * 100, 1).'%' : '—' }}</td>
                </tr>
            @endforeach
        </table>
    @endif
@endsection
