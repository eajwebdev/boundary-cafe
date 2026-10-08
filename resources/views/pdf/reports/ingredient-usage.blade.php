@extends('pdf.reports.layout')

@use('App\Services\Reports\ReportLabels', 'L')
@php($s = $report['summary'])

@section('meta')
    <tr><td class="k">Days covered</td><td class="v">{{ $report['days'] }}</td></tr>
@endsection

@section('content')
    <table class="figures">
        <tr>
            <td><div class="k">Ingredients used</div><div class="v">{{ $s['ingredients'] }}</div><div class="s">in this period</div></td>
            <td><div class="k">Menu items sold</div><div class="v">{{ $s['products'] }}</div><div class="s">made-to-order</div></td>
            <td><div class="k">Running low</div><div class="v">{{ $s['running_low'] }}</div><div class="s">under 3 days of stock</div></td>
        </tr>
    </table>

    <h2><span class="no">1</span>Ingredient consumption</h2>
    <table class="data">
        <tr>
            <th>Ingredient / used in</th><th class="num">Per item</th><th class="num">Items sold</th>
            <th class="num">Used</th><th class="num">Avg / day</th><th class="num">On hand</th><th class="num">Days left</th>
        </tr>
        @forelse ($report['rows'] as $row)
            <tr class="subtotal">
                <td>{{ $row['ingredient'] }}</td>
                <td></td><td></td>
                <td class="num">{{ L::quantity($row['used']) }} {{ $row['unit'] }}</td>
                <td class="num">{{ L::quantity($row['per_day']) }} {{ $row['unit'] }}</td>
                <td class="num">{{ $row['on_hand'] === null ? '—' : L::quantity($row['on_hand']).' '.$row['unit'] }}</td>
                <td class="num">{{ $row['days_left'] === null ? '—' : number_format($row['days_left'], 1) }}</td>
            </tr>
            @foreach ($row['products'] as $p)
                <tr class="sub">
                    <td class="indent">{{ $p['name'] }}</td>
                    <td class="num">{{ L::quantity($p['per_unit']) }} {{ $row['unit'] }}</td>
                    <td class="num">{{ L::quantity($p['sold']) }}</td>
                    <td class="num">{{ L::quantity($p['used']) }} {{ $row['unit'] }}</td>
                    <td colspan="3"></td>
                </tr>
            @endforeach
        @empty
            <tr class="empty"><td colspan="7">No made-to-order items were sold in this period.</td></tr>
        @endforelse
    </table>
    <p class="note">
        Worked out the same way the POS deducts stock: made-to-order items sold without a variant, using today's recipes; voided sales excluded.
        Quantities are in the recipe unit. "Days left" = stock on hand ÷ average daily use over this period.
    </p>
@endsection
