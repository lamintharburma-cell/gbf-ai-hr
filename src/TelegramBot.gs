/**
 * 📡 G.B.F. Enterprise HR & AI Management System — Telegram Bot & Approver Matrix (TelegramBot.gs v9.2)
 * Handles Webhook registration, Anti-Loop Inline Button callbacks, 2-Tier Position Layer Routing,
 * and Live Group Attendance Leaderboard Broadcasts.
 */

/**
 * 🎨 Unified Brand Symbol Legend aligned 1-for-1 with v9.5.2 App UI (1 Icon = 1 Color/Status).
 */
const GBF_TG_ICONS = {
  MVP: "👑",
  ONTIME: "❇️",
  LATE: "⚪️",
  LEAVE: "☑️",
  ABSENT: "🚩",
  PENDING: "🕒",
  CHECKOUT: "🏁",
  HQ: "🏢",
  SITE: "📡"
};

function formatKpiTierBadge_(kpi, mvpDailyAmt) {
  const k = String(kpi || "").trim();
  if (k === "MVP" || k === "Early") {
    return mvpDailyAmt
      ? `${GBF_TG_ICONS.MVP} MVP (+${Number(mvpDailyAmt).toLocaleString()} MMK)`
      : `${GBF_TG_ICONS.MVP} MVP`;
  }
  if (k === "Late") return `${GBF_TG_ICONS.LATE} ကျ`;
  return `${GBF_TG_ICONS.ONTIME} မှန်`;
}

/**
 * 🤖 Authoritative Private Telegram Bot Command List synced via `setMyCommands` (v9.3.0).
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
 * 👥 Privacy-safe Telegram Group Slash Menu synced exclusively to `all_group_chats`.
 */
const GBF_GROUP_BOT_COMMANDS = [
  { command: "board", description: "📊 ယနေ့ Group Attendance Live Board ကြည့်ရန်" },
  { command: "teams", description: "🛡️ ယနေ့ Field Teams (Alpha/Bravo/Charlie) ကြည့်ရန်" },
  { command: "checkin", description: "📍 Private Bot မှ Check-In / Status ကြည့်ရန်" },
  { command: "id", description: "🪪 Group Chat ID စစ်ဆေးရန်" }
];

/**
 * 📋 Syncs Telegram "/" Menus separately for Private Chats and Group Chats (`setMyCommands`).
 */
function syncBotCommands_() {
  const token = getBotToken();
  if (!token) return { ok: false, description: "BOT_TOKEN missing" };
  const pushScope = (commands, scopeObj) => {
    const res = UrlFetchApp.fetch(getTelegramAPI() + "setMyCommands", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({ commands: commands, scope: scopeObj })
    });
    const text = res.getContentText();
    Logger.log("📋 Telegram setMyCommands (" + scopeObj.type + "): " + text);
    try { return JSON.parse(text); } catch (e) { return { ok: false, raw: text }; }
  };

  try {
    const defRes = pushScope(GBF_BOT_COMMANDS, { type: "default" });
    const privRes = pushScope(GBF_BOT_COMMANDS, { type: "all_private_chats" });
    const grpRes = pushScope(GBF_GROUP_BOT_COMMANDS, { type: "all_group_chats" });
    return {
      ok: Boolean(defRes && defRes.ok && privRes && privRes.ok && grpRes && grpRes.ok),
      defaultScope: defRes,
      privateScope: privRes,
      groupScope: grpRes
    };
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

function parseThreadId_(rawThreadId) {
  const n = parseInt(String(rawThreadId == null ? "" : rawThreadId).trim(), 10);
  return (!isNaN(n) && n > 0) ? n : null;
}

function fitLinesWithinBudget_(prefix, lines, suffix, separator, overflowBuilder, maxChars) {
  const limit = maxChars || 3750;
  const sep = separator !== undefined ? separator : "\n";
  const p = String(prefix || "");
  const s = String(suffix || "");
  const items = Array.isArray(lines) ? lines : [];
  if (items.length === 0) return p + s;

  const fullText = p + items.join(sep) + s;
  if (fullText.length <= limit) return fullText;

  let acc = "";
  let kept = 0;
  for (let i = 0; i < items.length; i++) {
    const piece = (kept > 0 ? sep : "") + items[i];
    const remaining = items.length - (kept + 1);
    const tail = remaining > 0 ? (overflowBuilder ? overflowBuilder(remaining) : "") : "";
    if (p.length + acc.length + piece.length + tail.length + s.length > limit) {
      break;
    }
    acc += piece;
    kept++;
  }
  const omitted = items.length - kept;
  const overflowNote = omitted > 0 ? (overflowBuilder ? overflowBuilder(omitted) : "") : "";
  return p + acc + overflowNote + s;
}

function truncateBodyBeforeFooter_(baseHtml, footerHtml, maxChars) {
  const limit = maxChars || 4000;
  const footer = String(footerHtml || "");
  const body = String(baseHtml || "");
  if (!body) return footer;
  if (body.length + (footer ? footer.length + 2 : 0) <= limit) {
    return footer ? `${body}\n\n${footer}` : body;
  }
  const budget = Math.max(200, limit - footer.length - 40);
  const lines = body.split("\n");
  let kept = "";
  for (let i = 0; i < lines.length; i++) {
    const next = kept ? `${kept}\n${lines[i]}` : lines[i];
    if (next.length > budget) break;
    kept = next;
  }
  if (!kept) kept = lines[0].slice(0, budget);
  const stack = [];
  const tagRe = /<\/?(b|i|u|s|code|pre|blockquote)\b[^>]*>/gi;
  let tm;
  while ((tm = tagRe.exec(kept)) !== null) {
    const full = tm[0];
    const tagName = tm[1].toLowerCase();
    if (full.startsWith("</")) {
      const lastIdx = stack.lastIndexOf(tagName);
      if (lastIdx !== -1) stack.splice(lastIdx, 1);
    } else {
      stack.push(tagName);
    }
  }
  const hasBlockquote = stack.includes("blockquote");
  while (stack.length > 0 && stack[stack.length - 1] !== "blockquote") {
    kept += `</${stack.pop()}>`;
  }
  kept += "\n... <i>(truncated)</i>";
  if (hasBlockquote) {
    while (stack.length > 0) kept += `</${stack.pop()}>`;
  }
  return footer ? `${kept}\n\n${footer}` : kept;
}

function resolveGroupThreadId_(chatId, settings) {
  if (!settings || !settings.TELEGRAM_GROUP_THREAD_ID) return null;
  if (String(chatId || "").trim() !== String(settings.TELEGRAM_GROUP_CHAT_ID || "").trim()) return null;
  return parseThreadId_(settings.TELEGRAM_GROUP_THREAD_ID);
}

function sendTelegramHTML(chatId, text, kb, opts) {
  if (!chatId || !getBotToken()) return null;
  const o = opts || {};
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: o.disable_web_page_preview !== false
  };
  if (kb) payload.reply_markup = kb;
  const threadId = parseThreadId_(o.message_thread_id);
  if (threadId) payload.message_thread_id = threadId;

  const postFn = body => UrlFetchApp.fetch(getTelegramAPI() + "sendMessage", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(body)
  });

  let res = postFn(payload);
  if (res.getResponseCode() === 400 && payload.message_thread_id &&
      String(res.getContentText() || "").toLowerCase().indexOf("thread not found") !== -1) {
    Logger.log(`Telegram thread ${payload.message_thread_id} missing; retrying without message_thread_id.`);
    delete payload.message_thread_id;
    res = postFn(payload);
  }
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

function editTelegramHTML_(chatId, messageId, text, kb, opts) {
  if (!chatId || !messageId || !getBotToken()) return { ok: false };
  const o = opts || {};
  const payload = {
    chat_id: chatId,
    message_id: parseInt(messageId, 10),
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: o.disable_web_page_preview !== false
  };
  if (kb !== undefined && kb !== null) payload.reply_markup = kb;

  const res = UrlFetchApp.fetch(getTelegramAPI() + "editMessageText", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  const bodyText = res.getContentText();
  if (res.getResponseCode() === 200) {
    try {
      return { ok: true, unchanged: false, parsed: JSON.parse(bodyText) };
    } catch (e) {
      return { ok: true, unchanged: false };
    }
  }
  if (bodyText && bodyText.indexOf("message is not modified") !== -1) {
    return { ok: true, unchanged: true };
  }
  return { ok: false, raw: bodyText };
}

function upsertGroupBoardMessage_(groupChatId, propKey, text, kb, mode, threadId, dateTag) {
  const effectiveMode = String(mode || "LIVE_EDIT").toUpperCase();
  const props = PropertiesService.getScriptProperties();
  const todayTag = dateTag || Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
  let savedRecord = null;

  if (effectiveMode !== "NEW_MESSAGE" && propKey) {
    const rawSaved = props.getProperty(propKey);
    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        if (parsed && parsed.messageId && parsed.date === todayTag &&
            String(parsed.chatId || "") === String(groupChatId) &&
            String(parsed.threadId || "") === String(threadId || "")) {
          savedRecord = String(parsed.messageId);
        }
      } catch (e) {
        if (/^\d+$/.test(String(rawSaved).trim())) savedRecord = String(rawSaved).trim();
      }
    }
    if (savedRecord) {
      const editRes = editTelegramHTML_(groupChatId, savedRecord, text, kb || { inline_keyboard: [] }, {
        disable_web_page_preview: true
      });
      if (editRes && editRes.ok) {
        return { ok: true, edited: true, message_id: savedRecord };
      }
    }
  }
  const sent = sendTelegramHTML(groupChatId, text, kb || null, {
    message_thread_id: threadId,
    disable_web_page_preview: true
  });
  if (sent && sent.result && sent.result.message_id && propKey) {
    const newId = String(sent.result.message_id);
    props.setProperty(propKey, JSON.stringify({
      date: todayTag,
      chatId: String(groupChatId),
      threadId: threadId ? String(threadId) : "",
      messageId: newId
    }));
    return { ok: true, edited: false, message_id: newId };
  }
  return { ok: Boolean(sent), edited: false, message_id: null };
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

function extractApprovalTargetKey_(kb) {
  try {
    const firstBtn = kb && kb.inline_keyboard && kb.inline_keyboard[0] && kb.inline_keyboard[0][0];
    const cbData = firstBtn ? String(firstBtn.callback_data || "") : "";
    const m = cbData.match(/^([A-Z]+)_[A-Z]+_(\d+)_/);
    return m ? `${m[1]}_${m[2]}` : "";
  } catch (e) {
    return "";
  }
}

