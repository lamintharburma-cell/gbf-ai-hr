/**
 * 🗄️ G.B.F. Enterprise HR & AI Management System — Master Database Script (Database.gs v9.2)
 * Includes non-destructive schema migration, formatting, and ATT-timestamp time recovery.
 */

/**
 * ⏱️ Recovers exact `hh:mm a` check-in time in GMT+6:30 from an `ATT-<epoch_ms>` identifier.
 */
function formatTimeFromAttId_(attId) {
  const match = String(attId || "").trim().match(/^ATT-(\d{13})$/);
  if (!match) return "";
  const epochMs = Number(match[1]);
  if (!epochMs || isNaN(epochMs)) return "";

  const utcPlus630 = new Date(epochMs + 6.5 * 3600 * 1000);
  const hh24 = utcPlus630.getUTCHours();
  const min = String(utcPlus630.getUTCMinutes()).padStart(2, "0");
  const ampm = hh24 >= 12 ? "PM" : "AM";
  const hh12 = String(hh24 % 12 === 0 ? 12 : hh24 % 12).padStart(2, "0");
  return `${hh12}:${min} ${ampm}`;
}

/**
 * 🛠️ One-click repair utility for any `Daily_Attendance` Check_In_Time corrupted to `1899-12-30`.
 * Safely updates ONLY column D cells that match `1899-12-`.
 */
function recoverAttendanceTimesFromAttId() {
  const ss = getGBFSpreadsheet_();
  const sheet = ss.getSheetByName("Daily_Attendance");
  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: true, repaired: 0, message: "No Daily_Attendance rows to inspect." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const lastRow = sheet.getLastRow();
    const values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
    const updatedTimes = [];
    let repairedCount = 0;

    for (let i = 0; i < values.length; i++) {
      const attId = String(values[i][0] || "").trim();
      const curTime = String(values[i][3] || "").trim();
      if (curTime.startsWith("1899-12-")) {
        const recovered = formatTimeFromAttId_(attId);
        if (recovered) {
          updatedTimes.push([recovered]);
          repairedCount++;
        } else {
          updatedTimes.push([curTime]);
        }
      } else {
        updatedTimes.push([curTime]);
      }
    }

    if (repairedCount > 0) {
      const timeRange = sheet.getRange(2, 4, updatedTimes.length, 1);
      timeRange.setNumberFormat("@");
      timeRange.setValues(updatedTimes);
      SpreadsheetApp.flush();
      logToAudit("RECOVER_ATTENDANCE_TIMES", "SYSTEM", "DatabaseRepair", `Recovered ${repairedCount} Check_In_Time cells from Att_ID.`);
    }

    return { success: true, repaired: repairedCount };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 📌 Non-destructive schema normalization & migration across all 10 tables.
 */
function migrateAndNormalizeGBFDatabase() {
  const ss = getGBFSpreadsheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const existingEmployees = readLegacyEmployees_(ss);
    const existingAttendance = readLegacySheetRows_(ss, "Daily_Attendance", 11);
    const existingLeaves = readLegacyLeaves_(ss);
    const existingAdvances = readLegacyAdvances_(ss);
    const existingTeams = readLegacyTeams_(ss);
    const existingVoice = readLegacySheetRows_(ss, "HR_Voice_Feedback", 9);
    const existingAi = readLegacySheetRows_(ss, "AI_Predictive_Analytics", 10);
    const existingPayroll = readLegacySheetRows_(ss, "Payroll_Prep_Ledger", 15);
    const existingSettings = readLegacySettings_(ss);
    const existingLogs = readLegacySheetRows_(ss, "System_Audit_Logs", 5);

    ["Calc_Data", "Sheet5", "Sheet1"].forEach(scratchName => {
      const s = ss.getSheetByName(scratchName);
      if (s && ss.getSheets().length > 1) {
        s.setName(`_Archived_${scratchName}`);
        s.hideSheet();
      }
    });

    writeTableSheet_(ss, "HR_Employees", GBF_DB_SCHEMA.HR_Employees, existingEmployees.length > 0 ? existingEmployees : getOfficialGBFEmployeesSeed_());
    writeTableSheet_(ss, "Daily_Attendance", GBF_DB_SCHEMA.Daily_Attendance, existingAttendance);
    writeTableSheet_(ss, "Leave_Management", GBF_DB_SCHEMA.Leave_Management, existingLeaves);
    writeTableSheet_(ss, "Advance_Salary", GBF_DB_SCHEMA.Advance_Salary, existingAdvances);
    writeTableSheet_(ss, "Daily_Teams", GBF_DB_SCHEMA.Daily_Teams, existingTeams);
    writeTableSheet_(ss, "HR_Voice_Feedback", GBF_DB_SCHEMA.HR_Voice_Feedback, existingVoice);
    writeTableSheet_(ss, "AI_Predictive_Analytics", GBF_DB_SCHEMA.AI_Predictive_Analytics, existingAi);
    writeTableSheet_(ss, "Payroll_Prep_Ledger", GBF_DB_SCHEMA.Payroll_Prep_Ledger, existingPayroll);
    writeTableSheet_(ss, "System_Settings", GBF_DB_SCHEMA.System_Settings, mergeSystemSettings_(existingSettings));
    writeTableSheet_(ss, "System_Audit_Logs", GBF_DB_SCHEMA.System_Audit_Logs, existingLogs);

    applyEnterpriseFormatting_(ss);
    invalidateSettingsCache_();

    const auditSheet = ss.getSheetByName("System_Audit_Logs");
    auditSheet.appendRow([
      Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd HH:mm:ss"),
      "DB_MIGRATION_V9_2",
      "SYSTEM",
      "GBF HR AI Management Team",
      `Normalized 10 tables. Preserved ${existingEmployees.length} staff, ${existingAttendance.length} attendance, ${existingLeaves.length} leaves, ${existingAdvances.length} advances, ${existingTeams.length} teams.`
    ]);

    Logger.log("✅ GBF Master Database Migration & Normalization Completed Successfully!");
  } finally {
    lock.releaseLock();
  }
}

