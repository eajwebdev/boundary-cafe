<?php

namespace App\Console\Commands;

use App\Services\LoyaltyRewardService;
use Illuminate\Console\Command;

class ExpireLoyaltyClaims extends Command
{
    protected $signature = 'loyalty:expire-claims';

    protected $description = 'Return the points of reward QR claims that were not used before they expired';

    public function handle(LoyaltyRewardService $rewards): int
    {
        $expired = $rewards->expireStale();
        $this->info("{$expired} reward claim(s) expired.");

        return self::SUCCESS;
    }
}
