'use strict';

/* ------------------------------------------------------------------ */
/* ToolboxKo — hardened + optimized client-side logic                  */
/* All processing stays in the browser. No backend calls are made.     */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

/* --------------------------- Limits -------------------------------- */
const MAX_QR_DATA_LENGTH = 4000;
const MAX_URL_LENGTH = 2048;
const MAX_TEXT_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 10;
const HISTORY_KEY = 'qrHistory';
const THEME_KEY = 'qrTheme';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const CONVERTER_MAX_FILES = 20;
const CONVERTER_MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONVERTER_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
const ALLOWED_OUTPUT_FORMATS = ['jpg', 'png', 'svg'];

const ALLOWED_SIZES = [240, 320, 400, 500, 600];
const ALLOWED_DOTS = ['square', 'rounded', 'dots', 'classy', 'classy-rounded'];
const ALLOWED_CORNERS = ['square', 'dot', 'extra-rounded'];
const ALLOWED_EC = ['L', 'M', 'Q', 'H'];
const ALLOWED_QR_TYPES = ['url', 'text', 'email', 'phone', 'sms', 'wifi', 'vcard', 'location'];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PHONE_RE = /^[+\d][\d\s().-]*$/;
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

const state = {
  logo: null,
  logoUrl: null,
  qr: null,
  generated: false,
  currentData: ''
};

const converterState = {
  selectedFiles: [],
  outputFormat: 'jpg',
  targetSizeKB: 300,
  latestSvgMarkup: '',
  previewUrls: []
};

const ALT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ALT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
const ALT_SERVER_KEY = 'altServerUrl';
const ALT_MODEL_KEY = 'altModel';
const ALT_PASSWORD_KEY = 'altServerPassword';
const ALT_DEFAULT_SERVER = 'http://127.0.0.1:49374';

const altState = {
  fileName: '',
  fileType: '',
  fileBytes: 0,
  width: 0,
  height: 0,
  objectUrl: null,
  isRemote: false
};

const typeLabels = {
  url: 'Website',
  text: 'Plain text',
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  wifi: 'Wi-Fi',
  vcard: 'Contact',
  location: 'Location'
};

/* ------------------------- Small utilities ------------------------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = String(message);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function revokeUrl(url) {
  if (url) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function sanitizeColor(value, fallback) {
  return HEX_COLOR_RE.test(String(value || '').trim()) ? value.trim() : fallback;
}

/** Safe localStorage read that never throws. */
function storageGet(key) {
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}

/** Safe localStorage write. Returns false when storage is unavailable/full. */
function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

function storageRemove(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

function parseHistory(raw) {
  let parsed;
  try { parsed = JSON.parse(raw || '[]'); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => (
    item && typeof item === 'object' &&
    typeof item.id === 'number' &&
    ALLOWED_QR_TYPES.includes(item.type) &&
    typeof item.data === 'string' && item.data.length > 0 &&
    item.data.length <= MAX_QR_DATA_LENGTH &&
    typeof item.label === 'string'
  )).slice(0, MAX_HISTORY_ITEMS);
}

/** Strip CR/LF to prevent vCard / payload header injection, cap length. */
function cleanField(value, maxLength) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

/** Escape vCard structural characters per RFC 6350 basics. */
function escapeVCard(value) {
  return cleanField(value, 200).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function validatePhone(value, label) {
  const phone = cleanField(value, 40);
  if (!phone) throw new Error(`Please enter a ${label} phone number.`);
  if (!PHONE_RE.test(phone)) throw new Error('Please enter a valid phone number.');
  return phone;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = src;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Unable to export image.'));
      else resolve(blob);
    }, mime, quality);
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after the browser has picked up the download.
  setTimeout(() => revokeUrl(url), 4000);
}

function sanitizeFileStem(name) {
  const base = String(name || 'image').split(/[\\/]/).pop();
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base) || 'image';
  return stem.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80) || 'image';
}

/* ------------------------- QR field templates ---------------------- */
/* Static markup only — no user data is interpolated here. */

const fields = {
  url: `
    <label class="field"><span>Website URL</span>
      <input id="url" type="url" placeholder="https://example.com" autocomplete="url" maxlength="2048">
    </label>`,
  text: `
    <label class="field"><span>Your text</span>
      <textarea id="text" rows="5" maxlength="4000" placeholder="Enter any text you want to encode..."></textarea>
    </label>`,
  email: `
    <div class="grid-2">
      <label class="field"><span>Email address</span><input id="email" type="email" maxlength="254" placeholder="hello@example.com"></label>
      <label class="field"><span>Subject</span><input id="subject" type="text" maxlength="200" placeholder="Hello"></label>
    </div>
    <label class="field"><span>Message</span><textarea id="emailMessage" rows="4" maxlength="1000" placeholder="Your message..."></textarea></label>`,
  phone: `
    <label class="field"><span>Phone number</span><input id="phone" type="tel" maxlength="40" placeholder="+63 912 345 6789"></label>`,
  sms: `
    <div class="grid-2">
      <label class="field"><span>Phone number</span><input id="smsPhone" type="tel" maxlength="40" placeholder="+63 912 345 6789"></label>
      <label class="field"><span>Message</span><input id="smsMessage" type="text" maxlength="1000" placeholder="Hello!"></label>
    </div>`,
  wifi: `
    <div class="grid-2">
      <label class="field"><span>Network name (SSID)</span><input id="ssid" type="text" maxlength="32" placeholder="My Wi-Fi"></label>
      <label class="field"><span>Password</span><input id="wifiPassword" type="text" maxlength="63" placeholder="Password"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Security</span><select id="wifiSecurity"><option>WPA</option><option>WEP</option><option value="nopass">None</option></select></label>
      <label class="switch-row compact"><span><strong>Hidden network</strong></span><input id="wifiHidden" type="checkbox"><span class="switch"></span></label>
    </div>`,
  vcard: `
    <div class="grid-2">
      <label class="field"><span>First name</span><input id="firstName" type="text" maxlength="100" placeholder="Christian"></label>
      <label class="field"><span>Last name</span><input id="lastName" type="text" maxlength="100" placeholder="Buenaflor"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Phone</span><input id="contactPhone" type="tel" maxlength="40" placeholder="+63 912 345 6789"></label>
      <label class="field"><span>Email</span><input id="contactEmail" type="email" maxlength="254" placeholder="hello@example.com"></label>
    </div>
    <label class="field"><span>Organization</span><input id="organization" type="text" maxlength="200" placeholder="Company name"></label>`,
  location: `
    <div class="grid-2">
      <label class="field"><span>Latitude</span><input id="latitude" type="number" step="any" placeholder="14.5995"></label>
      <label class="field"><span>Longitude</span><input id="longitude" type="number" step="any" placeholder="120.9842"></label>
    </div>
    <label class="field"><span>Location label (optional)</span><input id="locationLabel" type="text" maxlength="200" placeholder="Manila"></label>`
};

