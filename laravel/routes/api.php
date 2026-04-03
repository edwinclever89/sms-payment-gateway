<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PaymentController;

Route::post('/payment/verify', [PaymentController::class, 'verify']);
Route::get('/payment/status/{id}', [PaymentController::class, 'getStatus']);
Route::get('/payment/transactions', [PaymentController::class, 'getTransactions']);