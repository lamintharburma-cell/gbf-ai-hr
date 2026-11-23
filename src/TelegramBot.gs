/**
 * 📡 G.B.F. Enterprise HR & AI Management System — Telegram Bot & Approver Matrix (TelegramBot.gs v9.2)
 * Handles Webhook registration, Anti-Loop Inline Button callbacks, 2-Tier Position Layer Routing,
 * and Live Group Attendance Leaderboard Broadcasts.
 */

/**
 * 🤖 Authoritative Telegram Bot Command List synced via `setMyCommands` (v9.2.4 Option B).
 */
const GBF_BOT_COMMANDS = [
  { command: "start", description: "🚀 Open GBF HR Mini App & Signed SSO" },
  { command: "checkin", description: "📍 ယနေ့ ရုံးတက်အခြေအနေ ကြည့်ရန်" },
  { command: "mykpi", description: "🏆 MLBB Season Rank & KPI စစ်ဆေးရန်" },
  { command: "wallet", description: "💳 50% Advance Limit & လက်ကျန်ကြည့်ရန်" },
  { command: "payslip", description: "🧾 ယခုလ Digital Payslip ကြည့်ရန်" },
  { command: "askai", description: "🤖 GBF HR-AI နှင့် မေးမြန်းဆွေးနွေးရန်" },
  { command: "link", description: "🔗 /link <PIN> ဖြင့် Telegram ID ချိတ်ရန်" },
  { command: "id", description: "🪪 Telegram Chat ID နှင့် ဝန်ထမ်း ID စစ်ရန်" }
];

/**
 * 📋 Syncs the Telegram "/" Menu commands so users only see live, working v9.2.4 commands.
 */
function syncBotCommands_() {
  const token = getBotToken();
  if (!token) return { ok: false, description: "BOT_TOKEN missing" };
  try {
    const res = UrlFetchApp.fetch(getTelegramAPI() + "setMyCommands", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        commands: GBF_BOT_COMMANDS,
        scope: { type: "default" }
      })
    });
    const text = res.getContentText();
    Logger.log("📋 Telegram setMyCommands: " + text);
    return JSON.parse(text);
  } catch (e) {
    Logger.log("setMyCommands Exception: " + e.message);
    return { ok: false, description: e.message };
  }
}

/**
 * 🚨 Emergency Webhook Reset & Registration (flushes stuck Telegram retry queues).
 */
function setupWebhook() {
  const botToken = getBotToken();
  if (!botToken) {
    Logger.log("❌ Error: BOT_TOKEN is empty in Script Properties. Run configureGBFProductionCredentials() first.");
    return;
  }
  const url = getActiveWebAppUrl_();
  if (!url || !url.includes("/exec")) {
    Logger.log("❌ Error: Please put your /exec Web App URL in System_Settings -> WEB_APP_URL first.");
    return;
  }

  const delRes = UrlFetchApp.fetch(getTelegramAPI() + "deleteWebhook?drop_pending_updates=true", {
    muteHttpExceptions: true
  });
  Logger.log("🧹 Step 1 (Flush Pending Queue): " + delRes.getContentText());

  const payload = {
    url: url,
    drop_pending_updates: true,
    max_connections: 40,
    allowed_updates: ["message", "callback_query"]
  };

  const response = UrlFetchApp.fetch(getTelegramAPI() + "setWebhook", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  Logger.log("✅ Step 2 (Webhook Registered to " + url + "): " + response.getContentText());
  syncBotCommands_();
}

function sendTelegramHTML(chatId, text, kb) {
  if (!chatId || !getBotToken()) return null;
  const payload = { chat_id: chatId, text: text, parse_mode: "HTML" };
  if (kb) payload.reply_markup = kb;

  const res = UrlFetchApp.fetch(getTelegramAPI() + "sendMessage", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  if (res.getResponseCode() !== 200) {
    Logger.log(`Telegram sendMessage Error (${chatId}): ${res.getContentText()}`);
    return null;
  }
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return null;
  }
}

function answerCallbackSafe_(callbackQueryId, toastText, showAlert) {
  if (!callbackQueryId || !getBotToken()) return;
  try {
    UrlFetchApp.fetch(getTelegramAPI() + "answerCallbackQuery", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: toastText,
        show_alert: Boolean(showAlert)
      })
    });
  } catch (e) {}
}

/**
 * 🧹 Removes Inline Buttons from the Approver's message and appends the final decision footer.
 * Includes a 2-step fallback to `editMessageReplyMarkup` so inline buttons ALWAYS disappear.
 */
