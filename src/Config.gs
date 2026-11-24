/**
 * ⚙️ G.B.F. Enterprise HR & AI Management System — Configuration & Core Utilities (v9.2 Production LTS)
 * Standardized constants, credential getters, cached settings, and shared pure helpers.
 */

const GBF_CONFIG = {
  VERSION: "v9.4.1 Production LTS",
  TIMEZONE: "Asia/Rangoon",
  GMT_OFFSET: "GMT+6:30",
  DEFAULT_BOT_USERNAME: "GBF_HRMS_Bot",
  DEFAULT_SPREADSHEET_ID: "1J13zp0CF3Pogq3ijRMWPl0fJNFliNjzzHsXUU_6VEyw",
  DEFAULT_SCRIPT_ID: "1yp2S7zYgTB-bUfBVX9RwSC4HGs9ZKLoaSwjXn2ZTv5fpruUm-g9n49hl",
  DEFAULT_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyRMUJDUbPJidoXDNrYycqS-WU_AS5Mech41ul7fO88VJYoqKg62SzNmPWkUg0G-kHx/exec",
  GEMINI_MODEL: "gemini-3.8-flash",
  GEMINI_INTERACTIONS_URL: "https://generativelanguage.googleapis.com/v1beta/interactions",
  SETTINGS_CACHE_KEY: "GBF_SETTINGS_CACHE_V94",
  SETTINGS_CACHE_TTL: 300
};

const GBF_DB_SCHEMA = {
  HR_Employees: [
    "Telegram_Chat_ID", "Official_Emp_ID", "Employee_Name", "Role", "Phone",
    "Joined_Date", "Base_Salary", "Status", "PIN", "Strike_Count", "Department", "Staff_Code"
  ],
  Daily_Attendance: [
    "Att_ID", "Date", "Official_Emp_ID", "Check_In_Time", "Check_In_GPS",
    "Check_Out_Time", "Check_Out_GPS", "Distance_Meter", "Location_Status", "KPI_Status", "Employee_Name"
  ],
  Leave_Management: [
    "Leave_ID", "Official_Emp_ID", "Emp_Name", "Leave_Type", "Start_Date",
    "End_Date", "Total_Days", "Reason", "Leave_Pattern_Day", "HR_Status"
  ],
  Advance_Salary: [
    "Req_ID", "Emp_ID", "Emp_Name", "Requested_Amount", "Requested_Date",
    "Reason", "HR_Status", "AI_Risk_Score"
  ],
  Daily_Teams: [
    "Team_ID", "Date", "Team_Name", "Project", "Members", "Members_JSON"
  ],
  HR_Voice_Feedback: [
    "Ticket_ID", "Timestamp", "Official_Emp_ID", "Employee_Name", "Category",
    "Employee_Message", "AI_Sentiment", "AI_Auto_Reply", "Escalation_Status"
  ],
  AI_Predictive_Analytics: [
    "Record_ID", "Target_Month", "Official_Emp_ID", "Employee_Name", "Department_Role",
    "Historical_WinRate", "Mon_Fri_Leave_Ratio", "Burnout_Risk_Score", "Predicted_Leave_Days", "Action_Recommendation"
  ],
  Payroll_Prep_Ledger: [
    "Payroll_ID", "Month", "Official_Emp_ID", "Employee_Name", "Role",
    "Base_Salary", "Attendance_Bonus", "SLA_Bonus", "Team_Shared_Bonus", "Installation_Bonus",
    "Advance_Deduction", "Absence_Deduction", "Late_Penalty", "Net_Payable", "Payslip_Status"
  ],
  System_Settings: [
    "Setting_Key", "Setting_Value", "Description"
  ],
  System_Audit_Logs: [
    "Timestamp", "Action", "Official_Emp_ID", "Employee_Name", "Details"
  ],
  KPI_Formula_Registry: [
    "Formula_ID", "Rule_Category", "Metric_Name_MM", "Formula_Expression",
    "Inputs_And_Settings_Source", "Dept_Rule_Scope", "Worked_Example",
    "Version_Status", "Last_Updated"
  ]
};

/**
 * 🔐 One-time credential initializer for Script Properties.
 * Pass BOT_TOKEN and GEMINI_API_KEY explicitly, or set them directly in Project Settings -> Script Properties.
 * Never store raw API keys or bot tokens in source code.
 */
