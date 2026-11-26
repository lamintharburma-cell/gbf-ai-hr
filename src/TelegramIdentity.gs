/**
 * 🔗 G.B.F. Enterprise HR & AI Management System — Telegram Identity Binding (TelegramIdentity.gs v9.2.3)
 *
 * Why this module exists:
 *   Apps Script serves the Mini App inside a cross-origin nested iframe (googleusercontent.com/userCodeAppPanel),
 *   so Telegram's `#tgWebAppData` hash never reaches `Telegram.WebApp.initDataUnsafe`. The Chat ID therefore
 *   has to travel through the Bot-issued Mini App URL instead (`?tg_id=...&tg_sig=...`).
 *
 * Security model:
 *   - The bot signs every Mini App link with HMAC-SHA256 (secret kept only in ScriptProperties `TG_LINK_SECRET`).
 *   - `doGet()` and `dispatchApiAction_()` accept a Chat ID ONLY when its signature verifies, so a forged
 *     `/exec?tg_id=<someone>` URL or a hand-crafted API payload can never trigger SSO or a binding.
 *   - A Chat ID is written to `HR_Employees!A` only after a successful PIN match, only into an empty cell,
 *     and never if that Chat ID already belongs to another active employee (conflict guard + audit log).
 */

/**
 * Returns a clean numeric Telegram private-chat ID string, or "" when invalid.
 */
function sanitizeTelegramChatId_(raw) {
  const s = String(raw == null ? "" : raw).trim();
  return /^\d{5,15}$/.test(s) ? s : "";
}

/**
 * Lazily provisions the HMAC secret used to sign Mini App deep links.
 */
function getTelegramLinkSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("TG_LINK_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("TG_LINK_SECRET", secret);
  }
  return secret;
}

function signTelegramChatId_(chatId) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (!clean) return "";
  const raw = Utilities.computeHmacSha256Signature("tg:" + clean, getTelegramLinkSecret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, "");
}

/**
 * Constant-time string comparison to prevent HMAC timing side-channels.
 */
function constantTimeEqual_(a, b) {
  const s1 = String(a == null ? "" : a);
  const s2 = String(b == null ? "" : b);
  if (!s1 || !s2 || s1.length !== s2.length) return false;
  let diff = 0;
  for (let i = 0; i < s1.length; i++) {
    diff |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Constant-time signature comparison.
 */
function verifyTelegramChatSig_(chatId, sig) {
  const clean = sanitizeTelegramChatId_(chatId);
  const given = String(sig == null ? "" : sig).trim();
  if (!clean || !given) return false;
  const expected = signTelegramChatId_(clean);
  return constantTimeEqual_(expected, given);
}

const GBF_B64URL_ALPHA_ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeBase64UrlUtf8_(str) {
  const bytes = [];
  const s = String(str == null ? "" : str);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      const cp = 0x10000 + (((code & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += GBF_B64URL_ALPHA_[b0 >> 2];
    out += GBF_B64URL_ALPHA_[((b0 & 3) << 4) | (b1 >> 4)];
    if (has1) out += GBF_B64URL_ALPHA_[((b1 & 15) << 2) | (b2 >> 6)];
    if (has2) out += GBF_B64URL_ALPHA_[b2 & 63];
  }
  return out;
}

function decodeBase64UrlUtf8_(b64) {
  const s = String(b64 == null ? "" : b64).replace(/=+$/, "");
  if (!s || !/^[A-Za-z0-9_-]+$/.test(s) || (s.length % 4) === 1) return "";
  const bytes = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = GBF_B64URL_ALPHA_.indexOf(s[i]);
    const c1 = GBF_B64URL_ALPHA_.indexOf(s[i + 1]);
    const c2 = i + 2 < s.length ? GBF_B64URL_ALPHA_.indexOf(s[i + 2]) : -1;
    const c3 = i + 3 < s.length ? GBF_B64URL_ALPHA_.indexOf(s[i + 3]) : -1;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 !== -1) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 !== -1) bytes.push(((c2 & 3) << 6) | c3);
  }
  let out = "";
  for (let i = 0; i < bytes.length;) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if ((b0 & 0xe0) === 0xc0 && i < bytes.length) {
      const b1 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if ((b0 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else if ((b0 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      const off = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff));
    } else {
      return "";
    }
  }
  return out;
}

/**
 * Lazily provisions the isolated HMAC secret used to sign Mini App Web Session Tokens.
 */
function getWebSessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("WEB_SESSION_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("WEB_SESSION_SECRET", secret);
  }
  return secret;
}

/**
 * Computes Monday–Saturday workweek session TTL in seconds until Saturday 23:59:59 Asia/Yangon (GMT+6:30),
 * with a minimum 12-hour (43,200s) floor for late-Saturday logins. Sunday logins expire next Saturday 23:59:59.
 */
function computeWorkweekSessionTtlSec_(nowDate) {
  const YGN_OFFSET_MS = 390 * 60000;
  const nowMs = (nowDate instanceof Date ? nowDate : new Date()).getTime();
  const ygn = new Date(nowMs + YGN_OFFSET_MS);
  const daysUntilSat = (6 - ygn.getUTCDay() + 7) % 7;
  const satEndUtcMs = Date.UTC(
    ygn.getUTCFullYear(),
    ygn.getUTCMonth(),
    ygn.getUTCDate() + daysUntilSat,
    23,
    59,
    59
  ) - YGN_OFFSET_MS;
  const rawSec = Math.floor((satEndUtcMs - nowMs) / 1000);
  return Math.max(43200, rawSec);
}

/**
 * Issues an HMAC-SHA256 signed Web App session token bound to Emp ID, Layer, and verified Chat ID.
 */
function issueSessionToken_(empId, layer, chatId, ttlSecOverride, nowDate) {
  const sub = String(empId == null ? "" : empId).trim();
  if (!sub || sub === "__GROUP_VIEWER__") return "";
  const nowMs = (nowDate instanceof Date ? nowDate : new Date()).getTime();
  const nowSec = Math.floor(nowMs / 1000);
  const ttlSec = (typeof ttlSecOverride === "number" && isFinite(ttlSecOverride))
    ? Math.floor(ttlSecOverride)
    : computeWorkweekSessionTtlSec_(new Date(nowMs));
  const payload = {
    sub: sub,
    layer: String(layer || "JT").trim(),
    cid: sanitizeTelegramChatId_(chatId),
    iat: nowSec,
    exp: nowSec + ttlSec
  };
  const payloadB64 = encodeBase64UrlUtf8_(JSON.stringify(payload));
  const sigBytes = Utilities.computeHmacSha256Signature("sess:" + payloadB64, getWebSessionSecret_());
  const sigB64 = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, "");
  return payloadB64 + "." + sigB64;
}

