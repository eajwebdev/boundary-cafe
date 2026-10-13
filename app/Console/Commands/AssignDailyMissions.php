<?php

namespace App\Console\Commands;

use App\Services\DailyMissionService;
use Illuminate\Console\Command;

class AssignDailyMissions extends Command
{
    protected $signature = 'loyalty:assign-missions';

    protected $description = 'Hand out today\'s daily missions to a random share of members (once per day)';

    public function handle(DailyMissionService $missions): int
    {
        $assigned = $missions->assignToday();
        $this->info("Daily missions handed out: {$assigned}.");

        return self::SUCCESS;
    }
}