function readPendingTargetsMap_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty("PENDING_APPROVAL_TARGETS");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writePendingTargetsMap_(mapObj) {
  try {
    const keys = Object.keys(mapObj || {});
    while (keys.length > 30) {
      const oldest = keys.shift();
      delete mapObj[oldest];
    }
    let serialized = JSON.stringify(mapObj);
    while (serialized.length > 7500 && keys.length > 1) {
      const dropKey = keys.shift();
      delete mapObj[dropKey];
      serialized = JSON.stringify(mapObj);
    }
    PropertiesService.getScriptProperties().setProperty("PENDING_APPROVAL_TARGETS", serialized);
  } catch (e) {}
}

function storeApprovalMessageTargets_(targetKey, htmlText, targets) {
  if (!targetKey || !targets || targets.length === 0) return;
  try {
    const cache = CacheService.getScriptCache();
    cache.put("APPROVAL_TARGETS_" + targetKey, JSON.stringify(targets), 21600);
    if (htmlText) cache.put("APPROVAL_HTML_" + targetKey, String(htmlText), 21600);
  } catch (e) {}
  try {
    const mapObj = readPendingTargetsMap_();
    if (mapObj[targetKey]) delete mapObj[targetKey];
    mapObj[targetKey] = targets.map(t => [String(t.chatId), String(t.messageId)]);
    writePendingTargetsMap_(mapObj);
  } catch (e) {}
}

function clearPendingApprovalTargetsDurable_(targetKey) {
  if (!targetKey) return;
  try {
    const mapObj = readPendingTargetsMap_();
    if (mapObj[targetKey]) {
      delete mapObj[targetKey];
      writePendingTargetsMap_(mapObj);
    }
  } catch (e) {}
}

function buildFallbackDecidedCardHtml_(sheet, type, row, statusTagText) {
  if (!sheet || !row || row > sheet.getLastRow()) return "";
  try {
    const cols = type === "LV" ? 10 : (type === "ADV" ? 8 : 9);
    const vals = sheet.getRange(row, 1, 1, cols).getDisplayValues()[0];
    const tag = statusTagText ? `  [<code>${escapeHtmlText_(statusTagText)}</code>]` : "";
    if (type === "LV") {
      return `📅 <b>ခွင့်တိုင်ကြားလွှာ (Leave)</b>${tag}\n` +
        `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(vals[2])} (<code>${escapeHtmlText_(vals[1])}</code>)\n` +
        `🔖 <b>အမျိုးအစား:</b> ${escapeHtmlText_(vals[3])} (${escapeHtmlText_(vals[6])} ရက်)\n` +
        `📆 <b>ရက်စွဲ:</b> ${escapeHtmlText_(vals[4])} မှ ${escapeHtmlText_(vals[5])} ထိ</blockquote>`;
    }
    if (type === "ADV") {
      const amt = parseFloat(String(vals[3] || "0").replace(/,/g, "")) || 0;
      return `💰 <b>လစာကြိုတင်တောင်းခံလွှာ (Advance)</b>${tag}\n` +
        `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(vals[2])} (<code>${escapeHtmlText_(vals[1])}</code>)\n` +
        `💵 <b>တောင်းခံငွေ:</b> <code>${amt.toLocaleString()} MMK</code>\n` +
        `📝 <b>အကြောင်းရင်း:</b> ${escapeHtmlText_(vals[5])}</blockquote>`;
    }
    if (type === "VOC") {
      return `📣 <b>[HR-AI Employee Voice &amp; Negotiation]</b>${tag}\n` +
        `<blockquote>🎫 <b>Ticket:</b> <code>${escapeHtmlText_(vals[0])}</code>\n` +
        `👤 <b>ပေးပို့သူ:</b> ${escapeHtmlText_(vals[3])} (${escapeHtmlText_(vals[2])})\n` +
        `📂 <b>ကဏ္ဍ:</b> ${escapeHtmlText_(vals[4])}</blockquote>`;
    }
  } catch (e) {}
  return "";
}

/**
 * 🧹 Removes Inline Buttons across ALL dispatched approver messages, preserves HTML formatting, and stamps the final decision.
 */