/**
 * Verifies HMAC signature and expiration of a Web App session token.
 */
function verifySessionToken_(token, nowDate) {
  const raw = String(token == null ? "" : token).trim();
  if (!raw) return { valid: false, reason: "MISSING" };
  const dotIdx = raw.indexOf(".");
  if (dotIdx <= 0 || raw.indexOf(".", dotIdx + 1) !== -1) {
    return { valid: false, reason: "MALFORMED" };
  }
  const payloadB64 = raw.slice(0, dotIdx);
  const sigB64 = raw.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return { valid: false, reason: "MALFORMED" };

  try {
    const expectedSigBytes = Utilities.computeHmacSha256Signature("sess:" + payloadB64, getWebSessionSecret_());
    const expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSigBytes).replace(/=+$/, "");
    if (!constantTimeEqual_(expectedSigB64, sigB64)) {
      return { valid: false, reason: "INVALID_SIG" };
    }
    const jsonStr = decodeBase64UrlUtf8_(payloadB64);
    if (!jsonStr) return { valid: false, reason: "BAD_ENCODING" };
    const payload = JSON.parse(jsonStr);
    if (!payload || typeof payload !== "object" || !payload.sub ||
        typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return { valid: false, reason: "BAD_CLAIMS" };
    }
    const nowSec = Math.floor(((nowDate instanceof Date ? nowDate : new Date()).getTime()) / 1000);
    if (payload.exp <= nowSec) {
      return { valid: false, reason: "EXPIRED", sub: String(payload.sub) };
    }
    return {
      valid: true,
      sub: String(payload.sub).trim(),
      layer: String(payload.layer || "").trim(),
      cid: sanitizeTelegramChatId_(payload.cid),
      iat: payload.iat,
      exp: payload.exp
    };
  } catch (e) {
    return { valid: false, reason: "VERIFY_ERROR" };
  }
}