function escapeWifi(value) {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

function buildData() {
  const typeEl = $('qrType');
  const type = ALLOWED_QR_TYPES.includes(typeEl && typeEl.value) ? typeEl.value : 'url';
  const value = (id) => $(id)?.value.trim() || '';

  if (type === 'url') {
    let url = cleanField(value('url'), MAX_URL_LENGTH);
    if (!url) throw new Error('Please enter a website URL.');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let parsed;
    try { parsed = new URL(url); }
    catch { throw new Error('Please enter a valid URL.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http(s) URLs are supported.');
    }
    if (url.length > MAX_URL_LENGTH) throw new Error('URL is too long (max 2048 characters).');
    return url;
  }

  if (type === 'text') {
    const text = cleanField($('text')?.value || '', MAX_TEXT_LENGTH + 1);
    if (!text) throw new Error('Please enter some text.');
    if (text.length > MAX_TEXT_LENGTH) throw new Error('Text is too long (max 4000 characters).');
    return text;
  }

  if (type === 'email') {
    const email = cleanField(value('email'), 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
    const subject = encodeURIComponent(cleanField(value('subject'), 200));
    const message = encodeURIComponent(cleanField(value('emailMessage'), 1000));
    const query = subject && message ? `subject=${subject}&body=${message}`
      : subject ? `subject=${subject}` : message ? `body=${message}` : '';
    const result = `mailto:${email}${query ? `?${query}` : ''}`;
    if (result.length > MAX_QR_DATA_LENGTH) throw new Error('Email content is too long.');
    return result;
  }

  if (type === 'phone') {
    return `tel:${validatePhone(value('phone'), '')}`;
  }

  if (type === 'sms') {
    const phone = validatePhone(value('smsPhone'), '');
    const message = cleanField(value('smsMessage'), 1000);
    const result = `SMSTO:${phone}:${message}`;
    if (result.length > MAX_QR_DATA_LENGTH) throw new Error('SMS content is too long.');
    return result;
  }

  if (type === 'wifi') {
    const ssid = cleanField(value('ssid'), 32);
    if (!ssid) throw new Error('Please enter the Wi-Fi network name.');
    const security = sanitizeEnum($('wifiSecurity')?.value, ['WPA', 'WEP', 'nopass'], 'WPA');
    const hidden = $('wifiHidden')?.checked ? 'true' : 'false';
    const password = cleanField(value('wifiPassword'), 63);
    return `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};H:${hidden};;`;
  }

  if (type === 'vcard') {
    const first = escapeVCard(value('firstName'));
    const last = escapeVCard(value('lastName'));
    if (!first && !last) throw new Error('Please enter a contact name.');
    const phoneRaw = cleanField(value('contactPhone'), 40);
    const emailRaw = cleanField(value('contactEmail'), 254);
    if (phoneRaw && !PHONE_RE.test(phoneRaw)) throw new Error('Please enter a valid contact phone.');
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) throw new Error('Please enter a valid contact email.');
    return [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${last};${first};;;`,
      `FN:${[first, last].filter(Boolean).join(' ')}`,
      phoneRaw ? `TEL:${phoneRaw}` : '',
      emailRaw ? `EMAIL:${emailRaw}` : '',
      value('organization') ? `ORG:${escapeVCard(value('organization'))}` : '',
      'END:VCARD'
    ].filter(Boolean).join('\n');
  }

  if (type === 'location') {
    const lat = cleanField(value('latitude'), 20);
    const lng = cleanField(value('longitude'), 20);
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (lat === '' || lng === '' || !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      throw new Error('Enter valid latitude and longitude values.');
    }
    const label = cleanField(value('locationLabel'), 200);
    return `geo:${latNum},${lngNum}${label ? `?q=${encodeURIComponent(label)}` : ''}`;
  }

  throw new Error('Unsupported QR type.');
}

function currentOptions() {
  const size = sanitizeEnum(Number($('size')?.value), ALLOWED_SIZES, 400);
  const dots = sanitizeEnum($('dots')?.value, ALLOWED_DOTS, 'square');
  const corners = sanitizeEnum($('corners')?.value, ALLOWED_CORNERS, 'square');
  const ecLevel = sanitizeEnum($('errorCorrection')?.value, ALLOWED_EC, 'M');
  const transparent = $('transparent')?.checked === true;
  const foreground = sanitizeColor($('foreground')?.value, '#111827');
  const background = sanitizeColor($('background')?.value, '#ffffff');

  return {
    width: size,
    height: size,
    type: 'canvas',
    data: state.currentData,
    margin: 0,
    qrOptions: { errorCorrectionLevel: ecLevel },
    dotsOptions: { color: foreground, type: dots },
    cornersSquareOptions: { color: foreground, type: corners },
    cornersDotOptions: { color: foreground, type: corners === 'dot' ? 'dot' : 'square' },
    backgroundOptions: { color: transparent ? 'rgba(0,0,0,0)' : background },
    image: state.logoUrl || undefined,
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 8,
      imageSize: 0.28,
      hideBackgroundDots: true
    }
  };
}

function renderQR(saveHistory = true) {
  if (typeof QRCodeStyling === 'undefined') {
    showToast('QR library failed to load. Check your connection and reload.');
    return;
  }
  let data;
  try {
    data = buildData();
  } catch (error) {
    showToast(error.message);
    return;
  }
  if (data.length > MAX_QR_DATA_LENGTH) {
    showToast('Content is too long for a QR code (max 4000 characters).');
    return;
  }
  state.currentData = data;

  try {
    const opts = currentOptions();
    if (state.qr && typeof state.qr.update === 'function') {
      // Reuse the instance: avoids rebuilding DOM nodes and logo decoding.
      state.qr.update(opts);
    } else {
      $('qr').innerHTML = '';
      state.qr = new QRCodeStyling(opts);
      state.qr.append($('qr'));
    }
  } catch (error) {
    showToast('Could not render the QR code.');
    return;
  }

  $('emptyPreview').classList.add('hidden');
  $('qrInfo').classList.remove('hidden');
  $('typeLabel').textContent = typeLabels[$('qrType').value] || 'QR';
  $('charCount').textContent = `${state.currentData.length} characters`;
  $('statusBadge').textContent = 'Generated';
  state.generated = true;
  if (saveHistory) addHistory();
}

function getPaddedCanvas() {
  return new Promise((resolve, reject) => {
    if (!state.qr || !state.generated) return reject(new Error('Generate a QR code first.'));
    state.qr.getRawData('png').then((blob) => {
      if (!blob) return reject(new Error('Could not read the QR image.'));
      const objectUrl = URL.createObjectURL(blob);
      loadImage(objectUrl).then((image) => {
        revokeUrl(objectUrl);
        try {
          const padding = clampInt($('padding')?.value, 0, 150, 40);
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth + padding * 2;
          canvas.height = image.naturalHeight + padding * 2;
          if (canvas.width > 4000 || canvas.height > 4000) {
            throw new Error('Export size is too large.');
          }
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas is not available.');
          if ($('transparent')?.checked !== true) {
            ctx.fillStyle = sanitizeColor($('background')?.value, '#ffffff');
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(image, padding, padding);
          resolve(canvas);
        } catch (error) {
          reject(error);
        }
      }).catch((error) => {
        revokeUrl(objectUrl);
        reject(error);
      });
    }).catch(() => reject(new Error('Could not read the QR image.')));
  });
}

async function downloadRaster(format) {
  const safeFormat = sanitizeEnum(format, ['png', 'jpg'], 'png');
  try {
    const canvas = await getPaddedCanvas();
    const mime = safeFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const blob = await canvasToBlob(canvas, mime, safeFormat === 'jpg' ? 0.95 : undefined);
    downloadBlob(blob, `qr-code.${safeFormat}`);
    showToast(`${safeFormat.toUpperCase()} downloaded.`);
  } catch (error) { showToast(error.message); }
}

async function downloadSvg() {
  if (!state.qr || !state.generated) return showToast('Generate a QR code first.');
  try {
    await state.qr.download({ name: 'qr-code', extension: 'svg' });
    showToast('SVG downloaded.');
  } catch { showToast('SVG export failed.'); }
}

async function copyQR() {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return showToast('Copy is not supported by this browser.');
  }
  try {
    const canvas = await getPaddedCanvas();
    const blob = await canvasToBlob(canvas, 'image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('QR code copied to clipboard.');
  } catch {
    showToast('Copy is not supported by this browser.');
  }
}

async function printQR() {
  let canvas;
  try {
    canvas = await getPaddedCanvas();
  } catch (error) { return showToast(error.message); }
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch { return showToast('Could not prepare the print image.'); }
  if (!/^data:image\/png;base64,/.test(dataUrl)) return showToast('Could not prepare the print image.');

  const title = typeLabels[$('qrType')?.value] || 'QR';
  const win = window.open('', '_blank', 'noopener,noreferrer,width=700,height=800');
  if (!win) return showToast('Please allow pop-ups to print.');
  try { win.opener = null; } catch { /* ignore */ }

  // Build the print document with DOM APIs (no document.write injection).
  const doc = win.document;
  doc.title = 'Print QR Code';
  const style = doc.createElement('style');
  style.textContent = 'body{font-family:Arial,sans-serif;text-align:center;padding:40px}img{max-width:80%;height:auto}h1{font-size:24px;margin-bottom:24px}@media print{button{display:none}}';
  doc.head.appendChild(style);
  const heading = doc.createElement('h1');
  heading.textContent = `${title} QR Code`;
  const img = doc.createElement('img');
  img.src = dataUrl;
  img.alt = 'QR Code';
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = 'Print';
  button.addEventListener('click', () => win.print());
  doc.body.append(heading, img, button);
  win.focus();
}

/* ------------------------------ History ---------------------------- */
/* Wi-Fi entries are intentionally NOT persisted: they contain secrets. */

function readHistory() {
  return parseHistory(storageGet(HISTORY_KEY));
}

function addHistory() {
  const type = $('qrType').value;
  if (type === 'wifi') return; // never persist Wi-Fi passwords in localStorage
  const history = readHistory();
  const item = {
    id: Date.now(),
    type,
    data: state.currentData,
    label: getHistoryLabel().slice(0, 120)
  };
  const filtered = history.filter((x) => x.data !== item.data);
  if (!storageSet(HISTORY_KEY, JSON.stringify([item, ...filtered].slice(0, MAX_HISTORY_ITEMS)))) {
    showToast('History could not be saved (storage unavailable).');
    return;
  }
  renderHistory();
}

function getHistoryLabel() {
  const type = $('qrType').value;
  if (type === 'url') return state.currentData.slice(0, 120);
  if (type === 'wifi') return $('ssid')?.value.trim() || 'Wi-Fi network';
  if (type === 'vcard') {
    return [$('firstName')?.value, $('lastName')?.value]
      .map((s) => cleanField(s, 60)).filter(Boolean).join(' ') || 'Contact';
  }
  return state.currentData.replace(/\s+/g, ' ').slice(0, 70);
}

function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  const history = readHistory();
  list.innerHTML = '';
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Your recent QR codes will appear here.';
    list.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of history) {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.type = 'button';
    button.dataset.id = String(item.id);

    const icon = document.createElement('span');
    icon.className = 'history-icon';
    icon.textContent = 'QR';

    const copy = document.createElement('span');
    copy.className = 'history-copy';
    const strong = document.createElement('strong');
    strong.textContent = typeLabels[item.type] || item.type;
    const small = document.createElement('small');
    small.textContent = item.label;
    copy.append(strong, small);

    const arrow = document.createElement('span');
    arrow.className = 'history-arrow';
    arrow.textContent = '→';

    button.append(icon, copy, arrow);
    fragment.appendChild(button);
  }
  list.appendChild(fragment);
}

function loadHistoryItem(item) {
  if (!item || !ALLOWED_QR_TYPES.includes(item.type) ||
      typeof item.data !== 'string' || item.data.length > MAX_QR_DATA_LENGTH) {
    return showToast('Saved item is no longer valid.');
  }
  $('qrType').value = item.type;
  renderFields();
  const type = item.type;
  const d = item.data;

  try {
    if (type === 'url') $('url').value = d.slice(0, MAX_URL_LENGTH);
    else if (type === 'text') $('text').value = d.slice(0, MAX_TEXT_LENGTH);
    else if (type === 'phone') $('phone').value = d.replace(/^tel:/, '').slice(0, 40);
    else if (type === 'email') {
      const match = d.match(/^mailto:([^?]+)(?:\?subject=([^&]*))?(?:&body=(.*))?$/);
      if (!match) throw new Error('invalid');
      $('email').value = decodeURIComponent(match[1]).slice(0, 254);
      $('subject').value = decodeURIComponent(match[2] || '').slice(0, 200);
      $('emailMessage').value = decodeURIComponent(match[3] || '').slice(0, 1000);
    } else if (type === 'sms') {
      const match = d.match(/^SMSTO:([^:]*):([\s\S]*)$/);
      if (!match) throw new Error('invalid');
      $('smsPhone').value = match[1].slice(0, 40);
      $('smsMessage').value = match[2].slice(0, 1000);
    } else if (type === 'wifi') {
      const m = d.match(/^WIFI:T:([^;]*);S:((?:\\.|[^;])*)?;P:((?:\\.|[^;])*)?;H:(true|false);;/);
      if (!m) throw new Error('invalid');
      if (!['WPA', 'WEP', 'nopass'].includes(m[1])) throw new Error('invalid');
      $('wifiSecurity').value = m[1];
      $('ssid').value = (m[2] || '').replace(/\\([\\;,:"])/g, '$1').slice(0, 32);
      $('wifiPassword').value = (m[3] || '').replace(/\\([\\;,:"])/g, '$1').slice(0, 63);
      $('wifiHidden').checked = m[4] === 'true';
    } else if (type === 'vcard') {
      const get = (key) => {
        const m = d.match(new RegExp(`^${key}:([\\s\\S]*)$`, 'm'));
        return m ? m[1] : '';
      };
      const n = get('N').split(';');
      $('lastName').value = cleanField(n[0], 100);
      $('firstName').value = cleanField(n[1], 100);
      $('contactPhone').value = cleanField(get('TEL'), 40);
      $('contactEmail').value = cleanField(get('EMAIL'), 254);
      $('organization').value = cleanField(get('ORG'), 200);
    } else if (type === 'location') {
      const m = d.match(/^geo:([^,]+),([^?]+)(?:\?q=(.*))?$/);
      if (!m) throw new Error('invalid');
      $('latitude').value = m[1];
      $('longitude').value = m[2];
      $('locationLabel').value = decodeURIComponent(m[3] || '').slice(0, 200);
    }
  } catch {
    return showToast('Saved item is no longer valid.');
  }
  renderQR(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderFields() {
  const type = sanitizeEnum($('qrType').value, ALLOWED_QR_TYPES, 'url');
  $('qrType').value = type;
  $('formFields').innerHTML = fields[type];
}

function clearAll() {
  renderFields();
  $('qr').innerHTML = '';
  $('emptyPreview').classList.remove('hidden');
  $('qrInfo').classList.add('hidden');
  $('statusBadge').textContent = 'Ready';
  state.generated = false;
  state.currentData = '';
}

function syncColor(colorId, hexId) {
  $(colorId).addEventListener('input', () => { $(hexId).value = $(colorId).value.toUpperCase(); });
  $(hexId).addEventListener('change', () => {
    const value = $(hexId).value.trim();
    if (!HEX_COLOR_RE.test(value)) {
      $(hexId).value = $(colorId).value.toUpperCase();
      return showToast('Use a 6-digit hex color, e.g. #111827.');
    }
    $(colorId).value = value;
    if (state.generated) debouncedRender();
  });
}

function toggleTheme() {
  const dark = document.body.classList.toggle('dark');
  storageSet(THEME_KEY, dark ? 'dark' : 'light');
  $('themeToggle').textContent = dark ? '☀' : '☾';
}

function toggleSidebar() {
  const appLayout = document.querySelector('.app-layout');
  const sidebar = document.querySelector('.sidebar');
  const collapseButton = $('sidebarToggle');

  if (!appLayout || !sidebar || !collapseButton) return;

  const isCollapsed = appLayout.classList.toggle('sidebar-collapsed');
  sidebar.setAttribute('aria-expanded', String(!isCollapsed));
  collapseButton.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  collapseButton.textContent = isCollapsed ? '⟩' : '⟨';
}

/* --------------------------- Case converter ------------------------ */

function toTitleCase(value) {
  return value.toLowerCase().replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function toSentenceCase(value) {
  return value.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (match) => match.toUpperCase());
}

function toCamelCase(value) {
  const words = value
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return '';
  return words.map((word, index) => {
    const normalized = word.toLowerCase();
    return index === 0 ? normalized : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }).join('');
}

function toSnakeCase(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toKebabCase(value) {
  return toSnakeCase(value).replace(/_/g, '-');
}

function convertCaseText(value, mode) {
  const text = String(value ?? '');
  if (!text.trim()) return '';

  switch (mode) {
    case 'upper': return text.toUpperCase();
    case 'lower': return text.toLowerCase();
    case 'title': return toTitleCase(text);
    case 'sentence': return toSentenceCase(text);
    case 'camel': return toCamelCase(text);
    case 'snake': return toSnakeCase(text);
    case 'kebab': return toKebabCase(text);
    default: return text;
  }
}

function setupCaseConverter() {
  const caseInput = $('caseInput');
  const caseOutput = $('caseOutput');
  const copyCaseBtn = $('copyCaseBtn');
  const clearCaseBtn = $('clearCaseBtn');

  if (!caseInput || !caseOutput || !copyCaseBtn || !clearCaseBtn) return;

  const activeMode = () => {
    const activeButton = document.querySelector('.case-action.active');
    return activeButton ? activeButton.dataset.case : 'upper';
  };

  const updateCaseOutput = (mode = 'upper') => {
    caseOutput.value = convertCaseText(caseInput.value, mode);
  };

  caseInput.addEventListener('input', () => updateCaseOutput(activeMode()));

  document.querySelectorAll('.case-action').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.case-action').forEach((item) => {
        const isActive = item === button;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });
      updateCaseOutput(button.dataset.case);
    });
  });

  copyCaseBtn.addEventListener('click', async () => {
    const content = caseOutput.value.trim();
    if (!content) return showToast('Enter some text to copy.');

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
      } else {
        caseOutput.focus();
        caseOutput.select();
        const ok = document.execCommand('copy');
        if (!ok) throw new Error('copy failed');
      }
      showToast('Converted text copied.');
    } catch {
      showToast('Copy is not supported in this browser.');
    }
  });

  clearCaseBtn.addEventListener('click', () => {
    caseInput.value = '';
    caseOutput.value = '';
    caseInput.focus();
  });

  updateCaseOutput();
}

function setupToolNavigation() {
  const navButtons = document.querySelectorAll('.nav-button');
  const toolPanels = document.querySelectorAll('.tool-panel');

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const selectedView = button.dataset.view;

      navButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });

      toolPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === `${selectedView}Panel`);
      });
    });
  });
}

/* --------------------------- Image converter ----------------------- */

function getConverterSizeConfig() {
  const custom = Boolean($('customSizeToggle')?.checked);
  const unit = sanitizeEnum($('imageUnit')?.value, ['px', 'in', 'cm'], 'px');
  const targetSizeKB = clampInt($('imageTargetSize')?.value, 50, 500, 300);
  let width = clampInt($('imageWidth')?.value, 10, 8000, 1600);
  let height = clampInt($('imageHeight')?.value, 10, 8000, 1200);

  if (unit === 'in') {
    width = clampInt(width * 300, 10, 12000, 1600);
    height = clampInt(height * 300, 10, 12000, 1200);
  } else if (unit === 'cm') {
    width = clampInt(width * 118.11, 10, 12000, 1600);
    height = clampInt(height * 118.11, 10, 12000, 1200);
  }

  converterState.targetSizeKB = targetSizeKB;
  return { custom, width, height, targetSizeKB };
}

function exportBlobWithSizeLimit(canvas, format, maxBytes) {
  return new Promise((resolve, reject) => {
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    const scaleDown = (source, factor) => {
      const scaledWidth = Math.max(32, Math.round(source.width * factor));
      const scaledHeight = Math.max(32, Math.round(source.height * factor));
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available.');
      if (format === 'jpg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, scaledWidth, scaledHeight);
      }
      ctx.drawImage(source, 0, 0, scaledWidth, scaledHeight);
      return tempCanvas;
    };

    const tryExport = (quality, currentCanvas) => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        reject(new Error(`Unable to keep file under ${Math.round(maxBytes / 1024)} KB.`));
        return;
      }
      currentCanvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Unable to export image.'));
        if (blob.size <= maxBytes) {
          resolve(blob);
          return;
        }

        if (format === 'jpg' && quality > 0.15) {
          tryExport(Math.max(0.15, quality - 0.08), currentCanvas);
          return;
        }

        if (currentCanvas.width > 32 && currentCanvas.height > 32) {
          try {
            tryExport(quality, scaleDown(currentCanvas, 0.9));
          } catch (error) {
            reject(error);
          }
          return;
        }

        reject(new Error(`Unable to keep file under ${Math.round(maxBytes / 1024)} KB.`));
      }, mime, quality);
    };

    tryExport(format === 'jpg' ? 0.95 : 1, canvas);
  });
}

function createSvgMarkupFromImageData(imageData, width, height) {
  if (!BASE64_RE.test(imageData)) throw new Error('Invalid image data.');
  const w = clampInt(width, 1, 12000, 800);
  const h = clampInt(height, 1, 12000, 600);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="data:image/png;base64,${imageData}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" /></svg>`;
}

function createSvgFromImageData(imageData, width, height) {
  return new Blob([createSvgMarkupFromImageData(imageData, width, height)], { type: 'image/svg+xml' });
}

function updateSvgCodeUI() {
  const panel = $('svgCodePanel');
  const textarea = $('svgCodeOutput');
  const convertBtn = $('convertBtn');

  if (convertBtn) {
    convertBtn.textContent = converterState.outputFormat === 'svg' ? 'Generate SVG Preview' : 'Convert Images';
  }

  if (!panel || !textarea) return;
  const shouldShow = converterState.outputFormat === 'svg' && Boolean(converterState.latestSvgMarkup);
  panel.classList.toggle('hidden', !shouldShow);
  if (shouldShow) textarea.value = converterState.latestSvgMarkup;
}

function copySvgMarkup() {
  const markup = converterState.latestSvgMarkup || $('svgCodeOutput')?.value;
  if (!markup) return showToast('Generate an SVG first.');

  const copyText = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(markup);
      } else {
        const textArea = $('svgCodeOutput');
        textArea.focus();
        textArea.select();
        const ok = document.execCommand('copy');
        if (!ok) throw new Error('copy failed');
      }
      showToast('SVG code copied to clipboard.');
    } catch {
      showToast('Copy is not supported in this browser.');
    }
  };

  copyText();
}

