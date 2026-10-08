@extends('pdf.reports.layout')

@use('App\Services\Reports\ReportLabels', 'L')
@use('Illuminate\Support\Carbon')
@php
    $s = $report['summary'];
    $statusLabels = ['out' => 'Out of stock', 'low' => 'Low', 'expired' => 'Expired', 'expiring' => 'Expiring', 'ok' => 'OK'];
    $rows = collect($report['rows']);
@endphp

@section('meta')
    <tr><td class="k">Low-stock level</td><td class="v">{{ $report['low_stock_threshold'] }} or fewer</td></tr>
    @if ($filterNote)
        <tr><td class="k">Filter</td><td class="v">{{ $filterNote }}</td></tr>
    @endif
@endsection

@section('content')
    <table class="figures">
        <tr>
            <td><div class="k">Stock value at cost</div><div class="v">{{ L::money($s['value']) }}</div><div class="s">{{ number_format($s['items']) }} stocked items</div></td>
            <td><div class="k">Value at selling price</div><div class="v">{{ L::money($s['retail_value']) }}</div><div class="s">current prices</div></td>
            <td><div class="k">Out of stock</div><div class="v">{{ $s['out'] }}</div><div class="s">items at zero</div></td>
            <td><div class="k">Low stock</div><div class="v">{{ $s['low'] }}</div><div class="s">at or below {{ $report['low_stock_threshold'] }}</div></td>
            <td><div class="k">Expired / expiring</div><div class="v">{{ $s['expired'] }} / {{ $s['expiring'] }}</div><div class="s">need attention</div></td>
        </tr>
    </table>

    <h2><span class="no">1</span>Stock on hand{{ $filterNote ? ' — '.$filterNote : '' }}</h2>
    <table class="data">
        <tr>
            <th>Item</th><th>SKU / barcode</th><th>Category</th>
            <th class="num">On hand</th><th class="num">Unit cost</th><th class="num">Value at cost</th>
            <th class="num">Selling price</th><th>Next expiry</th><th>Status</th>
        </tr>
        @forelse ($rows as $row)
            <tr>
                <td>{{ $row['name'] }}@if ($row['variant']) <span class="muted">— {{ $row['variant'] }}</span>@endif</td>
                <td class="mono">{{ $row['sku'] ?: '—' }}</td>
                <td>{{ $row['category'] }}</td>
                <td class="num">{{ L::quantity($row['stock']) }} {{ $row['unit'] }}</td>
                <td class="num">{{ L::money($row['unit_cost']) }}</td>
                <td class="num">{{ L::money($row['value']) }}</td>
                <td class="num">{{ L::money($row['price']) }}</td>
                <td>{{ $row['expiry_date'] ? Carbon::parse($row['expiry_date'])->format('M j, Y') : '—' }}</td>
                <td class="{{ $row['status'] !== 'ok' ? 'flag' : 'muted' }}">{{ $statusLabels[$row['status']] }}</td>
            </tr>
        @empty
            <tr class="empty"><td colspan="9">No stocked items match.</td></tr>
        @endforelse
        <tr class="total">
            <td colspan="5">{{ number_format($rows->count()) }} item(s)</td>
            <td class="num">{{ L::money($rows->sum('value')) }}</td>
            <td colspan="3"></td>
        </tr>
    </table>
    <p class="note">
        Values use each branch's recorded capital (unit cost). Negative stock is valued at zero.
        @if ($report['excluded_count'] > 0)
            {{ $report['excluded_count'] }} made-to-order, bundle or service item(s) are not listed — they hold no stock of their own; their ingredients and components are.
        @endif
    </p>
@endsection
