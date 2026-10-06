<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Throwable;

/**
 * Something on a branch's dining floor changed: a table's status or a table ticket.
 *
 * The event carries no data on purpose. Screens that hear it re-fetch through their
 * usual permission-checked endpoints, so nothing sensitive travels over the socket.
 */
class TableFloorChanged implements ShouldBroadcastNow
{
    use Dispatchable;

    public const BROADCAST_NAME = 'floor.changed';

    public function __construct(public int $branchId) {}

    public static function channelFor(int $branchId): string
    {
        return "branch.{$branchId}.tables";
    }

    /**
     * Announce a change after the current request has been answered.
     *
     * Calls for the same branch within one request collapse into a single broadcast,
     * and a broadcaster outage is reported instead of failing whatever caused the change.
     */
    public static function signal(?int $branchId): void
    {
        if (! $branchId) {
            return;
        }

        defer(function () use ($branchId) {
            try {
                event(new self($branchId));
            } catch (Throwable $e) {
                report($e);
            }
        }, "table-floor-changed:{$branchId}");
    }

    /**
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel(self::channelFor($this->branchId))];
    }

    public function broadcastAs(): string
    {
        return self::BROADCAST_NAME;
    }

    /**
     * @return array{}
     */
    public function broadcastWith(): array
    {
        return [];
    }
}