function downloadSvgMarkup() {
  const markup = converterState.latestSvgMarkup || $('svgCodeOutput')?.value;
  if (!markup) return showToast('Generate an SVG first.');

  try {
    downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), 'converted-image.svg');
    showToast('SVG downloaded.');
  } catch {
    showToast('SVG download failed.');
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(blob);
  });
}

function generateConvertedBlob(file, format) {
  const safeFormat = sanitizeEnum(format, ALLOWED_OUTPUT_FORMATS, 'jpg');
  const objectUrl = URL.createObjectURL(file);
  return loadImage(objectUrl).then(async (img) => {
    revokeUrl(objectUrl);
    const { custom, width: targetWidth, height: targetHeight, targetSizeKB } = getConverterSizeConfig();
    const maxBytes = targetSizeKB * 1024;
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) throw new Error('Invalid image dimensions.');

    let width;
    let height;
    if (custom) {
      width = Math.max(10, Math.round(targetWidth));
      height = Math.max(10, Math.round(targetHeight));
    } else {
      width = naturalWidth;
      height = naturalHeight;
    }
    if (width > 12000 || height > 12000) throw new Error('Image dimensions are too large.');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');

    if (safeFormat === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    if (safeFormat === 'svg') {
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      const dataUrl = await readBlobAsDataUrl(pngBlob);
      const base64 = dataUrl.split(',')[1] || '';
      if (!base64 || !BASE64_RE.test(base64)) throw new Error('Unable to create SVG preview.');
      const svgMarkup = createSvgMarkupFromImageData(base64, width, height);
      const svgBlob = createSvgFromImageData(base64, width, height);
      converterState.latestSvgMarkup = svgMarkup;
      updateSvgCodeUI();
      return svgBlob;
    }

    return exportBlobWithSizeLimit(canvas, safeFormat, maxBytes);
  }).catch((error) => {
    revokeUrl(objectUrl);
    throw error;
  });
}

