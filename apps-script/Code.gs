/**
 * Kelar Apps — license server (Google Apps Script web app).
 *
 * All requests are POST with a JSON body sent as text/plain (no CORS preflight).
 *
 * 1. License check, used by every Kelar app:
 *      { "action": "verify", "accessToken": "...", "product": "tracker-lamaran" }
 *    → { "allowed": true|false, "email": "user@example.com" }
 *
 * 2. Admin actions, used by the Kelar Admin app. Only accounts listed in the
 *    ADMIN_EMAILS Script Property may use them:
 *      { "action": "admin.list",      "accessToken": "..." }
 *        → { "admin": "...", "buyers": [{ email, produk, tanggal, ref_id, status }] }
 *      { "action": "admin.upsert",    "accessToken": "...", "email": "...", "product": "...", "refId": "..." }
 *        → { "result": "added"|"reactivated"|"already_active", "buyer": {...} }
 *      { "action": "admin.setStatus", "accessToken": "...", "email": "...", "product": "...", "status": "aktif"|"nonaktif" }
 *        → { "result": "updated", "buyer": {...} }
 *
 * Errors are answered as { "error": "<code>" } and never contain an "allowed" field.
 *
 * Script Properties (Project Settings → Script properties):
 *   CLIENT_ID     OAuth Client ID of the Kelar web apps (…apps.googleusercontent.com)
 *   SHEET_ID      id of the Google Sheet that has a sheet named "Pembeli"
 *   ADMIN_EMAILS  Google accounts allowed to use the admin actions, comma separated
 *   PRODUCTS      (optional) product ids, comma separated, default "tracker-lamaran".
 *                 Used to clear cached answers when a "semua" row changes.
 *
 * Sheet "Pembeli" columns (row 1 = headers): email, produk, tanggal, ref_id, status
 *   - email: buyer's Google account (case and spaces are ignored)
 *   - produk: product id (e.g. tracker-lamaran) or "semua" for every product
 *   - status: "aktif" to allow access
 *
 * Never log the access token.
 */

var SHEET_NAME = 'Pembeli';
var HEADERS = ['email', 'produk', 'tanggal', 'ref_id', 'status'];
var CACHE_SECONDS = 600; // 10 minutes per email + product
var STATUSES = ['aktif', 'nonaktif'];
var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return json_({ error: 'bad_request' });
    }
    if (!body || typeof body !== 'object') return json_({ error: 'bad_request' });

    switch (body.action) {
      case 'verify':
        return json_(handleVerify_(body));
      case 'admin.list':
        return json_(handleAdminList_(body));
      case 'admin.upsert':
        return json_(handleAdminUpsert_(body));
      case 'admin.setStatus':
        return json_(handleAdminSetStatus_(body));
      default:
        return json_({ error: 'unknown_action' });
    }
  } catch (err) {
    // Expected failures carry a code (bad input, not an admin, row not found…).
    if (err && err.code) return json_(err.payload);
    // Message only (e.g. a missing Script Property). Never log the request body.
    console.error('request failed: ' + (err && err.message));
    return json_({ error: 'server' });
  }
}

/** A GET shows a short status text, handy to check the deployment URL in a browser. */
function doGet() {
  return ContentService.createTextOutput('Kelar license server is running.').setMimeType(ContentService.MimeType.TEXT);
}

// ---------- License check ----------

function handleVerify_(body) {
  var product = normalizeProduct_(body.product);
  if (!product) return { error: 'bad_request' };
  var email = verifyToken_(body.accessToken);
  if (!email) return { error: 'invalid_token' };
  return { allowed: isBuyer_(email, product), email: email };
}

/**
 * Check the access token with Google and return the verified email, or '' if the
 * token is invalid, expired, issued for another app, or has no verified email.
 */
function verifyToken_(accessToken) {
  if (!accessToken || typeof accessToken !== 'string' || accessToken.length > 4096) return '';
  var clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  if (!clientId) throw new Error('Script property CLIENT_ID is not set');

  var res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) return '';

  var info;
  try {
    info = JSON.parse(res.getContentText());
  } catch (err) {
    return '';
  }

  var scopes = String(info.scope || '').split(' ');
  var hasEmailScope = scopes.indexOf('email') !== -1 || scopes.indexOf('https://www.googleapis.com/auth/userinfo.email') !== -1;
  var notExpired = Number(info.exp) * 1000 > Date.now();

  if (info.aud !== clientId) return '';
  if (String(info.email_verified) !== 'true') return '';
  if (!notExpired) return '';
  if (!hasEmailScope) return '';
  return normalizeEmail_(info.email);
}

