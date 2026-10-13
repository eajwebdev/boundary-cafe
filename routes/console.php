<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Unused reward QRs give their points back once they expire (they are also expired on the spot when scanned or viewed).
Schedule::command('loyalty:expire-claims')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('loyalty:expire-points')->dailyAt('02:00')->withoutOverlapping();
// Today's daily missions go out just after midnight (the first storefront visit hands them out if this did not run).
Schedule::command('loyalty:assign-missions')->dailyAt('00:05')->withoutOverlapping();
