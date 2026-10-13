<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\DailyMission;
use App\Models\SystemSetting;
use App\Services\DailyMissionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Daily mission settings on the rewards programme page (menu 44).
 * Changes apply from the next draw; missions already handed out today stay as they are.
 */
class LoyaltyMissionController extends Controller
{
    public function __construct(private DailyMissionService $missions) {}

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'share' => ['required', 'integer', 'min:1', 'max:100'],
            'missions' => ['required', 'array', 'min:1', 'max:'.DailyMissionService::MAX_MISSIONS],
            'missions.*.type' => ['required', 'string', Rule::in(DailyMission::TYPES)],
            'missions.*.target' => ['required', 'numeric', 'min:1', 'max:100000'],
            'missions.*.points' => ['required', 'integer', 'min:1', 'max:10000'],
            'missions.*.category_id' => ['nullable', 'required_if:missions.*.type,'.DailyMission::TYPE_CATEGORY, 'integer', 'exists:categories,id'],
        ], [
            'missions.min' => 'Add at least one mission.',
            'missions.*.category_id.required_if' => 'Pick the category for this mission.',
        ]);

        $before = $this->missions->settings();
        $missions = collect($data['missions'])->map(fn (array $m) => [
            'type' => $m['type'],
            // Item missions count whole items.
            'target' => $m['type'] === DailyMission::TYPE_SPEND ? round((float) $m['target'], 2) : max(1, (int) round((float) $m['target'])),
            'points' => (int) $m['points'],
            'category_id' => $m['type'] === DailyMission::TYPE_CATEGORY ? (int) $m['category_id'] : null,
        ])->values()->all();

        SystemSetting::set('loyalty.missions_enabled', $data['enabled']);
        SystemSetting::set('loyalty.missions_share', (int) $data['share']);
        SystemSetting::set('loyalty.missions', $missions);

        $after = $this->missions->settings();
        if ($before != $after) {
            ActivityLog::create([
                'user_id' => $request->user()->id,
                'action' => 'loyalty_missions_updated',
                'properties' => ['description' => 'Updated daily missions', 'changes' => ['from' => $before, 'to' => $after]],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method(),
                'url' => $request->fullUrl(),
            ]);
        }

        return back()->with('success', 'Daily missions saved. Changes apply from the next daily draw.');
    }
}