/** true when the email has an active purchase for this product (or for "semua"). */
function isBuyer_(email, product) {
  var cache = CacheService.getScriptCache();
  var key = cacheKey_(product, email);
  var cached = cache.get(key);
  if (cached !== null) return cached === '1';

  var allowed = false;
  var rows = readBuyers_();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.email !== email) continue;
    if (row.status !== 'aktif') continue;
    if (row.produk === product || row.produk.indexOf('semua') !== -1) {
      allowed = true;
      break;
    }
  }

  cache.put(key, allowed ? '1' : '0', CACHE_SECONDS);
  return allowed;
}

// ---------- Admin actions ----------

function handleAdminList_(body) {
  var admin = requireAdmin_(body.accessToken);
  var buyers = readBuyers_().filter(function (b) { return b.email; }).map(publicBuyer_);
  return { admin: admin, buyers: buyers };
}

function handleAdminUpsert_(body) {
  requireAdmin_(body.accessToken);
  return upsertBuyer_(body.email, body.product, body.refId);
}

function handleAdminSetStatus_(body) {
  requireAdmin_(body.accessToken);
  return setBuyerStatus_(body.email, body.product, body.status);
}

/** Returns the admin's email, or throws invalid_token / admin_not_configured / forbidden. */
function requireAdmin_(accessToken) {
  var email = verifyToken_(accessToken);
  if (!email) throw codeError_('invalid_token');
  var raw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  var admins = String(raw || '')
    .split(/[,;\s]+/)
    .map(normalizeEmail_)
    .filter(function (a) { return a; });
  if (!admins.length) throw codeError_('admin_not_configured');
  if (admins.indexOf(email) === -1) throw codeError_('forbidden', { email: email });
  return email;
}

/**
 * Add a buyer, or re-activate the existing row for the same email + product
 * (never a duplicate row). Clears the cached license answer.
 */
function upsertBuyer_(email, product, refId) {
  email = normalizeEmail_(email);
  product = normalizeProduct_(product);
  refId = String(refId == null ? '' : refId).trim();
  if (!isValidEmail_(email)) throw codeError_('invalid_email');
  if (!product) throw codeError_('invalid_product');
  if (refId.length > 100) throw codeError_('invalid_ref');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var result;
  var buyer;
  try {
    var table = readBuyerTable_();
    var match = null;
    for (var i = table.rows.length - 1; i >= 0; i--) {
      if (table.rows[i].email === email && table.rows[i].produk === product) {
        match = table.rows[i];
        break;
      }
    }

    if (match && match.status === 'aktif') {
      result = 'already_active';
      buyer = match;
    } else if (match) {
      table.sheet.getRange(match.rowNumber, table.col.status + 1).setValue('aktif');
      match.status = 'aktif';
      if (refId && table.col.ref_id !== -1 && !match.ref_id) {
        table.sheet.getRange(match.rowNumber, table.col.ref_id + 1).setValue(asText_(refId));
        match.ref_id = refId;
      }
      result = 'reactivated';
      buyer = match;
    } else {
      // Follow the sheet's own column order; unknown extra columns stay empty.
      var now = new Date();
      var row = [];
      for (var c = 0; c < table.width; c++) row.push('');
      row[table.col.email] = asText_(email);
      row[table.col.produk] = asText_(product);
      row[table.col.status] = 'aktif';
      if (table.col.tanggal !== -1) row[table.col.tanggal] = now;
      if (table.col.ref_id !== -1) row[table.col.ref_id] = asText_(refId);
      table.sheet.appendRow(row);
      result = 'added';
      buyer = { email: email, produk: product, tanggal: now, ref_id: refId, status: 'aktif' };
    }
  } finally {
    lock.releaseLock();
  }
  clearCache_(email, product);
  return { result: result, buyer: publicBuyer_(buyer) };
}