function finalizeApproverMessageAndRemoveButtons_(cb, decisionFooterHtml) {
  if (!cb || !cb.message || !cb.message.chat) return;
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const originalText = cb.message.text || "";

  const safeOriginal = originalText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const editRes = UrlFetchApp.fetch(getTelegramAPI() + "editMessageText", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: `${safeOriginal}\n\n${decisionFooterHtml}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] }
    })
  });

  if (editRes.getResponseCode() !== 200) {
    UrlFetchApp.fetch(getTelegramAPI() + "editMessageReplyMarkup", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] }
      })
    });
  }
}

function handleCallbackQuery(cb) {
  if (!cb || !cb.data) return;

  const cache = CacheService.getScriptCache();
  const cbKey = "CB_ID_" + String(cb.id);
  if (cache.get(cbKey)) return;
  cache.put(cbKey, "1", 21600);

  const rawData = String(cb.data);
  if (rawData.startsWith("CMD_")) {
    handlePortalMenuCallback_(cb);
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) {
    answerCallbackSafe_(cb.id, "⏳ ခဏစောင့်ဆိုင်းပေးပါ...", false);
    return;
  }

  try {
    const parts = rawData.split("_");
    const type = parts[0];          // "LV", "ADV", or "VOC"
    const action = parts[1];        // "APP", "REJ", "ACK", or "MEET"
    const row = parseInt(parts[2], 10);
    const targetEmpId = parts.slice(3).join("_");
    const approverName = (cb.from && cb.from.first_name) ? cb.from.first_name : "Approver";

    if (!row || isNaN(row) || row < 2) {
      answerCallbackSafe_(cb.id, "⚠️ Invalid Row Data", false);
      return;
    }

    const ss = getGBFSpreadsheet_();
    const rowActionLockKey = `DECIDED_${type}_ROW_${row}`;
    const alreadyDecidedInCache = cache.get(rowActionLockKey);

    // CASE 1: HR-AI VOICE TICKET
    if (type === "VOC") {
      const vSheet = ss.getSheetByName("HR_Voice_Feedback");
      if (!vSheet) {
        answerCallbackSafe_(cb.id, "⚠️ Sheet Not Found", false);
        return;
      }

      const currentVocStatus = String(vSheet.getRange(row, 9).getValue() || "").trim();
      if (alreadyDecidedInCache || (currentVocStatus !== "" && currentVocStatus !== "Pending_Review")) {
        finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ✅ ဆောင်ရွက်ပြီး (${escapeHtmlText_(currentVocStatus || alreadyDecidedInCache)})`);
        answerCallbackSafe_(cb.id, `⚠️ ဤတင်ပြချက်ကို (${currentVocStatus || "ဆောင်ရွက်ပြီး"}) အဖြစ် သတ်မှတ်ပြီးဖြစ်ပါသည်!`, true);
        return;
      }

      const newStatus = action === "ACK" ? `Acknowledged by ${approverName}` : `Meeting Set by ${approverName}`;
      const statusBadge = action === "ACK" ? `🤝 လက်ခံညှိနှိုင်းမည် (${escapeHtmlText_(approverName)})` : `📅 ရုံးခန်းချိန်းဆိုမည် (${escapeHtmlText_(approverName)})`;

      cache.put(rowActionLockKey, newStatus, 21600);
      vSheet.getRange(row, 9).setValue(newStatus);
      SpreadsheetApp.flush();

      answerCallbackSafe_(cb.id, "✅ ဝန်ထမ်းထံ အကြောင်းပြန်ပြီးပါပြီ!", false);
      finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ${statusBadge}`);

      const notifyKey = `NOTIFIED_VOC_${row}`;
      if (!cache.get(notifyKey)) {
        cache.put(notifyKey, "1", 21600);
        const empChatId = getChatIdByEmpId(targetEmpId);
        if (empChatId) {
          const ticketCode = String(vSheet.getRange(row, 1).getDisplayValue() || `VOC-#${row}`).trim();
          const msg = action === "ACK"
            ? `🤝 သင်၏ HR-AI ဆွေးနွေးတင်ပြချက် (<code>${escapeHtmlText_(ticketCode)}</code>) ကို <b>${escapeHtmlText_(approverName)}</b> မှ လက်ခံရရှိပြီး ညှိနှိုင်းဆောင်ရွက်ပေးနေပါသည်။`
            : `📅 သင်၏ တင်ပြချက် (<code>${escapeHtmlText_(ticketCode)}</code>) အတွက် <b>${escapeHtmlText_(approverName)}</b> မှ ရုံးခန်းတွင် တွေ့ဆုံဆွေးနွေးရန် ချိန်းဆိုထားပါသည်။`;
          const kb = buildPrivatePortalKeyboard_(empChatId, {
            rowButtons: [{ text: "🤖 Ask HR-AI Guide", callback_data: "CMD_ASKAI" }]
          });
          sendTelegramHTML(empChatId, `${msg}\n\n— <b>GBF HR AI Management Team</b>`, kb);
        }
        logToAudit("VOICE_TICKET_UPDATE", targetEmpId, approverName, `${newStatus} Row ${row}`);
      }
      return;
    }

    // CASE 2: LEAVE (LV) OR ADVANCE SALARY (ADV)
    if (type !== "LV" && type !== "ADV") {
      answerCallbackSafe_(cb.id, "⚠️ Unknown Callback Action", false);
      return;
    }
    const sheetName = type === "LV" ? "Leave_Management" : "Advance_Salary";
    const statusCol = type === "LV" ? 10 : 7;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      answerCallbackSafe_(cb.id, "⚠️ Sheet Not Found", false);
      return;
    }

    const currentStatus = String(sheet.getRange(row, statusCol).getValue() || "").trim();
    if (alreadyDecidedInCache || (currentStatus !== "" && currentStatus !== "Pending")) {
      finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ${escapeHtmlText_(currentStatus || alreadyDecidedInCache)}`);
      answerCallbackSafe_(cb.id, `⚠️ ဤတောင်းဆိုမှုကို (${currentStatus || alreadyDecidedInCache}) အဖြစ် ဆုံးဖြတ်ပြီးဖြစ်ပါသည်!`, true);
      return;
    }

    const decision = action === "APP" ? "Approved" : "Rejected";
    const statusBadge = action === "APP" ? "✅ အတည်ပြုပြီး (Approved)" : "❌ ငြင်းပယ်ပြီး (Rejected)";

    cache.put(rowActionLockKey, decision, 21600);
    sheet.getRange(row, statusCol).setValue(decision);
    SpreadsheetApp.flush();

    answerCallbackSafe_(cb.id, `${statusBadge}!`, false);
    finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ${statusBadge} (by ${escapeHtmlText_(approverName)})`);

    const notifyKey = `NOTIFIED_${type}_${row}`;
    if (!cache.get(notifyKey)) {
      cache.put(notifyKey, "1", 21600);
      const empContact = getEmployeeContactInfo(targetEmpId);
      if (empContact.chatId) {
        const detailLine = buildDecidedRequestSummaryLine_(sheet, type, row);
        const reqTitle = type === "LV" ? "ခွင့်တိုင်ကြားလွှာ" : "လစာကြိုတင်တောင်းခံလွှာ";
        const statusTag = action === "APP" ? "APPROVED ✅" : "DECLINED ❌";
        const declineNote = action === "REJ"
          ? `\n📌 <i>အကြောင်းအရာ အသေးစိတ်သိရှိလိုပါက HR / Team Leader ထံ ဆက်သွယ်မေးမြန်းနိုင်ပါသည်။</i>`
          : "";
        const empNotification = action === "APP"
          ? `✅ <b>${reqTitle} ခွင့်ပြုလိုက်ပါပြီ</b>  [<code>${statusTag}</code>]\n` +
            `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(empContact.name || targetEmpId)} (<code>${escapeHtmlText_(targetEmpId)}</code>)${detailLine}\n` +
            `🧑‍💼 <b>အတည်ပြုသူ:</b> ${escapeHtmlText_(approverName)}</blockquote>\n` +
            `— <b>GBF HR AI Management Team</b>`
          : `❌ <b>${reqTitle} ငြင်းပယ်လိုက်ပါသည်</b>  [<code>${statusTag}</code>]\n` +
            `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(empContact.name || targetEmpId)} (<code>${escapeHtmlText_(targetEmpId)}</code>)${detailLine}\n` +
            `🧑‍💼 <b>ဆုံးဖြတ်သူ:</b> ${escapeHtmlText_(approverName)}</blockquote>${declineNote}\n\n` +
            `— <b>GBF HR AI Management Team</b>`;
        const rowButtons = type === "LV"
          ? [{ text: "📍 Attendance", callback_data: "CMD_CHECKIN" }, { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }]
          : [{ text: "💳 My Wallet", callback_data: "CMD_WALLET" }, { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" }];
        sendTelegramHTML(empContact.chatId, empNotification, buildPrivatePortalKeyboard_(empContact.chatId, { rowButtons: rowButtons }));
      }
      logToAudit("HR_APPROVAL", targetEmpId, approverName, `${decision} ${sheetName} Row ${row}`);
    }
  } catch (err) {
    console.error("Callback Error:", err);
    answerCallbackSafe_(cb.id, "⚠️ Processed", false);
  } finally {
    lock.releaseLock();
  }
}

function resolvePositionLayer(roleStr, empId, settings) {
  const raw = String(roleStr || "").trim();
  const upper = raw.toUpperCase();

  const tokens = upper.split(/[\s\-\/\(\),]+/);
  if (tokens.includes("TT")) return "TT";
  if (tokens.includes("JT")) return "JT";
  if (tokens.includes("ST")) return "ST";
  if (tokens.includes("TL")) return "TL";
  if (tokens.includes("MM")) return "MM";
  if (tokens.includes("TM")) return "TM";

  const tmIds = String((settings && settings.APPROVER_TM_EMP_IDS) || "").split(",").map(s => s.trim());
  const tlIds = String((settings && settings.APPROVER_TL_EMP_IDS) || "").split(",").map(s => s.trim());
  if (tmIds.includes(String(empId).trim())) return "TM";
  if (tlIds.includes(String(empId).trim())) return "TL";

  const lower = raw.toLowerCase();
  if (lower.includes("admin") || lower.includes("director") || lower.includes("ceo") || lower === "leader") return "TM";
  if (lower.includes("team leader") || lower.includes("team lead")) return "TL";
  if (lower.includes("manager") || lower.includes("hr") || lower.includes("executive")) return "MM";
  if (lower.includes("senior")) return "ST";
  if (lower.includes("junior")) return "JT";
  if (lower.includes("trainee")) return "TT";

  return "JT";
}

function getEmployeeContactInfo(empId, cachedEmpRows) {
  let data = cachedEmpRows;
  if (!data) {
    const sheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
    if (!sheet) return { empId: String(empId), name: "", role: "", chatId: null, phone: "" };
    data = sheet.getDataRange().getValues();
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(empId).trim()) {
      return {
        empId: String(data[i][1]).trim(),
        name: String(data[i][2]).trim(),
        role: String(data[i][3]).trim(),
        phone: String(data[i][4] || "").trim(),
        chatId: String(data[i][0] || "").trim() || null
      };
    }
  }
  return { empId: String(empId), name: "", role: "", chatId: null, phone: "" };
}

