/**
 * 🚀 G.B.F. Enterprise HR & AI Management Backend (Code.gs v9.2 Production LTS)
 * Standardized Entry Points (`doGet`, `doPost`, `handleClientApiRequest`, `include`),
 * Server-Side RBAC Guard, Two-Tier Idempotency, and Real-Time Workforce State Engine.
 */

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 🌐 Serves Printable Payslip HTML or Renders `Index.html` with Accessible Viewport & URL Injection.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === "get_payslip_html") {
    let actor = null;
    const tokRes = verifySessionToken_(e.parameter.sess_tok);
    if (tokRes.valid) {
      actor = resolveActiveEmployeeById_(tokRes.sub);
    } else {
      const trustedChatId = resolveTrustedChatId_(e.parameter.tg_id, e.parameter.tg_sig);
      if (trustedChatId) {
        const emp = findEmployeeByChatId_(trustedChatId);
        if (emp) {
          actor = { empId: emp.empId, empName: emp.name, role: emp.role, chatId: trustedChatId };
        }
      }
    }
    if (!actor) {
      return HtmlService.createHtmlOutput(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>401 Unauthorized</title></head>" +
        "<body style=\"font-family:sans-serif;padding:24px;background:#0f172a;color:#f8fafc\">" +
        "<h2>401 Unauthorized</h2><p>🔐 Session သက်တမ်းကုန်ဆုံးပါပြီ — GBF HR Mini App မှတစ်ဆင့် ပြန်လည်ဝင်ရောက်ပါ။</p>" +
        "</body></html>"
      )
        .setTitle("401 Unauthorized")
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0, viewport-fit=cover");
    }
    const slipHtml = getPayrollSlipHtml(actor.empId, e.parameter.month);
    return HtmlService.createHtmlOutput(slipHtml)
      .setTitle(`GBF_Payslip_${actor.empId}_${e.parameter.month || ""}`)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, viewport-fit=cover");
  }

  const rawTgId = e && e.parameter ? e.parameter.tg_id : "";
  const rawTgSig = e && e.parameter ? e.parameter.tg_sig : "";
  const verifiedChatId = resolveTrustedChatId_(rawTgId, rawTgSig);

  const template = HtmlService.createTemplateFromFile("Index");
  template.webAppUrl = getActiveWebAppUrl_();
  template.initialChatId = verifiedChatId;
  template.initialChatSig = verifiedChatId ? String(rawTgSig || "").trim() : "";
  return template.evaluate()
    .setTitle("G.B.F. Enterprise HR & AI Portal")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, viewport-fit=cover")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 🔌 Client-Side `google.script.run.handleClientApiRequest(rawJson)` Bridge.
 */
function handleClientApiRequest(rawJson) {
  try {
    const payload = typeof rawJson === "string" ? JSON.parse(rawJson) : (rawJson || {});
    return JSON.stringify(dispatchApiAction_(payload));
  } catch (err) {
    return JSON.stringify({ success: false, message: "Request Parse Error: " + err.message });
  }
}

/**
 * 🛡️ Bulletproof Webhook & JSON API Router.
 */
