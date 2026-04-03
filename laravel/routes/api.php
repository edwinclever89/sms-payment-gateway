<?php

use App\Http\Controllers\PaymentController;
use App\Http\Middleware\VerifyApiToken;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned the "api" middleware group. Make something great!
|
*/

Route::middleware([VerifyApiToken::class])->group(function () {
    // Payment verification endpoint – called by the Termux SMS listener
    Route::post('/payment/verify', [PaymentController::class, 'verify']);
});