function setupImageConverter() {
  const imageUploadArea = $('imageUploadArea');
  const imageFileInput = $('imageFileInput');
  const previewGrid = $('previewGrid');
  const convertBtn = $('convertBtn');
  const statusDiv = $('status');
  const formatOptions = document.querySelectorAll('.format-option');

  if (!imageUploadArea || !imageFileInput || !previewGrid || !convertBtn || !statusDiv) return;

  // Status text is always set as plain text (never innerHTML with user data).
  const showStatus = (message, type) => {
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = String(message);
    statusDiv.classList.remove('hidden');
  };

  const showStatusWithDetail = (title, detail, type) => {
    statusDiv.className = `status ${type}`;
    statusDiv.innerHTML = '';
    statusDiv.appendChild(document.createTextNode(title));
    if (detail) {
      const br = document.createElement('br');
      const small = document.createElement('small');
      small.textContent = detail;
      statusDiv.append(br, small);
    }
    statusDiv.classList.remove('hidden');
  };

  const clearPreviewUrls = () => {
    for (const url of converterState.previewUrls) revokeUrl(url);
    converterState.previewUrls = [];
  };

  const updatePreview = () => {
    clearPreviewUrls();
    previewGrid.innerHTML = '';

    if (converterState.selectedFiles.length === 0) {
      previewGrid.classList.add('hidden');
      convertBtn.disabled = true;
      return;
    }

    previewGrid.classList.remove('hidden');

    converterState.selectedFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      converterState.previewUrls.push(url);

      const item = document.createElement('div');
      item.className = 'preview-item';

      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name;
      img.loading = 'lazy';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        converterState.selectedFiles.splice(index, 1);
        updatePreview();
      });

      const name = document.createElement('div');
      name.className = 'filename';
      name.textContent = file.name;

      item.append(img, removeBtn, name);
      previewGrid.appendChild(item);
    });
  };

  const handleFiles = (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    if (converterState.selectedFiles.length + incoming.length > CONVERTER_MAX_FILES) {
      showStatus(`You can convert up to ${CONVERTER_MAX_FILES} files at a time.`, 'error');
      return;
    }

    const accepted = [];
    for (const file of incoming) {
      if (!(file instanceof File)) continue;
      if (!ALLOWED_CONVERTER_TYPES.includes(file.type)) {
        showStatus(`Unsupported file type: ${file.name}. Use JPG, PNG, GIF, BMP or WEBP.`, 'error');
        continue;
      }
      if (file.size === 0) {
        showStatus(`Empty file skipped: ${file.name}.`, 'error');
        continue;
      }
      if (file.size > CONVERTER_MAX_FILE_BYTES) {
        showStatus(`${file.name} exceeds the 25 MB limit.`, 'error');
        continue;
      }
      accepted.push(file);
    }

    if (!accepted.length) return;

    converterState.selectedFiles = [...converterState.selectedFiles, ...accepted];
    updatePreview();
    convertBtn.disabled = false;
    statusDiv.classList.add('hidden');
    imageFileInput.value = '';
  };

  imageFileInput.addEventListener('change', (event) => handleFiles(event.target.files));

  imageUploadArea.addEventListener('click', () => imageFileInput.click());
  imageUploadArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      imageFileInput.click();
    }
  });

  ['dragover', 'dragenter'].forEach((eventName) => {
    imageUploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      imageUploadArea.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    imageUploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      imageUploadArea.classList.remove('dragover');
    });
  });

  imageUploadArea.addEventListener('drop', (event) => {
    handleFiles(event.dataTransfer?.files);
  });

  const customSizeToggle = $('customSizeToggle');
  const imageSizeFields = $('imageSizeFields');
  if (customSizeToggle && imageSizeFields) {
    const syncSizeFields = () => {
      imageSizeFields.classList.toggle('hidden', !customSizeToggle.checked);
    };
    customSizeToggle.addEventListener('change', syncSizeFields);
    syncSizeFields();
  }

  formatOptions.forEach((option) => {
    option.addEventListener('click', async () => {
      formatOptions.forEach((item) => item.classList.remove('selected'));
      option.classList.add('selected');
      converterState.outputFormat = sanitizeEnum(option.dataset.format, ALLOWED_OUTPUT_FORMATS, 'jpg');
      updateSvgCodeUI();

      if (converterState.outputFormat === 'svg' && converterState.selectedFiles.length > 0) {
        try {
          await generateConvertedBlob(converterState.selectedFiles[0], 'svg');
        } catch (error) {
          converterState.latestSvgMarkup = '';
          updateSvgCodeUI();
          showStatus(error.message || 'Could not generate the SVG preview.', 'error');
        }
      } else {
        converterState.latestSvgMarkup = '';
        updateSvgCodeUI();
      }
    });
  });

  convertBtn.addEventListener('click', async () => {
    if (converterState.selectedFiles.length === 0) return;
    if (typeof JSZip === 'undefined' && converterState.selectedFiles.length > 1) {
      return showStatus('ZIP library failed to load. Convert files one at a time.', 'error');
    }

    convertBtn.disabled = true;
    showStatus(`Converting ${converterState.selectedFiles.length} image(s)...`, 'processing');

    try {
      const convertedBlobs = [];

      for (const file of converterState.selectedFiles) {
        const blob = await generateConvertedBlob(file, converterState.outputFormat);
        const fileName = `${sanitizeFileStem(file.name)}.${converterState.outputFormat}`;
        convertedBlobs.push({ blob, fileName });
      }

      if (convertedBlobs.length === 1 && converterState.outputFormat !== 'svg') {
        downloadBlob(convertedBlobs[0].blob, convertedBlobs[0].fileName);
      } else if (convertedBlobs.length > 1) {
        showStatus('Creating ZIP archive...', 'processing');
        const zip = new JSZip();
        convertedBlobs.forEach(({ blob, fileName }) => zip.file(fileName, blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `converted_images_${Date.now()}.zip`);
      }

      if (converterState.outputFormat === 'svg') {
        showStatusWithDetail('SVG preview generated.', 'Use the code box below to copy or download it.', 'success');
      } else {
        showStatusWithDetail(
          `Successfully converted ${converterState.selectedFiles.length} image(s)!`,
          `Target size: ${converterState.targetSizeKB} KB`,
          'success'
        );
      }

      setTimeout(() => {
        if (converterState.outputFormat !== 'svg') {
          converterState.selectedFiles = [];
          updatePreview();
          imageFileInput.value = '';
        }
        convertBtn.disabled = converterState.selectedFiles.length === 0;
      }, 1800);
    } catch (error) {
      showStatus(error.message || 'Conversion failed.', 'error');
      convertBtn.disabled = false;
    }
  });
}