function doPost(e) {
  const telegramSafeAck = HtmlService.createHtmlOutput("OK");
  if (!e || !e.postData || !e.postData.contents) return telegramSafeAck;

  try {
    const data = JSON.parse(e.postData.contents);

    // Layer 1: Telegram update_id deduplication (prevents webhook retry loops 100%)
    if (typeof data.update_id !== "undefined") {
      const cache = CacheService.getScriptCache();
      const updateKey = "TG_UPD_" + String(data.update_id);
      if (cache.get(updateKey)) return telegramSafeAck;
      cache.put(updateKey, "1", 21600);
    }

    // 1. Mini App Frontend JSON API Actions
    if (data.action) {
      const responseObj = dispatchApiAction_(data);
      return ContentService.createTextOutput(JSON.stringify(responseObj)).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Telegram Inline Button Callback
    if (data.callback_query) {
      handleCallbackQuery(data.callback_query);
      return telegramSafeAck;
    }

    // 3. Telegram Direct Message / Commands
    if (data.message && data.message.chat) {
      if (data.message.from && data.message.from.is_bot) return telegramSafeAck;

      const chatId = data.message.chat.id;
      const isPrivate = data.message.chat.type === "private";
      const text = (data.message.text || "").trim();
      const firstName = data.message.from ? data.message.from.first_name : "ဝန်ထမ်း";
      const fromUserId = data.message.from ? data.message.from.id : null;
      const messageId = data.message.message_id || null;
      const topicThreadId = data.message.message_thread_id || null;

      if (text.startsWith("/")) {
        handleBotCommand_(chatId, isPrivate, firstName, text, {
          message_thread_id: topicThreadId,
          message_id: messageId,
          from_user_id: fromUserId
        });
      } else if (isPrivate && text.length > 0) {
        const myShortcut = resolveBurmeseBotShortcut_(text);
        if (myShortcut) {
          handleBotCommand_(chatId, true, firstName, myShortcut, {
            message_thread_id: topicThreadId,
            message_id: messageId,
            from_user_id: fromUserId
          });
        } else {
          handleConversationalAIMessage(chatId, firstName, text);
        }
      }
    }

    return telegramSafeAck;
  } catch (error) {
    console.error("Error in doPost:", error);
    return telegramSafeAck;
  }
}

function resolveActiveEmployeeById_(empId) {
  const cleanId = String(empId || "").trim();
  if (!cleanId) return null;
  const ss = getGBFSpreadsheet_();
  const empSheet = ss ? ss.getSheetByName("HR_Employees") : null;
  if (!empSheet || empSheet.getLastRow() <= 1) return null;
  const settings = getSettings();
  const rows = empSheet.getDataRange().getValues();
  const headers = buildHeaderMap_(rows[0]);
  const chatIdx = headers["telegram_chat_id"] !== undefined ? headers["telegram_chat_id"] : 0;
  const idIdx = headers["official_emp_id"] !== undefined ? headers["official_emp_id"] : 1;
  const nameIdx = headers["employee_name"] !== undefined ? headers["employee_name"] : 2;
  const roleIdx = headers["role"] !== undefined ? headers["role"] : 3;
  const statusIdx = headers["status"] !== undefined ? headers["status"] : 7;

  for (let i = 1; i < rows.length; i++) {
    const rId = String(rows[i][idIdx] || "").trim();
    const rStatus = String(rows[i][statusIdx] || "Active").trim().toLowerCase();
    if (rId === cleanId && rStatus !== "inactive") {
      const role = String(rows[i][roleIdx] || "").trim();
      return {
        empId: rId,
        empName: String(rows[i][nameIdx] || "").trim(),
        role: role,
        layer: resolvePositionLayer(role, rId, settings),
        chatId: sanitizeTelegramChatId_(rows[i][chatIdx])
      };
    }
  }
  return null;
}

function resolveAuthenticatedActor_(safeData) {
  const tokRes = verifySessionToken_(safeData && safeData.session_token);
  if (!tokRes.valid) {
    return {
      authenticated: false,
      auth_required: true,
      reason: tokRes.reason || "INVALID_SESSION",
      message: "🔐 Session သက်တမ်းကုန်ဆုံးပါပြီ — PIN ပြန်ရိုက်ထည့်ပါ။"
    };
  }
  const emp = resolveActiveEmployeeById_(tokRes.sub);
  if (!emp) {
    return {
      authenticated: false,
      auth_required: true,
      reason: "INACTIVE_OR_MISSING_EMP",
      message: "🔐 ဝန်ထမ်းအကောင့် အတည်ပြု၍မရပါ — PIN ပြန်ရိုက်ထည့်ပါ။"
    };
  }
  return {
    authenticated: true,
    empId: emp.empId,
    empName: emp.empName,
    role: emp.role,
    layer: emp.layer,
    chatId: emp.chatId || tokRes.cid || ""
  };
}

/**
 * 🧭 Unified Action Dispatcher shared between HTTP `doPost` and `google.script.run`.
 */
function dispatchApiAction_(data) {
  const safeData = Object.assign({}, data || {}, {
    chat_id: resolveTrustedChatId_(data && data.chat_id, data && data.chat_sig)
  });
  const action = safeData.action ? String(safeData.action).trim() : "";
  switch (action) {
    case "get_initial_data":
      return getInitialData(safeData.chat_id, safeData.selected_month);
    case "login_sync": {
      const suppliedTok = String(safeData.session_token || "").trim();
      const inputPin = String(safeData.pin || safeData.emp_id || "").trim();
      let state = null;

      if (suppliedTok) {
        const tokRes = verifySessionToken_(suppliedTok);
        if (tokRes.valid) {
          const activeEmp = resolveActiveEmployeeById_(tokRes.sub);
          if (activeEmp) {
            state = getFullSystemState(activeEmp.empId, activeEmp.empName, safeData.chat_id, safeData.selected_month);
          }
        }
      }

      if (!state && !inputPin && safeData.chat_id) {
        state = getFullSystemState("", "", safeData.chat_id, safeData.selected_month);
      }

      if (!state && inputPin) {
        if (inputPin === "__GROUP_VIEWER__" || inputPin.startsWith("__")) {
          return { success: false, message: "PIN နံပါတ် မကိုက်ညီပါ။" };
        }
        const hasVerifiedChat = Boolean(safeData.chat_id);
        const rateKeys = normalizeRateKeys_(inputPin, safeData.client_nonce, safeData.chat_id);
        const rateCheck = checkLoginRateLimit_(rateKeys, hasVerifiedChat);
        if (rateCheck.blocked) {
          return {
            success: false,
            rate_limited: true,
            message: "⛔ PIN မှားယွင်းမှု များလွန်းသဖြင့် ၁၅ မိနစ် ခေတ္တပိတ်ထားပါသည်။"
          };
        }
        state = getFullSystemState(inputPin, safeData.emp_name, safeData.chat_id, safeData.selected_month);
        if (!state) {
          recordLoginFailure_(rateKeys, inputPin, hasVerifiedChat);
          return { success: false, message: "PIN နံပါတ် မကိုက်ညီပါ။" };
        }
        clearLoginFailures_(rateKeys);
      }

      if (!state) {
        return {
          success: false,
          auth_required: Boolean(suppliedTok || !inputPin),
          message: suppliedTok
            ? "🔐 Session သက်တမ်းကုန်ဆုံးပါပြီ — PIN ပြန်ရိုက်ထည့်ပါ။"
            : "PIN နံပါတ် မကိုက်ညီပါ။"
        };
      }

      const verifiedEmpId = state.user ? state.user.id : "SSO";
      const verifiedEmpName = state.user ? state.user.name : "Telegram_User";
      const chatDetail = safeData.chat_id ? ` | ChatID: ${safeData.chat_id}` : "";
      logToAudit("LOGIN", verifiedEmpId, verifiedEmpName, `Sync Month: ${safeData.selected_month}${chatDetail}`);
      return {
        success: true,
        data: state,
        session_token: state.session_token || "",
        message: "Synced"
      };
    }
    case "attendance":
    case "leave_request":
    case "advance_request":
    case "assign_team":
    case "submit_voice":
    case "run_ai_predictions":
    case "generate_monthly_payroll":
    case "get_employee_payslip":
    case "save_payslip_to_drive":
    case "update_reward_settings":
    case "sync_formula_registry": {
      const actor = resolveAuthenticatedActor_(safeData);
      if (!actor.authenticated) {
        return { success: false, auth_required: true, message: actor.message };
      }
      safeData.emp_id = actor.empId;
      safeData.emp_name = actor.empName;
      safeData.chat_id = actor.chatId || safeData.chat_id;
      switch (action) {
        case "attendance":
          return processWebAppAttendance(safeData);
        case "leave_request":
          return processWebAppLeave(safeData);
        case "advance_request":
          return processWebAppAdvance(safeData);
        case "assign_team":
          return processWebAppTeam(safeData);
        case "submit_voice":
          return processWebAppVoice(safeData);
        case "run_ai_predictions":
          return runAIPredictionsForMonth(safeData.target_month, safeData.emp_id);
        case "generate_monthly_payroll":
          return generateMonthlyPayroll(safeData.target_month, safeData.emp_id);
        case "get_employee_payslip":
          return getEmployeePayslipData(safeData.emp_id, safeData.target_month);
        case "save_payslip_to_drive":
          return savePayslipPdfToDrive(safeData.emp_id, safeData.target_month);
        case "update_reward_settings":
          return updateRewardSettingsInSheet(safeData);
        case "sync_formula_registry":
          return syncKpiFormulaRegistrySheet(safeData.emp_id);
      }
      return { success: false, message: "Unknown action: " + action };
    }
    default:
      return { success: false, message: "Unknown action: " + action };
  }
}

// ==========================================
// 🔐 MANDATORY SERVER-SIDE RBAC & TWO-TIER IDEMPOTENCY
// ==========================================
function assertAuthorizedRole_(empId, allowedLayers) {
  const cleanId = String(empId || "").trim();
  if (!cleanId) {
    return { authorized: false, message: "⛔ Authorization Required: Missing caller Employee ID." };
  }
  const ss = getGBFSpreadsheet_();
  const empSheet = ss.getSheetByName("HR_Employees");
  if (!empSheet || empSheet.getLastRow() <= 1) {
    return { authorized: false, message: "⛔ RBAC Error: HR_Employees sheet unavailable." };
  }

  const settings = getSettings();
  const rows = empSheet.getDataRange().getValues();
  const headers = buildHeaderMap_(rows[0]);
  const idIdx = headers["official_emp_id"] !== undefined ? headers["official_emp_id"] : 1;
  const nameIdx = headers["employee_name"] !== undefined ? headers["employee_name"] : 2;
  const roleIdx = headers["role"] !== undefined ? headers["role"] : 3;
  const statusIdx = headers["status"] !== undefined ? headers["status"] : 7;

  for (let i = 1; i < rows.length; i++) {
    const rId = String(rows[i][idIdx] || "").trim();
    const rStatus = String(rows[i][statusIdx] || "Active").trim().toLowerCase();
    if (rId === cleanId && rStatus !== "inactive") {
      const role = String(rows[i][roleIdx] || "").trim();
      const layer = resolvePositionLayer(role, rId, settings);
      if (allowedLayers.includes(layer)) {
        return {
          authorized: true,
          empId: rId,
          empName: String(rows[i][nameIdx] || "").trim(),
          role: role,
          layer: layer
        };
      }
      return {
        authorized: false,
        message: `⛔ ခွင့်ပြုချက်မရှိပါ (${role} / ${layer})။ Admin / Manager / TL သာ လုပ်ဆောင်နိုင်ပါသည်။`
      };
    }
  }
  return { authorized: false, message: "⛔ Authentication Failed: Invalid or Inactive Employee ID." };
}

/**
 * 🔁 Two-Tier Idempotency Check (`CacheService` 6h fast path + `System_Audit_Logs` durable path).
 */
function checkIdempotency_(idempotencyKey) {
  if (!idempotencyKey) return null;
  const cache = CacheService.getScriptCache();
  const cacheKey = "IDEMP_" + String(idempotencyKey).trim();
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return Object.assign({}, parsed, { deduplicated: true });
    } catch (e) {}
  }

  const auditSheet = getGBFSpreadsheet_().getSheetByName("System_Audit_Logs");
  if (auditSheet && auditSheet.getLastRow() > 1) {
    const marker = `[idemp:${String(idempotencyKey).trim()}]`;
    const recentLogs = getLastNRows(auditSheet, 250, 5);
    for (let i = recentLogs.length - 1; i >= 0; i--) {
      if (String(recentLogs[i][4] || "").includes(marker)) {
        return { success: true, deduplicated: true, message: "✅ ဤတောင်းဆိုမှုကို မှတ်တမ်းတင်ပြီး ဖြစ်ပါသည်။" };
      }
    }
  }
  return null;
}

function recordIdempotency_(idempotencyKey, responseObj) {
  if (!idempotencyKey || !responseObj) return;
  try {
    const slim = { success: Boolean(responseObj.success), message: responseObj.message || "", ai_reply: responseObj.ai_reply || "" };
    CacheService.getScriptCache().put("IDEMP_" + String(idempotencyKey).trim(), JSON.stringify(slim), 21600);
  } catch (e) {}
}