function configureGBFProductionCredentials(botToken, geminiKey, spreadsheetId, webAppUrl) {
  const props = PropertiesService.getScriptProperties();
  const cleanBot = String(botToken || props.getProperty("BOT_TOKEN") || "").trim();
  const cleanGemini = String(geminiKey || props.getProperty("GEMINI_API_KEY") || "").trim();
  if (!cleanBot || !cleanGemini) {
    throw new Error("Missing credentials: pass botToken and geminiKey explicitly, or set BOT_TOKEN & GEMINI_API_KEY in Script Properties.");
  }
  props.setProperties({
    BOT_TOKEN: cleanBot,
    GEMINI_API_KEY: cleanGemini,
    SPREADSHEET_ID: String(spreadsheetId || props.getProperty("SPREADSHEET_ID") || GBF_CONFIG.DEFAULT_SPREADSHEET_ID).trim(),
    WEB_APP_URL: String(webAppUrl || props.getProperty("WEB_APP_URL") || GBF_CONFIG.DEFAULT_WEB_APP_URL).trim()
  }, false);
  invalidateSettingsCache_();
  Logger.log("✅ GBF Production Credentials configured in ScriptProperties.");
  return { success: true, message: "Credentials stored in ScriptProperties." };
}

function getBotToken() {
  return String(PropertiesService.getScriptProperties().getProperty("BOT_TOKEN") || "").trim();
}

function getGeminiApiKey() {
  return String(PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "").trim();
}

function getSpreadsheetId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") ||
    GBF_CONFIG.DEFAULT_SPREADSHEET_ID
  ).trim();
}

function getTelegramAPI() {
  return "https://api.telegram.org/bot" + getBotToken() + "/";
}

/**
 * Resolves the Telegram bot username (cached 6h) for Group-to-Private deep links (`t.me/<bot>?start=...`).
 */
function getBotUsername_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("GBF_BOT_USERNAME");
    if (cached) return cached;
    const token = getBotToken();
    if (token && typeof UrlFetchApp !== "undefined") {
      const res = UrlFetchApp.fetch(getTelegramAPI() + "getMe", { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        const parsed = JSON.parse(res.getContentText());
        if (parsed && parsed.ok && parsed.result && parsed.result.username) {
          const uname = String(parsed.result.username).trim();
          cache.put("GBF_BOT_USERNAME", uname, 21600);
          return uname;
        }
      }
    }
  } catch (e) {}
  return GBF_CONFIG.DEFAULT_BOT_USERNAME || "GBF_HRMS_Bot";
}

/**
 * 🗄️ Resolves the active GBF Master Database Spreadsheet across bound and standalone contexts.
 */
function getGBFSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

/**
 * 🔗 Resolves the active production `/exec` Web App URL from System_Settings, ScriptProperties, or ScriptApp.
 */
function getActiveWebAppUrl_() {
  const settings = getSettings();
  const sheetUrl = String(settings.WEB_APP_URL || "").trim();
  if (sheetUrl && sheetUrl.startsWith("https://script.google.com/") && sheetUrl.endsWith("/exec")) {
    return sheetUrl;
  }
  const propUrl = String(PropertiesService.getScriptProperties().getProperty("WEB_APP_URL") || "").trim();
  if (propUrl && propUrl.startsWith("https://script.google.com/") && propUrl.endsWith("/exec")) {
    return propUrl;
  }
  try {
    const rawUrl = String(ScriptApp.getService().getUrl() || "").trim();
    if (rawUrl) return rawUrl.replace(/\/dev$/, "/exec");
  } catch (e) {}
  return GBF_CONFIG.DEFAULT_WEB_APP_URL;
}

/**
 * ⚡ Cached Settings Reader (5-minute TTL in CacheService to prevent repeated sheet reads on webhooks).
 */
function getSettings(forceRefresh) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    try {
      const cached = cache.get(GBF_CONFIG.SETTINGS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }

  const settings = {
    TIME_EARLY: "09:00",
    TIME_LATE: "09:15",
    OFFICE_LAT: 16.804683,
    OFFICE_LNG: 96.177149,
    MAX_RADIUS: 500,
    HR_ADMIN_CHAT_ID: "",
    TELEGRAM_GROUP_CHAT_ID: "",
    WEB_APP_URL: "",
    POS_LAYER_TL_TARGETS: "TT,JT,ST",
    APPROVER_TL_EMP_IDS: "1002,1006,2006,2007,3012",
    TL_ROUTE_BY_DAILY_TEAM: "YES",
    POS_LAYER_TM_TARGETS: "TL,MM",
    APPROVER_TM_EMP_IDS: "1001,1004",
    APPROVER_HR_WATCH_IDS: "1003",
    REWARD_MVP_PER_DAY: "1000",
    REWARD_WEEKLY_MVP_TARGET: "5",
    REWARD_WEEKLY_MVP_BONUS: "10000",
    REWARD_ATTENDANCE_BONUS: "50000",
    REWARD_MYTHIC_BONUS: "30000",
    REWARD_LEGEND_BONUS: "15000",
    WORKING_DAYS_DEFAULT: "26",
    WORKING_DAYS_2026_10: "27",
    WORKING_DAYS_2026_11: "25",
    WORKING_DAYS_2026_12: "27",
    MONTH_WORKING_DAYS_OVERRIDES: "",
    GROUP_ATTENDANCE_BROADCAST: "YES",
    GROUP_ATTENDANCE_MODE: "LIVE_EDIT",
    TELEGRAM_GROUP_THREAD_ID: "",
    GROUP_DIGEST_ENABLED: "YES"
  };

  const sheet = getGBFSpreadsheet_().getSheetByName("System_Settings");
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) settings[String(data[i][0]).trim()] = data[i][1];
    }
  }

  try {
    cache.put(GBF_CONFIG.SETTINGS_CACHE_KEY, JSON.stringify(settings), GBF_CONFIG.SETTINGS_CACHE_TTL);
  } catch (e) {}
  return settings;
}

