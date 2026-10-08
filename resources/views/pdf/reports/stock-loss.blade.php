@extends('pdf.reports.layout')

@use('App\Services\Reports\ReportLabels', 'L')
@use('App\Models\StockAdjustment')
@use('Illuminate\Support\Carbon')
@php($s = $report['summary'])

@section('meta')
    @if ($type)
        <tr><td class="k">Type</td><td class="v">{{ StockAdjustment::typeLabel($type) }} only</td></tr>
    @endif
@endsection

@section('content')
    <table class="figures">
        <tr>
            <td><div class="k">Loss value at cost</div><div class="v">{{ L::money($s['value']) }}</div><div class="s">{{ $s['records'] }} write-off(s)</div></td>
            <td><div class="k">Items affected</div><div class="v">{{ $s['items'] }}</div><div class="s">different items</div></td>
            <td><div class="k">Biggest cause</div><div class="v">{{ $s['top_cause'] ?? '—' }}</div><div class="s">by value</div></td>
        </tr>
    </table>

    <table class="two-col"><tr>
        <td>
            <h2><span class="no">1</span>By cause</h2>
            <table class="data">
                <tr><th>Cause</th><th class="num">Records</th><th class="num">Value</th><th class="num">Share</th></tr>
                @foreach ($report['by_type'] as $t)
                    <tr class="{{ $t['count'] ? '' : 'sub' }}">
                        <td>{{ $t['label'] }}</td><td class="num">{{ $t['count'] }}</td>
                        <td class="num">{{ L::money($t['value']) }}</td><td class="num">{{ number_format($t['share'], 1) }}%</td>
                    </tr>
                @endforeach
                <tr class="total"><td>Total</td><td class="num">{{ $s['records'] }}</td><td class="num">{{ L::money($s['value']) }}</td><td class="num">{{ $s['value'] > 0 ? '100.0%' : '—' }}</td></tr>
            </table>
        </td>
        <td>
            <h2><span class="no">2</span>Most affected items</h2>
            <table class="data">
                <tr><th>Item</th><th class="num">Records</th><th class="num">Quantity</th><th class="num">Value</th></tr>
                @forelse ($report['by_product'] as $p)
                    <tr><td>{{ $p['name'] }}</td><td class="num">{{ $p['count'] }}</td><td class="num">{{ L::quantity($p['quantity']) }} {{ $p['unit'] }}</td><td class="num">{{ L::money($p['value']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="4">No write-offs in this period.</td></tr>
                @endforelse
            </table>
        </td>
    </tr></table>

    <h2><span class="no">3</span>Write-off register</h2>
    <table class="data">
        <tr><th>Date</th><th>Item</th><th>Cause</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Value</th><th>Note</th><th>Recorded by</th></tr>
        @forelse ($report['rows'] as $row)
            <tr>
                <td style="white-space: nowrap;">{{ Carbon::parse($row['date'])->format('M j, Y g:i A') }}</td>
                <td>{{ $row['product'] }}</td>
                <td>{{ $row['type_label'] }}</td>
                <td class="num">{{ L::quantity($row['quantity']) }} {{ $row['unit'] }}</td>
                <td class="num">{{ L::money($row['unit_cost']) }}</td>
                <td class="num">{{ L::money($row['value']) }}</td>
                <td>{{ $row['note'] ?: '—' }}</td>
                <td>{{ $row['recorded_by'] }}</td>
            </tr>
        @empty
            <tr class="empty"><td colspan="8">No write-offs in this period.</td></tr>
        @endforelse
        <tr class="total"><td colspan="3">{{ $s['records'] }} record(s)</td><td></td><td></td><td class="num">{{ L::money($s['value']) }}</td><td colspan="2"></td></tr>
    </table>
@endsection