// ==========================================
// ⚙️ SETTINGS & DIAGNOSTICS
// ==========================================
function initApproverSettings() {
  const ss = getGBFSpreadsheet_();
  let sheet = ss.getSheetByName("System_Settings");
  if (!sheet) {
    sheet = ss.insertSheet("System_Settings");
    sheet.appendRow(["Setting_Key", "Setting_Value", "Description"]);
  }

  const data = sheet.getDataRange().getValues();
  const existingKeys = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingKeys.add(String(data[i][0]).trim());
  }

  const canonicalRows = (typeof mergeSystemSettings_ === "function") ? mergeSystemSettings_({}) : [];
  const canonical = {};
  if (Array.isArray(canonicalRows)) {
    canonicalRows.forEach(r => { if (r && r[0]) canonical[String(r[0]).trim()] = r[1]; });
  }
  const val = (key, fallback) => (canonical[key] !== undefined && canonical[key] !== "") ? String(canonical[key]) : fallback;

  const defaultRows = [
    ["POS_LAYER_TL_TARGETS", val("POS_LAYER_TL_TARGETS", "TT,JT,ST"), "TL မှ Approve ပေးရမည့် Position Layer များ (TT=Trainee, JT=Junior Tech, ST=Senior Tech)"],
    ["APPROVER_TL_EMP_IDS", val("APPROVER_TL_EMP_IDS", "1002,1006,2006,2007,3012"), "TT, JT, ST များအတွက် Approve ပေးမည့် Team Leader (TL) Emp ID များ"],
    ["TL_ROUTE_BY_DAILY_TEAM", val("TL_ROUTE_BY_DAILY_TEAM", "YES"), "YES ထားပါက ယနေ့ Daily_Teams တွင် တွဲထားသော သက်ဆိုင်ရာ TL ထံ ဦးစားပေးပို့မည်"],
    ["POS_LAYER_TM_TARGETS", val("POS_LAYER_TM_TARGETS", "TL,MM"), "TM မှ Approve ပေးရမည့် Position Layer များ (TL=Team Leader, MM=Manager / HR)"],
    ["APPROVER_TM_EMP_IDS", val("APPROVER_TM_EMP_IDS", "1001,1004"), "TL, MM များအတွက် Approve ပေးမည့် Top Management (TM) Emp ID များ"],
    ["APPROVER_HR_WATCH_IDS", val("APPROVER_HR_WATCH_IDS", "1003"), "HR မှတ်တမ်းစစ်ဆေးရန် အမြဲအသိပေးမည့် HR Emp ID များ"],
    ["REWARD_MVP_PER_DAY", val("REWARD_MVP_PER_DAY", "1000"), "🌟 နေ့စဉ် MVP (<09:00 AM) တစ်ရက်ချင်း ရရှိမည့် ဆုကြေး (MMK)"],
    ["REWARD_WEEKLY_MVP_TARGET", val("REWARD_WEEKLY_MVP_TARGET", "5"), "🔥 အပတ်စဉ် MVP Streak Chest ရရှိရန် လိုအပ်သော MVP ရက်အရေအတွက်"],
    ["REWARD_WEEKLY_MVP_BONUS", val("REWARD_WEEKLY_MVP_BONUS", "10000"), "🎁 အပတ်စဉ် MVP Streak ပြည့်ပါက ရရှိမည့် အပိုဆုကြေး (MMK)"],
    ["REWARD_ATTENDANCE_BONUS", val("REWARD_ATTENDANCE_BONUS", "50000"), "🛡️ လစဉ် ခွင့်မဲ့ပျက်ရက် (0 AFK) ရက်မှန်ဆုကြေး (MMK)"],
    ["REWARD_MYTHIC_BONUS", val("REWARD_MYTHIC_BONUS", "30000"), "🏆 MYTHIC Rank (>=90% KPI) ရရှိသူအတွက် လစဉ် ဆုကြေး (MMK)"],
    ["REWARD_LEGEND_BONUS", val("REWARD_LEGEND_BONUS", "15000"), "⚔️ LEGEND Rank (>=80% KPI) ရရှိသူအတွက် လစဉ် ဆုကြေး (MMK)"],
    ["WORKING_DAYS_DEFAULT", val("WORKING_DAYS_DEFAULT", "26"), "📅 Default Scheduled Working Days per Month"],
    ["WORKING_DAYS_2026_10", val("WORKING_DAYS_2026_10", "27"), "📅 2026-10 အောက်တိုဘာလ အလုပ်လုပ်ရက် စုစုပေါင်း (Mon–Sat)"],
    ["WORKING_DAYS_2026_11", val("WORKING_DAYS_2026_11", "25"), "📅 2026-11 နိုဝင်ဘာလ အလုပ်လုပ်ရက် စုစုပေါင်း (Mon–Sat)"],
    ["WORKING_DAYS_2026_12", val("WORKING_DAYS_2026_12", "27"), "📅 2026-12 ဒီဇင်ဘာလ အလုပ်လုပ်ရက် စုစုပေါင်း (Mon–Sat)"],
    ["MONTH_WORKING_DAYS_OVERRIDES", val("MONTH_WORKING_DAYS_OVERRIDES", ""), "📅 Custom Month Working Days Overrides (2027-01:26,2027-02:24)"],
    ["TELEGRAM_GROUP_THREAD_ID", canonical.TELEGRAM_GROUP_THREAD_ID !== undefined ? String(canonical.TELEGRAM_GROUP_THREAD_ID) : "", "Optional Telegram Forum Topic Thread ID (Blank = Main Group)"],
    ["GROUP_ATTENDANCE_BROADCAST", val("GROUP_ATTENDANCE_BROADCAST", "YES"), "YES ထားပါက Check-In / Check-Out ဝင်တိုင်း Telegram Group သို့ အစဉ်လိုက်စာရင်းနှင့် Map အကွာအဝေး ပို့မည်"],
    ["GROUP_ATTENDANCE_MODE", val("GROUP_ATTENDANCE_MODE", "LIVE_EDIT"), "LIVE_EDIT = ယနေ့ Group စာတစ်စောင်တည်းကို အချိန်နှင့်တစ်ပြေးညီ Update လုပ်မည် | NEW_MESSAGE = ဝင်တိုင်း စာအသစ်ပို့မည်"],
    ["GROUP_DIGEST_ENABLED", val("GROUP_DIGEST_ENABLED", "YES"), "YES ထားပါက မနက် 09:20 နှင့် ညနေ 06:15 တွင် Group Summary Digest ပို့မည် (တနင်္ဂနွေ ပိတ်)"]
  ];

  const rowsToAppend = defaultRows.filter(r => !existingKeys.has(r[0]));
  if (rowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, 3).setValues(rowsToAppend);
    invalidateSettingsCache_();
  }
  if (!ss.getSheetByName("KPI_Formula_Registry") && typeof syncKpiFormulaRegistrySheet_ === "function") {
    syncKpiFormulaRegistrySheet_(ss, getSettings(true));
  }
}