function invalidateSettingsCache_() {
  try {
    CacheService.getScriptCache().remove(GBF_CONFIG.SETTINGS_CACHE_KEY);
  } catch (e) {}
}

/**
 * 🧭 Builds a lowercase header-name to zero-based column index map from row 1.
 */
function buildHeaderMap_(headerRow) {
  const map = {};
  if (!Array.isArray(headerRow)) return map;
  headerRow.forEach((h, idx) => {
    const key = String(h || "").trim().toLowerCase();
    if (key) map[key] = idx;
  });
  return map;
}

function getLastNRows(sheet, n, cols) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const numRows = Math.min(lastRow - 1, n);
  return sheet.getRange(lastRow - numRows + 1, 1, numRows, Math.min(cols, sheet.getLastColumn())).getDisplayValues();
}

function normalizeDateStr(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}[\.\/]\d{2}[\.\/]\d{4}$/.test(str)) {
    const p = str.split(/[\.\/]/);
    return `${p[2]}-${p[1]}-${p[0]}`;
  }
  return str;
}

function normalizeMonthFromDate(val) {
  const norm = normalizeDateStr(val);
  return norm.length >= 7 ? norm.substring(0, 7) : "";
}

/**
 * 📆 Counts full scheduled Mon–Sat working days inside `targetMonth` (`yyyy-MM`), excluding Sundays.
 */
function countMonthTotalWorkDays_(targetMonth) {
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) return 26;
  const parts = targetMonth.split("-");
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Date.UTC(year, monthIdx, d)).getUTCDay() !== 0) workDays++;
  }
  return Math.max(1, workDays);
}

/**
 * 🗂️ Resolves active scheduled working days for `targetMonth` from `System_Settings` first,
 * supporting both `WORKING_DAYS_YYYY_MM` / `WORKING_DAYS_YYYY-MM` and `MONTH_WORKING_DAYS_OVERRIDES`,
 * falling back to dynamic Mon–Sat count (or `WORKING_DAYS_DEFAULT` if month invalid).
 */
function resolveMonthWorkingDays_(targetMonth, settings) {
  const cfg = settings || {};
  const ym = /^\d{4}-\d{2}$/.test(String(targetMonth || "").trim()) ? String(targetMonth).trim() : "";
  if (ym) {
    const keyUnderscore = `WORKING_DAYS_${ym.replace("-", "_")}`;
    const keyDash = `WORKING_DAYS_${ym}`;
    const rawDirect = cfg[keyUnderscore] !== undefined && cfg[keyUnderscore] !== "" ? cfg[keyUnderscore] : cfg[keyDash];
    const parsedDirect = parseInt(String(rawDirect || "").trim(), 10);
    if (!isNaN(parsedDirect) && parsedDirect >= 1 && parsedDirect <= 31) return parsedDirect;

    const overridesRaw = String(cfg.MONTH_WORKING_DAYS_OVERRIDES || "").trim();
    if (overridesRaw) {
      const pairs = overridesRaw.split(/[,;\n]+/);
      for (let i = 0; i < pairs.length; i++) {
        const m = pairs[i].trim().match(/^(\d{4}-\d{2})\s*[:=]\s*(\d{1,2})$/);
        if (m && m[1] === ym) {
          const v = parseInt(m[2], 10);
          if (v >= 1 && v <= 31) return v;
        }
      }
    }
    return countMonthTotalWorkDays_(ym);
  }
  const defDays = parseInt(String(cfg.WORKING_DAYS_DEFAULT || "26"), 10);
  return (!isNaN(defDays) && defDays >= 1 && defDays <= 31) ? defDays : 26;
}

/**
 * 🏗️ Checks whether an employee belongs to Field Operations department vs HQ / Management / Support.
 */