/** Set the status of every row for this email + product. */
function setBuyerStatus_(email, product, status) {
  email = normalizeEmail_(email);
  product = normalizeProduct_(product);
  status = String(status || '').trim().toLowerCase();
  if (!isValidEmail_(email)) throw codeError_('invalid_email');
  if (!product) throw codeError_('invalid_product');
  if (STATUSES.indexOf(status) === -1) throw codeError_('invalid_status');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var last = null;
  try {
    var table = readBuyerTable_();
    for (var i = 0; i < table.rows.length; i++) {
      var row = table.rows[i];
      if (row.email !== email || row.produk !== product) continue;
      table.sheet.getRange(row.rowNumber, table.col.status + 1).setValue(status);
      row.status = status;
      last = row;
    }
  } finally {
    lock.releaseLock();
  }
  if (!last) throw codeError_('not_found');
  clearCache_(email, product);
  return { result: 'updated', buyer: publicBuyer_(last) };
}

/**
 * Add (or re-activate) a buyer. For a payment webhook later, or to run by hand
 * from the editor. Never creates a duplicate row.
 */
function addBuyer(email, product, refId) {
  return upsertBuyer_(email, product, refId);
}

/** Run once from the editor to create the "Pembeli" sheet with its header row. */
function setup() {
  var sheet = getSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
}

/** Manual test from the editor: Run → testAddBuyer (change the email first). */
function testAddBuyer() {
  addBuyer('pembeli@example.com', 'tracker-lamaran', 'TEST-1');
}

// ---------- Sheet access ----------

/** All rows of "Pembeli" as objects with normalised values. */
function readBuyers_() {
  return readBuyerTable_().rows;
}

/** The sheet, column positions (found by header name) and rows with their row numbers. */
function readBuyerTable_() {
  var sheet = getSheet_();
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS); // brand-new, empty sheet
  var values = sheet.getDataRange().getValues();
  var header = (values[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var col = {};
  HEADERS.forEach(function (name) { col[name] = header.indexOf(name); });
  if (col.email === -1 || col.produk === -1 || col.status === -1) {
    throw new Error('Sheet "Pembeli" needs the columns: ' + HEADERS.join(', '));
  }
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    rows.push({
      rowNumber: r + 1,
      email: normalizeEmail_(v[col.email]),
      produk: String(v[col.produk]).trim().toLowerCase(),
      tanggal: col.tanggal === -1 ? '' : v[col.tanggal],
      ref_id: col.ref_id === -1 ? '' : String(v[col.ref_id]).trim(),
      status: String(v[col.status]).trim().toLowerCase(),
    });
  }
  return { sheet: sheet, col: col, width: header.length, rows: rows };
}

function getSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Script property SHEET_ID is not set');
  var ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

// ---------- Helpers ----------

function publicBuyer_(row) {
  var t = row.tanggal;
  var tanggal = t instanceof Date && !isNaN(t.getTime()) ? t.toISOString() : String(t == null ? '' : t);
  return { email: row.email, produk: row.produk, tanggal: tanggal, ref_id: String(row.ref_id || ''), status: row.status };
}

function cacheKey_(product, email) {
  return 'buyer:' + product + ':' + email;
}

/** Forget cached answers for this email, so a change applies right away. */
function clearCache_(email, product) {
  var keys = [cacheKey_(product, email)];
  if (product === 'semua') {
    var raw = PropertiesService.getScriptProperties().getProperty('PRODUCTS') || 'tracker-lamaran';
    raw.split(/[,;\s]+/).forEach(function (p) {
      p = normalizeProduct_(p);
      if (p) keys.push(cacheKey_(p, email));
    });
  }
  CacheService.getScriptCache().removeAll(keys);
}

/** Stored as plain text, so a value like "=x@y" is never treated as a formula. */
function asText_(value) {
  return value === '' ? '' : "'" + value;
}

function codeError_(code, extra) {
  var err = new Error(code);
  err.code = code;
  err.payload = { error: code };
  if (extra) {
    for (var k in extra) err.payload[k] = extra[k];
  }
  return err;
}

function isValidEmail_(email) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function normalizeEmail_(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function normalizeProduct_(value) {
  var p = String(value || '').trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(p) ? p : '';
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
