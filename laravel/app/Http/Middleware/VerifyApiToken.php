<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyApiToken
{
    /**
     * Handle an incoming request.
     *
     * Validates the Bearer token in the Authorization header against the
     * API_TOKEN value configured in the application's .env file.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $configuredToken = config('app.api_token');

        // If no token is configured, allow all requests (development convenience)
        if (empty($configuredToken)) {
            return $next($request);
        }

        $provided = $request->bearerToken();

        if (!$provided || !hash_equals($configuredToken, $provided)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized – invalid or missing API token',
            ], 401);
        }

        return $next($request);
    }
}