/**
 * 🆕 Fresh Spreadsheet setup with Official 16 GBF Personnel, Approver Matrix & Reward Pass Settings.
 */
function setupFreshGBFDatabase() {
  const ss = getGBFSpreadsheet_();
  writeTableSheet_(ss, "HR_Employees", GBF_DB_SCHEMA.HR_Employees, getOfficialGBFEmployeesSeed_());
  writeTableSheet_(ss, "Daily_Attendance", GBF_DB_SCHEMA.Daily_Attendance, []);
  writeTableSheet_(ss, "Leave_Management", GBF_DB_SCHEMA.Leave_Management, []);
  writeTableSheet_(ss, "Advance_Salary", GBF_DB_SCHEMA.Advance_Salary, []);
  writeTableSheet_(ss, "Daily_Teams", GBF_DB_SCHEMA.Daily_Teams, []);
  writeTableSheet_(ss, "HR_Voice_Feedback", GBF_DB_SCHEMA.HR_Voice_Feedback, []);
  writeTableSheet_(ss, "AI_Predictive_Analytics", GBF_DB_SCHEMA.AI_Predictive_Analytics, []);
  writeTableSheet_(ss, "Payroll_Prep_Ledger", GBF_DB_SCHEMA.Payroll_Prep_Ledger, []);
  writeTableSheet_(ss, "System_Settings", GBF_DB_SCHEMA.System_Settings, mergeSystemSettings_({}));
  writeTableSheet_(ss, "System_Audit_Logs", GBF_DB_SCHEMA.System_Audit_Logs, [[
    Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd HH:mm:ss"),
    "DB_INIT_V9_2",
    "SYSTEM",
    "GBF HR AI Management Team",
    "Initialized GBF Master Database with Official 16 Personnel, Approver Matrix & Reward Pass Settings"
  ]]);

  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  applyEnterpriseFormatting_(ss);
  invalidateSettingsCache_();
  Logger.log("✅ Fresh GBF Master Database Created Successfully!");
}

