<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;

class QuotationController extends Controller
{
    /**
     * Client and project details for the public quotation pages (public/proposal/boundary-cafe).
     * Edited under System Settings → Quotation.
     */
    public function details(): JsonResponse
    {
        return response()->json([
            'client_name'    => (string) SystemSetting::get('quotation.client_name', null, 'Boundary Café'),
            'client_address' => (string) SystemSetting::get('quotation.client_address', null, ''),
            'project_name'   => (string) SystemSetting::get('quotation.project_name', null, ''),
            'project_note'   => [
                'subscription' => (string) SystemSetting::get('quotation.project_note_subscription', null, ''),
                'one_time'     => (string) SystemSetting::get('quotation.project_note_one_time', null, ''),
            ],
        ])->header('Cache-Control', 'no-cache');
    }
}