function finalizeApproverMessageAndRemoveButtons_(cb, decisionFooterHtml, opts) {
  const o = opts || {};
  let type = o.type || "";
  let row = o.row || "";
  if ((!type || !row) && cb && cb.data) {
    const parts = String(cb.data).split("_");
    if (parts.length >= 3) {
      type = type || parts[0];
      row = row || parts[2];
    }
  }
  const targetKey = (type && row) ? `${type}_${row}` : "";

  let cachedHtml = "";
  let targets = [];
  if (targetKey) {
    try {
      const cache = CacheService.getScriptCache();
      cachedHtml = cache.get("APPROVAL_HTML_" + targetKey) || "";
      if (!o.onlyClickedMessage) {
        const rawTargets = cache.get("APPROVAL_TARGETS_" + targetKey);
        if (rawTargets) {
          const parsed = JSON.parse(rawTargets);
          if (Array.isArray(parsed)) targets = parsed;
        }
        if (targets.length === 0) {
          const durableMap = readPendingTargetsMap_();
          const durablePairs = durableMap[targetKey];
          if (Array.isArray(durablePairs)) {
            targets = durablePairs.map(pair => ({ chatId: String(pair[0]), messageId: String(pair[1]) }));
          }
        }
      }
    } catch (e) {}
  }

  if (cb && cb.message && cb.message.chat && cb.message.message_id) {
    const curChat = String(cb.message.chat.id);
    const curMsg = String(cb.message.message_id);
    if (!targets.some(t => String(t.chatId) === curChat && String(t.messageId) === curMsg)) {
      targets.push({ chatId: curChat, messageId: curMsg });
    }
  }
  if (targets.length === 0) return;

  let baseHtml = "";
  if (cachedHtml) {
    baseHtml = cachedHtml;
    if (o.statusTagText) {
      baseHtml = baseHtml.replace(/\[<code>⏳ PENDING<\/code>\]/g, `[<code>${escapeHtmlText_(o.statusTagText)}</code>]`);
    }
  } else {
    baseHtml = buildFallbackDecidedCardHtml_(o.sheet, type, parseInt(row, 10), o.statusTagText);
    if (!baseHtml) {
      const originalText = (cb && cb.message && cb.message.text) ? cb.message.text : "";
      baseHtml = originalText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }
  const finalHtml = truncateBodyBeforeFooter_(baseHtml, decisionFooterHtml, 4000);

  targets.forEach(t => {
    try {
      const editRes = editTelegramHTML_(t.chatId, t.messageId, finalHtml, { inline_keyboard: [] });
      if (!editRes || !editRes.ok) {
        UrlFetchApp.fetch(getTelegramAPI() + "editMessageReplyMarkup", {
          method: "post",
          contentType: "application/json",
          muteHttpExceptions: true,
          payload: JSON.stringify({
            chat_id: t.chatId,
            message_id: parseInt(t.messageId, 10),
            reply_markup: { inline_keyboard: [] }
          })
        });
      }
    } catch (e) {
      Logger.log(`Finalize approver sync error (${t.chatId}/${t.messageId}): ${e}`);
    }
  });
  if (!o.onlyClickedMessage) {
    clearPendingApprovalTargetsDurable_(targetKey);
  }
}

/**
 * 🛡️ Cryptographically/RBAC-verified Approver Callback Access Control List & Row Integrity Check.
 * Prevents unlinked Telegram users, missing `cb.from.id`, junior self-approvals, or forged row targets.
 */
function authorizeApproverCallback_(cb, type, action, row, sheet, targetEmpId, settings) {
  const cleanTarget = String(targetEmpId == null ? "" : targetEmpId).trim();
  const actorChatId = sanitizeTelegramChatId_(cb && cb.from ? cb.from.id : "");
  if (!actorChatId) {
    logToAudit("CALLBACK_ACL_DENIED", "UNKNOWN", "NO_ID", `${type}_${action}_R${row}_${cleanTarget} (MISSING_FROM_ID)`);
    return { authorized: false, reason: "MISSING_FROM_ID" };
  }

  const settingsObj = settings || getSettings();
  const adminChatId = sanitizeTelegramChatId_(settingsObj.HR_ADMIN_CHAT_ID);
  const isAdminChat = Boolean(adminChatId && actorChatId === adminChatId);
  const actor = findEmployeeByChatId_(actorChatId);

  const deny = (reason) => {
    logToAudit(
      "CALLBACK_ACL_DENIED",
      actor ? actor.empId : "UNKNOWN",
      actor ? actor.name : actorChatId,
      `${type}_${action}_R${row}_${cleanTarget} (${reason})`
    );
    return { authorized: false, reason: reason };
  };

  if (!actor && !isAdminChat) {
    return deny("UNLINKED_USER");
  }

  const validAction = type === "VOC" ? (action === "ACK" || action === "MEET") : (action === "APP" || action === "REJ");
  if (!validAction) {
    return deny("INVALID_ACTION");
  }

  const empCol = type === "VOC" ? 3 : 2;
  const sheetEmpId = String(sheet.getRange(row, empCol).getValue() || "").trim();
  if (!sheetEmpId || sheetEmpId !== cleanTarget) {
    return deny("ROW_TARGET_MISMATCH");
  }

  const actorLayer = actor ? resolvePositionLayer(actor.role, actor.empId, settingsObj) : "TM";
  if (actor && cleanTarget && cleanTarget !== "ANONYMOUS" && String(actor.empId).trim() === cleanTarget) {
    const otherApprovers = isAdminChat
      ? resolveApproversForRequester(cleanTarget, actor.name, actor.role).chatIds.filter(id => String(id).trim() !== actorChatId)
      : ["NON_ADMIN"];
    if (!isAdminChat || otherApprovers.length > 0) {
      return deny("SELF_APPROVAL");
    }
  }

  const hrWatchIds = String(settingsObj.APPROVER_HR_WATCH_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isHrWatch = Boolean(actor && hrWatchIds.includes(actor.empId));
  const isTopTier = isAdminChat || isHrWatch || actorLayer === "TM" || actorLayer === "MM";

  if (type === "VOC") {
    if (!isTopTier) return deny("INSUFFICIENT_TIER");
  } else {
    if (!isTopTier) {
      if (actorLayer === "TL") {
        const reqInfo = getEmployeeContactInfo(cleanTarget);
        const reqLayer = resolvePositionLayer(reqInfo.role, cleanTarget, settingsObj);
        const tlTargets = String(settingsObj.POS_LAYER_TL_TARGETS || "TT,JT,ST").toUpperCase().split(",").map(s => s.trim()).filter(Boolean);
        const routing = resolveApproversForRequester(cleanTarget, reqInfo.name, reqInfo.role);
        if (!tlTargets.includes(reqLayer) || !routing.chatIds.includes(actorChatId)) {
          return deny("INSUFFICIENT_TIER");
        }
      } else {
        return deny("INSUFFICIENT_TIER");
      }
    }
  }

  return {
    authorized: true,
    approverName: actor ? `${actor.name} (#${actor.empId})` : "HR Admin",
    approverEmpId: actor ? actor.empId : "ADMIN",
    layer: actorLayer
  };
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

    if (!row || isNaN(row) || row < 2) {
      answerCallbackSafe_(cb.id, "⚠️ Invalid Row Data", false);
      return;
    }

    const ss = getGBFSpreadsheet_();
    const settings = getSettings();
    const rowActionLockKey = `DECIDED_${type}_ROW_${row}`;
    const alreadyDecidedInCache = cache.get(rowActionLockKey);

    // CASE 1: HR-AI VOICE TICKET
    if (type === "VOC") {
      const vSheet = ss.getSheetByName("HR_Voice_Feedback");
      if (!vSheet || row > vSheet.getLastRow()) {
        answerCallbackSafe_(cb.id, "⚠️ Ticket Row Not Found", false);
        return;
      }

      const acl = authorizeApproverCallback_(cb, type, action, row, vSheet, targetEmpId, settings);
      if (!acl.authorized) {
        answerCallbackSafe_(cb.id, "⛔ ဤတောင်းဆိုမှုကို အတည်ပြုခွင့် မရှိပါ။", true);
        return;
      }
      const approverName = acl.approverName;

      const currentVocStatus = String(vSheet.getRange(row, 9).getValue() || "").trim();
      if (alreadyDecidedInCache || (currentVocStatus !== "" && currentVocStatus !== "Pending_Review")) {
        finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ✅ ဆောင်ရွက်ပြီး (${escapeHtmlText_(currentVocStatus || alreadyDecidedInCache)})`, {
          type: type, row: row, sheet: vSheet, statusTagText: currentVocStatus || "DECIDED ✅", onlyClickedMessage: true
        });
        answerCallbackSafe_(cb.id, `⚠️ ဤတင်ပြချက်ကို (${currentVocStatus || "ဆောင်ရွက်ပြီး"}) အဖြစ် သတ်မှတ်ပြီးဖြစ်ပါသည်!`, true);
        return;
      }

      const newStatus = action === "ACK" ? `Acknowledged by ${approverName}` : `Meeting Set by ${approverName}`;
      const statusBadge = action === "ACK" ? `🤝 လက်ခံညှိနှိုင်းမည် (${escapeHtmlText_(approverName)})` : `📅 ရုံးခန်းချိန်းဆိုမည် (${escapeHtmlText_(approverName)})`;

      cache.put(rowActionLockKey, newStatus, 21600);
      vSheet.getRange(row, 9).setValue(newStatus);
      SpreadsheetApp.flush();

      answerCallbackSafe_(cb.id, "✅ ဝန်ထမ်းထံ အကြောင်းပြန်ပြီးပါပြီ!", false);
      finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ${statusBadge}`, {
        type: type, row: row, sheet: vSheet, statusTagText: newStatus
      });

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
    if (!sheet || row > sheet.getLastRow()) {
      answerCallbackSafe_(cb.id, "⚠️ Request Row Not Found", false);
      return;
    }

    const acl = authorizeApproverCallback_(cb, type, action, row, sheet, targetEmpId, settings);
    if (!acl.authorized) {
      answerCallbackSafe_(cb.id, "⛔ ဤတောင်းဆိုမှုကို အတည်ပြုခွင့် မရှိပါ။", true);
      return;
    }
    const approverName = acl.approverName;

    const currentStatus = String(sheet.getRange(row, statusCol).getValue() || "").trim();
    if (alreadyDecidedInCache || (currentStatus !== "" && currentStatus !== "Pending")) {
      finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ${escapeHtmlText_(currentStatus || alreadyDecidedInCache)}`, {
        type: type, row: row, sheet: sheet, statusTagText: currentStatus === "Approved" ? "APPROVED ✅" : "DECLINED ❌", onlyClickedMessage: true
      });
      answerCallbackSafe_(cb.id, `⚠️ ဤတောင်းဆိုမှုကို (${currentStatus || alreadyDecidedInCache}) အဖြစ် ဆုံးဖြတ်ပြီးဖြစ်ပါသည်!`, true);
      return;
    }

    const decision = action === "APP" ? "Approved" : "Rejected";
    const statusBadge = action === "APP" ? "✅ အတည်ပြုပြီး (Approved)" : "❌ ငြင်းပယ်ပြီး (Rejected)";

    cache.put(rowActionLockKey, decision, 21600);
    sheet.getRange(row, statusCol).setValue(decision);
    SpreadsheetApp.flush();

    answerCallbackSafe_(cb.id, `${statusBadge}!`, false);
    finalizeApproverMessageAndRemoveButtons_(cb, `📌 <b>ဆုံးဖြတ်ချက်:</b> ${statusBadge} (by ${escapeHtmlText_(approverName)})`, {
      type: type, row: row, sheet: sheet, statusTagText: action === "APP" ? "APPROVED ✅" : "DECLINED ❌"
    });

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
    if (normalizeDateStr(teamData[i][1]) === todayStr && hasSquadMemberName_(teamData[i][4], requesterName)) {
      matchedMembersText = String(teamData[i][4]);
      break;
    }
  }
  if (!matchedMembersText) return [];

  const matchedTlIds = [];
  configuredTlIds.forEach(tlId => {
    const info = getEmployeeContactInfo(tlId, cachedEmpRows);
    if (info.name && hasSquadMemberName_(matchedMembersText, info.name)) {
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
  const targets = [];
  routing.chatIds.forEach(chatId => {
    const res = sendTelegramHTML(chatId, routedText, kb);
    if (res && res.result && res.result.message_id) {
      targets.push({ chatId: String(chatId), messageId: String(res.result.message_id) });
    }
  });
  storeApprovalMessageTargets_(extractApprovalTargetKey_(kb), routedText, targets);
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
  const targets = [];
  chatSet.forEach(chatId => {
    const res = sendTelegramHTML(chatId, text, kb || null);
    if (res && res.result && res.result.message_id) {
      targets.push({ chatId: String(chatId), messageId: String(res.result.message_id) });
    }
  });
  storeApprovalMessageTargets_(extractApprovalTargetKey_(kb), text, targets);
}

function getChatIdByEmpId(empId) {
  return getEmployeeContactInfo(empId).chatId;
}

function buildGroupTeamsKeyboard_(settings) {
  const botUsername = getBotUsername_();
  return {
    inline_keyboard: [
      [
        { text: "📊 Live Board", callback_data: "CMD_GRP_BOARD" },
        { text: "🔄 Refresh Teams", callback_data: "CMD_GRP_TEAMS" }
      ],
      [
        { text: "🤖 Open My Private Portal", url: `https://t.me/${botUsername}?start=portal` }
      ]
    ]
  };
}

function isAuthorizedForGroupView_(chatId, isPrivate, settings) {
  if (isPrivate) return Boolean(findEmployeeByChatId_(chatId));
  const configuredGroup = String((settings && settings.TELEGRAM_GROUP_CHAT_ID) || "").trim();
  return Boolean(configuredGroup && String(chatId || "").trim() === configuredGroup);
}

function buildGroupBoardCard_(viewTab, updatedState, settings, latestEvent) {
  const sys = (updatedState && updatedState.system) ? updatedState.system : {};
  const todayStr = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
  const botUsername = getBotUsername_();
  const checkedList = sys.today_checked_in_list || [];
  const leaveList = sys.today_leaves_list || [];
  const pendingList = sys.today_pending_list || [];
  const totalEmp = Number(sys.total_emp || (checkedList.length + leaveList.length + pendingList.length) || 0);
  const mvpCnt = checkedList.filter(x => x.kpi === "MVP").length;
  const onTimeCnt = checkedList.filter(x => x.kpi === "On-Time").length;
  const lateCnt = checkedList.filter(x => x.kpi === "Late").length;

  let msg = "";
  let latestMapUrl = latestEvent && latestEvent.actorMapUrl ? latestEvent.actorMapUrl : "";
  if (!latestMapUrl && checkedList.length > 0 && checkedList[checkedList.length - 1].map_url) {
    latestMapUrl = checkedList[checkedList.length - 1].map_url;
  }

  if (viewTab === "pending") {
    const pendingItems = pendingList.map((p, idx) => `${idx + 1}. ${GBF_TG_ICONS.PENDING} <b>${escapeHtmlText_(p.name)}</b>`);
    const lvItems = leaveList.map(lv => `• ${GBF_TG_ICONS.LEAVE} <b>${escapeHtmlText_(lv.name)}</b> — ${escapeHtmlText_(lv.type)} (${lv.status === "Approved" ? `${GBF_TG_ICONS.ONTIME} Approved` : `${GBF_TG_ICONS.PENDING} Pending`})`);
    const lvSection = lvItems.length > 0
      ? `\n\n${GBF_TG_ICONS.LEAVE} <b>ယနေ့ ခွင့်တိုင်ကြားထားသူများ (${leaveList.length} ဦး):</b>\n${lvItems.join("\n")}`
      : "";
    const header = `${GBF_TG_ICONS.PENDING} <b>G.B.F. မဝင်ရသေးသူနှင့် ခွင့်စာရင်း (${todayStr})</b>\n` +
      `${GBF_TG_ICONS.ONTIME} <b>တက်:</b> ${checkedList.length}/${totalEmp} ဦး  •  ${GBF_TG_ICONS.LEAVE} <b>ခွင့်:</b> ${leaveList.length}  •  ${GBF_TG_ICONS.PENDING} <b>ကျန်:</b> ${pendingList.length}\n` +
      `<blockquote><b>${GBF_TG_ICONS.PENDING} မဝင်ရသေးသူ (${pendingList.length} ဦး):</b>\n`;
    if (pendingItems.length === 0) {
      const donePrefix = `${header}🎉 <i>ဝန်ထမ်းအားလုံး ရုံးတက်/ခွင့် စာရင်းဝင်ပြီး ဖြစ်ပါသည်။</i>`;
      if (lvItems.length === 0) {
        msg = `${donePrefix}</blockquote>`;
      } else {
        msg = fitLinesWithinBudget_(
          `${donePrefix}\n\n${GBF_TG_ICONS.LEAVE} <b>ယနေ့ ခွင့်တိုင်ကြားထားသူများ (${leaveList.length} ဦး):</b>\n`,
          lvItems,
          `</blockquote>`,
          "\n",
          rem => `\n<i>... နှင့် အခြား ${rem} ဦး (Mini App တွင် အပြည့်အစုံ ကြည့်ပါ)</i>`,
          3750
        );
      }
    } else {
      const lvTail = lvSection.length <= 700 ? lvSection : `\n\n${GBF_TG_ICONS.LEAVE} <b>ယနေ့ ခွင့်:</b> ${leaveList.length} ဦး (Mini App တွင် ကြည့်ပါ)`;
      msg = fitLinesWithinBudget_(
        header,
        pendingItems,
        `${lvTail}</blockquote>`,
        "\n",
        rem => `\n<i>... နှင့် အခြား ${rem} ဦး (Mini App တွင် အပြည့်အစုံ ကြည့်ပါ)</i>`,
        3750
      );
    }
  } else if (viewTab === "teams") {
    const teamSheet = getGBFSpreadsheet_().getSheetByName("Daily_Teams");
    msg = buildConsolidatedTeamsGroupMessage_(teamSheet, todayStr, "", "", [], updatedState);
  } else {
    let highlightBlock = `📡 <b>Live Attendance Snapshot</b> • ရုံးတက်/ရုံးဆင်း အချိန်နှင့်တစ်ပြေးညီ မှတ်တမ်း`;
    if (latestEvent) {
      const safeActor = escapeHtmlText_(latestEvent.actorName);
      const actionHeader = latestEvent.actionType === "Check In"
        ? `✅ <b>${safeActor}</b> — ${escapeHtmlText_(latestEvent.displayTime)} • <b>${latestEvent.kpiLabel}</b>`
        : `${GBF_TG_ICONS.CHECKOUT} <b>${safeActor}</b> (Check-Out) — ${escapeHtmlText_(latestEvent.displayTime)}${latestEvent.workedDuration ? `\n⏱️ <b>အလုပ်ချိန်:</b> <code>${escapeHtmlText_(latestEvent.workedDuration)}</code>` : ""}`;
      const mapInline = latestEvent.actorMapUrl ? ` • <a href="${latestEvent.actorMapUrl}">🗺️ Map</a>` : "";
      highlightBlock = `${actionHeader}\n📏 <b>တည်နေရာ:</b> <code>${escapeHtmlText_(latestEvent.distText)}</code> (${latestEvent.zoneTag})${mapInline}`;
    }

    const head = `📅 <b>${todayStr} (ယနေ့) Company Attendance • ${checkedList.length}/${totalEmp} ဦး</b>\n` +
      `${GBF_TG_ICONS.MVP} MVP ${mvpCnt}  •  ${GBF_TG_ICONS.ONTIME} မှန် ${onTimeCnt}  •  ${GBF_TG_ICONS.LATE} ကျ ${lateCnt}  •  ${GBF_TG_ICONS.LEAVE} ${leaveList.length}  •  ${GBF_TG_ICONS.PENDING} ${pendingList.length}\n` +
      `<blockquote>${highlightBlock}</blockquote>\n` +
      `🏆 <b>ယနေ့ ဝင်ရောက်ပြီးသူများ (Arrival Order):</b>\n`;

    const checkedLines = checkedList.map((emp, idx) => {
      const kBadge = emp.kpi === "MVP" ? GBF_TG_ICONS.MVP : (emp.kpi === "Late" ? GBF_TG_ICONS.LATE : GBF_TG_ICONS.ONTIME);
      const zIcon = emp.loc_status === "HQ_Zone" ? GBF_TG_ICONS.HQ : GBF_TG_ICONS.SITE;
      const mapAnchor = emp.map_url ? ` • <a href="${emp.map_url}">🗺️ Map</a>` : "";
      const durBadge = emp.out_time ? computeWorkedDurationText_(emp.time, emp.out_time) : "";
      const outTag = emp.out_time ? ` ➔ <code>${escapeHtmlText_(emp.out_time)}</code>${durBadge ? ` (${escapeHtmlText_(durBadge)})` : ""}` : "";
      return `${idx + 1}. ${kBadge} <b>${escapeHtmlText_(emp.name)}</b> — <code>${escapeHtmlText_(emp.time)}</code>${outTag} • ${zIcon} <code>${escapeHtmlText_(emp.distance_text)}</code>${mapAnchor}`;
    });

    let footerSections = "";
    if (leaveList.length > 0) {
      const lvPreview = leaveList.slice(0, 12).map(lv => {
        const stIcon = lv.status === "Approved" ? `${GBF_TG_ICONS.ONTIME} Approved` : `${GBF_TG_ICONS.PENDING} Pending`;
        return `• ${GBF_TG_ICONS.LEAVE} <b>${escapeHtmlText_(lv.name)}</b> — ${escapeHtmlText_(lv.type)} (${stIcon})`;
      }).join("\n");
      const lvMore = leaveList.length > 12 ? `\n• <i>+${leaveList.length - 12} ဦး (Pending tab တွင် ကြည့်ပါ)</i>` : "";
      footerSections += `\n\n${GBF_TG_ICONS.LEAVE} <b>ယနေ့ ခွင့်တိုင်ကြားထားသူများ (${leaveList.length} ဦး):</b>\n${lvPreview}${lvMore}`;
    }

    if (pendingList.length > 0) {
      const previewNames = pendingList.slice(0, 5).map(p => escapeHtmlText_(p.name)).join(", ");
      const moreCount = pendingList.length > 5 ? ` +${pendingList.length - 5} ဦး (Pending နှိပ်ကြည့်ပါ)` : "";
      footerSections += `\n\n${GBF_TG_ICONS.PENDING} <b>မဝင်ရသေးသူ (${pendingList.length} ဦး):</b> ${previewNames}${moreCount}`;
    } else {
      footerSections += `\n\n🎉 <b>ဝန်ထမ်းအားလုံး ရုံးတက်/ခွင့် စာရင်းဝင်ပြီးဖြစ်ပါသည်။</b>`;
    }

    if (checkedLines.length === 0) {
      msg = `${head}<i>မရှိသေးပါ</i>${footerSections}`;
    } else {
      msg = fitLinesWithinBudget_(
        head,
        checkedLines,
        footerSections,
        "\n",
        rem => `\n<i>... နှင့် အခြား ${rem} ဦး (Mini App တွင် အပြည့်အစုံ ကြည့်ပါ)</i>`,
        3750
      );
    }
  }

  const rows = [
    [
      { text: viewTab === "board" ? "🔄 Refresh Board" : "📊 Live Board", callback_data: "CMD_GRP_BOARD" },
      { text: `${GBF_TG_ICONS.PENDING} Pending (${pendingList.length})`, callback_data: "CMD_GRP_PENDING" },
      { text: "🛡️ Field Teams", callback_data: "CMD_GRP_TEAMS" }
    ]
  ];
  const row2 = [];
  if (latestMapUrl) {
    const labelName = latestEvent && latestEvent.actorName ? `${latestEvent.actorName} Map` : "Latest Map";
    row2.push({ text: `🗺️ ${labelName}`, url: latestMapUrl });
  }
  row2.push({ text: "🤖 My Private Portal", url: `https://t.me/${botUsername}?start=portal` });
  rows.push(row2);

  return { text: msg, reply_markup: { inline_keyboard: rows } };
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
    const zoneTag = isInsideHq ? `${GBF_TG_ICONS.HQ} HQ ≤${maxRadius}m` : `${GBF_TG_ICONS.SITE} Site`;
    const hasCoords = data && data.lat != null && data.lng != null && String(data.lat).trim() !== "" && String(data.lng).trim() !== "" && !isNaN(Number(data.lat)) && !isNaN(Number(data.lng));
    const actorMapUrl = hasCoords ? buildGoogleMapsMeasureUrl_(officeLat, officeLng, `${data.lat},${data.lng}`) : "";
    const mvpDailyAmt = parseFloat(settings.REWARD_MVP_PER_DAY) || 1000;
    const kpiEmoji = formatKpiTierBadge_(kpiStatus, mvpDailyAmt);

    const checkedList = updatedState.system.today_checked_in_list || [];
    const myToday = checkedList.find(x => x.id === String(data.emp_id).trim());
    const workedDuration = (data.type === "Check Out")
      ? computeWorkedDurationText_((myToday && myToday.time) || (updatedState.today_state && updatedState.today_state.time_in) || "", displayTime)
      : "";

    const card = buildGroupBoardCard_("board", updatedState, settings, {
      actorName: data.emp_name,
      actionType: data.type,
      displayTime: displayTime,
      kpiLabel: kpiEmoji,
      distText: distText,
      zoneTag: zoneTag,
      actorMapUrl: actorMapUrl,
      workedDuration: workedDuration
    });

    const mode = String(settings.GROUP_ATTENDANCE_MODE || "LIVE_EDIT").toUpperCase();
    const threadId = resolveGroupThreadId_(groupChatId, settings);
    upsertGroupBoardMessage_(groupChatId, "GRP_BOARD_MSG_LATEST", card.text, card.reply_markup, mode, threadId, todayStr);
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

  if (o.includeNavFooter) {
    const navRow = [{ text: "⬅️ Main Menu", callback_data: "CMD_MAIN_MENU" }];
    if (o.refreshCallback) {
      navRow.push({ text: "🔄 Refresh", callback_data: o.refreshCallback });
    }
    rows.push(navRow);
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
function buildBotPortalCard_(actionKey, chatId, opts) {
  const clean = sanitizeTelegramChatId_(chatId);
  const o = opts || {};

  if (actionKey === "START") {
    const firstName = o.firstName || "ဝန်ထမ်း";
    const emp = findEmployeeByChatId_(clean);
    const currentMonth = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM");
    let quickStatusBlock = `🔑 ပထမဆုံးအကြိမ် ဝင်ရောက်ပါက Official PIN (သို့) <code>/link PIN</code> ဖြင့် Telegram ID ချိတ်ဆက်နိုင်ပါသည်။`;
    if (emp) {
      const st = getFullSystemState(emp.empId, emp.name, null, currentMonth);
      let attBadge = `${GBF_TG_ICONS.PENDING} Check-In မဝင်ရသေးပါ`;
      if (st && st.today_state) {
        if (st.today_state.status === "CHECKED_IN") attBadge = `${GBF_TG_ICONS.ONTIME} Checked-In (${escapeHtmlText_(st.today_state.time_in)})`;
        else if (st.today_state.status === "CHECKED_OUT") attBadge = `${GBF_TG_ICONS.CHECKOUT} Checked-Out (${escapeHtmlText_(st.today_state.time_out)})`;
      }
      const rem = (st && st.wallet) ? `${Number(st.wallet.remaining_advance || 0).toLocaleString()} MMK` : "-";
      quickStatusBlock = `✅ <b>Linked Account:</b> ${escapeHtmlText_(emp.name)} (<code>${escapeHtmlText_(emp.empId)}</code> • ${escapeHtmlText_(emp.role)})\n` +
        `📍 <b>Today:</b> ${attBadge}  |  💳 <b>50% Wallet:</b> <code>${rem}</code>`;
    }
    const welcomeMsg = `🏢 <b>G.B.F. Enterprise HR &amp; AI Management</b>\n\n` +
      `မင်္ဂလာပါ <b>${escapeHtmlText_(firstName)}</b> ခင်ဗျာ။\n` +
      `<blockquote>${quickStatusBlock}\n\n` +
      `အောက်ပါ Mini App ခလုတ်နှင့် Quick Menu များမှတစ်ဆင့် Attendance, Wallet (50% Limit), MLBB KPI Rewards နှင့် Digital Payslip များကို တိုက်ရိုက် ကြည့်ရှုအသုံးပြုနိုင်ပါသည်။</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;
    return {
      text: welcomeMsg,
      reply_markup: buildPrivatePortalKeyboard_(clean, { includeFullQuickMenu: true })
    };
  }

  if (actionKey === "ASKAI") {
    const askText = `🤖 <b>GBF HR-AI Assistant</b>\n` +
      `<blockquote>မင်္ဂလာပါ! သိရှိလိုသော HR အချက်အလက်များကို အောက်ပါခလုတ်များမှ တစ်ချက်နှိပ်၍ မေးမြန်းနိုင်သလို စာရိုက်၍လည်း မေးနိုင်ပါသည်။</blockquote>\n` +
      `👇 <i>အောက်ပါ မေးခွန်းခလုတ်များမှ ရွေးချယ်နှိပ်ကြည့်ပါ-</i>`;
    return {
      text: askText,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 Open GBF HR Mini App",
        includeNavFooter: true,
        refreshCallback: "CMD_ASKAI",
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
      `<blockquote>${GBF_TG_ICONS.MVP} <b>MVP Early (≤ ${escapeHtmlText_(settings.TIME_EARLY || "09:00")} AM):</b> +${mvpAmt} MMK/ရက်\n` +
      `${GBF_TG_ICONS.ONTIME} <b>On-Time (≤ ${escapeHtmlText_(settings.TIME_LATE || "09:15")} AM):</b> အချိန်မှန် (No Penalty)\n` +
      `${GBF_TG_ICONS.LATE} <b>Late (&gt; ${escapeHtmlText_(settings.TIME_LATE || "09:15")} AM):</b> တစ်လ ၃ ကြိမ် Grace ပေးပြီး <b>၄ ကြိမ်မြောက်မှစ၍ -2,000 MMK/ကြိမ်</b>\n` +
      `🛡️ <b>Zero-AFK Bonus (0 AFK):</b> +${attAmt} MMK/လ (Weekly MVP Streak: +${streakAmt} MMK)\n` +
      `${GBF_TG_ICONS.ABSENT} <b>3+ AFK Rule:</b> ခွင့်မဲ့ ၃ ကြိမ်ပြည့်ပါက လစဉ် Bonus အားလုံး ပျက်ပြယ်ပါမည်</blockquote>\n` +
      `— <b>GBF HR AI Management Team</b>`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        includeNavFooter: true,
        refreshCallback: "CMD_ASKQ_LATE",
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
        reply_markup: buildPrivatePortalKeyboard_(clean, { includeNavFooter: true, refreshCallback: "CMD_PAYSLIP" })
      };
    }
    const p = slipRes.payslip;
    const text = `🧾 <b>GBF Digital Payslip (${escapeHtmlText_(p.month)})</b>\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(p.name)} (<code>${escapeHtmlText_(emp.empId)}</code>)\n` +
      `🏷️ <b>ရာထူး:</b> ${escapeHtmlText_(p.role)} | 📌 <b>Status:</b> ${escapeHtmlText_(p.status)}\n\n` +
      `💵 <b>Base Salary:</b> <code>${Number(p.base_salary || 0).toLocaleString()} MMK</code>\n` +
      `🛡️ <b>Attendance Bonus (0 AFK):</b> <code>+${Number(p.attendance_bonus || 0).toLocaleString()} MMK</code>\n` +
      `${GBF_TG_ICONS.MVP} <b>Daily MVP &amp; Weekly Streak:</b> <code>+${Number(p.mvp_streak_bonus || 0).toLocaleString()} MMK</code>\n` +
      `🏆 <b>MLBB Rank Bonus:</b> <code>+${Number(p.rank_bonus || 0).toLocaleString()} MMK</code>\n` +
      `💳 <b>Advance Deduction:</b> <code>-${Number(p.advance_deduction || 0).toLocaleString()} MMK</code>\n` +
      `${GBF_TG_ICONS.ABSENT} <b>Absence &amp; Late Penalty:</b> <code>-${(Number(p.absence_deduction || 0) + Number(p.late_penalty || 0)).toLocaleString()} MMK</code></blockquote>\n` +
      `💰 <b>NET PAYABLE:</b> <code>${Number(p.net_payable || 0).toLocaleString()} MMK</code>`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 PDF Print / Drive Save in App",
        includeNavFooter: true,
        refreshCallback: "CMD_PAYSLIP",
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
    const calc = computeEmployeeKpiAndPayroll_(state.totals, state.wallet.base_salary, state.reward_config, state.weekly_streak, state.user.strike_count, state.totals.working_days);
    const penalties = Number(calc.latePenalty || 0) + Number(calc.absenceDeduction || 0);
    const netExclAdvance = Math.max(0, Number(state.wallet.base_salary || 0) + Number(calc.totalBonuses || 0) - penalties - Number(calc.advanceDeduction || 0));
    const text = `🤖 <b>GBF HR-AI Assistant</b>\n` +
      `မင်္ဂလာပါ <b>${escapeHtmlText_(state.user.name)}</b> (<code>${escapeHtmlText_(state.user.role)}</code>) ရှင့်/ခင်ဗျာ။\n\n` +
      `<blockquote>📅 <b>ရုံးတက်ရက် (Present):</b> ${state.totals.present} ရက်\n` +
      `${GBF_TG_ICONS.MVP} <b>MVP &amp; Streak Bonus:</b> +${Number(calc.mvpAndStreakBonus || 0).toLocaleString()} ကျပ်\n` +
      `🛡️ <b>Zero-AFK Bonus:</b> ${Number(calc.attendanceBonus || 0).toLocaleString()} ကျပ် (AFK ${state.totals.unexcused_absent} ရက်)\n` +
      `🏆 <b>Rank Bonus (${escapeHtmlText_(calc.rank)}):</b> +${Number(calc.rankBonus || 0).toLocaleString()} ကျပ်\n` +
      `${GBF_TG_ICONS.LATE} <b>နောက်ကျ/AFK ဖြတ်ငွေ:</b> -${penalties.toLocaleString()} ကျပ်\n` +
      `💳 <b>Advance နုတ်ငွေ:</b> -${Number(calc.advanceDeduction || 0).toLocaleString()} ကျပ်\n` +
      `💰 <b>ခန့်မှန်းရရှိငွေ (Net):</b> <code>${netExclAdvance.toLocaleString()} MMK</code></blockquote>\n` +
      `<i>* Grace ၃ ကြိမ်ပေးပြီး ၄ ကြိမ်မြောက် နောက်ကျမှစ၍ 2,000 Ks ဖြတ်တောက်ပါသည်။</i>`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        includeNavFooter: true,
        refreshCallback: "CMD_ASKQ_EARN",
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
    let statusText = `${GBF_TG_ICONS.PENDING} ယနေ့ Check-In မဝင်ရသေးပါ`;
    if (state.today_state.status === "CHECKED_IN") {
      statusText = `${GBF_TG_ICONS.ONTIME} Checked-In (${escapeHtmlText_(state.today_state.time_in)})`;
    } else if (state.today_state.status === "CHECKED_OUT") {
      const worked = computeWorkedDurationText_(state.today_state.time_in, state.today_state.time_out);
      statusText = `${GBF_TG_ICONS.CHECKOUT} Checked-Out (In: ${escapeHtmlText_(state.today_state.time_in)} • Out: ${escapeHtmlText_(state.today_state.time_out)}${worked ? ` • ${escapeHtmlText_(worked)}` : ""})`;
    }
    const gpsLine = myToday
      ? `\n📏 <b>GPS:</b> <code>${escapeHtmlText_(myToday.distance_text)}</code> (${myToday.loc_status === "HQ_Zone" ? `${GBF_TG_ICONS.HQ} HQ Zone` : `${GBF_TG_ICONS.SITE} Field Site`}) • #${myToday.order} (${formatKpiTierBadge_(myToday.kpi)})`
      : "";
    const text = `📍 <b>Smart Attendance (${todayStr})</b>\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(state.user.name)} (<code>${escapeHtmlText_(state.user.id)}</code>)\n` +
      `📌 <b>အခြေအနေ:</b> ${statusText}${gpsLine}\n` +
      `👥 <b>ယနေ့ ရုံးတက်သူ:</b> ${state.system.today_active} / ${state.system.total_emp} ဦး</blockquote>\n` +
      `👇 Check-In / Check-Out (GPS 500m) ပြုလုပ်ရန် Mini App ကို ဖွင့်ပါ-`;
    const extraTopRow = (myToday && myToday.map_url)
      ? [{ text: "🗺️ Today Check-In Map", url: myToday.map_url }]
      : null;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 Open Check-In / Out in App",
        extraTopRow: extraTopRow,
        includeNavFooter: true,
        refreshCallback: "CMD_CHECKIN",
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
    const text = `💳 <b>50% Salary Advance Wallet (${currentMonth})</b>\n` +
      `<blockquote>👤 <b>ဝန်ထမ်း:</b> ${escapeHtmlText_(state.user.name)} (<code>${escapeHtmlText_(state.user.id)}</code>)\n` +
      `💵 <b>Base Salary:</b> <code>${Number(w.base_salary || 0).toLocaleString()} MMK</code>\n` +
      `🏦 <b>50% Max Limit:</b> <code>${Number(w.max_advance_limit || 0).toLocaleString()} MMK</code>\n` +
      `✅ <b>Approved Used:</b> <code>${Number(w.used_advance || 0).toLocaleString()} MMK</code>\n` +
      `⏳ <b>Pending:</b> <code>${Number(w.pending_advance || 0).toLocaleString()} MMK</code>\n` +
      `🟢 <b>ထုတ်ယူနိုင်သည့် လက်ကျန်:</b> <code>${Number(w.remaining_advance || 0).toLocaleString()} MMK</code></blockquote>${histText}`;
    return {
      text: text,
      reply_markup: buildPrivatePortalKeyboard_(clean, {
        miniAppLabel: "🚀 Request Advance in Mini App",
        includeNavFooter: true,
        refreshCallback: "CMD_WALLET",
        rowButtons: [
          { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" },
          { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }
        ]
      })
    };
  }

  // Default: MYKPI (v9.5.2 Hero HUD Mirror)
  const calc = computeEmployeeKpiAndPayroll_(state.totals, state.wallet.base_salary, state.reward_config, state.weekly_streak, state.user.strike_count, state.totals.working_days);
  const stars = "⭐".repeat(Math.max(1, calc.stars || 1));
  const forfeitNote = calc.monthlyBonusesForfeited ? `\n${GBF_TG_ICONS.ABSENT} <i>3+ AFK ဖြစ်ထားသဖြင့် လစဉ် Bonus များ ပျက်ပြယ်ထားပါသည်။</i>` : "";
  const mvpPerDay = Number((state.reward_config && state.reward_config.mvp_per_day) || 1000);
  const weeklyTarget = Math.max(1, Number((state.reward_config && state.reward_config.weekly_mvp_target) || 5));
  const weeklyBonus = Number((state.reward_config && state.reward_config.weekly_mvp_bonus) || 10000);
  const curStreak = Math.min(weeklyTarget, Number((state.weekly_streak && state.weekly_streak.currentWeekMvp) || 0));
  const streakSlots = [];
  for (let sIdx = 0; sIdx < weeklyTarget; sIdx++) {
    streakSlots.push(sIdx < curStreak ? GBF_TG_ICONS.MVP : "▫️");
  }
  const myTodayAtt = (state.system && Array.isArray(state.system.today_checked_in_list))
    ? state.system.today_checked_in_list.find(item => item.id === state.user.id)
    : null;
  const todayRewardLine = (myTodayAtt && myTodayAtt.kpi === "MVP")
    ? `🎁 <b>ယနေ့ MVP (+${mvpPerDay.toLocaleString()} MMK)</b>`
    : (myTodayAtt ? `🎁 <b>ယနေ့ ${formatKpiTierBadge_(myTodayAtt.kpi)}</b>` : `🎁 <b>${escapeHtmlText_(currentMonth)} ဆုကြေး</b>`);

  const text = `🏆 <b>${escapeHtmlText_(calc.rank)}</b> ${stars} • <b>${calc.kpiScore}% KPI</b> (${escapeHtmlText_(currentMonth)})\n` +
    `📅 <b>တက်ရောက်:</b> ${state.totals.present}/${calc.workingDays}  |  🎯 <b>နိုင်နှုန်း:</b> ${calc.winRate}%  |  ${GBF_TG_ICONS.MVP} <b>MVP:</b> ${state.totals.mvp}  |  ${GBF_TG_ICONS.ABSENT} <b>ပျက်:</b> ${state.totals.unexcused_absent}\n` +
    `<blockquote>${todayRewardLine} • စုစုပေါင်း: <code>+${Number(calc.totalBonuses || 0).toLocaleString()} MMK</code>\n` +
    `🔥 <b>${weeklyTarget}-Day Streak:</b> ${streakSlots.join(" ")} (${curStreak}/${weeklyTarget} • +${weeklyBonus.toLocaleString()} MMK)\n` +
    `${GBF_TG_ICONS.MVP} <b>MVP:</b> ${state.totals.mvp}  •  ${GBF_TG_ICONS.ONTIME} <b>မှန်:</b> ${state.totals.ontime}  •  ${GBF_TG_ICONS.LATE} <b>ကျ:</b> ${state.totals.late}  •  ${GBF_TG_ICONS.ABSENT} <b>ပျက်:</b> ${state.totals.unexcused_absent}\n` +
    `👤 <b>${escapeHtmlText_(state.user.name)}</b> (<code>${escapeHtmlText_(state.user.id)}</code> • ${escapeHtmlText_(state.user.role)}) | ⚡ <b>Strike:</b> ${state.user.strike_count}/3${forfeitNote}</blockquote>`;
  return {
    text: text,
    reply_markup: buildPrivatePortalKeyboard_(clean, {
      miniAppLabel: "🚀 View Full Radar & Quests",
      includeNavFooter: true,
      refreshCallback: "CMD_MYKPI",
      rowButtons: [
        { text: "📍 Attendance", callback_data: "CMD_CHECKIN" },
        { text: "🧾 Payslip", callback_data: "CMD_PAYSLIP" }
      ]
    })
  };
}

function handlePortalMenuCallback_(cb) {
  const cbData = String(cb.data || "");
  const chatId = cb.message && cb.message.chat ? cb.message.chat.id : (cb.from ? cb.from.id : "");
  const msgId = cb.message && cb.message.message_id ? cb.message.message_id : null;
  const isPrivate = cb.message && cb.message.chat ? cb.message.chat.type === "private" : Boolean(sanitizeTelegramChatId_(chatId));
  const firstName = cb.from && cb.from.first_name ? cb.from.first_name : "ဝန်ထမ်း";
  const cbTopicThreadId = (cb.message && cb.message.message_thread_id) ? parseThreadId_(cb.message.message_thread_id) : null;

  if (cbData === "CMD_GRP_BOARD" || cbData === "CMD_GRP_PENDING" || cbData === "CMD_GRP_TEAMS") {
    const settings = getSettings();
    if (!isAuthorizedForGroupView_(chatId, isPrivate, settings)) {
      answerCallbackSafe_(cb.id, "🔐 ခွင့်ပြုချက် မရှိသော Group / Chat ဖြစ်ပါသည်။", true);
      return;
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) {
      answerCallbackSafe_(cb.id, "⏳ ခဏစောင့်ဆိုင်းပေးပါ...", false);
      return;
    }
    try {
      const tabMap = { CMD_GRP_BOARD: "board", CMD_GRP_PENDING: "pending", CMD_GRP_TEAMS: "teams" };
      const toastMap = { CMD_GRP_BOARD: "📊 Updating Live Board...", CMD_GRP_PENDING: "🕒 Loading Pending & Leaves...", CMD_GRP_TEAMS: "🛡️ Loading Field Teams..." };
      answerCallbackSafe_(cb.id, toastMap[cbData], false);
      const currentMonth = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM");
      const st = getFullSystemState("__GROUP_VIEWER__", "GroupViewer", null, currentMonth);
      const card = buildGroupBoardCard_(tabMap[cbData], st, settings, null);
      if (msgId) {
        const editRes = editTelegramHTML_(chatId, msgId, card.text, card.reply_markup);
        if (editRes && editRes.ok) return;
      }
      sendTelegramHTML(chatId, card.text, card.reply_markup, {
        message_thread_id: isPrivate ? null : (cbTopicThreadId || resolveGroupThreadId_(chatId, settings))
      });
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
    return;
  }

  const map = {
    CMD_MAIN_MENU: { key: "START", toast: "🏢 Main Menu" },
    CMD_CHECKIN: { key: "CHECKIN", toast: "📍 Loading Attendance..." },
    CMD_MYKPI: { key: "MYKPI", toast: "🏆 Loading MLBB KPI..." },
    CMD_WALLET: { key: "WALLET", toast: "💳 Loading 50% Wallet..." },
    CMD_PAYSLIP: { key: "PAYSLIP", toast: "🧾 Loading Payslip..." },
    CMD_ASKAI: { key: "ASKAI", toast: "🤖 GBF HR-AI Guide" },
    CMD_ASKQ_EARN: { key: "ASKQ_EARN", toast: "💰 တွက်ချက်နေပါသည်..." },
    CMD_ASKQ_LATE: { key: "ASKQ_LATE", toast: "⚠️ စည်းမျဉ်းများ..." }
  };
  const spec = map[cbData];
  if (!spec) {
    answerCallbackSafe_(cb.id, "⚠️ Unknown Menu Action", false);
    return;
  }
  answerCallbackSafe_(cb.id, spec.toast, false);
  if (!isPrivate) {
    const botUsername = getBotUsername_();
    sendTelegramHTML(chatId, `🔐 ကိုယ်ပိုင် HR အချက်အလက်များကို Bot Private Chat တွင်သာ ကြည့်ရှုနိုင်ပါသည်။`, {
      inline_keyboard: [[{ text: "🤖 Private Bot ထဲတွင် ဖွင့်ရန်", url: `https://t.me/${botUsername}?start=portal` }]]
    }, { message_thread_id: cbTopicThreadId });
    return;
  }
  const card = buildBotPortalCard_(spec.key, chatId, { firstName: firstName });
  if (msgId) {
    const editRes = editTelegramHTML_(chatId, msgId, card.text, card.reply_markup);
    if (editRes && editRes.ok) return;
  }
  sendTelegramHTML(chatId, card.text, card.reply_markup);
}

/**
 * 🧭 Unified Telegram "/" Command Router supporting `/cmd`, `/cmd@BotName`, Group `/board` & `/teams`, and `/start <tab>` deep links.
 */
function handleBotCommand_(chatId, isPrivate, firstName, rawText, opts) {
  const match = String(rawText || "").trim().match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return false;
  const cmd = match[1].toLowerCase();
  const arg = String(match[2] || "").trim();
  const botUsername = getBotUsername_();
  const topicThreadId = (opts && opts.message_thread_id) ? parseThreadId_(opts.message_thread_id) : null;
  const groupReplyOpts = isPrivate ? {} : { message_thread_id: topicThreadId };

  if (cmd === "board" || cmd === "teams") {
    const settings = getSettings();
    if (!isAuthorizedForGroupView_(chatId, isPrivate, settings)) {
      sendTelegramHTML(
        chatId,
        isPrivate
          ? `🔐 Group Attendance Board ကြည့်ရန် ဦးစွာ <code>/link PIN</code> ဖြင့် ဝန်ထမ်းအကောင့် ချိတ်ဆက်ပါ။`
          : `🔐 ဤ Group Chat သည် G.B.F. တရားဝင် Group မဟုတ်သဖြင့် Live Board ကြည့်ရှုခွင့် မရှိပါ။`,
        { inline_keyboard: [[{ text: "🤖 Open Private HR Bot", url: `https://t.me/${botUsername}?start=portal` }]] },
        groupReplyOpts
      );
      return true;
    }
    const currentMonth = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM");
    const st = getFullSystemState("__GROUP_VIEWER__", "GroupViewer", null, currentMonth);
    const card = buildGroupBoardCard_(cmd === "teams" ? "teams" : "board", st, settings, null);
    sendTelegramHTML(chatId, card.text, card.reply_markup, {
      message_thread_id: isPrivate ? null : (topicThreadId || resolveGroupThreadId_(chatId, settings))
    });
    return true;
  }

  if (cmd === "start" || cmd === "app") {
    if (!isPrivate) {
      sendTelegramHTML(chatId, `🏢 <b>G.B.F. Enterprise HR &amp; AI Management</b>\n\nMini App နှင့် ကိုယ်ပိုင် HR Portal ဖွင့်ရန် အောက်ပါခလုတ်ဖြင့် Bot Private Chat သို့ ဝင်ရောက်ပါ။`, {
        inline_keyboard: [[{ text: "🚀 Open Private HR Bot", url: `https://t.me/${botUsername}?start=portal` }]]
      }, groupReplyOpts);
      return true;
    }
    const webAppUrl = buildSignedMiniAppUrl_(chatId);
    setPersonalMenuButton_(chatId, webAppUrl);

    const deepKeyMap = { checkin: "CHECKIN", attendance: "CHECKIN", mykpi: "MYKPI", kpi: "MYKPI", wallet: "WALLET", advance: "WALLET", payslip: "PAYSLIP", askai: "ASKAI", ai: "ASKAI" };
    const deepTarget = deepKeyMap[arg.toLowerCase()];
    if (deepTarget) {
      const deepCard = buildBotPortalCard_(deepTarget, chatId, { firstName: firstName });
      sendTelegramHTML(chatId, deepCard.text, deepCard.reply_markup);
      return true;
    }

    const startCard = buildBotPortalCard_("START", chatId, { firstName: firstName });
    sendTelegramHTML(chatId, startCard.text, startCard.reply_markup);
    return true;
  }

  if (cmd === "link") {
    if (!isPrivate) {
      sendTelegramHTML(chatId, "🔐 လုံခြုံရေးအရ <code>/link PIN</code> ကို Bot Private Chat တွင်သာ ပေးပို့ပါ။", {
        inline_keyboard: [[{ text: "🔗 Link in Private Bot", url: `https://t.me/${botUsername}?start=portal` }]]
      }, groupReplyOpts);
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
      `🆔 ဤ Chat ၏ Telegram Chat ID မှာ: <code>${chatId}</code> ဖြစ်ပါသည်။${empLine}\n\n— <b>GBF HR AI Management Team</b>`,
      isPrivate ? buildPrivatePortalKeyboard_(chatId, {
        rowButtons: [{ text: "📍 Attendance", callback_data: "CMD_CHECKIN" }, { text: "🏆 My KPI", callback_data: "CMD_MYKPI" }]
      }) : { inline_keyboard: [[{ text: "🤖 Open Private HR Bot", url: `https://t.me/${botUsername}?start=portal` }]] },
      groupReplyOpts
    );
    return true;
  }

  const portalCmdMap = { checkin: "CHECKIN", mykpi: "MYKPI", wallet: "WALLET", payslip: "PAYSLIP" };
  if (portalCmdMap[cmd]) {
    if (!isPrivate) {
      sendTelegramHTML(chatId, `🔐 ကိုယ်ပိုင် HR အချက်အလက်များ ကြည့်ရှုရန် Bot Private Chat ထဲတွင် <code>/${cmd}</code> ကို အသုံးပြုပါ (သို့) အောက်ပါခလုတ်ကို နှိပ်ပါ။`, {
        inline_keyboard: [[{ text: `🚀 Private Bot တွင် /${cmd} ကြည့်ရန်`, url: `https://t.me/${botUsername}?start=${cmd}` }]]
      }, groupReplyOpts);
      return true;
    }
    const card = buildBotPortalCard_(portalCmdMap[cmd], chatId, { firstName: firstName });
    sendTelegramHTML(chatId, card.text, card.reply_markup);
    return true;
  }

  if (cmd === "askai") {
    if (!isPrivate) {
      sendTelegramHTML(chatId, `🤖 HR-AI နှင့် မေးမြန်းဆွေးနွေးရန် Private Bot Chat ထဲသို့ ဝင်ရောက်ပါ။`, {
        inline_keyboard: [[{ text: "🤖 Open HR-AI in Private Bot", url: `https://t.me/${botUsername}?start=askai` }]]
      }, groupReplyOpts);
      return true;
    }
    if (arg.length > 0) {
      handleConversationalAIMessage(chatId, firstName, arg);
    } else {
      const guide = buildBotPortalCard_("ASKAI", chatId, { firstName: firstName });
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
      `• <code>/board</code> / <code>/teams</code> — Group Live Board &amp; Teams\n` +
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
    const zoneTag = distanceMeters <= maxRadius ? `${GBF_TG_ICONS.HQ} HQ Zone (≤${maxRadius}m)` : `${GBF_TG_ICONS.SITE} Field Site`;
    const hasCoords = data && data.lat != null && data.lng != null && String(data.lat).trim() !== "" && String(data.lng).trim() !== "" && !isNaN(Number(data.lat)) && !isNaN(Number(data.lng));
    const actorMapUrl = hasCoords ? buildGoogleMapsMeasureUrl_(officeLat, officeLng, `${data.lat},${data.lng}`) : "";
    const myToday = (updatedState && updatedState.system && Array.isArray(updatedState.system.today_checked_in_list))
      ? updatedState.system.today_checked_in_list.find(x => x.id === String(data.emp_id).trim())
      : null;
    const orderTag = myToday ? ` (#${myToday.order})` : "";
    const kpiBadge = formatKpiTierBadge_(kpiStatus, mvpDailyAmt);
    const isOut = data.type === "Check Out";
    const title = isOut ? `${GBF_TG_ICONS.CHECKOUT} <b>ရုံးဆင်း မှတ်တမ်းတင်ပြီးပါပြီ (Check-Out)</b>` : "✅ <b>ရုံးတက် မှတ်တမ်းတင်ပြီးပါပြီ (Check-In)</b>";
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

function buildMemberReadinessMap_(todaySystemState) {
  const map = {};
  if (!todaySystemState || !todaySystemState.system) return map;
  const sys = todaySystemState.system;
  (sys.today_checked_in_list || []).forEach(c => {
    const key = String(c.name || "").trim().toLowerCase();
    if (!key) return;
    if (c.out_time) map[key] = GBF_TG_ICONS.CHECKOUT;
    else if (c.kpi === "MVP" || c.kpi === "Early") map[key] = GBF_TG_ICONS.MVP;
    else if (c.kpi === "Late") map[key] = GBF_TG_ICONS.LATE;
    else map[key] = GBF_TG_ICONS.ONTIME;
  });
  (sys.today_leaves_list || []).forEach(lv => {
    const key = String(lv.name || "").trim().toLowerCase();
    if (key && !map[key]) map[key] = GBF_TG_ICONS.LEAVE;
  });
  (sys.today_pending_list || []).forEach(p => {
    const key = String(p.name || "").trim().toLowerCase();
    if (key && !map[key]) map[key] = GBF_TG_ICONS.PENDING;
  });
  return map;
}

/**
 * 🛡️ Formats chronological Field Teams from `Daily_Teams` matching v9.5.2 (creation time + unified member icons, no [Active] noise).
 */
function buildConsolidatedTeamsGroupMessage_(teamSheet, fDate, fallbackTeamName, fallbackProject, fallbackMembers, todaySystemState) {
  const byTeam = {};
  const teamOrder = [];
  const rows = teamSheet ? getLastNRows(teamSheet, 60, 5) : [];

  rows.forEach((r, idx) => {
    if (normalizeDateStr(r[1]) !== fDate) return;
    const tId = String(r[0] || "").trim();
    const tName = String(r[2] || "").trim();
    const proj = String(r[3] || "").trim();
    const mStr = String(r[4] || "").trim();
    if (!tName) return;
    const m13 = tId.match(/TEAM-(\d{13,})/);
    const m10 = !m13 ? tId.match(/TEAM-(1[5-9]\d{8})(?:\b|\D)/) : null;
    const ms = m13 ? parseInt(m13[1], 10) : (m10 ? parseInt(m10[1], 10) * 1000 : NaN);
    const hasTs = Number.isFinite(ms) && ms > 1000000000000;
    const createdMs = hasTs ? ms : (9007199254740000 + idx);
    const createdTime = hasTs ? Utilities.formatDate(new Date(ms), GBF_CONFIG.GMT_OFFSET, "hh:mm a") : "";
    if (!byTeam[tName]) teamOrder.push(tName);
    const prevMs = byTeam[tName] ? byTeam[tName].createdMs : createdMs;
    const chosenMs = Math.min(prevMs, createdMs);
    const chosenTime = (byTeam[tName] && byTeam[tName].createdTime && chosenMs === prevMs)
      ? byTeam[tName].createdTime
      : createdTime;
    byTeam[tName] = { project: proj, membersStr: mStr, createdMs: chosenMs, createdTime: chosenTime };
  });
  teamOrder.sort((a, b) => (byTeam[a].createdMs - byTeam[b].createdMs));

  if (teamOrder.length === 0 && fallbackTeamName) {
    byTeam[fallbackTeamName] = {
      project: fallbackProject || "",
      membersStr: (fallbackMembers || []).map(m => `${m.name} (${m.role})`).join(", "),
      createdMs: Date.now(),
      createdTime: Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "hh:mm a")
    };
    teamOrder.push(fallbackTeamName);
  }

  const readinessMap = buildMemberReadinessMap_(todaySystemState);
  const teamBlocks = [];
  teamOrder.forEach(tName => {
    const info = byTeam[tName];
    const parsed = String(info.membersStr || "").split(",").map(s => s.trim()).filter(Boolean);
    const leads = [];
    const techs = [];
    parsed.forEach(entry => {
      const cleanName = entry.replace(/\s*\([^)]*\)$/, "").trim();
      if (!cleanName) return;
      if (/leader|lead|tl/i.test(entry)) leads.push(cleanName);
      else techs.push(cleanName);
    });
    const memberLines = [];
    leads.forEach(name => {
      const rIcon = readinessMap[name.toLowerCase()] || GBF_TG_ICONS.PENDING;
      memberLines.push(`   ${rIcon} <b>${escapeHtmlText_(name)}</b> (Lead)`);
    });
    techs.forEach(name => {
      const rIcon = readinessMap[name.toLowerCase()] || GBF_TG_ICONS.PENDING;
      memberLines.push(`   ${rIcon} ${escapeHtmlText_(name)}`);
    });
    const timeChip = info.createdTime ? ` • <code>${escapeHtmlText_(info.createdTime)}</code>` : "";
    let block = `<blockquote>👥 <b>${escapeHtmlText_(tName)}</b> • ${parsed.length} ဦး${timeChip}\n` +
      `<i>Project: ${escapeHtmlText_(info.project || "-")}</i>`;
    if (memberLines.length > 0) block += `\n${memberLines.join("\n")}`;
    block += `</blockquote>`;
    teamBlocks.push(block);
  });

  const prefix = `🛡️ <b>အဖွဲ့များ (${escapeHtmlText_(fDate)} • ${teamOrder.length} သင်း • ဖွဲ့စည်းချိန်အလိုက်)</b>\n`;
  const suffix = `\n— <b>GBF Field Operations Control</b>`;
  if (teamBlocks.length === 0) {
    return `${prefix}<blockquote><i>ယနေ့အတွက် Field Team တာဝန်ခွဲဝေမှု မရှိသေးပါ။</i></blockquote>${suffix}`;
  }
  return fitLinesWithinBudget_(
    prefix,
    teamBlocks,
    suffix,
    "\n",
    rem => `\n<i>... နှင့် အခြား Team ${rem} ဖွဲ့</i>`,
    3750
  );
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
    const memberBlock = (leads.length ? `${GBF_TG_ICONS.MVP} <b>Lead:</b> ${leads.join(", ")}\n` : "") +
      (techs.length ? `🔧 <b>Tech:</b> ${techs.join(", ")}` : "");
    const timeStr = Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "hh:mm a");

    const msg = `🛡️ <b>ကွင်းဆင်းအဖွဲ့ တာဝန်သတ်မှတ်ချက် (Team Receipt)</b>\n` +
      `<blockquote>👥 <b>${escapeHtmlText_(data.team_name)}</b> • ${(members || []).length} ဦး • <code>${escapeHtmlText_(timeStr)}</code>\n` +
      `<i>Project: ${escapeHtmlText_(data.project)} • ${escapeHtmlText_(fDate)}</i>\n` +
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

// ==========================================
// ⏰ SCHEDULED GROUP ATTENDANCE DIGESTS (09:20 AM & 06:15 PM)
// ==========================================

function isSundayInYangon_(dateObj) {
  return Utilities.formatDate(dateObj || new Date(), GBF_CONFIG.GMT_OFFSET, "u") === "7";
}

function runMorningAttendanceDigest(ignoreSunday) {
  try {
    const settings = getSettings();
    if (String(settings.GROUP_DIGEST_ENABLED || "YES").toUpperCase() === "NO") return { skipped: "disabled" };
    const now = new Date();
    if (!ignoreSunday && isSundayInYangon_(now)) return { skipped: "sunday" };
    const groupChatId = String(settings.TELEGRAM_GROUP_CHAT_ID || "").trim();
    if (!groupChatId || !getBotToken()) return { skipped: "missing_config" };

    const todayStr = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
    const currentMonth = todayStr.slice(0, 7);
    const st = getFullSystemState("__GROUP_VIEWER__", "Digest", null, currentMonth);
    const sys = (st && st.system) ? st.system : {};
    const checked = sys.today_checked_in_list || [];
    const leaves = sys.today_leaves_list || [];
    const pending = sys.today_pending_list || [];

    const mvpCnt = checked.filter(x => x.kpi === "MVP").length;
    const onTimeCnt = checked.filter(x => x.kpi === "On-Time").length;
    const lateCnt = checked.filter(x => x.kpi === "Late").length;
    const head = `⏰ <b>09:20 AM Daily Roll-Call Digest (${todayStr})</b>\n` +
      `<blockquote>👥 <b>Total Active:</b> ${checked.length}/${sys.total_emp || 0} ဦး\n` +
      `${GBF_TG_ICONS.MVP} <b>MVP:</b> ${mvpCnt}  •  ${GBF_TG_ICONS.ONTIME} <b>မှန်:</b> ${onTimeCnt}  •  ${GBF_TG_ICONS.LATE} <b>ကျ:</b> ${lateCnt}  •  ${GBF_TG_ICONS.LEAVE} <b>ခွင့်:</b> ${leaves.length}`;
    const tail = `</blockquote>\n— <b>GBF HR Automated Operations</b>`;
    const msg = pending.length > 0
      ? fitLinesWithinBudget_(
          `${head}\n${GBF_TG_ICONS.PENDING} <b>မဝင်ရသေးသူ (${pending.length}):</b> `,
          pending.map(p => escapeHtmlText_(p.name)),
          tail,
          ", ",
          rem => ` ... +${rem} ဦး`,
          3750
        )
      : `${head}\n🎉 <b>ဝန်ထမ်းအားလုံး စာရင်းဝင်ပြီး ဖြစ်ပါသည်။</b>${tail}`;

    const kb = buildGroupBoardCard_("board", st, settings, null).reply_markup;
    const threadId = resolveGroupThreadId_(groupChatId, settings);
    sendTelegramHTML(groupChatId, msg, kb, { message_thread_id: threadId });
    return { ok: true, checked: checked.length, pending: pending.length };
  } catch (e) {
    console.error("Morning Digest Error:", e);
    return { ok: false, error: e.message };
  }
}

function runEveningAttendanceDigest(ignoreSunday) {
  try {
    const settings = getSettings();
    if (String(settings.GROUP_DIGEST_ENABLED || "YES").toUpperCase() === "NO") return { skipped: "disabled" };
    const now = new Date();
    if (!ignoreSunday && isSundayInYangon_(now)) return { skipped: "sunday" };
    const groupChatId = String(settings.TELEGRAM_GROUP_CHAT_ID || "").trim();
    if (!groupChatId || !getBotToken()) return { skipped: "missing_config" };

    const todayStr = Utilities.formatDate(now, GBF_CONFIG.GMT_OFFSET, "yyyy-MM-dd");
    const currentMonth = todayStr.slice(0, 7);
    const st = getFullSystemState("__GROUP_VIEWER__", "Digest", null, currentMonth);
    const sys = (st && st.system) ? st.system : {};
    const checked = sys.today_checked_in_list || [];
    const checkedOut = checked.filter(x => Boolean(x.out_time));
    const stillActive = checked.filter(x => !x.out_time);

    const head = `🏁 <b>06:15 PM End-of-Day Attendance Summary (${todayStr})</b>\n` +
      `<blockquote>${GBF_TG_ICONS.ONTIME} <b>Checked-In Total:</b> ${checked.length} ဦး\n` +
      `${GBF_TG_ICONS.CHECKOUT} <b>Checked-Out Complete:</b> ${checkedOut.length} ဦး`;
    const tail = `</blockquote>\n— <b>GBF HR Automated Operations</b>`;
    const msg = stillActive.length > 0
      ? fitLinesWithinBudget_(
          `${head}\n🔔 <b>Check-Out မလုပ်ရသေးသူ (${stillActive.length}):</b> `,
          stillActive.map(s => escapeHtmlText_(s.name)),
          tail,
          ", ",
          rem => ` ... +${rem} ဦး`,
          3750
        )
      : `${head}\n✅ <b>ရုံးတက်သူအားလုံး Check-Out စာရင်းသွင်းပြီး ဖြစ်ပါသည်။</b>${tail}`;

    const kb = buildGroupBoardCard_("board", st, settings, null).reply_markup;
    const threadId = resolveGroupThreadId_(groupChatId, settings);
    sendTelegramHTML(groupChatId, msg, kb, { message_thread_id: threadId });
    return { ok: true, checkedOut: checkedOut.length, pendingOut: stillActive.length };
  } catch (e) {
    console.error("Evening Digest Error:", e);
    return { ok: false, error: e.message };
  }
}

/**
 * Installs idempotent daily Apps Script time triggers for 09:20 AM & 06:15 PM Group Digests.
 */
function installGroupDigestTriggers() {
  const targetFns = new Set(["runMorningAttendanceDigest", "runEveningAttendanceDigest"]);
  ScriptApp.getProjectTriggers().forEach(t => {
    if (targetFns.has(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runMorningAttendanceDigest").timeBased().everyDays(1).atHour(9).nearMinute(20).create();
  ScriptApp.newTrigger("runEveningAttendanceDigest").timeBased().everyDays(1).atHour(18).nearMinute(15).create();
  Logger.log("⏰ Installed daily 09:20 AM & 06:15 PM Group Digest triggers.");
  return { success: true };
}