function resolveApproversForRequester(requesterEmpId, requesterName, requesterRole) {
  const settings = getSettings();
  const empSheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
  const empRows = empSheet ? empSheet.getDataRange().getValues() : null;
  const posLayer = resolvePositionLayer(requesterRole, requesterEmpId, settings);

  const tlTargets = String(settings.POS_LAYER_TL_TARGETS || "TT,JT,ST").toUpperCase().split(",").map(s => s.trim()).filter(Boolean);
  const tmTargets = String(settings.POS_LAYER_TM_TARGETS || "TL,MM").toUpperCase().split(",").map(s => s.trim()).filter(Boolean);

  const configuredTlIds = String(settings.APPROVER_TL_EMP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const configuredTmIds = String(settings.APPROVER_TM_EMP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const hrWatchIds = String(settings.APPROVER_HR_WATCH_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

  let targetApproverEmpIds = [];
  let approverTierLabel = "TM (Top Management)";

  if (tlTargets.includes(posLayer)) {
    approverTierLabel = "TL (Team Leader)";
    if (String(settings.TL_ROUTE_BY_DAILY_TEAM || "YES").toUpperCase() === "YES") {
      const todayAssignedTlIds = findTodayTeamLeaderEmpIds(requesterName, configuredTlIds, empRows);
      targetApproverEmpIds = todayAssignedTlIds.length > 0 ? todayAssignedTlIds : configuredTlIds;
    } else {
      targetApproverEmpIds = configuredTlIds;
    }
  } else if (tmTargets.includes(posLayer) || posLayer === "TM") {
    approverTierLabel = "TM (Top Management)";
    targetApproverEmpIds = configuredTmIds;
  } else {
    approverTierLabel = "TM (Top Management)";
    targetApproverEmpIds = configuredTmIds;
  }

  hrWatchIds.forEach(hrId => {
    if (!targetApproverEmpIds.includes(hrId)) targetApproverEmpIds.push(hrId);
  });

  if (targetApproverEmpIds.length > 1) {
    targetApproverEmpIds = targetApproverEmpIds.filter(id => id !== String(requesterEmpId).trim());
  }

  const chatIdSet = new Set();
  const approverNames = [];
  targetApproverEmpIds.forEach(appId => {
    const info = getEmployeeContactInfo(appId, empRows);
    if (info.chatId) chatIdSet.add(info.chatId);
    if (info.name) approverNames.push(`${info.name} (#${appId})`);
  });

  if (chatIdSet.size === 0 && settings.HR_ADMIN_CHAT_ID) {
    chatIdSet.add(String(settings.HR_ADMIN_CHAT_ID).trim());
  }

  return {
    positionLayer: posLayer,
    approverTierLabel: approverTierLabel,
    approverNames: approverNames,
    chatIds: Array.from(chatIdSet)
  };
}

function findTodayTeamLeaderEmpIds(requesterName, configuredTlIds, cachedEmpRows) {
  const ss = getGBFSpreadsheet_();
  const teamSheet = ss.getSheetByName("Daily_Teams");
  if (!teamSheet || !requesterName) return [];

  const todayStr = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
  const teamData = getLastNRows(teamSheet, 100, 5);
  let matchedMembersText = "";

  for (let i = teamData.length - 1; i >= 0; i--) {
    if (normalizeDateStr(teamData[i][1]) === todayStr && String(teamData[i][4]).includes(requesterName)) {
      matchedMembersText = String(teamData[i][4]);
      break;
    }
  }
  if (!matchedMembersText) return [];

  const matchedTlIds = [];
  configuredTlIds.forEach(tlId => {
    const info = getEmployeeContactInfo(tlId, cachedEmpRows);
    if (info.name && matchedMembersText.includes(info.name)) {
      matchedTlIds.push(tlId);
    }
  });
  return matchedTlIds;
}

/**
 * 🛡️ Builds inline buttons ONLY with `callback_data` (avoids Telegram HTTP 400 `BUTTON_USER_PRIVACY_RESTRICTED`).
 */
function buildApprovalInlineKeyboard(approveCallback, rejectCallback) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve (ခွင့်ပြုမည်)", callback_data: approveCallback },
        { text: "❌ Reject (ငြင်းပယ်မည်)", callback_data: rejectCallback }
      ]
    ]
  };
}

function buildDirectContactHtmlLine_(requesterEmpId, requesterName) {
  const contact = getEmployeeContactInfo(requesterEmpId);
  const displayName = requesterName || contact.name || "ဝန်ထမ်း";
  const parts = [];
  if (contact.chatId) {
    parts.push(`<a href="tg://user?id=${contact.chatId}">💬 ${escapeHtmlText_(displayName)} ထံ တိုက်ရိုက်စာပို့ရန်</a>`);
  }
  if (contact.phone) {
    parts.push(`📞 <code>${escapeHtmlText_(contact.phone)}</code>`);
  }
  return parts.length > 0 ? `\n📲 <b>ဆက်သွယ်ရန်:</b> ${parts.join(" | ")}` : "";
}

function sendToTierApprovers(requesterEmpId, requesterName, requesterRole, text, kb) {
  const routing = resolveApproversForRequester(requesterEmpId, requesterName, requesterRole);
  const contactLine = buildDirectContactHtmlLine_(requesterEmpId, requesterName);
  const routedText = `${text}\n🎯 <b>Approval Layer:</b> ${routing.positionLayer} ➔ ${routing.approverTierLabel}${contactLine}`;
  routing.chatIds.forEach(chatId => sendTelegramHTML(chatId, routedText, kb));
  return routing;
}