function updateRewardSettingsInSheet(data) {
  const auth = assertAuthorizedRole_(data.emp_id, ["TM", "MM", "TL"]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const cfg = data.reward_config || {};
  const ss = getGBFSpreadsheet_();
  let sheet = ss.getSheetByName("System_Settings");
  if (!sheet) {
    initApproverSettings();
    sheet = ss.getSheetByName("System_Settings");
  }

  const keyMap = {
    REWARD_MVP_PER_DAY: parseNonNegativeSetting_(cfg.mvp_per_day, 1000),
    REWARD_WEEKLY_MVP_TARGET: Math.max(1, Math.min(7, parseInt(cfg.weekly_mvp_target, 10) || 5)),
    REWARD_WEEKLY_MVP_BONUS: parseNonNegativeSetting_(cfg.weekly_mvp_bonus, 10000),
    REWARD_ATTENDANCE_BONUS: parseNonNegativeSetting_(cfg.attendance_bonus, 50000),
    REWARD_MYTHIC_BONUS: parseNonNegativeSetting_(cfg.mythic_rank_bonus, 30000),
    REWARD_LEGEND_BONUS: parseNonNegativeSetting_(cfg.legend_rank_bonus, 15000)
  };
  const targetYm = String(cfg.working_days_month || data.selected_month || "").trim();
  const parsedWorkDays = parseInt(cfg.working_days, 10);
  if (/^\d{4}-\d{2}$/.test(targetYm) && !isNaN(parsedWorkDays) && parsedWorkDays >= 1 && parsedWorkDays <= 31) {
    keyMap[`WORKING_DAYS_${targetYm.replace("-", "_")}`] = parsedWorkDays;
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const rows = sheet.getDataRange().getValues();
    const rowByKey = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) rowByKey[String(rows[i][0]).trim()] = i + 1;
    }

    const toAppend = [];
    Object.keys(keyMap).forEach(k => {
      if (rowByKey[k]) {
        sheet.getRange(rowByKey[k], 2).setValue(keyMap[k]);
      } else {
        toAppend.push([k, keyMap[k], "Configured via GBF Mini App Reward & Schedule Settings"]);
      }
    });
    if (toAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 3).setValues(toAppend);
    }

    SpreadsheetApp.flush();
    invalidateSettingsCache_();
    if (typeof syncKpiFormulaRegistrySheet_ === "function") {
      syncKpiFormulaRegistrySheet_(ss, getSettings(true));
    }
    logToAudit("REWARD_CONFIG_UPDATED", auth.empId, auth.empName, JSON.stringify(keyMap));

    return {
      success: true,
      message: "🎁 ဆုကြေးနှုန်းထားများကို System_Settings တွင် သိမ်းဆည်းပြီးပါပြီ!",
      updated_data: getFullSystemState(auth.empId, auth.empName, data.chat_id, data.selected_month, true)
    };
  } catch (error) {
    console.error("saveRewardSettings Error:", error);
    return { success: false, message: "Server အလုပ်များနေပါသည်။" };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * 🛠️ Live System Diagnostics Checker (Telegram + Gemini 3.8 Flash Interactions API + Sheet).
 */
function runSystemDiagnostics() {
  initApproverSettings();
  const botToken = getBotToken();
  const geminiKey = getGeminiApiKey();
  const webAppUrl = getActiveWebAppUrl_();
  const ss = getGBFSpreadsheet_();

  Logger.log("==========================================");
  Logger.log("🔍 GBF HR SYSTEM DIAGNOSTICS (" + GBF_CONFIG.VERSION + ")");
  Logger.log("==========================================");
  Logger.log("0️⃣ Spreadsheet: " + ss.getName() + " (" + ss.getId() + ")");
  Logger.log("1️⃣ Web App URL: " + (webAppUrl || "❌ NOT CONFIGURED"));

  if (!botToken) {
    Logger.log("2️⃣ BOT_TOKEN: ❌ MISSING in Script Properties!");
  } else {
    const meRes = UrlFetchApp.fetch(getTelegramAPI() + "getMe", { muteHttpExceptions: true });
    Logger.log("2️⃣ Telegram Bot getMe: " + meRes.getContentText());
    const whInfo = UrlFetchApp.fetch(getTelegramAPI() + "getWebhookInfo", { muteHttpExceptions: true });
    Logger.log("3️⃣ Telegram Webhook Info: " + whInfo.getContentText());
    const cmdInfo = UrlFetchApp.fetch(getTelegramAPI() + "getMyCommands?scope=" + encodeURIComponent(JSON.stringify({ type: "all_private_chats" })), { muteHttpExceptions: true });
    Logger.log("3️⃣b Telegram Private Menu: " + cmdInfo.getContentText());
    const grpCmdInfo = UrlFetchApp.fetch(getTelegramAPI() + "getMyCommands?scope=" + encodeURIComponent(JSON.stringify({ type: "all_group_chats" })), { muteHttpExceptions: true });
    Logger.log("3️⃣c Telegram Group Menu: " + grpCmdInfo.getContentText());
  }

  if (!geminiKey) {
    Logger.log("4️⃣ GEMINI_API_KEY: ❌ MISSING in Script Properties!");
  } else {
    const keyType = geminiKey.startsWith("AQ.") ? "Google Cloud Express Key (AQ.)" : "Google AI Studio Key (AIza)";
    Logger.log("4️⃣ GEMINI_API_KEY Type: " + keyType);
    const aiTest = callGeminiApi_("Reply with 'OK' in one Burmese word.");
    Logger.log("5️⃣ Gemini 3.8 Flash Interactions API Live Test: " + (aiTest || "❌ Failed"));
  }
  Logger.log("==========================================");
}

// ==========================================
// 📊 CORE WORKFORCE STATE & MINI APP MUTATIONS
// ==========================================
function getInitialData(chatId, selectedMonth) {
  const cleanChatId = sanitizeTelegramChatId_(chatId);
  let ssoUser = null;
  if (cleanChatId) {
    const sheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const empId = String(data[i][1] || "").trim();
        const empName = String(data[i][2] || "").trim();
        const empRole = String(data[i][3] || "").trim();
        const empStatus = String(data[i][7] || "").trim().toLowerCase();
        if (empId && empName && empStatus !== "inactive" && String(data[i][0] || "").trim() === cleanChatId) {
          ssoUser = { id: empId, name: empName, role: empRole };
          break;
        }
      }
    }
  }
  const ssoState = ssoUser ? getFullSystemState(ssoUser.id, ssoUser.name, cleanChatId, selectedMonth) : null;
  return { success: true, employees: [], sso_matched: ssoState !== null, sso_data: ssoState };
}

