<?php

namespace App\Console\Commands;

use App\Services\LoyaltyService;
use Illuminate\Console\Command;

class ExpireLoyaltyPoints extends Command
{
    protected $signature = 'loyalty:expire-points';

    protected $description = 'Expire the points of members inactive longer than the loyalty.points_expiry_months setting (0 = never)';

    public function handle(LoyaltyService $loyalty): int
    {
        $expired = $loyalty->expireInactivePoints();
        $this->info("Points expired for {$expired} member(s).");

        return self::SUCCESS;
    }
}
