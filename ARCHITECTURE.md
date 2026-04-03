# Architecture – SMS Payment Gateway

## System Overview

This project bridges incoming payment SMS messages on an Android phone (via Termux) with a Laravel web application that stores transactions and sends automated confirmation replies.

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Android Device                            │
│                                                              │
│  ┌─────────────────────────────────────────┐                │
│  │  Termux (Linux environment)             │                │
│  │                                         │                │
│  │  ┌───────────────────┐                  │                │
│  │  │  sms-listener.js  │  Poll every 5 s  │                │
│  │  │  (Node.js)        │◀─────────────────┤                │
│  │  └────────┬──────────┘                  │                │
│  │           │ termux-sms-list             │                │
│  │           ▼                             │                │
│  │  ┌────────────────────┐                 │                │
│  │  │  SMS Inbox         │                 │                │
│  │  │  (Android SIM)     │                 │                │
│  │  └────────────────────┘                 │                │
│  │                                         │                │
│  │  ┌──────────────────────────────────┐   │                │
│  │  │  termux-sms-send (reply)         │   │                │
│  │  └──────────────────────────────────┘   │                │
│  └─────────────────────────────────────────┘                │
└───────────────────────────┬──────────────────────────────────┘
                            │  HTTP POST (JSON)
                            │  Authorization: Bearer <token>
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                 Laravel Server (PC / VPS)                    │
│                                                              │
│  routes/api.php                                              │
│    POST /api/payment/verify                                  │
│         │                                                    │
│         ▼                                                    │
│  VerifyApiToken (Middleware)                                 │
│         │                                                    │
│         ▼                                                    │
│  PaymentController@verify                                    │
│    ├─ Validate input                                         │
│    ├─ Check for duplicate transaction_id                     │
│    ├─ Persist Transaction model → SQLite / MySQL             │
│    └─ shell_exec(termux-sms-send) → confirmation SMS        │
│                                                              │
│  Database (transactions table)                               │
│    id | amount | currency | sender_name | transaction_id    │
│       | sender_phone | status | timestamp | created_at      │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
1. Payment SMS arrives on Android SIM
        ↓
2. termux-sms-list returns inbox (polled every 5 s)
        ↓
3. sms-listener.js compares _id against last-processed watermark
        ↓ (new message)
4. parsePaymentSms() applies regex to extract:
   amount, currency, sender_name, transaction_id, timestamp
        ↓
5. axios.post() sends JSON to Laravel with Bearer token
        ↓
6. Laravel validates → deduplicates → stores in DB
        ↓
7. shell_exec("termux-sms-send -n <phone> 'Payment of TSh X received…'")
        ↓
8. Confirmation SMS delivered to payer
```

---

## Database Schema

### `transactions`

| Column         | Type          | Constraints      | Description                        |
|----------------|---------------|------------------|------------------------------------|
| id             | BIGINT        | PK, auto-inc     | Internal record ID                 |
| amount         | DECIMAL(15,2) | NOT NULL         | Payment amount                     |
| currency       | VARCHAR(10)   | DEFAULT 'TSh'    | Currency code                      |
| sender_name    | VARCHAR(255)  | NOT NULL         | Full name from SMS                 |
| transaction_id | VARCHAR(255)  | UNIQUE, NOT NULL | Mobile-money reference number      |
| sender_phone   | VARCHAR(50)   | NULL             | Payer's phone number               |
| status         | ENUM          | DEFAULT 'pending'| pending / completed / failed       |
| timestamp      | TIMESTAMP     | NULL             | Time extracted from SMS            |
| created_at     | TIMESTAMP     |                  | Record creation time               |
| updated_at     | TIMESTAMP     |                  | Record last-updated time           |

---

## Security Design

| Concern              | Mitigation                                                   |
|----------------------|--------------------------------------------------------------|
| Unauthorized access  | `VerifyApiToken` middleware checks `Authorization: Bearer`   |
| Token comparison     | `hash_equals()` prevents timing-based token leakage         |
| Duplicate processing | Unique constraint on `transaction_id` + pre-insert check     |
| Input validation     | Laravel `Validator` enforces types and required fields       |
| Shell injection      | `escapeshellarg()` used on all shell_exec arguments          |

---

## File Structure

```
sms-payment-gateway/
│
├── termux/
│   ├── sms-listener.js          # Main Node.js listener
│   ├── config.json              # Runtime configuration
│   ├── package.json             # npm dependencies (axios)
│   └── last_processed.txt       # Auto-created watermark file
│
├── laravel/
│   ├── app/
│   │   ├── Http/
│   │   │   ├── Controllers/
│   │   │   │   └── PaymentController.php
│   │   │   └── Middleware/
│   │   │       └── VerifyApiToken.php
│   │   └── Models/
│   │       └── Transaction.php
│   ├── database/
│   │   └── migrations/
│   │       └── 2025_08_28_000001_create_transactions_table.php
│   ├── routes/
│   │   └── api.php
│   └── .env.example
│
├── README.md
├── SETUP.md
├── ARCHITECTURE.md
├── .gitignore
└── LICENSE
```

---

## Technology Choices

| Layer             | Technology     | Reason                                      |
|-------------------|----------------|---------------------------------------------|
| SMS listener      | Node.js        | async I/O, easy JSON/HTTP, runs on Termux   |
| HTTP client       | axios          | Promise-based, timeout support              |
| Backend framework | Laravel 10+    | Rapid API development, Eloquent ORM         |
| Database          | SQLite / MySQL | SQLite zero-config for dev; MySQL for prod  |
| SMS sending       | termux-sms-send| Uses device SIM – no external SMS provider  |