/* --------------------------- Alt text generator ------------------ */
/* Local-only heuristic: metadata + color sampling, no network calls. */

function rgbToColorName(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2 / 255;
  if (delta < 18) {
    if (light < 0.16) return 'black';
    if (light > 0.92) return 'white';
    if (light > 0.75) return 'light gray';
    if (light < 0.32) return 'dark gray';
    return 'gray';
  }
  if (max === r && g >= b && r - b < 40 && g > 120) return 'yellow';
  if (max === r && r - g < 60 && g > 100 && b < 100) return 'orange';
  if (max === r && r > g + 40 && r > b + 40) return 'red';
  if (max === g && g > b + 30) return 'green';
  if (b > r && b > g && g > 100) return 'teal';
  if (max === b) return 'blue';
  if (r > 120 && b > 120 && g < 120) return 'purple';
  if (r > 150 && g < 150 && b > 120) return 'pink';
  if (r > 90 && g > 60 && b < 80) return 'brown';
  return 'gray';
}

function sampleImageColors(img) {
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const counts = new Map();
    for (let i = 0; i < data.length; i += 16) {
      const alpha = data[i + 3];
      if (alpha < 128) continue;
      const name = rgbToColorName(data[i], data[i + 1], data[i + 2]);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .filter((name) => name !== 'gray' || counts.size === 1)
      .slice(0, 2);
  } catch {
    return []; // remote images without CORS taint the canvas
  }
}