function readLegacyEmployees_(ss) {
  const sheet = ss.getSheetByName("HR_Employees");
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h || "").trim());
  const officialSeeds = getOfficialGBFEmployeesSeed_();
  const seedById = {};
  officialSeeds.forEach(row => { seedById[String(row[1]).trim()] = row; });

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const empId = String(r[1] || r[4] || "").trim();
    const empName = String(r[2] || "").trim();
    if (!empId || !empName) continue;

    const fallback = seedById[empId] || [];
    const chatId = String(r[0] || fallback[0] || "").trim();
    const role = String(r[3] || fallback[3] || "Junior FTTx Field Technician").trim();
    const phone = String(r[4] || fallback[4] || "").trim();
    const joinedDate = formatLegacyDate_(r[5] || fallback[5] || "");
    const rawSalary = parseFloat(String(r[6] || "").replace(/,/g, ""));
    const baseSalary = (!isNaN(rawSalary) && rawSalary > 0) ? rawSalary : (fallback[6] || 400000);

    const rawStatus = String(r[7] || "Active").trim();
    const status = rawStatus.toLowerCase() === "inactive" ? "Inactive" : "Active";

    const colI = String(r[8] || "").trim();
    const colJ = String(r[9] || "").trim();
    const colK = String(r[10] || "").trim();
    const colL = String(r[11] || "").trim();

    let pin = empId;
    let strikeCount = 0;
    let department = fallback[10] || "Field Operations";
    let staffCode = fallback[11] || `81020401-3-${empId.slice(-3)}`;

    if (headers[8] === "PIN" && headers[9] === "Strike_Count") {
      pin = colI || empId;
      strikeCount = parseInt(colJ, 10) || 0;
      department = colK || department;
      staffCode = colL || staffCode;
    } else {
      if (colI.startsWith("81020401")) staffCode = colI;
      if (colJ && isNaN(Number(colJ))) department = colJ;
      if (colK) pin = colK;
    }

    rows.push([
      chatId, empId, empName, role, phone, joinedDate,
      baseSalary, status, pin, strikeCount, department, staffCode
    ]);
  }
  return rows;
}

function readLegacyLeaves_(ss) {
  const sheet = ss.getSheetByName("Leave_Management");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0] && !r[1]) continue;
    const startStr = formatLegacyDate_(r[4]);
    const endStr = formatLegacyDate_(r[5]);

    let patternDay = "Standard_Day";
    let hrStatus = "Pending";
    const colI = String(r[8] || "").trim();
    const colJ = String(r[9] || "").trim();

    if (["Pending", "Approved", "Rejected"].includes(colI) && !colJ) {
      hrStatus = colI;
      patternDay = detectLeavePattern_(startStr);
    } else {
      patternDay = colI || detectLeavePattern_(startStr);
      hrStatus = colJ || "Pending";
    }

    rows.push([
      String(r[0] || `LV-${i}`).trim(),
      String(r[1] || "").trim(),
      String(r[2] || "").trim(),
      String(r[3] || "Casual").trim(),
      startStr,
      endStr,
      parseInt(r[6], 10) || 1,
      String(r[7] || "").trim(),
      patternDay,
      hrStatus
    ]);
  }
  return rows;
}

function readLegacyAdvances_(ss) {
  const sheet = ss.getSheetByName("Advance_Salary");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0] && !r[1]) continue;
    const amt = parseFloat(String(r[3] || "0").replace(/,/g, "")) || 0;
    const reqDate = formatLegacyDate_(r[4]);
    const status = String(r[6] || "Pending").trim();
    const riskScore = String(r[7] || "🟢 Low Risk (Migrated)").trim();

    rows.push([
      String(r[0] || `ADV-${i}`).trim(),
      String(r[1] || "").trim(),
      String(r[2] || "").trim(),
      amt,
      reqDate,
      String(r[5] || "").trim(),
      status,
      riskScore
    ]);
  }
  return rows;
}

function readLegacyTeams_(ss) {
  const sheet = ss.getSheetByName("Daily_Teams");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0] && !r[2]) continue;
    rows.push([
      String(r[0] || `TEAM-${i}`).trim(),
      formatLegacyDate_(r[1]),
      String(r[2] || "").trim(),
      String(r[3] || "").trim(),
      String(r[4] || "").trim(),
      String(r[5] || "[]").trim()
    ]);
  }
  return rows;
}

function readLegacySettings_(ss) {
  const sheet = ss.getSheetByName("System_Settings");
  const map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][0] || "").trim();
    if (k) {
      map[k] = {
        value: data[i][1],
        desc: String(data[i][2] || "").trim()
      };
    }
  }
  return map;
}

/**
 * 🛡️ Fixed legacy row reader: formats Daily_Attendance time columns (c === 3, c === 5)
 * as `hh:mm a` instead of `yyyy-MM-dd`, and recovers any `1899-12-` entries from `Att_ID`.
 */