function getFullSystemState(empId, empName, chatId, selectedMonth, skipBindLock) {
  const ss = getGBFSpreadsheet_();
  const empSheet = ss.getSheetByName("HR_Employees");
  if (!empSheet) return null;

  const settings = getSettings();
  const empData = empSheet.getDataRange().getValues();
  const cleanChatId = sanitizeTelegramChatId_(chatId);
  const inputPinOrId = String(empId || "").trim();
  const isGroupViewer = inputPinOrId === "__GROUP_VIEWER__";
  let userRowIndex = -1, userRole = isGroupViewer ? "Viewer" : null, userDepartment = isGroupViewer ? "Viewer" : "", baseSalary = isGroupViewer ? 0 : 400000, strikeCount = 0, matchedRowChatId = "", matchedExactEmpId = false;
  if (isGroupViewer) {
    empId = "__GROUP_VIEWER__";
    empName = empName || "GroupViewer";
  }
  const activeEmployees = [];

  for (let i = 1; i < empData.length; i++) {
    const rowChatId = String(empData[i][0] || "").trim();
    const rowEmpId = String(empData[i][1] || "").trim();
    const rowName = String(empData[i][2] || "").trim();
    const rowRole = String(empData[i][3] || "Staff").trim();
    const rowStatus = String(empData[i][7] || "Active").trim();
    const rowPin = String(empData[i][8] || empData[i][1] || "").trim();
    const rowDept = String(empData[i][10] || "").trim();

    if (rowEmpId && rowName && rowStatus.toLowerCase() !== "inactive") {
      activeEmployees.push({ id: rowEmpId, name: rowName, role: rowRole, department: rowDept });
    }

    if (isGroupViewer || rowStatus.toLowerCase() === "inactive") continue;

    const isExactEmpId = inputPinOrId !== "" && rowEmpId === inputPinOrId;
    const isPinMatch = inputPinOrId !== "" && rowPin === inputPinOrId && !matchedExactEmpId;
    const isSsoMatch = !inputPinOrId && cleanChatId && rowChatId === cleanChatId && !matchedExactEmpId;

    if (isExactEmpId || isPinMatch || isSsoMatch) {
      if (isExactEmpId) matchedExactEmpId = true;
      userRowIndex = i + 1;
      empId = rowEmpId;
      empName = rowName;
      userRole = rowRole;
      userDepartment = rowDept;
      matchedRowChatId = rowChatId;
      baseSalary = parseFloat(String(empData[i][6] || "400000").replace(/,/g, "")) || 400000;
      strikeCount = parseInt(empData[i][9], 10) || 0;
    }
  }
  if (!userRole) return null;

  let bindResult = { bound: false, reason: isGroupViewer ? "GROUP_VIEWER" : (matchedRowChatId ? "ALREADY_LINKED" : "NO_CHAT_ID") };
  if (!isGroupViewer && cleanChatId && userRowIndex !== -1 && matchedRowChatId !== cleanChatId) {
    if (skipBindLock) {
      bindResult = bindTelegramChatIdToRow_(empSheet, empData, userRowIndex, cleanChatId, "MINIAPP_PIN_LOGIN");
    } else {
      const bindLock = LockService.getScriptLock();
      const gotLock = bindLock.tryLock(2500);
      if (gotLock) {
        try {
          bindResult = bindTelegramChatIdToRow_(empSheet, empData, userRowIndex, cleanChatId, "MINIAPP_PIN_LOGIN");
        } finally {
          try { bindLock.releaseLock(); } catch (e) {}
        }
      } else {
        bindResult = { bound: false, reason: "LOCK_BUSY" };
      }
    }
  }

  const positionLayer = resolvePositionLayer(userRole, empId, settings);
  const isOpDept = isOperationDepartment_(userDepartment, userRole);
  const now = new Date();
  const todayStr = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
  const currentMonthStr = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "yyyy-MM");
  const targetMonth = (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) ? selectedMonth : currentMonthStr;
  const monthWorkDays = resolveMonthWorkingDays_(targetMonth, settings);

  const configuredAttBonus = parseNonNegativeSetting_(settings.REWARD_ATTENDANCE_BONUS, 50000);
  const availableMonthsSet = new Set([currentMonthStr]);

  const result = {
    selected_month: targetMonth,
    available_months: [],
    user: {
      id: empId,
      name: empName,
      role: userRole,
      department: userDepartment || (isOpDept ? "Field Operations" : "HQ Operations"),
      is_operation_dept: isOpDept,
      position_layer: positionLayer,
      is_leader: ["TM", "MM", "TL"].includes(positionLayer),
      base_salary: baseSalary,
      strike_count: strikeCount,
      chat_bound: Boolean(bindResult && bindResult.bound),
      telegram_linked: Boolean(matchedRowChatId || (bindResult && (bindResult.bound || bindResult.reason === "ALREADY_LINKED")))
    },
    wallet: {
      base_salary: baseSalary,
      max_advance_limit: Math.round(baseSalary * 0.5),
      used_advance: 0,
      pending_advance: 0,
      remaining_advance: Math.round(baseSalary * 0.5),
      attendance_bonus: configuredAttBonus,
      bonus_active: true
    },
    reward_config: {
      mvp_per_day: parseNonNegativeSetting_(settings.REWARD_MVP_PER_DAY, 1000),
      weekly_mvp_target: Math.max(1, Math.min(7, parseInt(settings.REWARD_WEEKLY_MVP_TARGET, 10) || 5)),
      weekly_mvp_bonus: parseNonNegativeSetting_(settings.REWARD_WEEKLY_MVP_BONUS, 10000),
      attendance_bonus: configuredAttBonus,
      mythic_rank_bonus: parseNonNegativeSetting_(settings.REWARD_MYTHIC_BONUS, 30000),
      legend_rank_bonus: parseNonNegativeSetting_(settings.REWARD_LEGEND_BONUS, 15000),
      working_days: monthWorkDays
    },
    weekly_streak: {
      achievedWeeks: 0,
      maxWeekMvp: 0,
      currentWeekMvp: 0,
      unlocked: false
    },
    system: {
      today_active: 0,
      total_emp: activeEmployees.length,
      office_gps: {
        lat: parseFloat(settings.OFFICE_LAT) || 16.804683,
        lng: parseFloat(settings.OFFICE_LNG) || 96.177149,
        max_radius: parseFloat(settings.MAX_RADIUS) || 500
      },
      today_checked_in_list: [],
      today_leaves_list: [],
      today_pending_list: [],
      today_teams: [],
      eligible_members: []
    },
    totals: {
      present: 0,
      mvp: 0,
      ontime: 0,
      late: 0,
      leave: 0,
      unexcused_absent: 0,
      advance: 0,
      working_days: monthWorkDays,
      elapsed_work_days: monthWorkDays,
      team_days: 0,
      is_operation_dept: isOpDept
    },
    today_state: { status: "NOT_CHECKED_IN", time_in: "", time_out: "" },
    month_daily_snapshots: {},
    history: { attendance: [], leave: [], advance: [], teams: [], voice: [] }
  };

  const ensureDaySnapshot = (dateIso) => {
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
    if (!result.month_daily_snapshots[dateIso]) {
      result.month_daily_snapshots[dateIso] = { checked_in: [], teams: [], leaves: [] };
    }
    return result.month_daily_snapshots[dateIso];
  };

  const teamSheet = ss.getSheetByName("Daily_Teams");
  const assignedNamesToday = [];
  const empTeamDatesSet = new Set();
  const LEGACY_TEAM_SORT_BASE = 9007199254740000;
  const parseTeamMeta_ = (rawId, fallbackIdx) => {
    const idStr = String(rawId || "").trim();
    const m13 = idStr.match(/TEAM-(\d{13,})/);
    const m10 = !m13 ? idStr.match(/TEAM-(1[5-9]\d{8})(?:\b|\D)/) : null;
    const ms = m13 ? parseInt(m13[1], 10) : (m10 ? parseInt(m10[1], 10) * 1000 : NaN);
    if (Number.isFinite(ms) && ms > 1000000000000) {
      return {
        id: idStr,
        created_ms: ms,
        created_time: Utilities.formatDate(new Date(ms), GBF_CONFIG.GMT_OFFSET, "hh:mm a")
      };
    }
    return { id: idStr, created_ms: LEGACY_TEAM_SORT_BASE + fallbackIdx, created_time: "" };
  };
  if (teamSheet) {
    const teamData = getLastNRows(teamSheet, 400, 5);
    const myTeamHistory = [];
    for (let i = 0; i < teamData.length; i++) {
      const tMeta = parseTeamMeta_(teamData[i][0], i);
      const tDate = normalizeDateStr(teamData[i][1]);
      const tName = teamData[i][2], tProj = teamData[i][3], tMembers = teamData[i][4];
      const teamRec = { id: tMeta.id, name: tName, project: tProj, members: tMembers, created_ms: tMeta.created_ms, created_time: tMeta.created_time };
      if (tDate === todayStr) {
        result.system.today_teams.push(teamRec);
        assignedNamesToday.push(tMembers);
      }
      if (tDate && tDate.startsWith(targetMonth)) {
        const snap = ensureDaySnapshot(tDate);
        if (snap) snap.teams.push(teamRec);
      }
      if (hasSquadMemberName_(tMembers, empName) && tDate && tDate.startsWith(targetMonth)) {
        empTeamDatesSet.add(tDate);
        myTeamHistory.push({ date: tDate, name: tName, project: tProj, created_time: tMeta.created_time, created_ms: tMeta.created_ms });
      }
    }
    const sortTeamsAsc_ = (a, b) => (Number(a.created_ms) || 0) - (Number(b.created_ms) || 0);
    result.system.today_teams.sort(sortTeamsAsc_);
    Object.keys(result.month_daily_snapshots).forEach(k => {
      if (result.month_daily_snapshots[k].teams && result.month_daily_snapshots[k].teams.length > 1) {
        result.month_daily_snapshots[k].teams.sort(sortTeamsAsc_);
      }
    });
    myTeamHistory.sort((a, b) => {
      if (b.date !== a.date) return b.date > a.date ? 1 : -1;
      return (Number(b.created_ms) || 0) - (Number(a.created_ms) || 0);
    });
    result.history.teams = myTeamHistory.slice(0, 31);
  }
  result.totals.team_days = empTeamDatesSet.size;

  const findSquadForDateAndName = (dateIso, personName) => {
    const snap = result.month_daily_snapshots[dateIso];
    if (snap && snap.teams.length > 0) {
      const f = snap.teams.find(t => hasSquadMemberName_(t.members, personName));
      if (f) return f.name;
    }
    const found = dateIso === todayStr ? result.system.today_teams.find(t => hasSquadMemberName_(t.members, personName)) : null;
    return found ? found.name : "HQ / Standby";
  };

  const officeLat = parseFloat(settings.OFFICE_LAT) || 16.804683;
  const officeLng = parseFloat(settings.OFFICE_LNG) || 96.177149;
  const maxRadius = parseFloat(settings.MAX_RADIUS) || 500;

  const checkedInNamesToday = [];
  const checkedInIdsToday = new Set();
  const seenAttendanceIdsByDate = {};
  const empAttRecordsMonth = [];
  const attSheet = ss.getSheetByName("Daily_Attendance");
  if (attSheet) {
    const attData = getLastNRows(attSheet, 1500, 11);
    let arrivalOrder = 0;

    for (let i = 0; i < attData.length; i++) {
      const rDate = normalizeDateStr(attData[i][1]);
      if (rDate.length >= 7) availableMonthsSet.add(rDate.substring(0, 7));

      const rowId = String(attData[i][2]).trim();
      const rowName = String(attData[i][10]).trim();
      let rowInTime = String(attData[i][3] || "").trim();
      if (rowInTime.startsWith("1899-12-")) {
        rowInTime = formatTimeFromAttId_(attData[i][0]) || rowInTime;
      }
      const empMeta = activeEmployees.find(e => e.id === rowId);
      const rawGps = String(attData[i][4] || "").trim();
      const distMeters = parseFloat(String(attData[i][7] || "0").replace(/,/g, "")) || 0;
      const distLabel = formatDistanceText_(distMeters);
      const locZone = distMeters <= maxRadius ? "HQ_Zone" : "Field_Site";
      const mapMeasureUrl = buildGoogleMapsMeasureUrl_(officeLat, officeLng, rawGps);
      const rowOutTime = attData[i][5] || "";
      const rowKpi = (attData[i][9] === "Early" ? "MVP" : attData[i][9]) || "On-Time";

      if (rDate && rDate.startsWith(targetMonth)) {
        const snap = ensureDaySnapshot(rDate);
        if (snap) {
          if (!seenAttendanceIdsByDate[rDate]) seenAttendanceIdsByDate[rDate] = new Set();
          if (!seenAttendanceIdsByDate[rDate].has(rowId)) {
            seenAttendanceIdsByDate[rDate].add(rowId);
            snap.checked_in.push({
              order: snap.checked_in.length + 1,
              id: rowId,
              name: rowName || (empMeta ? empMeta.name : rowId),
              role: empMeta ? empMeta.role : "Staff",
              time: rowInTime,
              out_time: rowOutTime,
              kpi: rowKpi,
              squad: findSquadForDateAndName(rDate, rowName || (empMeta ? empMeta.name : "")),
              distance_m: Math.round(distMeters),
              distance_text: distLabel,
              loc_status: locZone,
              map_url: mapMeasureUrl
            });
          }
        }
      }

      if (rDate === todayStr && !checkedInIdsToday.has(rowId)) {
        arrivalOrder++;
        checkedInIdsToday.add(rowId);
        checkedInNamesToday.push(rowName);

        result.system.today_checked_in_list.push({
          order: arrivalOrder,
          id: rowId,
          name: rowName || (empMeta ? empMeta.name : rowId),
          role: empMeta ? empMeta.role : "Staff",
          time: rowInTime,
          out_time: rowOutTime,
          kpi: rowKpi,
          squad: findSquadForDateAndName(todayStr, rowName || (empMeta ? empMeta.name : "")),
          gps: rawGps,
          distance_m: Math.round(distMeters),
          distance_text: distLabel,
          loc_status: locZone,
          map_url: mapMeasureUrl
        });
      }
    }

    result.system.today_active = checkedInIdsToday.size;

    for (let i = attData.length - 1; i >= 0; i--) {
      const rDate = normalizeDateStr(attData[i][1]);
      if (String(attData[i][2]).trim() === String(empId)) {
        let rowInTime = String(attData[i][3] || "").trim();
        if (rowInTime.startsWith("1899-12-")) {
          rowInTime = formatTimeFromAttId_(attData[i][0]) || rowInTime;
        }
        if (rDate === todayStr) {
          result.today_state.time_in = rowInTime;
          result.today_state.status = attData[i][5] === "" ? "CHECKED_IN" : "CHECKED_OUT";
          result.today_state.time_out = attData[i][5] || "";
        }
        if (rDate.startsWith(targetMonth)) {
          result.totals.present++;
          let kpi = String(attData[i][9] || "").trim();
          if (kpi === "MVP" || kpi === "Early") { result.totals.mvp++; kpi = "MVP"; }
          else if (kpi === "Late") result.totals.late++;
          else { result.totals.ontime++; kpi = "On-Time"; }

          empAttRecordsMonth.push({ date: rDate, kpi: kpi });
          if (result.history.attendance.length < 31) {
            result.history.attendance.push({ date: rDate, in_time: rowInTime, out_time: attData[i][5] || "-", kpi: kpi });
          }
        }
      }
    }
  }

  result.weekly_streak = countWeeklyMvpStreaks_(empAttRecordsMonth, targetMonth, result.reward_config.weekly_mvp_target);

  const onLeaveIdsToday = new Set();
  const lvSheet = ss.getSheetByName("Leave_Management");
  if (lvSheet) {
    const lvData = getLastNRows(lvSheet, 500, 10);
    for (let i = lvData.length - 1; i >= 0; i--) {
      const lvEmpId = String(lvData[i][1]).trim();
      const lvEmpName = String(lvData[i][2]).trim();
      const lvType = String(lvData[i][3]).trim();
      const lvStartIso = normalizeDateStr(lvData[i][4]);
      const lvEndIso = normalizeDateStr(lvData[i][5]) || lvStartIso;
      const lvDays = parseInt(lvData[i][6], 10) || 1;
      const lvReason = String(lvData[i][7] || "").trim();
      const lvStatus = String(lvData[i][9] || "Pending").trim();

      if (lvStartIso && lvEndIso && lvStatus !== "Rejected") {
        if (lvStartIso.startsWith(targetMonth) || lvEndIso.startsWith(targetMonth)) {
          const [sy, sm, sd] = lvStartIso.split("-").map(Number);
          const [ey, em, ed] = lvEndIso.split("-").map(Number);
          if (sy && ey) {
            const cur = new Date(Date.UTC(sy, sm - 1, sd));
            const endDt = new Date(Date.UTC(ey, em - 1, ed));
            let guard = 0;
            while (cur <= endDt && guard++ < 31) {
              const isoDay = cur.toISOString().slice(0, 10);
              if (isoDay.startsWith(targetMonth)) {
                const snap = ensureDaySnapshot(isoDay);
                if (snap && !snap.leaves.some(x => x.id === lvEmpId)) {
                  snap.leaves.push({ id: lvEmpId, name: lvEmpName, type: lvType, days: lvDays, reason: lvReason, status: lvStatus });
                }
              }
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          }
        }
      }

      if (lvStartIso && lvEndIso && lvStartIso <= todayStr && todayStr <= lvEndIso && lvStatus !== "Rejected") {
        if (!onLeaveIdsToday.has(lvEmpId)) {
          onLeaveIdsToday.add(lvEmpId);
          result.system.today_leaves_list.push({
            id: lvEmpId,
            name: lvEmpName,
            type: lvType,
            days: lvDays,
            reason: lvReason,
            status: lvStatus
          });
        }
      }

      if (lvEmpId === String(empId)) {
        const startMonth = normalizeMonthFromDate(lvData[i][4]);
        if (startMonth) availableMonthsSet.add(startMonth);
        if (!startMonth || startMonth === targetMonth) {
          if (lvStatus === "Approved") result.totals.leave += lvDays;
          if (result.history.leave.length < 15) {
            result.history.leave.push({ type: lvType, start: lvData[i][4], end: lvData[i][5], days: lvDays, status: lvStatus });
          }
        }
      }
    }
  }

  activeEmployees.forEach(emp => {
    if (!checkedInIdsToday.has(emp.id) && !onLeaveIdsToday.has(emp.id)) {
      result.system.today_pending_list.push({
        id: emp.id,
        name: emp.name,
        role: emp.role,
        squad: findSquadForDateAndName(todayStr, emp.name)
      });
    }
    if (emp.name !== empName && checkedInNamesToday.includes(emp.name) && !assignedNamesToday.some(t => hasSquadMemberName_(t, emp.name))) {
      result.system.eligible_members.push({ id: emp.id, name: emp.name, role: emp.role });
    }
  });

  const advSheet = ss.getSheetByName("Advance_Salary");
  if (advSheet) {
    const advData = getLastNRows(advSheet, 500, 8);
    for (let i = advData.length - 1; i >= 0; i--) {
      if (String(advData[i][1]).trim() === String(empId)) {
        const reqMonth = normalizeMonthFromDate(advData[i][4]);
        if (reqMonth) availableMonthsSet.add(reqMonth);
        if (!reqMonth || reqMonth === targetMonth) {
          const amt = parseInt(String(advData[i][3]).replace(/,/g, ""), 10) || 0;
          const st = String(advData[i][6]).trim();
          if (st === "Approved") { result.totals.advance += amt; result.wallet.used_advance += amt; }
          else if (st === "Pending") { result.wallet.pending_advance += amt; }
          if (result.history.advance.length < 15) {
            result.history.advance.push({ date: advData[i][4], amount: amt.toLocaleString(), status: st });
          }
        }
      }
    }
  }

  result.wallet.remaining_advance = Math.max(0, result.wallet.max_advance_limit - (result.wallet.used_advance + result.wallet.pending_advance));

  const elapsedWorkDays = Math.min(monthWorkDays, countElapsedWorkDays_(targetMonth, now));
  const accountedDays = result.totals.present + result.totals.leave;
  result.totals.elapsed_work_days = elapsedWorkDays;
  result.totals.unexcused_absent = result.totals.present > 0 ? Math.max(0, elapsedWorkDays - accountedDays) : 0;
  if (result.totals.unexcused_absent > 0) {
    result.wallet.attendance_bonus = 0;
    result.wallet.bonus_active = false;
  }

  const voiceSheet = ss.getSheetByName("HR_Voice_Feedback");
  if (voiceSheet) {
    const vData = getLastNRows(voiceSheet, 200, 9);
    for (let i = vData.length - 1; i >= 0; i--) {
      if (String(vData[i][2]).trim() === String(empId) && result.history.voice.length < 10) {
        result.history.voice.push({
          ticket: vData[i][0],
          date: normalizeDateStr(String(vData[i][1]).split(" ")[0]),
          category: vData[i][4],
          message: vData[i][5],
          reply: vData[i][7],
          status: vData[i][8]
        });
      }
    }
  }

  result.available_months = Array.from(availableMonthsSet).sort().reverse();
  if (!isGroupViewer) {
    result.session_token = issueSessionToken_(empId, positionLayer, cleanChatId || matchedRowChatId);
  }
  return result;
}