function normalizeRateKeys_(targetPin, clientNonce, chatId) {
  const keys = [];
  const cleanTarget = String(targetPin == null ? "" : targetPin).trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  const cleanClient = String(clientNonce == null ? "" : clientNonce).trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);
  const cleanChat = sanitizeTelegramChatId_(chatId);
  if (cleanTarget) keys.push("PIN_FAIL_T_" + cleanTarget);
  if (cleanClient) keys.push("PIN_FAIL_C_" + cleanClient);
  if (cleanChat) keys.push("PIN_FAIL_CHAT_" + cleanChat);
  return keys;
}

function checkLoginRateLimit_(rateKeys, hasVerifiedChat) {
  const MAX_FAILURES = 8;
  const MAX_GLOBAL_WEB_FAILURES = 24;
  try {
    const cache = CacheService.getScriptCache();
    let maxAttempts = 0;
    (rateKeys || []).forEach(k => {
      const cnt = parseInt(cache.get(k) || "0", 10) || 0;
      if (cnt > maxAttempts) maxAttempts = cnt;
    });
    if (maxAttempts >= MAX_FAILURES) {
      return { blocked: true, attempts: maxAttempts };
    }
    if (!hasVerifiedChat) {
      const globalCnt = parseInt(cache.get("PIN_FAIL_WEB_GLOBAL") || "0", 10) || 0;
      if (globalCnt >= MAX_GLOBAL_WEB_FAILURES) {
        return { blocked: true, attempts: globalCnt };
      }
    }
    return { blocked: false, attempts: maxAttempts };
  } catch (e) {
    return { blocked: false, attempts: 0 };
  }
}

function recordLoginFailure_(rateKeys, empIdHint, hasVerifiedChat) {
  const MAX_FAILURES = 8;
  const MAX_GLOBAL_WEB_FAILURES = 24;
  const LOCK_TTL_SEC = 900;
  const GLOBAL_TTL_SEC = 300;
  try {
    const cache = CacheService.getScriptCache();
    let hitLock = false;
    let peak = 0;
    (rateKeys || []).forEach(k => {
      const next = (parseInt(cache.get(k) || "0", 10) || 0) + 1;
      cache.put(k, String(next), LOCK_TTL_SEC);
      if (next >= MAX_FAILURES) hitLock = true;
      if (next > peak) peak = next;
    });
    if (!hasVerifiedChat) {
      const nextGlobal = (parseInt(cache.get("PIN_FAIL_WEB_GLOBAL") || "0", 10) || 0) + 1;
      cache.put("PIN_FAIL_WEB_GLOBAL", String(nextGlobal), GLOBAL_TTL_SEC);
      if (nextGlobal >= MAX_GLOBAL_WEB_FAILURES) {
        hitLock = true;
        if (nextGlobal > peak) peak = nextGlobal;
      }
    }
    if (hitLock) {
      logToAudit("LOGIN_BRUTE_GUARD", String(empIdHint || "UNKNOWN"), "RateLimit", "Blocked after " + peak + " failed PIN attempts");
    }
    return peak;
  } catch (e) {
    return 0;
  }
}

function clearLoginFailures_(rateKeys) {
  try {
    const cache = CacheService.getScriptCache();
    (rateKeys || []).forEach(k => cache.remove(k));
  } catch (e) {}
}

/**
 * Returns the Chat ID only when accompanied by a valid signature; otherwise "".
 */
function resolveTrustedChatId_(chatId, sig) {
  return verifyTelegramChatSig_(chatId, sig) ? sanitizeTelegramChatId_(chatId) : "";
}

/**
 * Builds the personal, signed Mini App URL for a Telegram private chat.
 */
function buildSignedMiniAppUrl_(chatId) {
  const base = getActiveWebAppUrl_();
  const clean = sanitizeTelegramChatId_(chatId);
  if (!clean) return base;
  const sep = base.indexOf("?") === -1 ? "?" : "&";
  return `${base}${sep}tg_id=${encodeURIComponent(clean)}&tg_sig=${encodeURIComponent(signTelegramChatId_(clean))}`;
}

/**
 * Points this user's bottom-left Telegram Menu Button at their signed Mini App URL.
 */
function setPersonalMenuButton_(chatId, appUrl) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (!clean || !appUrl || !getBotToken()) return false;
  try {
    const res = UrlFetchApp.fetch(getTelegramAPI() + "setChatMenuButton", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: Number(clean),
        menu_button: { type: "web_app", text: "GBF HR App", web_app: { url: appUrl } }
      })
    });
    if (res.getResponseCode() !== 200) {
      Logger.log(`setChatMenuButton Error (${clean}): ${res.getContentText()}`);
      return false;
    }
    return true;
  } catch (e) {
    Logger.log("setChatMenuButton Exception: " + e.message);
    return false;
  }
}