function readLegacySheetRows_(ss, sheetName, expectedCols) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const hasContent = data[i].some(cell => String(cell || "").trim() !== "");
    if (!hasContent) continue;
    const normalized = [];
    for (let c = 0; c < expectedCols; c++) {
      let val = data[i][c] !== undefined ? data[i][c] : "";
      if (val instanceof Date) {
        if (sheetName === "Daily_Attendance" && (c === 3 || c === 5)) {
          val = Utilities.formatDate(val, GBF_CONFIG.GMT_OFFSET, "hh:mm a");
        } else if (sheetName === "System_Audit_Logs" || sheetName === "HR_Voice_Feedback") {
          val = Utilities.formatDate(val, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd HH:mm:ss");
        } else {
          val = Utilities.formatDate(val, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
        }
      }
      if (sheetName === "Daily_Attendance" && c === 3 && String(val).startsWith("1899-12-")) {
        const recovered = formatTimeFromAttId_(data[i][0]);
        if (recovered) val = recovered;
      }
      normalized.push(val);
    }
    rows.push(normalized);
  }
  return rows;
}

function getOfficialGBFEmployeesSeed_() {
  return [
    ["6062798917", "1001", "Ko La Min Thar", "Leader", "09-966312987", "01/04/2018", 800000, "Active", "1001", 0, "Leader", "81020401-1-001"],
    ["", "1002", "Ko Myint Thein Zaw", "Field Operations Team Leader", "09 429775170", "01/04/2018", 700000, "Active", "1002", 0, "Field Operations", "81020401-1-002"],
    ["1892594972", "1003", "Ma Hsu Lae Nandar", "Executive Operations Manager", "09-971343997", "01/05/2020", 700000, "Active", "1003", 0, "Project Management", "81020401-1-003"],
    ["8579354244", "1004", "Ko Thwin Htoo", "Executive Operations Manager", "09-977513762", "01/06/2020", 800000, "Active", "1004", 0, "Project Management", "81020401-1-004"],
    ["", "1006", "Ko Ye Min Oo", "Field Operations Team Leader", "09-5172609", "01/05/2018", 550000, "Active", "1006", 0, "Field Operations", "81020401-1-006"],
    ["", "2006", "Ko Myo", "Field Operations Team Leader", "09-799585094", "04/04/2021", 650000, "Active", "2006", 0, "Field Operations", "81020401-2-006"],
    ["", "2007", "Ko Wai Yan Oo", "Field Operations Team Leader", "09-977262275", "27/06/2018", 650000, "Active", "2007", 0, "Field Operations", "81020401-2-007"],
    ["", "2008", "Ko Khant Ko Ko Latt", "Senior FTTx Field Technician", "09-983239684", "01/06/2022", 500000, "Active", "2008", 0, "Field Operations", "81020401-2-008"],
    ["", "2010", "Ko Ye Htut Aung", "Senior FTTx Field Technician", "09-980490149", "05/05/2024", 580000, "Active", "2010", 0, "Field Operations", "81020401-2-010"],
    ["", "3011", "Ko Khin Maung Than", "Relationship Manager", "09 42300 7004", "01/10/2024", 450000, "Active", "3011", 0, "Project Management", "81020401-3-011"],
    ["", "3012", "Ma Than Tin Aye", "Customer Support Team Lead", "09 443387276", "01/11/2024", 550000, "Active", "3012", 0, "Customer Experience", "81020401-3-012"],
    ["", "3013", "Ko Myo Thant Zaw", "Junior FTTx Field Technician", "09 685 768 587", "01/03/2025", 400000, "Active", "3013", 0, "Field Operations", "81020401-3-013"],
    ["", "3015", "Ko Tin Tun Aung", "Junior FTTx Field Technician", "09 959 399 815", "15/04/2025", 400000, "Active", "3015", 0, "Field Operations", "81020401-3-015"],
    ["", "3016", "Ko Wai Lin Mg", "Junior FTTx Field Technician", "09 695 789 865", "15/04/2025", 400000, "Active", "3016", 0, "Field Operations", "81020401-3-016"],
    ["", "3017", "Ko Tint Lwin Oo", "Junior FTTx Field Technician", "09 252258039", "15/05/2025", 400000, "Active", "3017", 0, "Field Operations", "81020401-3-017"],
    ["", "3019", "Ko Aung Ko Zin", "Junior FTTx Field Technician", "", "", 400000, "Active", "3019", 0, "Field Operations", "81020401-3-019"]
  ];
}