function processWebAppAttendance(data) {
  const settings = getSettings();
  const attSheet = getGBFSpreadsheet_().getSheetByName("Daily_Attendance");
  const now = new Date();
  const todayStr = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
  const timeNow = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "HH:mm");
  const displayTime = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "hh:mm a");

  let kpiStatus = "Late";
  if (timeNow <= String(settings.TIME_EARLY || "09:00")) kpiStatus = "MVP";
  else if (timeNow <= String(settings.TIME_LATE || "09:15")) kpiStatus = "On-Time";

  const distance = haversineDistance(parseFloat(settings.OFFICE_LAT), parseFloat(settings.OFFICE_LNG), data.lat, data.lng);
  const maxRadius = parseFloat(settings.MAX_RADIUS) || 500;
  const locStatus = distance <= maxRadius ? "Normal" : "Out_of_Range";

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const dup = checkIdempotency_(data.idempotencyKey);
    if (dup) {
      return Object.assign({}, dup, {
        updated_data: getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true)
      });
    }

    const lastRow = attSheet.getLastRow();
    let checkedInToday = false, isCheckedOut = false, rowToUpdate = -1;
    if (lastRow >= 2) {
      const lookback = Math.max(2, lastRow - 100);
      const existingData = attSheet.getRange(lookback, 1, (lastRow - lookback) + 1, 6).getDisplayValues();
      for (let i = existingData.length - 1; i >= 0; i--) {
        if (normalizeDateStr(existingData[i][1]) === todayStr && String(existingData[i][2]).trim() === String(data.emp_id).trim()) {
          checkedInToday = true;
          rowToUpdate = lookback + i;
          if (String(existingData[i][5] || "").trim() !== "") isCheckedOut = true;
          break;
        }
      }
    }

    let successMsg = "";
    const distFormatted = formatDistanceText_(distance);
    if (data.type === "Check In") {
      if (checkedInToday) return { success: false, message: "ယနေ့အတွက် ရုံးတက်စာရင်း ဝင်ပြီးဖြစ်ပါသည်။" };
      attSheet.appendRow(["ATT-" + now.getTime(), todayStr, data.emp_id, displayTime, `${data.lat},${data.lng}`, "", "", distance.toFixed(0), locStatus, kpiStatus, data.emp_name]);
      successMsg = `✅ Check-In အောင်မြင်ပါသည် (${kpiStatus} • ${distFormatted})`;
    } else if (data.type === "Check Out") {
      if (!checkedInToday || isCheckedOut) return { success: false, message: "စာရင်းသွင်းပြီးဖြစ်ပါသည်။" };
      attSheet.getRange(rowToUpdate, 6).setValue(displayTime);
      attSheet.getRange(rowToUpdate, 7).setValue(`${data.lat},${data.lng}`);
      successMsg = `✅ Check-Out အောင်မြင်ပါသည် (${distFormatted})`;
    }
    SpreadsheetApp.flush();

    logToAudit("ATTENDANCE_" + (data.type === "Check Out" ? "OUT" : "IN"), data.emp_id, data.emp_name, `${kpiStatus} ${distFormatted}`, data.idempotencyKey);
    const updatedState = getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true);
    broadcastAttendanceToTelegramGroup_(data, kpiStatus, distance, locStatus, displayTime, updatedState, settings);
    notifyPerformerAttendance_(data, kpiStatus, distance, locStatus, displayTime, updatedState, settings, data.chat_id);

    const res = { success: true, message: successMsg, updated_data: updatedState };
    recordIdempotency_(data.idempotencyKey, res);
    return res;
  } catch (error) {
    return { success: false, message: "Server အလုပ်များနေပါသည်။" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Executes a state-mutating WebApp action under ScriptLock with timeout/exception safety.
 */
function withScriptLock_(label, fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return fn();
  } catch (error) {
    console.error(`${label} Error:`, error);
    return { success: false, message: "Server အလုပ်များနေပါသည်။" };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function processWebAppLeave(data) {
  return withScriptLock_("processWebAppLeave", () => {
    const dup = checkIdempotency_(data.idempotencyKey);
    if (dup) {
      return Object.assign({}, dup, {
        updated_data: getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true)
      });
    }

    const currentState = getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true);
    const empInfo = getEmployeeContactInfo(data.emp_id);
    const sheet = getGBFSpreadsheet_().getSheetByName("Leave_Management");
    const fStart = formatDate(data.start_date), fEnd = formatDate(data.end_date);
    const dayOfWeek = new Date(data.start_date).getDay();
    const patternDay = dayOfWeek === 1 ? "Monday_Bridge" : (dayOfWeek === 5 ? "Friday_Bridge" : "Standard_Day");

    const aiRiskAdvice = evaluateLeaveRiskWithGemini(
      data.emp_id, data.emp_name, data.leave_type, fStart, fEnd,
      data.total_days, data.reason, patternDay, currentState
    );

    sheet.appendRow(["LV-" + new Date().getTime(), data.emp_id, data.emp_name, data.leave_type, fStart, fEnd, data.total_days, data.reason, patternDay, "Pending"]);
    SpreadsheetApp.flush();
    const row = sheet.getLastRow();

    const hrMsg = `📅 <b>ခွင့်တိုင်ကြားလွှာ အသစ် (Leave)</b>  [<code>⏳ PENDING</code>]\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(data.emp_name)} (<code>${escapeHtmlText_(data.emp_id)}</code>)\n` +
      `🏷️ <b>ရာထူး:</b> ${escapeHtmlText_(empInfo.role || (currentState ? currentState.user.role : "Staff"))}\n` +
      `🔖 <b>အမျိုးအစား:</b> ${escapeHtmlText_(data.leave_type)} (${escapeHtmlText_(data.total_days)} ရက်)\n` +
      `📆 <b>ရက်စွဲ:</b> ${escapeHtmlText_(fStart)} မှ ${escapeHtmlText_(fEnd)} ထိ\n` +
      `🔍 <b>AI Pattern:</b> <code>${escapeHtmlText_(patternDay)}</code>\n` +
      `📝 <b>အကြောင်းရင်း:</b> ${escapeHtmlText_(data.reason)}\n` +
      `🤖 <b>AI Risk Advisor:</b> ${formatAiToTelegramHtml(aiRiskAdvice)}</blockquote>`;

    const kb = buildApprovalInlineKeyboard(`LV_APP_${row}_${data.emp_id}`, `LV_REJ_${row}_${data.emp_id}`);
    const routing = sendToTierApprovers(data.emp_id, data.emp_name, empInfo.role, hrMsg, kb);
    notifyPerformerLeaveSubmitted_(data, data.leave_type, fStart, fEnd, aiRiskAdvice, routing, data.chat_id);
    logToAudit("LEAVE_REQUEST", data.emp_id, data.emp_name, `${data.leave_type} ${data.total_days}d Row ${row}`, data.idempotencyKey);

    const freshState = getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true);
    const res = {
      success: true,
      message: `📝 ခွင့်တိုင်ကြားလွှာကို ${routing.approverTierLabel} ထံ ပေးပို့ပြီးပါပြီ။`,
      updated_data: freshState
    };
    recordIdempotency_(data.idempotencyKey, res);
    return res;
  });
}

