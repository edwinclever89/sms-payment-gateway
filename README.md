# SMS Payment Gateway

A complete SMS payment gateway system built with **Node.js on Termux** (Android) and **Laravel** (backend server). It automatically listens for incoming payment SMS messages, parses them, stores the transaction, and sends a confirmation SMS reply — all without a third-party SMS provider.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [SMS Format](#sms-format)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Overview

```
Android Phone (Termux)          Laravel Server (PC / VPS)
┌───────────────────────┐       ┌────────────────────────────┐
│  Incoming Payment SMS │       │  POST /api/payment/verify  │
│         ↓             │  JSON │         ↓                  │
│  termux/sms-listener  │──────▶│  PaymentController         │
│  (Node.js)            │       │  • Validate                │
│                       │       │  • Store in DB             │
│                       │◀──────│  • Send SMS reply          │
│  Confirmation SMS     │  SMS  │    via termux-sms-send     │
└───────────────────────┘       └────────────────────────────┘
```

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

---

## Prerequisites

### Android Phone (Termux)
- [Termux](https://f-droid.org/en/packages/com.termux/) (install via F-Droid, **not** Play Store)
- [Termux:API](https://f-droid.org/en/packages/com.termux.api/) companion app
- Node.js ≥ 14

```bash
pkg update && pkg upgrade
pkg install nodejs termux-api
```

### PC / Server (Laravel)
- PHP ≥ 8.1
- Composer
- SQLite or MySQL

---

## Quick Start

### 1 – Clone the repository

```bash
git clone https://github.com/edwinclever89/sms-payment-gateway.git
cd sms-payment-gateway
```

### 2 – Setup Laravel backend

```bash
cd laravel
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite   # if using SQLite
php artisan migrate
php artisan serve
```

### 3 – Setup Termux listener

In Termux on your Android phone:

```bash
cd ~/sms-payment-gateway/termux
npm install
# Edit config.json to set the correct Laravel URL and API token
node sms-listener.js
```

---

## SMS Format

The listener is pre-configured to parse Tanzanian mobile-money payment SMS:

```
Umepokea TSh 3,000 kutoka kwa Wakala - KHATIBU KIMARO, Salio lako jipya ni
TSh 3,030. Kumbukumbu no.: 25804634437820. 28/08/25 08:11. ...
```

Fields extracted:

| Field          | Example value        |
|----------------|----------------------|
| amount         | 3000                 |
| currency       | TSh                  |
| sender_name    | KHATIBU KIMARO       |
| transaction_id | 25804634437820       |
| sender_phone   | (from Termux header) |
| timestamp      | 2025-08-28T08:11:00Z |

---

## API Reference

### `POST /api/payment/verify`

**Headers**

| Header          | Value                        |
|-----------------|------------------------------|
| Content-Type    | application/json             |
| Accept          | application/json             |
| Authorization   | Bearer \<API_TOKEN\>         |

**Request body**

```json
{
  "amount": 3000,
  "currency": "TSh",
  "sender_name": "KHATIBU KIMARO",
  "transaction_id": "25804634437820",
  "sender_phone": "+255700000000",
  "timestamp": "2025-08-28T08:11:00.000Z",
  "raw_sms": "Umepokea TSh 3,000 ..."
}
```

**Success response** `201`

```json
{
  "success": true,
  "message": "Payment verified and stored successfully",
  "transaction_id": "25804634437820",
  "sms_sent": true
}
```

---

## Configuration

### `termux/config.json`

| Key                   | Description                              | Default                        |
|-----------------------|------------------------------------------|--------------------------------|
| laravel.url           | Laravel server base URL                  | `http://127.0.0.1:8000`        |
| laravel.api_token     | Shared secret for API authentication     | `your-secret-api-token-here`   |
| sms.poll_interval_ms  | How often to check for new SMS (ms)      | `5000`                         |
| logging.level         | Log verbosity (debug/info/warn/error)    | `info`                         |

### `laravel/.env`

| Key       | Description                                        |
|-----------|----------------------------------------------------|
| API_TOKEN | Must match `laravel.api_token` in config.json      |
| DB_*      | Database connection settings                       |

---

## Troubleshooting

| Symptom                              | Fix                                               |
|--------------------------------------|---------------------------------------------------|
| `termux-sms-list` not found          | `pkg install termux-api` and grant SMS permission |
| `ECONNREFUSED` in listener log       | Make sure Laravel is running (`php artisan serve`) |
| 401 Unauthorized from Laravel        | Check that API_TOKEN matches in both config files |
| SMS reply not delivered              | Verify Termux:API is installed and has SMS send permission |

---

## License

MIT – see [LICENSE](LICENSE).