function sendToAllApprovers(text, kb) {
  const settings = getSettings();
  const empSheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
  const empRows = empSheet ? empSheet.getDataRange().getValues() : null;

  const tlIds = String(settings.APPROVER_TL_EMP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const tmIds = String(settings.APPROVER_TM_EMP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const hrIds = String(settings.APPROVER_HR_WATCH_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const allIds = Array.from(new Set([...tmIds, ...hrIds, ...tlIds]));

  const chatSet = new Set();
  if (settings.HR_ADMIN_CHAT_ID) chatSet.add(String(settings.HR_ADMIN_CHAT_ID).trim());
  allIds.forEach(id => {
    const c = getEmployeeContactInfo(id, empRows);
    if (c.chatId) chatSet.add(c.chatId);
  });
  chatSet.forEach(chatId => sendTelegramHTML(chatId, text, kb || null));
}

function getChatIdByEmpId(empId) {
  return getEmployeeContactInfo(empId).chatId;
}

function broadcastAttendanceToTelegramGroup_(data, kpiStatus, distanceMeters, locStatus, displayTime, updatedState, settings) {
  try {
    if (String(settings.GROUP_ATTENDANCE_BROADCAST || "YES").toUpperCase() === "NO") return;
    const groupChatId = String(settings.TELEGRAM_GROUP_CHAT_ID || "").trim();
    if (!groupChatId || !updatedState || !updatedState.system || !getBotToken()) return;

    const now = new Date();
    const todayStr = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
    const officeLat = parseFloat(settings.OFFICE_LAT) || 16.804683;
    const officeLng = parseFloat(settings.OFFICE_LNG) || 96.177149;
    const maxRadius = parseFloat(settings.MAX_RADIUS) || 500;

    const distText = formatDistanceText_(distanceMeters);
    const isInsideHq = distanceMeters <= maxRadius;
    const zoneTag = isInsideHq ? `🏢 ရုံးချုပ်အတွင်း (≤${maxRadius}m)` : `🗼 ပြင်ပ/ဆိုက်တိုက်ရိုက်`;
    const hasCoords = data && data.lat != null && data.lng != null && String(data.lat).trim() !== "" && String(data.lng).trim() !== "" && !isNaN(Number(data.lat)) && !isNaN(Number(data.lng));
    const actorMapUrl = hasCoords ? buildGoogleMapsMeasureUrl_(officeLat, officeLng, `${data.lat},${data.lng}`) : "";
    const mvpDailyAmt = parseFloat(settings.REWARD_MVP_PER_DAY) || 1000;
    const kpiEmoji = kpiStatus === "MVP" ? `👑 MVP EARLY (+${mvpDailyAmt.toLocaleString()} MMK)` : (kpiStatus === "On-Time" ? "🟢 On-Time" : "❗ Late");

    const checkedList = updatedState.system.today_checked_in_list || [];
    const leaveList = updatedState.system.today_leaves_list || [];
    const pendingList = updatedState.system.today_pending_list || [];

    const myToday = checkedList.find(x => x.id === String(data.emp_id).trim());
    const workedDuration = (data.type === "Check Out")
      ? computeWorkedDurationText_((myToday && myToday.time) || (updatedState.today_state && updatedState.today_state.time_in) || "", displayTime)
      : "";

    const safeActor = escapeHtmlText_(data.emp_name);
    const actionHeader = data.type === "Check In"
      ? `✅ <b>${safeActor}</b> ရုံးတက်စာရင်းသွင်းပြီး\n⏰ <b>အချိန်:</b> ${escapeHtmlText_(displayTime)} • <b>${kpiEmoji}</b>`
      : `🏁 <b>${safeActor}</b> ရုံးဆင်းစာရင်းသွင်းပြီး\n⏰ <b>အချိန်:</b> ${escapeHtmlText_(displayTime)}${workedDuration ? `\n⏱️ <b>အလုပ်ချိန် စုစုပေါင်း:</b> <code>${escapeHtmlText_(workedDuration)}</code>` : ""}`;

    let msg = `📡 <b>G.B.F. ယနေ့ ရုံးတက်အစဉ်လိုက်နှင့် တည်နေရာတိုင်းတာချက်</b>\n`;
    msg += `📅 <b>ရက်စွဲ:</b> ${todayStr}  |  👥 <b>ရုံးတက်:</b> ${checkedList.length}/${updatedState.system.total_emp} ဦး\n`;
    msg += `<blockquote>${actionHeader}\n`;
    msg += `📏 <b>ရုံးနှင့်အကွာအဝေး:</b> <code>${distText}</code> (${zoneTag})`;
    if (actorMapUrl) {
      msg += `\n🗺️ <a href="${actorMapUrl}">Map ပေါ်တွင် အကွာအဝေးတိုင်းတာမှု ကြည့်ရန် (HQ ➔ Check-In)</a>`;
    }
    msg += `</blockquote>\n`;

    msg += `🏆 <b>ယနေ့ ဝင်ရောက်ပြီးသူများ (Arrival Order):</b>\n`;
    if (checkedList.length === 0) {
      msg += `<i>မရှိသေးပါ</i>\n`;
    } else {
      checkedList.forEach((emp, idx) => {
        const rankIcon = idx === 0 ? "🥇 #1" : (idx === 1 ? "🥈 #2" : (idx === 2 ? "🥉 #3" : `🔹 #${idx + 1}`));
        const kBadge = emp.kpi === "MVP" ? "👑" : (emp.kpi === "On-Time" ? "🟢" : "❗");
        const zIcon = emp.loc_status === "HQ_Zone" ? "🏢" : "🗼";
        const mapAnchor = emp.map_url ? ` • <a href="${emp.map_url}">🗺️ Map</a>` : "";
        const durBadge = emp.out_time ? computeWorkedDurationText_(emp.time, emp.out_time) : "";
        const outTag = emp.out_time ? ` ➔ Out: ${escapeHtmlText_(emp.out_time)}${durBadge ? ` (${escapeHtmlText_(durBadge)})` : ""}` : "";
        msg += `${rankIcon} <b>${escapeHtmlText_(emp.name)}</b> — ${escapeHtmlText_(emp.time)}${outTag} (${kBadge} ${escapeHtmlText_(emp.kpi)} | ${zIcon} <code>${escapeHtmlText_(emp.distance_text)}</code>${mapAnchor})\n`;
      });
    }

    if (leaveList.length > 0) {
      msg += `\n🏖️ <b>ယနေ့ ခွင့်တိုင်ကြားထားသူများ (${leaveList.length} ဦး):</b>\n`;
      leaveList.forEach(lv => {
        const stIcon = lv.status === "Approved" ? "🟢 Approved" : "🟡 Pending";
        msg += `• <b>${escapeHtmlText_(lv.name)}</b> — ${escapeHtmlText_(lv.type)} (${stIcon})\n`;
      });
    }

    if (pendingList.length > 0) {
      const previewNames = pendingList.slice(0, 5).map(p => escapeHtmlText_(p.name)).join(", ");
      const moreCount = pendingList.length > 5 ? ` +${pendingList.length - 5} ဦး` : "";
      msg += `\n⏳ <b>မဝင်ရသေးသူ (${pendingList.length} ဦး):</b> ${previewNames}${moreCount}`;
    } else {
      msg += `\n🎉 <b>ဝန်ထမ်းအားလုံး ရုံးတက်/ခွင့် စာရင်းဝင်ပြီးဖြစ်ပါသည်။</b>`;
    }

    const kb = actorMapUrl
      ? { inline_keyboard: [[{ text: `🗺️ ${data.emp_name} ၏ အကွာအဝေး (${distText}) Map ကြည့်ရန်`, url: actorMapUrl }]] }
      : null;

    const mode = String(settings.GROUP_ATTENDANCE_MODE || "NEW_MESSAGE").toUpperCase();
    const propKey = `GRP_BOARD_MSG_${todayStr}`;
    const savedMsgId = PropertiesService.getScriptProperties().getProperty(propKey);

    if (mode === "LIVE_EDIT" && savedMsgId) {
      const editPayload = {
        chat_id: groupChatId,
        message_id: parseInt(savedMsgId, 10),
        text: msg,
        parse_mode: "HTML",
        disable_web_page_preview: true
      };
      if (kb) editPayload.reply_markup = kb;
      const editRes = UrlFetchApp.fetch(getTelegramAPI() + "editMessageText", {
        method: "post",
        contentType: "application/json",
        muteHttpExceptions: true,
        payload: JSON.stringify(editPayload)
      });
      if (editRes.getResponseCode() === 200) return;
    }

    const postPayload = {
      chat_id: groupChatId,
      text: msg,
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    if (kb) postPayload.reply_markup = kb;
    const sendRes = UrlFetchApp.fetch(getTelegramAPI() + "sendMessage", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify(postPayload)
    });
    if (sendRes.getResponseCode() === 200) {
      const parsed = JSON.parse(sendRes.getContentText());
      if (parsed && parsed.result && parsed.result.message_id) {
        PropertiesService.getScriptProperties().setProperty(propKey, String(parsed.result.message_id));
      }
    }
  } catch (e) {
    console.error("Group Attendance Broadcast Error:", e);
  }
}

// ==========================================
// 🎯 PRIVATE PORTAL KEYBOARDS, BOT COMMANDS & PERFORMER RECEIPTS
// ==========================================

/**
 * Resolves a verified private Telegram Chat ID for a performer from signed session or HR_Employees.
 */
function resolvePerformerChatId_(trustedChatId, empId) {
  const cleanTrusted = sanitizeTelegramChatId_(trustedChatId);
  if (cleanTrusted) return cleanTrusted;
  return sanitizeTelegramChatId_(getChatIdByEmpId(empId));
}

/**
 * Builds private-chat Inline Buttons (Signed Mini App + quick action callbacks/links).
 * Returns null if `chatId` is not a valid positive private Telegram user ID.
 */
function buildPrivatePortalKeyboard_(chatId, opts) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (!clean) return null;
  const o = opts || {};
  const webAppUrl = buildSignedMiniAppUrl_(clean);
  const rows = [];

  if (Array.isArray(o.extraTopRow) && o.extraTopRow.length > 0) {
    rows.push(o.extraTopRow);
  }

  if (Array.isArray(o.extraRows) && o.extraRows.length > 0) {
    o.extraRows.forEach(r => {
      if (Array.isArray(r) && r.length > 0) rows.push(r);
    });
  }

  rows.push([{ text: o.miniAppLabel || "🚀 Open GBF HR Mini App", web_app: { url: webAppUrl } }]);

  if (o.includeFullQuickMenu) {
    rows.push([
      { text: "📍 Attendance", callback_data: "CMD_CHECKIN" },
      { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }
    ]);
    rows.push([
      { text: "💳 Wallet (50%)", callback_data: "CMD_WALLET" },
      { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" }
    ]);
    rows.push([{ text: "🤖 Ask HR-AI Guide", callback_data: "CMD_ASKAI" }]);
  } else if (Array.isArray(o.rowButtons) && o.rowButtons.length > 0) {
    rows.push(o.rowButtons);
  }

  return { inline_keyboard: rows };
}

function buildDecidedRequestSummaryLine_(sheet, type, row) {
  try {
    if (type === "LV") {
      const vals = sheet.getRange(row, 1, 1, 10).getDisplayValues()[0];
      return `\n🔖 <b>အမျိုးအစား:</b> ${escapeHtmlText_(vals[3] || "-")} (${escapeHtmlText_(vals[6] || "1")} ရက်)\n📆 <b>ရက်စွဲ:</b> ${escapeHtmlText_(vals[4] || "")} မှ ${escapeHtmlText_(vals[5] || "")}`;
    }
    const vals = sheet.getRange(row, 1, 1, 8).getDisplayValues()[0];
    const amt = parseFloat(String(vals[3] || "0").replace(/,/g, "")) || 0;
    return `\n💵 <b>ပမာဏ:</b> ${amt.toLocaleString()} MMK\n📅 <b>ရက်စွဲ:</b> ${escapeHtmlText_(vals[4] || "")}`;
  } catch (e) {
    return "";
  }
}

function buildUnlinkedAccountReply_(chatId) {
  const msg = `🔗 <b>Telegram ID မချိတ်ဆက်ရသေးပါ</b>\n\n` +
    `သင်၏ ကိုယ်ပိုင် HR အချက်အလက်များကို Chat ထဲတွင် ကြည့်ရှုနိုင်ရန် အောက်ပါနည်းလမ်း (၁) ခုခုဖြင့် ချိတ်ဆက်ပါ-\n` +
    `1️⃣ Chat ထဲတွင် <code>/link 1234</code> (သင်၏ Official PIN) ရိုက်ပို့ပါ\n` +
    `2️⃣ (သို့) အောက်ပါ <b>Open GBF HR Mini App</b> မှ PIN ဖြင့် တစ်ကြိမ် ဝင်ရောက်ပါ (Auto-Link ဖြစ်ပါမည်)\n\n` +
    `— <b>GBF HR AI Management Team</b>`;
  return {
    text: msg,
    reply_markup: buildPrivatePortalKeyboard_(chatId, {
      rowButtons: [{ text: "🤖 Ask HR-AI Guide", callback_data: "CMD_ASKAI" }]
    })
  };
}

/**
 * Generates real-time interactive summary cards for `/checkin`, `/mykpi`, `/wallet`, `/payslip`, `/askai` and `CMD_*` buttons.
 */
function buildBotPortalCard_(actionKey, chatId) {
  const clean = sanitizeTelegramChatId_(chatId);
  if (actionKey === "ASKAI") {
    const askText = `🤖 <b>GBF HR-AI Assistant</b>\n` +
      `<blockquote>မင်္ဂလာပါ! သိရှိလိုသော HR အချက်အလက်များကို အောက်ပါခလုတ်များမှ တစ်ချက်နှိပ်၍ မေးမြန်းနိုင်သလို စာရိုက်၍လည်း မေးနိုင်ပါသည်။</blockquote>\n` +
      `👇 <i>အောက်ပါ မေးခွန်းခလုတ်များမှ ရွေးချယ်နှိပ်ကြည့်ပါ-</i>`;
    return {
      text: askText,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 Open GBF HR Mini App",
        extraRows: [
          [
            { text: "💰 ဒီလ ဘယ်လောက်ရပြီလဲ", callback_data: "CMD_ASKQ_EARN" },
            { text: "💳 လစာကြိုထုတ်ခွင့် လက်ကျန်", callback_data: "CMD_WALLET" }
          ],
          [
            { text: "⚠️ နောက်ကျကြေး စည်းကမ်း", callback_data: "CMD_ASKQ_LATE" },
            { text: "🏆 ကျွန်တော့် KPI Rank", callback_data: "CMD_MYKPI" }
          ]
        ]
      })
    };
  }

  if (actionKey === "ASKQ_LATE") {
    const settings = getSettings();
    const mvpAmt = (parseFloat(settings.REWARD_MVP_PER_DAY) || 1000).toLocaleString();
    const attAmt = (parseFloat(settings.REWARD_ATTENDANCE_BONUS) || 50000).toLocaleString();
    const streakAmt = (parseFloat(settings.REWARD_WEEKLY_MVP_BONUS) || 10000).toLocaleString();
    const text = `🤖 <b>GBF HR-AI Assistant</b>\n` +
      `📌 <b>နောက်ကျကြေး၊ AFK နှင့် ဆုကြေး စည်းမျဉ်းများ</b>\n` +
      `<blockquote>🌟 <b>MVP Early (≤ ${escapeHtmlText_(settings.TIME_EARLY || "09:00")} AM):</b> +${mvpAmt} MMK/ရက်\n` +
      `🟢 <b>On-Time (≤ ${escapeHtmlText_(settings.TIME_LATE || "09:15")} AM):</b> အချိန်မှန် (No Penalty)\n` +
      `❗ <b>Late (&gt; ${escapeHtmlText_(settings.TIME_LATE || "09:15")} AM):</b> တစ်လ ၃ ကြိမ် Grace ပေးပြီး <b>၄ ကြိမ်မြောက်မှစ၍ -2,000 MMK/ကြိမ်</b>\n` +
      `🛡️ <b>Zero-AFK Bonus (0 AFK):</b> +${attAmt} MMK/လ (Weekly MVP Streak: +${streakAmt} MMK)\n` +
      `🚩 <b>3+ AFK Rule:</b> ခွင့်မဲ့ ၃ ကြိမ်ပြည့်ပါက လစဉ် Bonus အားလုံး ပျက်ပြယ်ပါမည်</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        rowButtons: [
          { text: "💰 ဒီလ ရရှိငွေ", callback_data: "CMD_ASKQ_EARN" },
          { text: "🏆 KPI Rank", callback_data: "CMD_MYKPI" }
        ]
      })
    };
  }

  const emp = findEmployeeByChatId_(clean);
  if (!emp) return buildUnlinkedAccountReply_(clean);

  const currentMonth = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM");

  if (actionKey === "PAYSLIP") {
    const slipRes = getEmployeePayslipData(emp.empId, currentMonth);
    if (!slipRes || !slipRes.success || !slipRes.payslip) {
      return {
        text: `🧾 <b>Digital Payslip (${currentMonth})</b>\n👤 ${escapeHtmlText_(emp.name)} (<code>${escapeHtmlText_(emp.empId)}</code>)\n\n⚠️ ယခုလ Payslip အချက်အလက် မတွေ့ရှိသေးပါ။`,
        reply_markup: buildPrivatePortalKeyboard_(clean)
      };
    }
    const p = slipRes.payslip;
    const text = `🧾 <b>GBF Digital Payslip (${escapeHtmlText_(p.month)})</b>\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(p.name)} (<code>${escapeHtmlText_(emp.empId)}</code>)\n` +
      `🏷️ <b>ရာထူး:</b> ${escapeHtmlText_(p.role)} | 📌 <b>Status:</b> ${escapeHtmlText_(p.status)}\n\n` +
      `💵 <b>Base Salary:</b> <code>${Number(p.base_salary || 0).toLocaleString()} MMK</code>\n` +
      `🛡️ <b>Attendance Bonus (0 AFK):</b> <code>+${Number(p.attendance_bonus || 0).toLocaleString()} MMK</code>\n` +
      `🌟 <b>Daily MVP &amp; Weekly Streak:</b> <code>+${Number(p.mvp_streak_bonus || 0).toLocaleString()} MMK</code>\n` +
      `🏆 <b>MLBB Rank Bonus:</b> <code>+${Number(p.rank_bonus || 0).toLocaleString()} MMK</code>\n` +
      `💳 <b>Advance Deduction:</b> <code>-${Number(p.advance_deduction || 0).toLocaleString()} MMK</code>\n` +
      `⚠️ <b>Absence &amp; Late Penalty:</b> <code>-${(Number(p.absence_deduction || 0) + Number(p.late_penalty || 0)).toLocaleString()} MMK</code></blockquote>\n` +
      `💰 <b>NET PAYABLE:</b> <code>${Number(p.net_payable || 0).toLocaleString()} MMK</code>`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 PDF Print / Drive Save in App",
        rowButtons: [
          { text: "💳 Wallet (50%)", callback_data: "CMD_WALLET" },
          { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }
        ]
      })
    };
  }

  const state = getFullSystemState(emp.empId, emp.name, null, currentMonth);
  if (!state) return buildUnlinkedAccountReply_(clean);

  if (actionKey === "ASKQ_EARN") {
    const calc = computeEmployeeKpiAndPayroll_(state.totals, state.wallet.base_salary, state.reward_config, state.weekly_streak, state.user.strike_count);
    const penalties = Number(calc.latePenalty || 0) + Number(calc.absenceDeduction || 0);
    const netExclAdvance = Math.max(0, Number(state.wallet.base_salary || 0) + Number(calc.totalBonuses || 0) - penalties - Number(calc.advanceDeduction || 0));
    const text = `🤖 <b>GBF HR-AI Assistant</b>\n` +
      `မင်္ဂလာပါ <b>${escapeHtmlText_(state.user.name)}</b> (<code>${escapeHtmlText_(state.user.role)}</code>) ရှင့်/ခင်ဗျာ။\n\n` +
      `<blockquote>📅 <b>ရုံးတက်ရက် (Present):</b> ${state.totals.present} ရက်\n` +
      `🌟 <b>MVP &amp; Streak Bonus:</b> +${Number(calc.mvpAndStreakBonus || 0).toLocaleString()} ကျပ်\n` +
      `🛡️ <b>Zero-AFK Bonus:</b> ${Number(calc.attendanceBonus || 0).toLocaleString()} ကျပ် (AFK ${state.totals.unexcused_absent} ရက်)\n` +
      `🏆 <b>Rank Bonus (${escapeHtmlText_(calc.rank)}):</b> +${Number(calc.rankBonus || 0).toLocaleString()} ကျပ်\n` +
      `❗ <b>နောက်ကျ/AFK ဖြတ်ငွေ:</b> -${penalties.toLocaleString()} ကျပ်\n` +
      `💳 <b>Advance နုတ်ငွေ:</b> -${Number(calc.advanceDeduction || 0).toLocaleString()} ကျပ်\n` +
      `💰 <b>ခန့်မှန်းရရှိငွေ (Net):</b> <code>${netExclAdvance.toLocaleString()} MMK</code></blockquote>\n` +
      `<i>* Grace ၃ ကြိမ်ပေးပြီး ၄ ကြိမ်မြောက် နောက်ကျမှစ၍ 2,000 Ks ဖြတ်တောက်ပါသည်။</i>`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        rowButtons: [
          { text: "🧾 Full Payslip", callback_data: "CMD_PAYSLIP" },
          { text: "💳 50% Wallet", callback_data: "CMD_WALLET" }
        ]
      })
    };
  }

  if (actionKey === "CHECKIN") {
    const todayStr = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
    const myToday = (state.system.today_checked_in_list || []).find(item => item.id === emp.empId);
    let statusText = "⏳ ယနေ့ Check-In မဝင်ရသေးပါ";
    if (state.today_state.status === "CHECKED_IN") {
      statusText = `🟢 Checked-In (${escapeHtmlText_(state.today_state.time_in)})`;
    } else if (state.today_state.status === "CHECKED_OUT") {
      statusText = `🏁 Checked-Out (In: ${escapeHtmlText_(state.today_state.time_in)} • Out: ${escapeHtmlText_(state.today_state.time_out)})`;
    }
    const gpsLine = myToday
      ? `\n📏 <b>အကွာအဝေး:</b> <code>${escapeHtmlText_(myToday.distance_text)}</code> (${myToday.loc_status === "HQ_Zone" ? "🏢 HQ Zone" : "🗼 Field Site"}) • <b>Order:</b> #${myToday.order} (${escapeHtmlText_(myToday.kpi)})`
      : "";
    const text = `📍 <b>Smart Attendance (${todayStr})</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(state.user.name)} (<code>${escapeHtmlText_(state.user.id)}</code>)\n` +
      `📌 <b>အခြေအနေ:</b> ${statusText}${gpsLine}\n` +
      `👥 <b>ယနေ့ ရုံးတက်သူ:</b> ${state.system.today_active} / ${state.system.total_emp} ဦး\n\n` +
      `👇 Check-In / Check-Out (GPS 500m) ပြုလုပ်ရန် Mini App ကို ဖွင့်ပါ-`;
    const extraTopRow = (myToday && myToday.map_url)
      ? [{ text: "🗺️ Today Check-In Map", url: myToday.map_url }]
      : null;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 Open Check-In / Out in App",
        extraTopRow: extraTopRow,
        rowButtons: [
          { text: "🏆 My KPI", callback_data: "CMD_MYKPI" },
          { text: "💳 Wallet (50%)", callback_data: "CMD_WALLET" }
        ]
      })
    };
  }

  if (actionKey === "WALLET") {
    const w = state.wallet;
    let histText = "";
    const recentAdv = (state.history.advance || []).slice(0, 3);
    if (recentAdv.length > 0) {
      histText = "\n\n📋 <b>မကြာသေးမီ တောင်းခံမှုများ:</b>\n" +
        recentAdv.map(a => `• ${escapeHtmlText_(a.date)}: <code>${escapeHtmlText_(a.amount)} MMK</code> (${escapeHtmlText_(a.status)})`).join("\n");
    }
    const text = `💳 <b>50% Salary Advance Wallet (${currentMonth})</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(state.user.name)} (<code>${escapeHtmlText_(state.user.id)}</code>)\n` +
      `💵 <b>Base Salary:</b> <code>${Number(w.base_salary || 0).toLocaleString()} MMK</code>\n` +
      `🏦 <b>50% Max Limit:</b> <code>${Number(w.max_advance_limit || 0).toLocaleString()} MMK</code>\n` +
      `✅ <b>Approved Used:</b> <code>${Number(w.used_advance || 0).toLocaleString()} MMK</code>\n` +
      `⏳ <b>Pending:</b> <code>${Number(w.pending_advance || 0).toLocaleString()} MMK</code>\n` +
      `🟢 <b>ထုတ်ယူနိုင်သည့် လက်ကျန်:</b> <code>${Number(w.remaining_advance || 0).toLocaleString()} MMK</code>${histText}`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 Request Advance in Mini App",
        rowButtons: [
          { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" },
          { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }
        ]
      })
    };
  }

  // Default: MYKPI
  const calc = computeEmployeeKpiAndPayroll_(state.totals, state.wallet.base_salary, state.reward_config, state.weekly_streak, state.user.strike_count);
  const stars = "⭐".repeat(Math.max(1, calc.stars || 1));
  const forfeitNote = calc.monthlyBonusesForfeited ? "\n🚩 <i>3+ AFK ဖြစ်ထားသဖြင့် လစဉ် Bonus များ ပျက်ပြယ်ထားပါသည်။</i>" : "";
  const text = `🏆 <b>MLBB Gamified KPI &amp; Season Rank (${currentMonth})</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Player:</b> ${escapeHtmlText_(state.user.name)} (<code>${escapeHtmlText_(state.user.id)}</code> • ${escapeHtmlText_(state.user.role)})\n` +
    `🎖️ <b>Rank:</b> <b>${escapeHtmlText_(calc.rank)}</b> ${stars} (<b>${calc.kpiScore}% KPI</b> • <b>${calc.winRate}% Win Rate</b>)\n` +
    `📊 <b>Present:</b> ${state.totals.present}d | 🌟 <b>MVP:</b> ${state.totals.mvp} | 🟢 <b>On-Time:</b> ${state.totals.ontime} | ❗ <b>Late:</b> ${state.totals.late} | 🚩 <b>AFK:</b> ${state.totals.unexcused_absent}\n` +
    `🔥 <b>Weekly MVP Streak:</b> ${state.weekly_streak.currentWeekMvp}/${state.reward_config.weekly_mvp_target} (Unlocked Weeks: ${state.weekly_streak.achievedWeeks})\n` +
    `🎁 <b>Est. Total Bonuses:</b> <code>${Number(calc.totalBonuses || 0).toLocaleString()} MMK</code> | ⚡ <b>Strike:</b> ${state.user.strike_count}/3${forfeitNote}`;
  return {
    text: text,
    reply_markup: buildPrivatePortalKeyboard_(clean, {
      miniAppLabel: "🚀 View Full Radar & Quests",
      rowButtons: [
        { text: "📍 Attendance", callback_data: "CMD_CHECKIN" },
        { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" }
      ]
    })
  };
}