function processWebAppAdvance(data) {
  return withScriptLock_("processWebAppAdvance", () => {
    const dup = checkIdempotency_(data.idempotencyKey);
    if (dup) {
      return Object.assign({}, dup, {
        updated_data: getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true)
      });
    }

    const currentState = getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true);
    const empInfo = getEmployeeContactInfo(data.emp_id);
    const reqAmt = parseFloat(data.requested_amount) || 0;
    if (reqAmt <= 0) {
      return { success: false, message: "⚠️ ငွေပမာဏ မှန်ကန်စွာ ထည့်သွင်းပါ။" };
    }
    if (currentState && reqAmt > currentState.wallet.remaining_advance) {
      return { success: false, message: `⚠️ 50% Limit ကျော်လွန်နေပါသည် (လက်ကျန်: ${currentState.wallet.remaining_advance.toLocaleString()} MMK)။` };
    }

    const aiRiskAdvice = evaluateAdvanceRiskWithGemini(
      data.emp_id, data.emp_name, reqAmt, data.reason, currentState
    );

    const sheet = getGBFSpreadsheet_().getSheetByName("Advance_Salary");
    sheet.appendRow(["ADV-" + new Date().getTime(), data.emp_id, data.emp_name, reqAmt, formatDate(data.requested_date), data.reason, "Pending", aiRiskAdvice]);
    SpreadsheetApp.flush();
    const row = sheet.getLastRow();

    const remainingAfter = currentState ? Math.max(0, currentState.wallet.remaining_advance - reqAmt) : 0;
    const hrMsg = `💰 <b>လစာကြိုတင်တောင်းခံလွှာ အသစ် (Advance)</b>  [<code>⏳ PENDING</code>]\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(data.emp_name)} (<code>${escapeHtmlText_(data.emp_id)}</code>)\n` +
      `🏷️ <b>ရာထူး:</b> ${escapeHtmlText_(empInfo.role || (currentState ? currentState.user.role : "Staff"))}\n` +
      `💵 <b>တောင်းခံငွေ:</b> <code>${reqAmt.toLocaleString()} MMK</code>\n` +
      `📊 <b>50% Limit Check (ကျန်ငွေ):</b> <code>${remainingAfter.toLocaleString()} MMK</code>\n` +
      `📝 <b>အကြောင်းရင်း:</b> ${escapeHtmlText_(data.reason)}\n` +
      `🤖 <b>AI Risk Advisor:</b> ${formatAiToTelegramHtml(aiRiskAdvice)}</blockquote>`;

    const kb = buildApprovalInlineKeyboard(`ADV_APP_${row}_${data.emp_id}`, `ADV_REJ_${row}_${data.emp_id}`);
    const routing = sendToTierApprovers(data.emp_id, data.emp_name, empInfo.role, hrMsg, kb);
    notifyPerformerAdvanceSubmitted_(data, reqAmt, remainingAfter, aiRiskAdvice, routing, data.chat_id);
    logToAudit("ADVANCE_REQUEST", data.emp_id, data.emp_name, `${reqAmt} MMK Row ${row}`, data.idempotencyKey);

    const freshState = getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true);
    const res = {
      success: true,
      message: `💸 ကြိုတင်ငွေတောင်းခံလွှာကို ${routing.approverTierLabel} ထံ ပေးပို့ပြီးပါပြီ။`,
      updated_data: freshState
    };
    recordIdempotency_(data.idempotencyKey, res);
    return res;
  });
}