function cleanAltSubject(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function stemToWords(name) {
  const base = String(name || '').split(/[\\/]/).pop().split('?')[0] || '';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!stem || /^(image|img|photo|screenshot|picture|untitled|download|file)\s*\d*$/i.test(stem)) return '';
  return stem.slice(0, 80);
}

function buildLocalAltText() {
  const length = sanitizeEnum($('altLength')?.value, ['short', 'medium', 'detailed'], 'short');
  const context = cleanAltSubject($('altContext')?.value);
  const fromName = stemToWords(altState.fileName);
  const subject = context || fromName || 'image';
  const orientation = altState.width && altState.height
    ? (altState.width > altState.height * 1.1 ? 'Landscape' : altState.height > altState.width * 1.1 ? 'Portrait' : 'Square')
    : '';
  const dims = altState.width && altState.height ? `${altState.width}×${altState.height}` : '';
  const format = (altState.fileType.split('/')[1] || '').toUpperCase().replace('JPEG', 'JPG');
  const colors = altState.colorHints && altState.colorHints.length
    ? `with ${altState.colorHints.join(' and ')} tones`
    : '';

  if (length === 'short') {
    let text = context
      ? `${orientation ? orientation + ' photo of ' : ''}${subject}`
      : fromName ? `Photo of ${fromName}` : `${orientation ? orientation + ' ' : ''}Photo`;
    if (text.length > 120) text = text.slice(0, 117).trim() + '...';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  let first = `${orientation ? orientation + ' photo' : 'Photo'}${subject && subject.toLowerCase() !== 'image' ? ` of ${subject}` : ''}`;
  const details = [dims, format].filter(Boolean).join(' ');
  if (details) first += ` (${details})`;
  if (colors) first += ` ${colors}`;
  first += '.';

  if (length === 'medium') return first.charAt(0).toUpperCase() + first.slice(1);

  const second = context || fromName
    ? 'Suitable as accessible alt text for web content.'
    : 'Add a subject in Context above for a more descriptive result.';
  return (first.charAt(0).toUpperCase() + first.slice(1)) + ' ' + second;
}

function updateAltPreview(img, displayName, sub) {
  const wrap = $('altPreviewWrap');
  const preview = $('altPreview');
  const meta = $('altMeta');
  if (!wrap || !preview || !meta) return;
  preview.src = img.src || img;
  meta.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = String(displayName || 'Image').slice(0, 120);
  const small = document.createElement('div');
  small.textContent = String(sub || '').slice(0, 200);
  meta.append(strong, small);
  wrap.classList.remove('hidden');
}

function setAltFromImage(img, info) {
  altState.width = img.naturalWidth || img.width || 0;
  altState.height = img.naturalHeight || img.height || 0;
  altState.fileName = info.name || '';
  altState.fileType = info.type || '';
  altState.fileBytes = info.bytes || 0;
  altState.isRemote = Boolean(info.remote);
  if ('dataUrl' in info) altState.dataUrl = info.dataUrl || null;
  altState.colorHints = sampleImageColors(img);
  const kb = altState.fileBytes ? `${Math.max(1, Math.round(altState.fileBytes / 1024))} KB · ` : '';
  updateAltPreview(img, altState.fileName || 'Pasted image',
    `${kb}${altState.width}×${altState.height}${altState.fileType ? ` · ${altState.fileType}` : ''}`);
  $('altGenerateBtn').disabled = false;
  $('altOutput').value = '';
  setAltStatus('', '');
}

function handleAltFiles(files) {
  const incoming = Array.from(files || []).filter((f) => f instanceof File);
  if (!incoming.length) return;
  const file = incoming[0];
  if (String(file.type) === 'image/svg+xml') {
    showToast('SVG is text to models — convert to PNG first (Image Converter tab).');
    return;
  }
  if (!ALLOWED_ALT_TYPES.includes(file.type) && !String(file.type).startsWith('image/')) {
    showToast('Use JPG, PNG, GIF, BMP or WEBP.');
    return;
  }
  if (file.size === 0 || file.size > ALT_MAX_FILE_BYTES) {
    showToast('Image must be under 10 MB.');
    return;
  }
  revokeUrl(altState.objectUrl);
  altState.dataUrl = null;
  const url = URL.createObjectURL(file);
  altState.objectUrl = url;
  Promise.all([loadImage(url), readBlobAsDataUrl(file)]).then(([img, dataUrl]) => {
    setAltFromImage(img, { name: file.name, type: file.type, bytes: file.size, remote: false, dataUrl });
  }).catch(() => {
    revokeUrl(url);
    altState.objectUrl = null;
    altState.dataUrl = null;
    showToast('Could not read that image.');
  });
}

/* ---------------- OpenCode API for alt text -------------------- */
/* Talks to the user's own OpenCode server (Basic auth opencode:password).
   Verified against OpenCode V2 API: POST /api/session, POST
   /api/session/{id}/prompt with files:[{uri: data:...}], GET
   /api/session/{id}/message polled for the assistant text. */

function altServerConfig() {
  const base = cleanField($('altServerUrl')?.value || storageGet(ALT_SERVER_KEY) || ALT_DEFAULT_SERVER, 200)
    .replace(/\/+$/, '');
  let password = '';
  try { password = sessionStorage.getItem(ALT_PASSWORD_KEY) || ''; }
  catch { password = ''; }
  if (!password) password = $('altServerPassword')?.value || '';
  const modelRaw = cleanField($('altModel')?.value || '', 200);
  return { base, password, modelRaw };
}

function altAuthHeaders(password) {
  return { Authorization: 'Basic ' + btoa('opencode:' + password) };
}

async function altApi(path, password, options = {}) {
  const { base } = altServerConfig();
  if (!base) throw new Error('Set your OpenCode server URL first.');
  if (!password) throw new Error('Enter your OpenCode password (from `opencode pair`).');
  let url;
  try { url = new URL(path, base + '/').toString(); }
  catch { throw new Error('Server URL looks invalid.'); }
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: { ...altAuthHeaders(password), ...(options.json ? { 'Content-Type': 'application/json' } : {}) },
      body: options.json ? JSON.stringify(options.json) : undefined
    });
  } catch {
    throw new Error('Cannot reach the server. Is OpenCode running? Try `opencode service status`.');
  }
  if (response.status === 401) throw new Error('Wrong password. Run `opencode pair` to see it.');
  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err.message || err._tag || '';
    } catch { /* ignore */ }
    throw new Error(`Server error ${response.status}${detail ? ': ' + detail : ''}.`);
  }
  return response.json();
}