function handlePortalMenuCallback_(cb) {
  const map = {
    CMD_CHECKIN: { key: "CHECKIN", toast: "📍 Loading Attendance..." },
    CMD_MYKPI: { key: "MYKPI", toast: "🏆 Loading MLBB KPI..." },
    CMD_WALLET: { key: "WALLET", toast: "💳 Loading 50% Wallet..." },
    CMD_PAYSLIP: { key: "PAYSLIP", toast: "🧾 Loading Payslip..." },
    CMD_ASKAI: { key: "ASKAI", toast: "🤖 GBF HR-AI Guide" },
    CMD_ASKQ_EARN: { key: "ASKQ_EARN", toast: "💰 တွက်ချက်နေပါသည်..." },
    CMD_ASKQ_LATE: { key: "ASKQ_LATE", toast: "⚠️ စည်းမျဉ်းများ..." }
  };
  const spec = map[String(cb.data || "")];
  if (!spec) {
    answerCallbackSafe_(cb.id, "⚠️ Unknown Menu Action", false);
    return;
  }
  const chatId = cb.message && cb.message.chat ? cb.message.chat.id : (cb.from ? cb.from.id : "");
  const isPrivate = cb.message && cb.message.chat ? cb.message.chat.type === "private" : Boolean(sanitizeTelegramChatId_(chatId));
  answerCallbackSafe_(cb.id, spec.toast, false);
  if (!isPrivate) {
    sendTelegramHTML(chatId, `🔐 ကိုယ်ပိုင် HR အချက်အလက်များကို Bot Private Chat တွင်သာ ကြည့်ရှုနိုင်ပါသည်။`);
    return;
  }
  const card = buildBotPortalCard_(spec.key, chatId);
  sendTelegramHTML(chatId, card.text, card.reply_markup);
}

