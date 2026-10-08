@extends('pdf.reports.layout')

@use('App\Services\Reports\ReportLabels', 'L')
@use('Illuminate\Support\Carbon')
@php($s = $report['summary'])

@section('content')
    <table class="figures">
        <tr>
            <td><div class="k">Total expenses</div><div class="v">{{ L::money($s['total']) }}</div><div class="s">{{ number_format($s['count']) }} approved</div></td>
            <td><div class="k">Average expense</div><div class="v">{{ L::money($s['average']) }}</div><div class="s">per entry</div></td>
            <td><div class="k">Largest single expense</div><div class="v">{{ L::money($s['largest']) }}</div><div class="s">&nbsp;</div></td>
            <td><div class="k">Not yet approved</div><div class="v">{{ L::money($s['not_approved_amount']) }}</div><div class="s">{{ $s['not_approved_count'] }} pending / rejected</div></td>
        </tr>
    </table>

    <table class="two-col"><tr>
        <td>
            <h2><span class="no">1</span>By category</h2>
            <table class="data">
                <tr><th>Category</th><th class="num">Count</th><th class="num">Amount</th><th class="num">Share</th></tr>
                @forelse ($report['by_category'] as $c)
                    <tr><td>{{ $c['name'] }}</td><td class="num">{{ $c['count'] }}</td><td class="num">{{ L::money($c['amount']) }}</td><td class="num">{{ number_format($c['share'], 1) }}%</td></tr>
                @empty
                    <tr class="empty"><td colspan="4">No approved expenses.</td></tr>
                @endforelse
                <tr class="total"><td>Total</td><td class="num">{{ $s['count'] }}</td><td class="num">{{ L::money($s['total']) }}</td><td class="num">100.0%</td></tr>
            </table>
        </td>
        <td>
            <h2><span class="no">2</span>By payment method</h2>
            <table class="data">
                <tr><th>Method</th><th class="num">Count</th><th class="num">Amount</th></tr>
                @forelse ($report['by_method'] as $m)
                    <tr><td>{{ L::paymentMethod($m['key']) }}</td><td class="num">{{ $m['count'] }}</td><td class="num">{{ L::money($m['amount']) }}</td></tr>
                @empty
                    <tr class="empty"><td colspan="3">No approved expenses.</td></tr>
                @endforelse
            </table>
        </td>
    </tr></table>

    <h2><span class="no">3</span>Expense register</h2>
    <table class="data">
        <tr><th>Date</th><th>Reference</th><th>Category</th><th>Description</th><th>Paid by</th><th>Recorded by</th><th class="num">Amount</th></tr>
        @forelse ($register as $row)
            <tr>
                <td style="white-space: nowrap;">{{ Carbon::parse($row['date'])->format('M j, Y') }}</td>
                <td class="mono">{{ $row['reference'] ?: '—' }}</td>
                <td>{{ $row['category'] }}</td>
                <td>{{ $row['description'] ?: '—' }}</td>
                <td>{{ $row['payment_label'] }}</td>
                <td>{{ $row['recorded_by'] }}</td>
                <td class="num">{{ L::money($row['amount']) }}</td>
            </tr>
        @empty
            <tr class="empty"><td colspan="7">No approved expenses in this period.</td></tr>
        @endforelse
        <tr class="total"><td colspan="6">{{ number_format(count($register)) }} expense(s)</td><td class="num">{{ L::money($s['total']) }}</td></tr>
    </table>
    <p class="note">Only approved expenses are included. Pending and rejected entries are shown above for information only.</p>
@endsection