function isOperationDepartment_(department, role) {
  const dept = String(department || "").trim();
  if (dept) return /operation/i.test(dept);
  const roleStr = String(role || "").trim();
  return /tech|fttx|field/i.test(roleStr) && !/manager|executive|admin|hr|support|relationship/i.test(roleStr);
}

/**
 * 🏷️ Exact member-token matcher for comma-separated `Daily_Teams!Members` (`"Name (Role), ..."`).
 * Prevents substring collisions (e.g., `"Ko Myo"` matching `"Ko Myo Thant Zaw"`).
 */
function hasSquadMemberName_(membersStr, targetName) {
  const needle = String(targetName || "").trim().toLowerCase();
  if (!needle || !membersStr) return false;
  return String(membersStr).split(",").some(raw => {
    const cleanToken = raw.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
    return cleanToken !== "" && cleanToken === needle;
  });
}

function formatDate(dateStr) {
  if (!dateStr || !String(dateStr).includes("-")) return dateStr;
  const p = String(dateStr).split("-");
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function formatDistanceText_(meters) {
  const m = parseFloat(meters) || 0;
  if (m >= 1000) return (m / 1000).toFixed(2) + " km";
  return Math.round(m) + " m";
}

function buildGoogleMapsMeasureUrl_(officeLat, officeLng, rawUserGps) {
  const cleanGps = String(rawUserGps || "").trim();
  if (!/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(cleanGps)) return "";
  return `https://www.google.com/maps/dir/${officeLat},${officeLng}/${encodeURIComponent(cleanGps.replace(/\s+/g, ""))}`;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function escapeHtmlText_(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * ✨ Converts Gemini Markdown replies (`**bold**`, `*italic*`, `` `code` ``, bullet lists) into safe, non-overlapping Telegram HTML.
 */
function formatAiToTelegramHtml(text) {
  const safe = escapeHtmlText_(text);
  if (!safe) return "";

  const tokens = [];
  const stash = (html) => {
    const idx = tokens.length;
    tokens.push(html);
    return `\uE000${idx}\uE001`;
  };

  let s = safe
    .replace(/```(?:[a-z0-9_-]+\r?\n)?([\s\S]*?)```/gi, (_, code) => stash(`<pre>${code}</pre>`))
    .replace(/`([^`\n\uE000\uE001]+?)`/g, (_, code) => stash(`<code>${code}</code>`))
    .replace(/^\s*#{1,3}\s+([^\n]+)$/gm, (_, heading) => stash(`<b>${heading.replace(/\*\*|__|[*_]/g, "").trim()}</b>`))
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*([^*\n\uE000\uE001]+?)\*\*/g, (_, inner) => stash(`<b>${inner}</b>`))
    .replace(/__([^_\n\uE000\uE001]+?)__/g, (_, inner) => stash(`<b>${inner}</b>`))
    .replace(/(^|[\s(])\*([^\s*\n\uE000\uE001][^*\n\uE000\uE001]*?)\*(?=[\s.,!?:;)]|$)/gm, (_, lead, inner) => `${lead}${stash(`<i>${inner}</i>`)}`)
    .replace(/\*\*/g, "");

  return s.replace(/\uE000(\d+)\uE001/g, (_, idx) => tokens[Number(idx)] || "");
}

function parseClockMinutes_(timeStr) {
  const m = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!m) return -1;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return -1;
  const mer = m[3] ? m[3].toUpperCase() : "";
  if (mer === "AM") {
    if (hh === 12) hh = 0;
  } else if (mer === "PM") {
    if (hh < 12) hh += 12;
  }
  if (hh < 0 || hh > 23) return -1;
  return hh * 60 + mm;
}

/**
 * ⏱️ Computes worked hours between Check-In and Check-Out (`hh:mm a` or `HH:mm`).
 */
function computeWorkedDurationText_(timeInStr, timeOutStr) {
  const inMin = parseClockMinutes_(timeInStr);
  const outMin = parseClockMinutes_(timeOutStr);
  if (inMin < 0 || outMin < 0) return "";
  let diff = outMin - inMin;
  if (diff < 0) diff += 1440;
  if (diff <= 0 || diff >= 1440) return "";
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  return hrs > 0 ? `${hrs} နာရီ ${mins} မိနစ် (${hrs}h ${mins}m)` : `${mins} မိနစ် (${mins}m)`;
}

function logToAudit(action, empId, empName, details, idempotencyKey) {
  const sheet = getGBFSpreadsheet_().getSheetByName("System_Audit_Logs");
  if (!sheet) return;
  const suffix = idempotencyKey ? ` [idemp:${idempotencyKey}]` : "";
  sheet.appendRow([
    Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd HH:mm:ss"),
    action,
    empId,
    empName,
    String(details || "") + suffix
  ]);
}