/**
 * Finds the active employee row (0-based index into empData) already bound to a Chat ID, or -1.
 */
function findEmployeeIndexByChatId_(empData, chatId) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (!clean || !Array.isArray(empData)) return -1;
  for (let i = 1; i < empData.length; i++) {
    const rowChat = String(empData[i][0] || "").trim();
    const rowStatus = String(empData[i][7] || "Active").trim().toLowerCase();
    if (rowChat === clean && rowStatus !== "inactive") return i;
  }
  return -1;
}

/**
 * Resolves the active employee record bound to a Telegram private Chat ID, or null.
 * @return {{rowIndex: number, empId: string, name: string, role: string, baseSalary: number, strikeCount: number}|null}
 */
function findEmployeeByChatId_(chatId, cachedEmpRows) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (!clean) return null;
  let data = cachedEmpRows;
  if (!data) {
    const sheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
    if (!sheet) return null;
    data = sheet.getDataRange().getValues();
  }
  const idx = findEmployeeIndexByChatId_(data, clean);
  if (idx === -1) return null;
  const row = data[idx];
  return {
    rowIndex: idx + 1,
    empId: String(row[1] || "").trim(),
    name: String(row[2] || "").trim(),
    role: String(row[3] || "Staff").trim(),
    baseSalary: parseFloat(String(row[6] || "400000").replace(/,/g, "")) || 400000,
    strikeCount: parseInt(row[9], 10) || 0
  };
}

/**
 * 🔐 Writes a Chat ID into HR_Employees!A{rowIndex} with conflict + overwrite guards.
 * @param {number} rowIndex 1-based sheet row of the employee (>= 2).
 * @return {{bound: boolean, reason: string, empId?: string, empName?: string, otherEmpId?: string}}
 */
function bindTelegramChatIdToRow_(empSheet, empData, rowIndex, chatId, source) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (!empSheet || !Array.isArray(empData) || !clean || rowIndex < 2 || rowIndex > empData.length) {
    return { bound: false, reason: "INVALID" };
  }
  const row = empData[rowIndex - 1];
  const empId = String(row[1] || "").trim();
  const empName = String(row[2] || "").trim();
  const current = String(row[0] || "").trim();

  if (current === clean) return { bound: false, reason: "ALREADY_LINKED", empId, empName };
  if (current) return { bound: false, reason: "ROW_HAS_OTHER_CHAT", empId, empName };

  const otherIdx = findEmployeeIndexByChatId_(empData, clean);
  if (otherIdx !== -1 && otherIdx !== rowIndex - 1) {
    const otherEmpId = String(empData[otherIdx][1] || "").trim();
    logIdentityConflictOnce_(empId, empName, clean, otherEmpId, source);
    return { bound: false, reason: "CHAT_USED_BY_OTHER", empId, empName, otherEmpId };
  }

  empSheet.getRange(rowIndex, 1).setValue(clean);
  row[0] = clean;
  SpreadsheetApp.flush();
  logToAudit("CHAT_ID_BOUND", empId, empName, `Telegram ChatID ${clean} bound (source: ${source})`);
  notifyAdminChatBound_(empId, empName, clean, source);
  return { bound: true, reason: "BOUND", empId, empName };
}

/**
 * Logs a binding conflict at most once per 6 hours per (chat, employee) to keep System_Audit_Logs clean.
 */
function logIdentityConflictOnce_(empId, empName, chatId, otherEmpId, source) {
  try {
    const cache = CacheService.getScriptCache();
    const key = `TG_BIND_CONFLICT_${chatId}_${empId}`;
    if (cache.get(key)) return;
    cache.put(key, "1", 21600);
  } catch (e) {}
  logToAudit("CHAT_ID_BIND_CONFLICT", empId, empName, `ChatID ${chatId} already bound to Emp ${otherEmpId} (source: ${source})`);
}

function notifyAdminChatBound_(empId, empName, chatId, source) {
  try {
    const adminChat = String(getSettings().HR_ADMIN_CHAT_ID || "").trim();
    if (!adminChat || adminChat === chatId || !getBotToken()) return;
    sendTelegramHTML(adminChat,
      `🔗 <b>Telegram ID ချိတ်ဆက်ပြီး</b>\n👤 ${escapeHtmlText_(empName)} (<code>${escapeHtmlText_(empId)}</code>)\n🆔 Chat ID: <code>${escapeHtmlText_(chatId)}</code>\n📍 Source: ${escapeHtmlText_(source)}\n\n— <b>GBF HR AI Management Team</b>`);
  } catch (e) {}
}