function mergeSystemSettings_(existingMap) {
  const defaults = [
    ["TIME_EARLY", "09:00", "MVP Check-In Cutoff Time (Before or at 09:00 AM = MVP)"],
    ["TIME_LATE", "09:15", "Late Check-In Threshold (After 09:15 AM = Late / Feeding)"],
    ["OFFICE_LAT", "16.804683", "GBF Yangon Office Latitude"],
    ["OFFICE_LNG", "96.177149", "GBF Yangon Office Longitude"],
    ["MAX_RADIUS", "500", "GPS Geofence Allowed Radius in Meters"],
    ["HR_ADMIN_CHAT_ID", "6062798917", "Primary Admin Fallback Telegram Chat ID (စိတ်ကြိုက်ပြင်နိုင်သည်)"],
    ["TELEGRAM_GROUP_CHAT_ID", "-1003886390064", "Daily 3-Team Rollout ပေးပို့မည့် Telegram Group ID (စိတ်ကြိုက်ပြင်နိုင်သည်)"],
    ["WEB_APP_URL", GBF_CONFIG.DEFAULT_WEB_APP_URL, "Deploy လုပ်ပြီး ရလာသော Web App /exec URL ကို ဤနေရာတွင် ထည့်ပါ"],
    ["POS_LAYER_TL_TARGETS", "TT,JT,ST", "TL မှ Approve ပေးရမည့် Position Layer များ (TT=Trainee, JT=Junior Tech, ST=Senior Tech)"],
    ["APPROVER_TL_EMP_IDS", "1002,1006,2006,2007,3012", "TT, JT, ST များအတွက် Approve ပေးမည့် Team Leader (TL) Emp ID များ (စိတ်ကြိုက်ပြင်နိုင်သည်)"],
    ["TL_ROUTE_BY_DAILY_TEAM", "YES", "YES ထားပါက ယနေ့ Daily_Teams တွင် တွဲထားသော သက်ဆိုင်ရာ TL ထံ ဦးစားပေးပို့မည် (NO ဆိုပါက TL အားလုံးထံပို့မည်)"],
    ["POS_LAYER_TM_TARGETS", "TL,MM", "TM မှ Approve ပေးရမည့် Position Layer များ (TL=Team Leader, MM=Manager / HR)"],
    ["APPROVER_TM_EMP_IDS", "1001,1004", "TL, MM များအတွက် Approve ပေးမည့် Top Management (TM) Emp ID များ (စိတ်ကြိုက်ပြင်နိုင်သည်)"],
    ["APPROVER_HR_WATCH_IDS", "1003", "HR မှတ်တမ်းစစ်ဆေးရန် အမြဲအသိပေးမည့် HR Emp ID များ (မလိုပါက အလွတ်ထားနိုင်သည်)"],
    ["REWARD_MVP_PER_DAY", "1000", "🌟 နေ့စဉ် MVP (<09:00 AM) တစ်ရက်ချင်း ရရှိမည့် ဆုကြေး (MMK)"],
    ["REWARD_WEEKLY_MVP_TARGET", "5", "🔥 အပတ်စဉ် MVP Streak Chest ရရှိရန် လိုအပ်သော MVP ရက်အရေအတွက်"],
    ["REWARD_WEEKLY_MVP_BONUS", "10000", "🎁 အပတ်စဉ် MVP Streak ပြည့်ပါက ရရှိမည့် အပိုဆုကြေး (MMK)"],
    ["REWARD_ATTENDANCE_BONUS", "50000", "🛡️ လစဉ် ခွင့်မဲ့ပျက်ရက် (0 AFK) ရက်မှန်ဆုကြေး (MMK)"],
    ["REWARD_MYTHIC_BONUS", "30000", "🏆 MYTHIC Rank (>=90% KPI) ရရှိသူအတွက် လစဉ် ဆုကြေး (MMK)"],
    ["REWARD_LEGEND_BONUS", "15000", "⚔️ LEGEND Rank (>=80% KPI) ရရှိသူအတွက် လစဉ် ဆုကြေး (MMK)"],
    ["GROUP_ATTENDANCE_BROADCAST", "YES", "YES ထားပါက Check-In / Check-Out ဝင်တိုင်း Telegram Group သို့ အစဉ်လိုက်စာရင်းနှင့် Map အကွာအဝေး ပို့မည်"],
    ["GROUP_ATTENDANCE_MODE", "LIVE_EDIT", "LIVE_EDIT = ယနေ့ Group Live Board တစ်စောင်တည်းကို Update လုပ်မည် | NEW_MESSAGE = ဝင်တိုင်း စာအသစ်ပို့မည်"],
    ["TELEGRAM_GROUP_THREAD_ID", "", "Telegram Forum Group တွင် Topic Thread ID သီးသန့်ပို့လိုပါက ထည့်ရန် (မလိုပါက အလွတ်ထားပါ)"],
    ["GROUP_DIGEST_ENABLED", "YES", "YES = မနက် 09:20 AM Roll-Call နှင့် ညနေ 06:15 PM Summary Auto-Digest Group သို့ ပို့မည်"]
  ];

  const mergedRows = [];
  const usedKeys = new Set();

  defaults.forEach(([key, defVal, defDesc]) => {
    usedKeys.add(key);
    if (existingMap[key] && String(existingMap[key].value).trim() !== "") {
      mergedRows.push([key, existingMap[key].value, existingMap[key].desc || defDesc]);
    } else {
      mergedRows.push([key, defVal, defDesc]);
    }
  });

  Object.keys(existingMap).forEach(k => {
    if (!usedKeys.has(k)) {
      mergedRows.push([k, existingMap[k].value, existingMap[k].desc]);
    }
  });

  return mergedRows;
}