/**
 * 🧭 Unified Telegram "/" Command Router supporting `/cmd` and `/cmd@BotName` + Private Menu actions.
 */
function handleBotCommand_(chatId, isPrivate, firstName, rawText) {
  const match = String(rawText || "").trim().match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return false;
  const cmd = match[1].toLowerCase();
  const arg = String(match[2] || "").trim();

  if (cmd === "start" || cmd === "app") {
    if (!isPrivate) {
      sendTelegramHTML(chatId, `🏢 <b>G.B.F. Enterprise HR &amp; AI Management</b>\n\nMini App ကို ဖွင့်ရန် Bot ၏ Private Chat ထဲတွင် <code>/start</code> နှိပ်ပါ။`);
      return true;
    }
    const webAppUrl = buildSignedMiniAppUrl_(chatId);
    setPersonalMenuButton_(chatId, webAppUrl);
    const emp = findEmployeeByChatId_(chatId);
    const linkLine = emp
      ? `✅ <b>Linked Account:</b> ${escapeHtmlText_(emp.name)} (<code>${escapeHtmlText_(emp.empId)}</code> • ${escapeHtmlText_(emp.role)})`
      : `🔑 ပထမဆုံးအကြိမ် ဝင်ရောက်ပါက Official PIN (သို့) <code>/link PIN</code> ဖြင့် Telegram ID ချိတ်ဆက်နိုင်ပါသည်။`;
    const welcomeMsg = `🏢 <b>G.B.F. Enterprise HR &amp; AI Management</b>\n\nမင်္ဂလာပါ ${escapeHtmlText_(firstName)} ခင်ဗျာ။\nအောက်ပါ Mini App ခလုတ်နှင့် Quick Menu များမှတစ်ဆင့် Attendance, Wallet (50% Limit), MLBB KPI Rewards နှင့် Digital Payslip များကို တိုက်ရိုက် ကြည့်ရှုအသုံးပြုနိုင်ပါသည်။\n\n${linkLine}\n\n— <b>GBF HR AI Management Team</b>`;
    sendTelegramHTML(chatId, welcomeMsg, buildPrivatePortalKeyboard_(chatId, { includeFullQuickMenu: true }));
    return true;
  }

  if (cmd === "link") {
    if (!isPrivate) {
      sendTelegramHTML(chatId, "🔐 လုံခြုံရေးအရ <code>/link PIN</code> ကို Bot နှင့် Private Chat တွင်သာ ပေးပို့ပါ။");
      return true;
    }
    const linkRes = linkTelegramChatByPin_(chatId, arg);
    if (linkRes.ok) {
      setPersonalMenuButton_(chatId, buildSignedMiniAppUrl_(chatId));
      sendTelegramHTML(chatId, linkRes.message, buildPrivatePortalKeyboard_(chatId, { includeFullQuickMenu: true }));
    } else {
      sendTelegramHTML(chatId, linkRes.message);
    }
    return true;
  }

  if (cmd === "id") {
    const emp = isPrivate ? findEmployeeByChatId_(chatId) : null;
    const empLine = emp
      ? `\n👤 <b>Linked Employee:</b> ${escapeHtmlText_(emp.name)} (<code>${escapeHtmlText_(emp.empId)}</code> • ${escapeHtmlText_(emp.role)}) ✅`
      : (isPrivate ? `\n🔗 <b>Link Status:</b> မချိတ်ဆက်ရသေးပါ (<code>/link PIN</code> ဖြင့် ချိတ်ဆက်နိုင်ပါသည်)` : "");
    sendTelegramHTML(
      chatId,
      `🆔 သင်၏ Telegram Chat ID မှာ: <code>${chatId}</code> ဖြစ်ပါသည်။${empLine}\n\n— <b>GBF HR AI Management Team</b>`,
      isPrivate ? buildPrivatePortalKeyboard_(chatId, {
        rowButtons: [{ text: "📍 Attendance", callback_data: "CMD_CHECKIN" }, { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }]
      }) : null
    );
    return true;
  }

  const portalCmdMap = { checkin: "CHECKIN", mykpi: "MYKPI", wallet: "WALLET", payslip: "PAYSLIP" };
  if (portalCmdMap[cmd]) {
    if (!isPrivate) {
      sendTelegramHTML(chatId, `🔐 ကိုယ်ပိုင် HR အချက်အလက်များ ကြည့်ရှုရန် Bot ၏ Private Chat ထဲတွင် <code>/${cmd}</code> ကို အသုံးပြုပါ။`);
      return true;
    }
    const card = buildBotPortalCard_(portalCmdMap[cmd], chatId);
    sendTelegramHTML(chatId, card.text, card.reply_markup);
    return true;
  }

  if (cmd === "askai") {
    if (!isPrivate) {
      sendTelegramHTML(chatId, `🤖 HR-AI နှင့် မေးမြန်းဆွေးနွေးရန် Bot ၏ Private Chat ထဲတွင် စာရိုက်ပို့ပါ။`);
      return true;
    }
    if (arg.length > 0) {
      handleConversationalAIMessage(chatId, firstName, arg);
    } else {
      const guide = buildBotPortalCard_("ASKAI", chatId);
      sendTelegramHTML(chatId, guide.text, guide.reply_markup);
    }
    return true;
  }

  if (isPrivate) {
    const helpMsg = `ℹ️ <b>အသုံးပြုနိုင်သော Command များ:</b>\n` +
      `• <code>/start</code> — Mini App &amp; Menu ဖွင့်ရန်\n` +
      `• <code>/checkin</code> — ယနေ့ ရုံးတက်အခြေအနေ\n` +
      `• <code>/mykpi</code> — MLBB Rank &amp; KPI ကြည့်ရန်\n` +
      `• <code>/wallet</code> — 50% Advance Limit လက်ကျန်\n` +
      `• <code>/payslip</code> — ယခုလ Digital Payslip\n` +
      `• <code>/askai မေးခွန်း</code> — HR-AI မေးမြန်းရန်\n` +
      `• <code>/link PIN</code> — Telegram ID ချိတ်ရန်\n` +
      `• <code>/id</code> — Chat ID စစ်ဆေးရန်`;
    sendTelegramHTML(chatId, helpMsg, buildPrivatePortalKeyboard_(chatId, { includeFullQuickMenu: true }));
  }
  return true;
}

