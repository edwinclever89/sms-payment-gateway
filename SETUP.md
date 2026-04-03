# Setup Guide – SMS Payment Gateway

Follow these steps to get the full system running from scratch.

---

## Part 1: Android Phone Setup (Termux)

### 1.1 Install required apps

> Install both apps from **F-Droid** (not the Google Play Store – the Play Store versions are outdated and lack API support).

- [Termux](https://f-droid.org/en/packages/com.termux/)
- [Termux:API](https://f-droid.org/en/packages/com.termux.api/)

### 1.2 Grant permissions

Open Android **Settings → Apps → Termux:API → Permissions** and enable:

- ✅ SMS (Read & Send)
- ✅ Phone

### 1.3 Install packages inside Termux

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git termux-api
```

### 1.4 Verify Termux API works

```bash
# List the last 5 SMS messages – should return a JSON array
termux-sms-list -l 5
```

### 1.5 Clone the repository

```bash
git clone https://github.com/edwinclever89/sms-payment-gateway.git
cd sms-payment-gateway/termux
```

### 1.6 Install Node.js dependencies

```bash
npm install
```

### 1.7 Configure the listener

```bash
nano config.json
```

Update:
- `laravel.url` → your Laravel server URL (e.g. `http://192.168.1.100:8000`)
- `laravel.api_token` → a strong random secret (must match Laravel's `API_TOKEN`)

### 1.8 Start the listener

```bash
node sms-listener.js
```

To run it in the background (keep running after closing Termux):

```bash
nohup node sms-listener.js > sms-listener.log 2>&1 &
echo "Listener PID: $!"
```

---

## Part 2: PC / Server Setup (Laravel)

### 2.1 Prerequisites

- PHP ≥ 8.1 with extensions: `pdo`, `mbstring`, `openssl`, `json`
- [Composer](https://getcomposer.org/)
- SQLite **or** MySQL/MariaDB

### 2.2 Clone & enter the laravel directory

```bash
git clone https://github.com/edwinclever89/sms-payment-gateway.git
cd sms-payment-gateway/laravel
```

### 2.3 Install PHP dependencies

```bash
composer install
```

### 2.4 Configure environment

```bash
cp .env.example .env
php artisan key:generate
```

Open `.env` and set:

```
API_TOKEN=your-secret-api-token-here   # must match config.json on Termux
DB_DATABASE=/absolute/path/to/database.sqlite
```

### 2.5 Create the database

**SQLite (recommended for local development):**

```bash
touch database/database.sqlite
```

**MySQL (production):**

```sql
CREATE DATABASE sms_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then update `DB_CONNECTION`, `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` in `.env`.

### 2.6 Run migrations

```bash
php artisan migrate
```

### 2.7 Start the development server

```bash
php artisan serve
# Listening on http://127.0.0.1:8000
```

For production, configure a web server (Nginx / Apache) to point to the `public/` directory.

---

## Part 3: Verify the System Works

### 3.1 Manual test with curl

```bash
curl -X POST http://127.0.0.1:8000/api/payment/verify \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer your-secret-api-token-here" \
  -d '{
    "amount": 3000,
    "currency": "TSh",
    "sender_name": "KHATIBU KIMARO",
    "transaction_id": "25804634437820",
    "sender_phone": "+255700000000",
    "timestamp": "2025-08-28T08:11:00.000Z"
  }'
```

Expected response (`201 Created`):

```json
{
  "success": true,
  "message": "Payment verified and stored successfully",
  "transaction_id": "25804634437820",
  "sms_sent": true
}
```

### 3.2 End-to-end test

1. Send yourself a mobile-money payment SMS (or ask someone to send one)
2. Watch the Termux console – you should see the SMS parsed and forwarded
3. Check the Laravel log (`storage/logs/laravel.log`) for confirmation

---

## Keeping the Listener Running Automatically

To auto-start the SMS listener when Termux opens, create a boot script:

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-sms-listener.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/sms-payment-gateway/termux
nohup node sms-listener.js >> sms-listener.log 2>&1 &
EOF
chmod +x ~/.termux/boot/start-sms-listener.sh
```

Install the **Termux:Boot** app from F-Droid to enable boot scripts.
