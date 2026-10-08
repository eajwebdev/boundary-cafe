{{--
    Shared letterhead for every report PDF.
    Expects $meta: title, period, branch, businessName, address, phone, tin,
    logoPath, generatedAt, generatedBy, orientation.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{ $meta['title'] }} — {{ $meta['businessName'] }}</title>
    <style>
        @page { margin: 22mm 13mm 18mm 13mm; }
        * { box-sizing: border-box; }
        body { font-family: 'DejaVu Sans', sans-serif; font-size: 8.4pt; color: #1b1b1b; line-height: 1.38; margin: 0; }

        /* Running header and footer (repeat on every page) */
        .running-head { position: fixed; top: -15mm; left: 0; right: 0; height: 9mm; border-bottom: 0.6pt solid #1b1b1b; font-size: 7.4pt; color: #444; }
        .running-head td { padding: 0 0 3pt; vertical-align: bottom; }
        .running-head .biz { font-family: 'DejaVu Serif', serif; font-weight: bold; font-size: 8.6pt; color: #1b1b1b; }
        .running-foot { position: fixed; bottom: -11mm; left: 0; right: 0; height: 7mm; border-top: 0.4pt solid #9a9a9a; font-size: 6.8pt; color: #666; padding-top: 3pt; }

        /* Title block (first page) */
        .title-block { width: 100%; border-collapse: collapse; margin: 0 0 12pt; }
        .title-block td { vertical-align: top; padding: 0; }
        .brand td { padding: 0; vertical-align: middle; }
        .brand td.logo-cell { width: 17mm; padding-right: 7pt; }
        .logo { max-height: 14mm; max-width: 17mm; }
        .business-name { font-family: 'DejaVu Serif', serif; font-size: 13.5pt; font-weight: bold; letter-spacing: 0.2pt; }
        .business-line { font-size: 7.4pt; color: #555; }
        .report-title { font-family: 'DejaVu Serif', serif; font-size: 15pt; font-weight: bold; margin-top: 8pt; }
        .report-period { font-size: 9pt; color: #333; margin-top: 1pt; }
        .meta { border-collapse: collapse; margin-left: auto; font-size: 7.6pt; }
        .meta td { padding: 1.2pt 0 1.2pt 8pt; }
        .meta td.k { color: #666; text-align: right; }
        .meta td.v { font-weight: bold; }

        /* Key figures */
        .figures { width: 100%; border-collapse: collapse; margin: 2pt 0 14pt; table-layout: fixed; }
        .figures td { border: 0.5pt solid #bdbdbd; padding: 5pt 7pt 6pt; vertical-align: top; }
        .figures .k { font-size: 6.8pt; color: #5c5c5c; text-transform: uppercase; letter-spacing: 0.4pt; }
        .figures .v { font-size: 11.5pt; font-weight: bold; margin-top: 1pt; white-space: nowrap; }
        .figures .s { font-size: 6.8pt; color: #666; margin-top: 1pt; }

        /* Sections */
        h2 { font-size: 8.6pt; text-transform: uppercase; letter-spacing: 0.6pt; margin: 14pt 0 4pt; padding-bottom: 2pt; border-bottom: 0.6pt solid #1b1b1b; page-break-after: avoid; }
        h2 .no { color: #777; margin-right: 4pt; }
        .note { font-size: 7.2pt; color: #5c5c5c; margin: 3pt 0 0; }
        .two-col { width: 100%; border-collapse: collapse; }
        .two-col > tbody > tr > td { vertical-align: top; width: 50%; padding: 0; }
        .two-col > tbody > tr > td:first-child { padding-right: 9pt; }
        .two-col > tbody > tr > td:last-child { padding-left: 9pt; }

        /* Data tables */
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { font-size: 6.9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3pt; color: #444; text-align: left; padding: 3pt 4pt; border-bottom: 0.6pt solid #1b1b1b; }
        table.data td { padding: 2.2pt 4pt; border-bottom: 0.3pt solid #d4d4d4; vertical-align: top; }
        table.data td + td, table.data th + th { padding-left: 7pt; }
        table.data tr { page-break-inside: avoid; }
        table.data .num, table.data th.num { text-align: right; white-space: nowrap; }
        table.data .mono { font-family: 'DejaVu Sans Mono', monospace; font-size: 7.4pt; }
        table.data .muted { color: #666; }
        table.data .sub td { color: #555; font-size: 7.6pt; }
        table.data .indent { padding-left: 12pt; }
        table.data tr.subtotal td { font-weight: bold; border-top: 0.6pt solid #1b1b1b; border-bottom: none; }
        table.data tr.total td { font-weight: bold; border-top: 0.6pt solid #1b1b1b; border-bottom: 1.6pt double #1b1b1b; }
        table.data tr.empty td { color: #777; text-align: center; padding: 8pt 4pt; }
        .flag { font-weight: bold; }

        /* Sign-off */
        .signoff { width: 100%; border-collapse: collapse; margin-top: 26pt; page-break-inside: avoid; table-layout: fixed; }
        .signoff td { padding: 0 10pt 0 0; vertical-align: bottom; font-size: 7.4pt; }
        .signoff .line { border-top: 0.6pt solid #1b1b1b; padding-top: 2pt; margin-top: 22pt; }
        .signoff .name { font-weight: bold; }
        .signoff .role { color: #666; }
    </style>
</head>
<body>
    <div class="running-head">
        <table width="100%"><tr>
            <td class="biz">{{ $meta['businessName'] }}</td>
            <td style="text-align: right;">{{ $meta['title'] }} · {{ $meta['branch'] }} · {{ $meta['period'] }}</td>
        </tr></table>
    </div>

    <div class="running-foot">
        Generated {{ $meta['generatedAt'] }} by {{ $meta['generatedBy'] }} · System-generated report; figures are as recorded at the time of printing.
    </div>

    <table class="title-block">
        <tr>
            <td>
                <table class="brand"><tr>
                    @if (! empty($meta['logoPath']))
                        <td class="logo-cell"><img class="logo" src="{{ $meta['logoPath'] }}" alt=""></td>
                    @endif
                    <td>
                        <div class="business-name">{{ $meta['businessName'] }}</div>
                        @if ($meta['address'])<div class="business-line">{{ $meta['address'] }}</div>@endif
                        @if ($meta['phone'] || $meta['tin'])
                            <div class="business-line">
                                {{ $meta['phone'] ? 'Tel. '.$meta['phone'] : '' }}{{ $meta['phone'] && $meta['tin'] ? '  ·  ' : '' }}{{ $meta['tin'] ? 'TIN '.$meta['tin'] : '' }}
                            </div>
                        @endif
                    </td>
                </tr></table>
                <div class="report-title">{{ $meta['title'] }}</div>
                <div class="report-period">{{ $meta['period'] }}</div>
            </td>
            <td style="width: 42%;">
                <table class="meta">
                    <tr><td class="k">Branch</td><td class="v">{{ $meta['branch'] }}</td></tr>
                    <tr><td class="k">Period</td><td class="v">{{ $meta['period'] }}</td></tr>
                    @yield('meta')
                    <tr><td class="k">Generated</td><td class="v">{{ $meta['generatedAt'] }}</td></tr>
                    <tr><td class="k">Prepared by</td><td class="v">{{ $meta['generatedBy'] }}</td></tr>
                </table>
            </td>
        </tr>
    </table>

    @yield('content')

    <table class="signoff">
        <tr>
            <td>
                <div class="line"><span class="name">{{ $meta['generatedBy'] }}</span><br><span class="role">Prepared by</span></div>
            </td>
            <td><div class="line">&nbsp;<br><span class="role">Checked by</span></div></td>
            <td><div class="line">&nbsp;<br><span class="role">Approved by</span></div></td>
        </tr>
    </table>

    <script type="text/php">
        if (isset($pdf)) {
            $font = $fontMetrics->getFont('DejaVu Sans');
            $size = 6.8;
            $text = 'Page {PAGE_NUM} of {PAGE_COUNT}';
            $width = $fontMetrics->getTextWidth('Page 99 of 99', $font, $size);
            $pdf->page_text($pdf->get_width() - $width - 37, $pdf->get_height() - 38, $text, $font, $size, [0.4, 0.4, 0.4]);
        }
    </script>
</body>
</html>