// ==========================================
// 📩 PERFORMER CONFIRMATION RECEIPTS (FOR EVERY WEB APP ACTION)
// ==========================================

function notifyPerformerAttendance_(data, kpiStatus, distanceMeters, locStatus, displayTime, updatedState, settings, trustedChatId) {
  try {
    const chatId = resolvePerformerChatId_(trustedChatId, data.emp_id);
    if (!chatId || !getBotToken()) return;
    const officeLat = parseFloat(settings.OFFICE_LAT) || 16.804683;
    const officeLng = parseFloat(settings.OFFICE_LNG) || 96.177149;
    const maxRadius = parseFloat(settings.MAX_RADIUS) || 500;
    const mvpDailyAmt = parseFloat(settings.REWARD_MVP_PER_DAY) || 1000;
    const distText = formatDistanceText_(distanceMeters);
    const zoneTag = distanceMeters <= maxRadius ? `🏢 HQ Zone (≤${maxRadius}m)` : `🗼 Field Site`;
    const hasCoords = data && data.lat != null && data.lng != null && String(data.lat).trim() !== "" && String(data.lng).trim() !== "" && !isNaN(Number(data.lat)) && !isNaN(Number(data.lng));
    const actorMapUrl = hasCoords ? buildGoogleMapsMeasureUrl_(officeLat, officeLng, `${data.lat},${data.lng}`) : "";
    const myToday = (updatedState && updatedState.system && Array.isArray(updatedState.system.today_checked_in_list))
      ? updatedState.system.today_checked_in_list.find(x => x.id === String(data.emp_id).trim())
      : null;
    const orderTag = myToday ? ` (#${myToday.order})` : "";
    const kpiBadge = kpiStatus === "MVP" ? `👑 MVP EARLY (+${mvpDailyAmt.toLocaleString()} MMK)` : (kpiStatus === "On-Time" ? "🟢 On-Time" : "❗ Late");
    const isOut = data.type === "Check Out";
    const title = isOut ? "🏁 <b>ရုံးဆင်း မှတ်တမ်းတင်ပြီးပါပြီ (Check-Out)</b>" : "✅ <b>ရုံးတက် မှတ်တမ်းတင်ပြီးပါပြီ (Check-In)</b>";
    const timeInRef = (myToday && myToday.time) || (updatedState && updatedState.today_state && updatedState.today_state.time_in) || "";
    const workedDuration = isOut ? computeWorkedDurationText_(timeInRef, displayTime) : "";
    const durationLine = workedDuration ? `\n⏱️ <b>စုစုပေါင်း အလုပ်ချိန်:</b> <code>${escapeHtmlText_(workedDuration)}</code>` : "";
    const bonusNote = (!isOut && kpiStatus === "MVP") ? `\n🎁 <b>Bonus:</b> စံပြဝန်ထမ်း (+${mvpDailyAmt.toLocaleString()} MMK) စာရင်းဝင်ပါပြီ!` : "";

    const msg = `${title}\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(data.emp_name)} (<code>${escapeHtmlText_(data.emp_id)}</code>)\n` +
      `⏰ <b>အချိန်:</b> ${escapeHtmlText_(displayTime)}${orderTag}\n` +
      `🏷️ <b>Status:</b> ${kpiBadge}${durationLine}\n` +
      `📏 <b>တည်နေရာ:</b> <code>${escapeHtmlText_(distText)}</code> (${zoneTag})${bonusNote}</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;

    const extraTopRow = actorMapUrl ? [{ text: `🗺️ ကိုယ်ပိုင် Check-In Map (${distText})`, url: actorMapUrl }] : null;
    const kb = buildPrivatePortalKeyboard_(chatId, {
      extraTopRow: extraTopRow,
      rowButtons: [
        { text: "🏆 My KPI", callback_data: "CMD_MYKPI" },
        { text: "📍 Today Status", callback_data: "CMD_CHECKIN" }
      ]
    });
    sendTelegramHTML(chatId, msg, kb);
  } catch (e) {
    console.error("Performer Attendance Notify Error:", e);
  }
}

function notifyPerformerLeaveSubmitted_(data, leaveType, fStart, fEnd, aiRiskAdvice, routing, trustedChatId) {
  try {
    const chatId = resolvePerformerChatId_(trustedChatId, data.emp_id);
    if (!chatId || !getBotToken()) return;
    const tier = routing && routing.approverTierLabel ? routing.approverTierLabel : "Approvers";
    const msg = `📝 <b>ခွင့်တိုင်ကြားလွှာ ပေးပို့ပြီးပါပြီ</b>  [<code>⏳ PENDING</code>]\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(data.emp_name)} (<code>${escapeHtmlText_(data.emp_id)}</code>)\n` +
      `🔖 <b>အမျိုးအစား:</b> ${escapeHtmlText_(leaveType)} (${escapeHtmlText_(data.total_days)} ရက်)\n` +
      `📆 <b>ရက်စွဲ:</b> ${escapeHtmlText_(fStart)} မှ ${escapeHtmlText_(fEnd)} ထိ\n` +
      `🎯 <b>ပေးပို့ထားသူ:</b> ${escapeHtmlText_(tier)}\n` +
      `🤖 <b>AI Risk Advisor:</b> ${formatAiToTelegramHtml(aiRiskAdvice)}</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;
    const kb = buildPrivatePortalKeyboard_(chatId, {
      rowButtons: [
        { text: "📍 Attendance", callback_data: "CMD_CHECKIN" },
        { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }
      ]
    });
    sendTelegramHTML(chatId, msg, kb);
  } catch (e) {
    console.error("Performer Leave Notify Error:", e);
  }
}