function writeTableSheet_(ss, sheetName, headers, rows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clear();
  sheet.clearConditionalFormatRules();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setBackground("#005D42")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontFamily("Inter")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);

  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length)
      .setFontFamily("Inter")
      .setFontSize(10)
      .setVerticalAlignment("middle");
  }
}

function applyEnterpriseFormatting_(ss) {
  const empSheet = ss.getSheetByName("HR_Employees");
  if (empSheet && empSheet.getLastRow() > 1) {
    empSheet.getRange(2, 7, empSheet.getLastRow() - 1, 1).setNumberFormat("#,##0");
    const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(["Active", "Inactive"], true).build();
    empSheet.getRange(2, 8, empSheet.getLastRow() - 1, 1).setDataValidation(statusRule);
  }

  const advSheet = ss.getSheetByName("Advance_Salary");
  if (advSheet && advSheet.getLastRow() > 1) {
    advSheet.getRange(2, 4, advSheet.getLastRow() - 1, 1).setNumberFormat("#,##0");
    const advStatusRule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending", "Approved", "Rejected"], true).build();
    advSheet.getRange(2, 7, advSheet.getLastRow() - 1, 1).setDataValidation(advStatusRule);
  }

  const lvSheet = ss.getSheetByName("Leave_Management");
  if (lvSheet && lvSheet.getLastRow() > 1) {
    const lvStatusRule = SpreadsheetApp.newDataValidation().requireValueInList(["Pending", "Approved", "Rejected"], true).build();
    lvSheet.getRange(2, 10, lvSheet.getLastRow() - 1, 1).setDataValidation(lvStatusRule);
  }

  const paySheet = ss.getSheetByName("Payroll_Prep_Ledger");
  if (paySheet && paySheet.getLastRow() > 1) {
    paySheet.getRange(2, 6, paySheet.getLastRow() - 1, 9).setNumberFormat("#,##0");
  }

  Object.keys(GBF_DB_SCHEMA).forEach(name => {
    const s = ss.getSheetByName(name);
    if (s) {
      s.autoResizeColumns(1, GBF_DB_SCHEMA[name].length);
    }
  });
}

function formatLegacyDate_(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, GBF_CONFIG.GMT_OFFSET, "dd/MM/yyyy");
  }
  return String(val).trim();
}

function detectLeavePattern_(dateStr) {
  if (!dateStr) return "Standard_Day";
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    d = new Date(dateStr + "T00:00:00");
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    const p = dateStr.split(".");
    d = new Date(`${p[2]}-${p[1]}-${p[0]}T00:00:00`);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const p = dateStr.split("/");
    d = new Date(`${p[2]}-${p[1]}-${p[0]}T00:00:00`);
  }
  if (!d || isNaN(d.getTime())) return "Standard_Day";
  const day = d.getDay();
  return day === 1 ? "Monday_Bridge" : (day === 5 ? "Friday_Bridge" : "Standard_Day");
}