function parseAltModel(raw) {
  const cleaned = cleanField(raw, 200);
  if (!cleaned) return null;
  const hash = cleaned.lastIndexOf('#');
  const ref = hash > 0 ? cleaned.slice(0, hash) : cleaned;
  const variant = hash > 0 ? cleaned.slice(hash + 1) : undefined;
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1) {
    throw new Error('Model must look like provider/model, e.g. anthropic/claude-sonnet-4-5.');
  }
  const out = { id: ref.slice(slash + 1), providerID: ref.slice(0, slash) };
  if (variant) out.variant = variant;
  return out;
}

function buildAltPrompt() {
  const length = sanitizeEnum($('altLength')?.value, ['short', 'medium', 'detailed'], 'short');
  const context = cleanAltSubject($('altContext')?.value);
  const scope = length === 'short'
    ? 'a concise alt text under 125 characters'
    : length === 'medium' ? 'one clear sentence of alt text' : 'two sentences of detailed alt text';
  let prompt = `Generate ${scope} for the attached image. Reply with ONLY the alt text, nothing else.`;
  if (context) prompt += ` The image shows: ${context}.`;
  return prompt;
}

function extractAltAssistantText(messages) {
  const list = Array.isArray(messages?.data) ? messages.data : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const msg = list[i];
    if (!msg || msg.type !== 'assistant' || !Array.isArray(msg.content)) continue;
    const text = msg.content.filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text).join('').trim();
    if (!text) continue;
    const done = Boolean(msg.time?.completed || msg.finish);
    return { text, done };
  }
  return { text: '', done: false };
}

async function pollAltResult(sessionID, password, timeoutMs = 120000) {
  const started = Date.now();
  let lastText = '';
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    const messages = await altApi(`/api/session/${sessionID}/message`, password);
    const found = extractAltAssistantText(messages);
    if (found.text && found.text !== lastText) {
      lastText = found.text;
      $('altOutput').value = lastText;
    }
    if (found.text && found.done) return found.text;
  }
  if (lastText) return lastText;
  throw new Error('Timed out waiting for the model. If OpenCode is asking for permission, approve it in the OpenCode UI and try again.');
}

function setAltStatus(message, type) {
  const el = $('altStatus');
  if (!el) return;
  if (!message) { el.classList.add('hidden'); return; }
  el.className = `status ${type || ''}`;
  el.textContent = String(message);
  el.classList.remove('hidden');
}

function setAltBadge(text) {
  const badge = $('altApiBadge');
  if (badge) badge.textContent = String(text).slice(0, 40);
}

/** Convert BMP (unsupported by vision models) to PNG via canvas. */
function normalizeAltDataUrl(dataUrl, mime) {
  if (mime !== 'image/bmp' && mime !== 'image/x-ms-bmp') return Promise.resolve({ dataUrl, mime });
  return loadImage(dataUrl).then((img) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), mime: 'image/png' };
  });
}

/** Fetch a remote image through an <img> + canvas so we can send a data: URL
    (OpenCode attachments do not accept http(s) URLs). May fail without CORS. */
function remoteImageToDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        if (!canvas.width || !canvas.height) throw new Error('empty');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/png'), mime: 'image/png', width: canvas.width, height: canvas.height });
      } catch { reject(new Error('That URL blocks cross-origin reads. Download the image and upload the file instead.')); }
    };
    img.onerror = () => reject(new Error('Could not load that URL (blocked by CSP, CORS, or not an image).'));
    img.src = url;
  });
}

async function currentAltDataUrl() {
  if (altState.dataUrl) {
    const normalized = await normalizeAltDataUrl(altState.dataUrl, altState.fileType);
    return { ...normalized, name: altState.fileName || 'image' };
  }
  const url = cleanField($('altUrl')?.value || '', MAX_URL_LENGTH);
  if (!url) throw new Error('Upload, paste, or load an image first.');
  const converted = await remoteImageToDataUrl(url);
  return { dataUrl: converted.dataUrl, mime: converted.mime, name: url.split('/').pop().split('?')[0] || 'remote-image' };
}

async function generateAltViaOpenCode() {
  const { password, modelRaw } = altServerConfig();
  const generateBtn = $('altGenerateBtn');
  generateBtn.disabled = true;
  setAltBadge('OpenCode…');
  try {
    const model = parseAltModel(modelRaw);
    setAltStatus('Preparing image…', 'processing');
    const attachment = await currentAltDataUrl();
    setAltStatus('Creating session…', 'processing');
    const createBody = { title: 'Alt text' };
    if (model) createBody.model = model;
    const created = await altApi('/api/session', password, { method: 'POST', json: createBody });
    const sessionID = created?.data?.id;
    if (!sessionID) throw new Error('Server did not return a session.');
    setAltStatus('Generating alt text…', 'processing');
    await altApi(`/api/session/${sessionID}/prompt`, password, {
      method: 'POST',
      json: {
        text: buildAltPrompt(),
        files: [{ uri: attachment.dataUrl, name: attachment.name.slice(0, 120) }]
      }
    });
    const text = await pollAltResult(sessionID, password);
    setAltStatus('Done.', 'success');
    setAltBadge('OpenCode ✓');
    showToast('Alt text generated with OpenCode.');
    try { await altApi(`/api/session/${sessionID}`, password, { method: 'DELETE' }); }
    catch { /* best-effort cleanup */ }
    return text;
  } catch (error) {
    setAltStatus(error.message || 'Generation failed.', 'error');
    setAltBadge('OpenCode ✗');
    showToast(error.message || 'Generation failed.');
    return '';
  } finally {
    generateBtn.disabled = !altState.width && !$('altUrl')?.value;
  }
}

