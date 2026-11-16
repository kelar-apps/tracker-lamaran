/**
 * Kelar Apps — license server (Google Apps Script web app).
 *
 * POST body (sent as text/plain to avoid a CORS preflight):
 *   { "action": "verify", "accessToken": "...", "product": "tracker-lamaran" }
 * Response:
 *   { "allowed": true|false, "email": "user@example.com" }
 *
 * Script Properties (Project Settings → Script properties):
 *   CLIENT_ID  OAuth Client ID of the Kelar web app (…apps.googleusercontent.com)
 *   SHEET_ID   id of the Google Sheet that has a sheet named "Pembeli"
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

// Errors are answered WITHOUT an "allowed" field, so the app shows "could not
// check" instead of wrongly telling a buyer that they have no access.
function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return json_({ error: 'bad_request' });
    }

    if (body.action !== 'verify') return json_({ error: 'unknown_action' });

    var product = normalizeProduct_(body.product);
    if (!product) return json_({ error: 'bad_request' });

    var email = verifyToken_(body.accessToken);
    if (!email) return json_({ error: 'invalid_token' });

    return json_({ allowed: isBuyer_(email, product), email: email });
  } catch (err) {
    // Message only (e.g. a missing Script Property). Never log the request body.
    console.error('verify failed: ' + (err && err.message));
    return json_({ error: 'server' });
  }
}

/** A GET shows a short status text, handy to check the deployment URL in a browser. */
function doGet() {
  return ContentService.createTextOutput('Kelar license server is running.').setMimeType(ContentService.MimeType.TEXT);
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
  var key = 'buyer:' + product + ':' + email;
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

/** All rows of "Pembeli" as objects with normalised values. Columns are found by header. */
function readBuyers_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = {};
  HEADERS.forEach(function (name) { col[name] = header.indexOf(name); });
  if (col.email === -1 || col.produk === -1 || col.status === -1) {
    throw new Error('Sheet "Pembeli" needs the columns: ' + HEADERS.join(', '));
  }
  var out = [];
  for (var r = 1; r < values.length; r++) {
    out.push({
      email: normalizeEmail_(values[r][col.email]),
      produk: String(values[r][col.produk]).trim().toLowerCase(),
      status: String(values[r][col.status]).trim().toLowerCase(),
    });
  }
  return out;
}

/**
 * Add (or re-activate) a buyer. Meant to be called by a payment webhook later, or
 * run by hand from the editor. Clears the cached answer for that email.
 */
function addBuyer(email, product, refId) {
  email = normalizeEmail_(email);
  product = normalizeProduct_(product);
  if (!email || email.indexOf('@') === -1) throw new Error('Invalid email');
  if (!product) throw new Error('Invalid product');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    // Store as plain text so an email like "=x@y" is never treated as a formula.
    sheet.appendRow(["'" + email, "'" + product, new Date(), "'" + String(refId || ''), 'aktif']);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove('buyer:' + product + ':' + email);
  return true;
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

function getSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Script property SHEET_ID is not set');
  var ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
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
