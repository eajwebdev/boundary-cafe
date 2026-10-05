@php
    $businessName = \App\Models\SystemSetting::businessName();
    $logoUrl = \App\Models\SystemSetting::logoUrl();
    $fallbackIcon = asset('uploads/logo.png');
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="{{ ($appearance ?? 'system') === 'dark' ? 'dark' : '' }}" data-theme="{{ \App\Models\SystemSetting::get('general.color_theme', null, 'ea') }}" data-app-name="{{ $businessName }}">
    <head>
        <meta charset="utf-8">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ $businessName }}</title>

        <!-- Icons -->
        <link rel="icon" href="{{ $logoUrl ?? $fallbackIcon }}" sizes="any">
        <link rel="apple-touch-icon" href="{{ $logoUrl ?? $fallbackIcon }}">

        <!-- Preconnect to Bunny Fonts (faster loading) -->
        <link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
        <link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700,800|instrument-sans:400,500,600,700" rel="stylesheet">

        <!-- Ziggy routes (important for route() in JS) -->
        @routes

        <!-- Vite + React Refresh + entry points -->
        @viteReactRefresh
        @vite([
            'resources/css/app.css',
            'resources/js/app.tsx',
        ])

        <!-- Inertia head (title, meta, links, scripts) -->
        @inertiaHead
    </head>

    <body class="font-sans antialiased bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        @inertia
    </body>
</html>
