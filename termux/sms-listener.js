#!/usr/bin/env node

/**
 * SMS Payment Gateway - Termux SMS Listener
 *
 * Listens for incoming SMS via Termux API, parses Tanzanian payment SMS,
 * and forwards parsed data to the Laravel backend for processing.
 *
 * Usage: node sms-listener.js
 * Requires: termux-api package (pkg install termux-api)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// ─── Logger ──────────────────────────────────────────────────────────────────

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[config.logging.level] ?? LOG_LEVELS.info;

function log(level, message, data) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;

  console.log(entry);

  try {
    fs.appendFileSync(config.logging.file, entry + '\n');
  } catch (_) {
    // Non-fatal: logging to file failed, continue
  }
}

// ─── SMS Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a Tanzanian payment SMS into a structured object.
 *
 * Expected format (example):
 *   "Umepokea TSh 3,000 kutoka kwa Wakala - KHATIBU KIMARO, Salio lako jipya
 *    ni TSh 3,030. Kumbukumbu no.: 25804634437820. 28/08/25 08:11. ..."
 *
 * @param {string} body  Raw SMS body text
 * @param {string} from  Sender phone number reported by Termux
 * @returns {Object|null} Parsed payment data, or null if SMS does not match
 */
function parsePaymentSms(body, from) {
  const { regex } = config.sms;

  const amountMatch = body.match(new RegExp(regex.amount));
  const senderMatch = body.match(new RegExp(regex.sender_name));
  const txnMatch = body.match(new RegExp(regex.transaction_id));
  const timestampMatch = body.match(new RegExp(regex.timestamp));

  // The SMS must contain at minimum an amount and a transaction ID
  if (!amountMatch || !txnMatch) {
    return null;
  }

  const amountRaw = amountMatch[1].replace(/,/g, '');

  // Parse the "DD/MM/YY HH:mm" timestamp into an ISO string when available
  let isoTimestamp = new Date().toISOString();
  if (timestampMatch) {
    const [datePart, timePart] = timestampMatch[1].split(' ');
    const [day, month, year] = datePart.split('/');
    const fullYear = parseInt(year, 10) + 2000;
    const parsed = new Date(`${fullYear}-${month}-${day}T${timePart}:00`);
    if (!isNaN(parsed.getTime())) {
      isoTimestamp = parsed.toISOString();
    }
  }

  return {
    amount: parseFloat(amountRaw),
    currency: 'TSh',
    sender_name: senderMatch ? senderMatch[1].trim() : 'Unknown',
    transaction_id: txnMatch[1].trim(),
    sender_phone: from || 'Unknown',
    timestamp: isoTimestamp,
    raw_sms: body,
  };
}

// ─── Termux API Helpers ───────────────────────────────────────────────────────

/**
 * Retrieve all SMS messages currently in the inbox via Termux API.
 *
 * @returns {Array} Array of SMS objects from Termux
 */
function getInboxSms() {
  try {
    const output = execSync('termux-sms-list -t inbox -l 50', { timeout: 15000 }).toString().trim();
    if (!output) return [];
    return JSON.parse(output);
  } catch (err) {
    log('error', 'Failed to fetch SMS via termux-sms-list', { error: err.message });
    return [];
  }
}

// ─── Persistence (last-processed tracking) ───────────────────────────────────

function readLastProcessedId() {
  try {
    const content = fs.readFileSync(config.sms.last_processed_file, 'utf8').trim();
    return content ? parseInt(content, 10) : -1;
  } catch (_) {
    return -1;
  }
}

function writeLastProcessedId(id) {
  try {
    fs.writeFileSync(config.sms.last_processed_file, String(id));
  } catch (err) {
    log('warn', 'Could not persist last-processed ID', { error: err.message });
  }
}

// ─── Laravel API ─────────────────────────────────────────────────────────────

/**
 * Send parsed payment data to the Laravel backend.
 *
 * @param {Object} paymentData  Parsed payment information
 * @returns {Promise<boolean>}  true on success, false on failure
 */
async function sendToLaravel(paymentData) {
  const url = `${config.laravel.url}${config.laravel.endpoint}`;

  try {
    log('info', 'Sending payment data to Laravel', { transaction_id: paymentData.transaction_id, url });

    const response = await axios.post(url, paymentData, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.laravel.api_token}`,
      },
      timeout: config.laravel.timeout_ms,
    });

    log('info', 'Laravel response received', {
      status: response.status,
      data: response.data,
    });

    return true;
  } catch (err) {
    if (err.response) {
      log('error', 'Laravel returned an error response', {
        status: err.response.status,
        data: err.response.data,
      });
    } else if (err.code === 'ECONNREFUSED') {
      log('error', 'Cannot reach Laravel server – is it running?', { url });
    } else {
      log('error', 'Failed to send data to Laravel', { error: err.message });
    }
    return false;
  }
}

// ─── Main polling loop ────────────────────────────────────────────────────────

let lastProcessedId = readLastProcessedId();
log('info', 'SMS listener started', {
  laravel_url: config.laravel.url,
  poll_interval_ms: config.sms.poll_interval_ms,
  last_processed_id: lastProcessedId,
});

async function pollSms() {
  log('debug', 'Polling inbox for new SMS…');

  const messages = getInboxSms();

  if (!messages.length) {
    log('debug', 'Inbox is empty or no new messages');
    return;
  }

  // Termux returns messages newest-first; sort ascending by _id to process oldest first
  messages.sort((a, b) => (a._id ?? 0) - (b._id ?? 0));

  let highestId = lastProcessedId;

  for (const sms of messages) {
    const smsId = sms._id ?? 0;

    // Skip already-processed messages
    if (smsId <= lastProcessedId) continue;

    log('info', 'New SMS detected', { id: smsId, from: sms.number });

    const paymentData = parsePaymentSms(sms.body ?? '', sms.number ?? '');

    if (!paymentData) {
      log('debug', 'SMS does not match payment pattern, skipping', { id: smsId });
    } else {
      log('info', 'Payment SMS parsed', {
        transaction_id: paymentData.transaction_id,
        amount: paymentData.amount,
        sender: paymentData.sender_name,
      });

      await sendToLaravel(paymentData);
    }

    if (smsId > highestId) highestId = smsId;
  }

  if (highestId > lastProcessedId) {
    lastProcessedId = highestId;
    writeLastProcessedId(lastProcessedId);
    log('debug', 'Updated last-processed ID', { lastProcessedId });
  }
}

// Start polling
(function startPolling() {
  pollSms().catch(err => log('error', 'Unhandled error in pollSms', { error: err.message }));

  setInterval(() => {
    pollSms().catch(err => log('error', 'Unhandled error in pollSms', { error: err.message }));
  }, config.sms.poll_interval_ms);
})();