function setupAltText() {
  const uploadArea = $('altUploadArea');
  const fileInput = $('altFileInput');
  const generateBtn = $('altGenerateBtn');
  const output = $('altOutput');
  if (!uploadArea || !fileInput || !generateBtn || !output) return;

  // Restore saved server settings (password lives in sessionStorage only).
  if ($('altServerUrl') && !$('altServerUrl').value) {
    $('altServerUrl').value = storageGet(ALT_SERVER_KEY) || ALT_DEFAULT_SERVER;
  }
  if ($('altModel') && !$('altModel').value) $('altModel').value = storageGet(ALT_MODEL_KEY) || '';
  try {
    const savedPw = sessionStorage.getItem(ALT_PASSWORD_KEY) || '';
    if (savedPw && $('altServerPassword')) $('altServerPassword').value = savedPw;
  } catch { /* ignore */ }

  const persistServerSettings = () => {
    if ($('altServerUrl')) storageSet(ALT_SERVER_KEY, cleanField($('altServerUrl').value, 200));
    if ($('altModel')) storageSet(ALT_MODEL_KEY, cleanField($('altModel').value, 200));
    try { sessionStorage.setItem(ALT_PASSWORD_KEY, $('altServerPassword')?.value || ''); }
    catch { /* ignore */ }
  };
  $('altServerUrl')?.addEventListener('change', persistServerSettings);
  $('altModel')?.addEventListener('change', persistServerSettings);
  $('altServerPassword')?.addEventListener('change', persistServerSettings);

  fileInput.addEventListener('change', (event) => {
    handleAltFiles(event.target.files);
    fileInput.value = '';
  });
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  ['dragover', 'dragenter'].forEach((name) => uploadArea.addEventListener(name, (event) => {
    event.preventDefault();
    uploadArea.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => uploadArea.addEventListener(name, (event) => {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
  }));
  uploadArea.addEventListener('drop', (event) => handleAltFiles(event.dataTransfer?.files));

  // Paste anywhere while the Alt panel is active.
  document.addEventListener('paste', (event) => {
    const panel = $('altPanel');
    if (!panel || !panel.classList.contains('active')) return;
    const files = event.clipboardData?.files;
    if (files && files.length) handleAltFiles(files);
  });

  $('altLoadUrlBtn')?.addEventListener('click', () => {    let url = cleanField($('altUrl')?.value || '', MAX_URL_LENGTH);
    if (!url) return showToast('Paste an image URL first.');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad');
    } catch {
      return showToast('Please enter a valid http(s) image URL.');
    }
    loadImage(url).then((img) => {
      revokeUrl(altState.objectUrl);
      altState.objectUrl = null;
      altState.dataUrl = null; // converted on demand via canvas at generate time
      const ext = (parsedExt(url) || '').toLowerCase();
      const type = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      setAltFromImage(img, { name: url.split('/').pop().split('?')[0] || 'remote-image', type, bytes: 0, remote: true });
    }).catch(() => showToast('Could not load that URL (blocked by CSP, CORS, or not an image).'));
  });

  // Allow generating straight from a typed URL (converted at generate time).
  $('altUrl')?.addEventListener('input', () => {
    if (cleanField($('altUrl').value || '', MAX_URL_LENGTH)) generateBtn.disabled = false;
    else if (!altState.width) generateBtn.disabled = true;
  });

  $('altTestBtn')?.addEventListener('click', async () => {
    persistServerSettings();
    const { password } = altServerConfig();
    setAltBadge('OpenCode…');
    setAltStatus('Testing connection…', 'processing');
    try {
      const info = await altApi('/api/info', password);
      setAltStatus(`Connected — server v${info?.version || 'unknown'}.`, 'success');
      setAltBadge('OpenCode ✓');
      showToast('OpenCode server reachable.');
    } catch (error) {
      setAltStatus(error.message, 'error');
      setAltBadge('OpenCode ✗');
    }
  });

  $('altOfflineBtn')?.addEventListener('click', () => {
    if (!altState.width) return showToast('Upload or paste an image first.');
    try {
      output.value = buildLocalAltText();
      setAltStatus('Offline guess — metadata only, no AI used.', 'processing');
      showToast('Offline guess generated.');
    } catch {
      showToast('Could not generate alt text.');
    }
  });

  generateBtn.addEventListener('click', async () => {
    persistServerSettings();
    await generateAltViaOpenCode();
  });

  $('copyAltBtn')?.addEventListener('click', async () => {
    const content = output.value.trim();
    if (!content) return showToast('Generate alt text first.');
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(content);
      else { output.focus(); output.select(); if (!document.execCommand('copy')) throw new Error('copy'); }
      showToast('Alt text copied.');
    } catch { showToast('Copy is not supported in this browser.'); }
  });

  $('clearAltBtn')?.addEventListener('click', () => {
    revokeUrl(altState.objectUrl);
    Object.assign(altState, { fileName: '', fileType: '', fileBytes: 0, width: 0, height: 0, objectUrl: null, dataUrl: null, isRemote: false, colorHints: [] });
    if ($('altUrl')) $('altUrl').value = '';
    if ($('altContext')) $('altContext').value = '';
    output.value = '';
    setAltStatus('', '');
    $('altPreviewWrap')?.classList.add('hidden');
    if ($('altPreview')) $('altPreview').removeAttribute('src');
    generateBtn.disabled = true;
  });
}

function parsedExt(url) {
  const clean = String(url).split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1).slice(0, 5) : '';
}

/* ------------------------------- Init ------------------------------ */

const debouncedRender = debounce(() => renderQR(false), 180);

function init() {
  setupToolNavigation();
  setupImageConverter();
  setupCaseConverter();
  setupAltText();

  const copySvgBtn = $('copySvgCodeBtn');
  if (copySvgBtn) copySvgBtn.addEventListener('click', copySvgMarkup);
  const downloadSvgCodeBtn = $('downloadSvgCodeBtn');
  if (downloadSvgCodeBtn) downloadSvgCodeBtn.addEventListener('click', downloadSvgMarkup);

  $('qrType').addEventListener('change', () => { renderFields(); if (state.generated) clearAll(); });
  $('generateBtn').addEventListener('click', () => renderQR(true));
  $('clearBtn').addEventListener('click', clearAll);
  $('downloadPng').addEventListener('click', () => downloadRaster('png'));
  $('downloadJpg').addEventListener('click', () => downloadRaster('jpg'));
  $('downloadSvg').addEventListener('click', downloadSvg);
  $('copyBtn').addEventListener('click', copyQR);
  $('printBtn').addEventListener('click', printQR);
  $('themeToggle').addEventListener('click', toggleTheme);
  $('sidebarToggle').addEventListener('click', toggleSidebar);
  $('clearHistoryBtn').addEventListener('click', () => { storageRemove(HISTORY_KEY); renderHistory(); });
  $('historyList').addEventListener('click', (event) => {
    const button = event.target.closest('.history-item');
    if (!button) return;
    const history = readHistory();
    const item = history.find((x) => x.id === Number(button.dataset.id));
    if (item) loadHistoryItem(item);
  });

  $('removeLogo').addEventListener('click', () => {
    state.logo = null;
    revokeUrl(state.logoUrl);
    state.logoUrl = null;
    $('logoInput').value = '';
    $('logoName').textContent = 'Upload logo';
    if (state.generated) renderQR(false);
  });

  $('logoInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      event.target.value = '';
      return showToast('Logo must be PNG, JPG or WEBP.');
    }
    if (file.size > LOGO_MAX_BYTES) {
      event.target.value = '';
      return showToast('Logo must be 2 MB or smaller.');
    }
    state.logo = file;
    revokeUrl(state.logoUrl);
    state.logoUrl = URL.createObjectURL(file);
    $('logoName').textContent = file.name;
    if ($('errorCorrection').value !== 'H') $('errorCorrection').value = 'H';
    if (state.generated) renderQR(false);
  });

  ['size', 'padding', 'dots', 'corners', 'errorCorrection', 'transparent'].forEach((id) => {
    $(id).addEventListener('change', () => { if (state.generated) debouncedRender(); });
  });
  syncColor('foreground', 'foregroundHex');
  syncColor('background', 'backgroundHex');

  if (storageGet(THEME_KEY) === 'dark') {
    document.body.classList.add('dark');
    $('themeToggle').textContent = '☀';
  }

  renderFields();
  renderHistory();
}

init();