function processWebAppTeam(data) {
  return withScriptLock_("processWebAppTeam", () => {
    const dup = checkIdempotency_(data.idempotencyKey);
    if (dup) {
      return Object.assign({}, dup, {
        updated_data: getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true)
      });
    }

    const settings = getSettings();
    const sheet = getGBFSpreadsheet_().getSheetByName("Daily_Teams");
    const fDate = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
    const members = Array.isArray(data.members) ? data.members.slice() : [];
    if (!members.some(m => m.name === data.emp_name)) members.unshift({ name: data.emp_name, role: "Leader" });
    const membersStr = members.map(m => `${m.name} (${m.role})`).join(", ");
    sheet.appendRow(["TEAM-" + new Date().getTime(), fDate, data.team_name, data.project, membersStr, JSON.stringify(members)]);
    SpreadsheetApp.flush();

    const freshState = getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true);
    const groupRosterMsg = buildConsolidatedTeamsGroupMessage_(sheet, fDate, data.team_name, data.project, members, freshState);
    if (settings.TELEGRAM_GROUP_CHAT_ID) {
      const grpChatId = String(settings.TELEGRAM_GROUP_CHAT_ID).trim();
      const mode = String(settings.GROUP_ATTENDANCE_MODE || "LIVE_EDIT").toUpperCase();
      upsertGroupBoardMessage_(grpChatId, "GRP_TEAM_MSG_LATEST", groupRosterMsg, buildGroupTeamsKeyboard_(settings), mode, resolveGroupThreadId_(grpChatId, settings), fDate);
    }
    notifyPerformerAndMembersTeam_(data, members, fDate, data.chat_id);

    logToAudit("TEAM_ASSIGNED", data.emp_id, data.emp_name, `${data.team_name} (${data.project})`, data.idempotencyKey);
    const res = {
      success: true,
      message: "📡 အဖွဲ့ဖွဲ့စည်းပြီးပါပြီ။",
      updated_data: freshState
    };
    recordIdempotency_(data.idempotencyKey, res);
    return res;
  });
}

function processWebAppVoice(data) {
  return withScriptLock_("processWebAppVoice", () => {
    const dup = checkIdempotency_(data.idempotencyKey);
    if (dup) {
      return Object.assign({}, dup, {
        updated_data: getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true)
      });
    }

    const sheet = getGBFSpreadsheet_().getSheetByName("HR_Voice_Feedback");
    const ticketId = "VOC-" + Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "MMdd-HHmm");
    const isAnon = data.is_anonymous === true;
    const recordedId = isAnon ? "ANONYMOUS" : String(data.emp_id || "UNKNOWN");
    const recordedName = isAnon ? "အမည်ဝှက် ဝန်ထမ်း (Anonymous)" : String(data.emp_name || "Employee");

    const aiAnalysis = analyzeVoiceFeedbackWithGemini(data.category, data.message);

    sheet.appendRow([
      ticketId,
      Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd HH:mm:ss"),
      recordedId,
      recordedName,
      data.category,
      data.message,
      aiAnalysis.sentiment,
      aiAnalysis.reply,
      "Pending_Review"
    ]);
    SpreadsheetApp.flush();
    const row = sheet.getLastRow();

    const contactLine = (!isAnon && data.emp_id) ? buildDirectContactHtmlLine_(data.emp_id, recordedName) : "";
    const hrAlert = `📣 <b>[HR-AI Employee Voice &amp; Negotiation]</b>\n` +
      `<blockquote>🎫 <b>Ticket:</b> <code>${escapeHtmlText_(ticketId)}</code> (${escapeHtmlText_(aiAnalysis.sentiment)})\n` +
      `👤 <b>ပေးပို့သူ:</b> ${escapeHtmlText_(recordedName)} (${escapeHtmlText_(recordedId)})\n` +
      `📂 <b>ကဏ္ဍ:</b> ${escapeHtmlText_(data.category)}\n` +
      `💬 <b>တင်ပြချက်:</b> <i>"${escapeHtmlText_(data.message)}"</i>${contactLine}</blockquote>`;

    const kb = {
      inline_keyboard: [
        [
          { text: "🤝 လက်ခံညှိနှိုင်းမည်", callback_data: `VOC_ACK_${row}_${recordedId}` },
          { text: "📅 ရုံးခန်းချိန်းဆိုမည်", callback_data: `VOC_MEET_${row}_${recordedId}` }
        ]
      ]
    };

    sendToAllApprovers(hrAlert, kb);
    notifyPerformerVoiceSubmitted_(data, ticketId, aiAnalysis, isAnon, data.chat_id);
    logToAudit("VOICE_SUBMITTED", recordedId, recordedName, `${ticketId} ${aiAnalysis.sentiment}`, data.idempotencyKey);

    const res = {
      success: true,
      ai_reply: aiAnalysis.reply,
      sentiment: aiAnalysis.sentiment,
      updated_data: getFullSystemState(data.emp_id, data.emp_name, data.chat_id, data.selected_month, true)
    };
    recordIdempotency_(data.idempotencyKey, res);
    return res;
  });
}
