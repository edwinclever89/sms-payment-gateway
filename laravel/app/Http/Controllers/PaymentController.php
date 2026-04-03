<?php

namespace App\Http\Controllers;

use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class PaymentController extends Controller
{
    /**
     * Receive and verify a payment forwarded from the Termux SMS listener.
     *
     * POST /api/payment/verify
     *
     * Expected JSON body:
     * {
     *   "amount":         3000,
     *   "currency":       "TSh",
     *   "sender_name":    "KHATIBU KIMARO",
     *   "transaction_id": "25804634437820",
     *   "sender_phone":   "+255700000000",
     *   "timestamp":      "2025-08-28T08:11:00.000Z",
     *   "raw_sms":        "Umepokea TSh 3,000 kutoka kwa Wakala..."
     * }
     */
    public function verify(Request $request): JsonResponse
    {
        // ── Validate incoming data ────────────────────────────────────────────
        $validator = Validator::make($request->all(), [
            'amount'         => 'required|numeric|min:1',
            'currency'       => 'required|string|max:10',
            'sender_name'    => 'required|string|max:255',
            'transaction_id' => 'required|string|max:255',
            'sender_phone'   => 'nullable|string|max:50',
            'timestamp'      => 'nullable|string',
            'raw_sms'        => 'nullable|string',
        ]);

        if ($validator->fails()) {
            Log::warning('Payment verification failed – validation errors', [
                'errors' => $validator->errors()->toArray(),
                'input'  => $request->all(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $data = $validator->validated();

        // ── Prevent duplicate transactions ────────────────────────────────────
        if (Transaction::where('transaction_id', $data['transaction_id'])->exists()) {
            Log::info('Duplicate transaction ignored', ['transaction_id' => $data['transaction_id']]);

            return response()->json([
                'success' => false,
                'message' => 'Transaction already processed',
            ], 409);
        }

        // ── Persist transaction ───────────────────────────────────────────────
        $transaction = Transaction::create([
            'amount'         => $data['amount'],
            'currency'       => $data['currency'],
            'sender_name'    => $data['sender_name'],
            'transaction_id' => $data['transaction_id'],
            'sender_phone'   => $data['sender_phone'] ?? null,
            'status'         => 'completed',
            'timestamp'      => isset($data['timestamp'])
                                    ? \Carbon\Carbon::parse($data['timestamp'])
                                    : now(),
        ]);

        Log::info('Payment stored successfully', [
            'id'             => $transaction->id,
            'transaction_id' => $transaction->transaction_id,
            'amount'         => $transaction->amount,
        ]);

        // ── Send SMS confirmation ─────────────────────────────────────────────
        $smsSent = $this->sendConfirmationSms(
            $transaction->sender_phone,
            $transaction->amount,
            $transaction->currency
        );

        return response()->json([
            'success'        => true,
            'message'        => 'Payment verified and stored successfully',
            'transaction_id' => $transaction->transaction_id,
            'sms_sent'       => $smsSent,
        ], 201);
    }

    /**
     * Send a confirmation SMS to the payer using the device SIM card via
     * the Termux API (termux-sms-send).
     *
     * @param  string|null  $phone    Recipient phone number
     * @param  float        $amount   Payment amount
     * @param  string       $currency Currency string (e.g. "TSh")
     * @return bool True if the SMS was dispatched without error
     */
    private function sendConfirmationSms(?string $phone, float $amount, string $currency): bool
    {
        if (empty($phone) || $phone === 'Unknown') {
            Log::warning('Cannot send confirmation SMS – no valid phone number', [
                'phone' => $phone,
            ]);
            return false;
        }

        $formattedAmount = number_format($amount, 0, '.', ',');
        $message = "Payment of {$currency} {$formattedAmount} received successfully. Thank you";

        // Escape single-quotes for the shell command
        $safePhone   = escapeshellarg($phone);
        $safeMessage = escapeshellarg($message);

        $command = "termux-sms-send -n {$safePhone} {$safeMessage}";

        try {
            $output = shell_exec($command . ' 2>&1');

            Log::info('Confirmation SMS sent', [
                'phone'   => $phone,
                'message' => $message,
                'output'  => trim($output ?? ''),
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::error('Failed to send confirmation SMS', [
                'phone'   => $phone,
                'error'   => $e->getMessage(),
            ]);
            return false;
        }
    }
}