/**
 * 🤖 `/link <PIN>` fallback: binds the sender's private Chat ID by PIN (rate-limited 5 failures / hour).
 */
function linkTelegramChatByPin_(chatId, rawPin) {
  const clean = sanitizeTelegramChatId_(chatId);
  const pin = String(rawPin == null ? "" : rawPin).trim();
  if (!clean) return { ok: false, message: "❌ Telegram Chat ID မမှန်ကန်ပါ။ Bot ကို Private Chat တွင်သာ အသုံးပြုပါ။" };
  if (!/^\d{3,8}$/.test(pin)) {
    return { ok: false, message: "ℹ️ အသုံးပြုပုံ: <code>/link 1234</code> (သင်၏ Official PIN နံပါတ်)" };
  }

  const cache = CacheService.getScriptCache();
  const attemptKey = "TG_LINK_ATTEMPTS_" + clean;
  const attempts = parseInt(cache.get(attemptKey) || "0", 10) || 0;
  if (attempts >= 5) {
    return { ok: false, message: "⛔ ကြိုးစားမှု များလွန်းနေပါသည်။ ၁ နာရီအကြာမှ ထပ်ကြိုးစားပါ (သို့) HR ထံ ဆက်သွယ်ပါ။" };
  }

  const empSheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
  if (!empSheet) return { ok: false, message: "❌ HR_Employees sheet မတွေ့ပါ။" };
  const empData = empSheet.getDataRange().getValues();

  let rowIndex = -1;
  for (let i = 1; i < empData.length; i++) {
    const rowEmpId = String(empData[i][1] || "").trim();
    const rowPin = String(empData[i][8] || empData[i][1] || "").trim();
    const rowStatus = String(empData[i][7] || "Active").trim().toLowerCase();
    if (rowStatus !== "inactive" && (rowPin === pin || rowEmpId === pin)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    cache.put(attemptKey, String(attempts + 1), 3600);
    return { ok: false, message: `❌ PIN နံပါတ် မှားယွင်းနေပါသည်။ (ကျန်ရှိသော အကြိမ်: ${Math.max(0, 4 - attempts)})` };
  }

  const result = bindTelegramChatIdToRow_(empSheet, empData, rowIndex, clean, "BOT_LINK_COMMAND");
  const who = `${escapeHtmlText_(result.empName || "")} (<code>${escapeHtmlText_(result.empId || "")}</code>)`;
  switch (result.reason) {
    case "BOUND":
      cache.remove(attemptKey);
      return { ok: true, message: `✅ <b>Telegram ID ချိတ်ဆက်ပြီးပါပြီ</b>\n👤 ${who}\n\nယခုမှစ၍ ခွင့်/ကြိုတင်လစာ အကြောင်းကြားချက်များ ဤ Chat သို့ ရောက်ရှိမည်ဖြစ်ပြီး Menu ခလုတ်မှ Mini App ကို PIN မလိုဘဲ ဝင်ရောက်နိုင်ပါပြီ။` };
    case "ALREADY_LINKED":
      cache.remove(attemptKey);
      return { ok: true, message: `ℹ️ ${who} နှင့် ချိတ်ဆက်ပြီးသား ဖြစ်ပါသည်။` };
    case "ROW_HAS_OTHER_CHAT":
      logToAudit("CHAT_ID_BIND_CONFLICT", result.empId, result.empName, `ChatID ${clean} tried /link but row already bound to another Telegram account`);
      return { ok: false, message: `⚠️ ${who} အကောင့်သည် အခြား Telegram အကောင့်နှင့် ချိတ်ထားပြီး ဖြစ်ပါသည်။ ပြောင်းလဲလိုပါက HR ထံ ဆက်သွယ်ပါ။` };
    case "CHAT_USED_BY_OTHER":
      return { ok: false, message: `⚠️ ဤ Telegram အကောင့်သည် ဝန်ထမ်း <code>${escapeHtmlText_(result.otherEmpId || "")}</code> နှင့် ချိတ်ထားပြီး ဖြစ်ပါသည်။ ပြောင်းလဲလိုပါက HR ထံ ဆက်သွယ်ပါ။` };
    default:
      return { ok: false, message: "❌ ချိတ်ဆက်မှု မအောင်မြင်ပါ။ HR ထံ ဆက်သွယ်ပါ။" };
  }
}