function notifyPerformerAdvanceSubmitted_(data, reqAmt, remainingAfter, aiRiskAdvice, routing, trustedChatId) {
  try {
    const chatId = resolvePerformerChatId_(trustedChatId, data.emp_id);
    if (!chatId || !getBotToken()) return;
    const tier = routing && routing.approverTierLabel ? routing.approverTierLabel : "Approvers";
    const msg = `💸 <b>လစာကြိုတင်တောင်းခံလွှာ ပေးပို့ပြီးပါပြီ</b>  [<code>⏳ PENDING</code>]\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(data.emp_name)} (<code>${escapeHtmlText_(data.emp_id)}</code>)\n` +
      `💵 <b>တောင်းခံငွေ:</b> <code>${Number(reqAmt || 0).toLocaleString()} MMK</code>\n` +
      `📊 <b>50% Limit လက်ကျန်:</b> <code>${Number(remainingAfter || 0).toLocaleString()} MMK</code>\n` +
      `🎯 <b>ပေးပို့ထားသူ:</b> ${escapeHtmlText_(tier)}\n` +
      `🤖 <b>AI Limit Check:</b> ${formatAiToTelegramHtml(aiRiskAdvice)}</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;
    const kb = buildPrivatePortalKeyboard_(chatId, {
      rowButtons: [
        { text: "💳 My Wallet", callback_data: "CMD_WALLET" },
        { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" }
      ]
    });
    sendTelegramHTML(chatId, msg, kb);
  } catch (e) {
    console.error("Performer Advance Notify Error:", e);
  }
}

function notifyPerformerVoiceSubmitted_(data, ticketId, aiAnalysis, isAnon, trustedChatId) {
  try {
    // Never look up emp_id when submitted anonymously; only reply privately to verified active Mini App session if present.
    const chatId = isAnon ? sanitizeTelegramChatId_(trustedChatId) : resolvePerformerChatId_(trustedChatId, data.emp_id);
    if (!chatId || !getBotToken()) return;
    const anonNote = isAnon ? `\n🔒 <i>(Anonymous Mode: သင်၏ အမည်နှင့် ID ကို HR ထံ မဖော်ပြထားပါ)</i>` : "";
    const msg = `💬 <b>HR-AI Voice တင်ပြချက် မှတ်တမ်းတင်ပြီးပါပြီ</b>\n` +
      `<blockquote>🎫 <b>Ticket:</b> <code>${escapeHtmlText_(ticketId)}</code> (${escapeHtmlText_(aiAnalysis.sentiment)})\n` +
      `📂 <b>ကဏ္ဍ:</b> ${escapeHtmlText_(data.category)}\n` +
      `🤖 <b>HR-AI Response:</b> ${formatAiToTelegramHtml(aiAnalysis.reply)}${anonNote}</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;
    const kb = buildPrivatePortalKeyboard_(chatId, {
      rowButtons: [{ text: "🤖 Ask HR-AI Guide", callback_data: "CMD_ASKAI" }]
    });
    sendTelegramHTML(chatId, msg, kb);
  } catch (e) {
    console.error("Performer Voice Notify Error:", e);
  }
}

/**
 * 🗼 Formats a consolidated Daily Team Rollout card (Alpha / Beta / Charlie) from `Daily_Teams`.
 */
function buildConsolidatedTeamsGroupMessage_(teamSheet, fDate, fallbackTeamName, fallbackProject, fallbackMembers) {
  const byTeam = {};
  const teamOrder = [];
  const rows = teamSheet ? getLastNRows(teamSheet, 60, 5) : [];

  rows.forEach(r => {
    if (normalizeDateStr(r[1]) !== fDate) return;
    const tName = String(r[2] || "").trim();
    const proj = String(r[3] || "").trim();
    const mStr = String(r[4] || "").trim();
    if (!tName) return;
    if (!byTeam[tName]) teamOrder.push(tName);
    byTeam[tName] = { project: proj, membersStr: mStr };
  });

  if (teamOrder.length === 0 && fallbackTeamName) {
    byTeam[fallbackTeamName] = {
      project: fallbackProject || "",
      membersStr: (fallbackMembers || []).map(m => `${m.name} (${m.role})`).join(", ")
    };
    teamOrder.push(fallbackTeamName);
  }

  let body = "";
  teamOrder.forEach(tName => {
    const info = byTeam[tName];
    const parsed = String(info.membersStr || "").split(",").map(s => s.trim()).filter(Boolean);
    const leads = [];
    const techs = [];
    parsed.forEach(entry => {
      if (/leader|lead|tl/i.test(entry)) leads.push(entry.replace(/\s*\([^)]*\)$/, "").trim());
      else techs.push(entry.replace(/\s*\([^)]*\)$/, "").trim());
    });
    body += `⚡ <b>${escapeHtmlText_(tName)}</b> (${escapeHtmlText_(info.project)}) [<code>Active</code>]\n`;
    if (leads.length > 0) body += `   🌟 <b>Lead:</b> ${leads.map(escapeHtmlText_).join(", ")}\n`;
    if (techs.length > 0) body += `   🔧 <b>Tech:</b> ${techs.map(escapeHtmlText_).join(", ")}\n`;
    body += `\n`;
  });

  return `🗼 <b>ယနေ့ Field Team တာဝန်ခွဲဝေမှု (${escapeHtmlText_(fDate)})</b>\n` +
    `<blockquote>${body.trim()}</blockquote>\n— <b>GBF Field Operations Control</b>`;
}

function notifyPerformerAndMembersTeam_(data, members, fDate, trustedChatId) {
  try {
    if (!getBotToken()) return;
    const targetChats = new Set();
    const creatorChat = resolvePerformerChatId_(trustedChatId, data.emp_id);
    if (creatorChat) targetChats.add(creatorChat);

    const empSheet = getGBFSpreadsheet_().getSheetByName("HR_Employees");
    if (empSheet && empSheet.getLastRow() > 1) {
      const rows = empSheet.getDataRange().getValues();
      const nameToChat = {};
      for (let i = 1; i < rows.length; i++) {
        const cId = sanitizeTelegramChatId_(rows[i][0]);
        const eName = String(rows[i][2] || "").trim().toLowerCase();
        const st = String(rows[i][7] || "Active").trim().toLowerCase();
        if (cId && eName && st !== "inactive") nameToChat[eName] = cId;
      }
      (members || []).forEach(m => {
        const key = String(m.name || "").trim().toLowerCase();
        if (key && nameToChat[key]) targetChats.add(nameToChat[key]);
      });
    }

    if (targetChats.size === 0) return;
    const leads = [];
    const techs = [];
    (members || []).forEach(m => {
      if (String(m.role || "").toLowerCase().includes("leader")) leads.push(`${escapeHtmlText_(m.name)} (${escapeHtmlText_(m.role)})`);
      else techs.push(`${escapeHtmlText_(m.name)} (${escapeHtmlText_(m.role)})`);
    });
    const memberBlock = (leads.length ? `🌟 <b>Lead:</b> ${leads.join(", ")}\n` : "") +
      (techs.length ? `🔧 <b>Tech:</b> ${techs.join(", ")}` : "");

    const msg = `🗼 <b>ကွင်းဆင်းအဖွဲ့ တာဝန်သတ်မှတ်ချက် (Team Receipt)</b>\n` +
      `<blockquote>📦 <b>Team:</b> ${escapeHtmlText_(data.team_name)} [<code>Active</code>]\n` +
      `🏗️ <b>Project:</b> ${escapeHtmlText_(data.project)} | 📅 ${escapeHtmlText_(fDate)}\n` +
      `${memberBlock}</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;

    targetChats.forEach(cId => {
      sendTelegramHTML(cId, msg, buildPrivatePortalKeyboard_(cId, {
        rowButtons: [
          { text: "📍 Attendance", callback_data: "CMD_CHECKIN" },
          { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }
        ]
      }));
    });
  } catch (e) {
    console.error("Performer Team Notify Error:", e);
  }
}
