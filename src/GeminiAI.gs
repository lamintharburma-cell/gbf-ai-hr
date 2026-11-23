/**
 * 🤖 G.B.F. Enterprise HR & AI Management System — Gemini 3.8 Flash Interactions Client (GeminiAI.gs v9.2)
 * Uses 2026 Gemini Interactions API (`/v1beta/interactions`) with `x-goog-api-key` header,
 * verified compatible with Google Cloud Express (`AQ.`) and AI Studio (`AIza`) keys.
 */

/**
 * Extracts trailing `model_output` text from a Gemini Interactions API response object.
 */
function extractInteractionText_(parsed) {
  if (!parsed) return null;
  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step && step.type === "model_output" && Array.isArray(step.content)) {
      const textParts = step.content
        .filter(part => part && part.type === "text" && typeof part.text === "string")
        .map(part => part.text);
      const joined = textParts.join("").trim();
      if (joined) return joined;
    }
  }
  return null;
}

/**
 * 🧠 Universal Gemini 3.8 Flash Interactions API caller.
 */
function callGeminiApi_(promptText, options) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const opts = options || {};

  const body = {
    model: opts.model || GBF_CONFIG.GEMINI_MODEL,
    input: String(promptText || ""),
    store: false,
    generation_config: {
      thinking_level: opts.thinkingLevel || "low",
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.35,
      max_output_tokens: opts.maxOutputTokens || 400
    }
  };

  try {
    const res = UrlFetchApp.fetch(GBF_CONFIG.GEMINI_INTERACTIONS_URL, {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-goog-api-key": apiKey
      },
      muteHttpExceptions: true,
      payload: JSON.stringify(body)
    });

    if (res.getResponseCode() === 200) {
      const parsed = JSON.parse(res.getContentText());
      return extractInteractionText_(parsed);
    }
    Logger.log(`Gemini Interactions API HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
  } catch (err) {
    Logger.log("Gemini Interactions API Error: " + err.message);
  }
  return null;
}

function evaluateLeaveRiskWithGemini(empId, empName, leaveType, startDate, endDate, totalDays, reason, patternDay, stats) {
  const present = stats ? stats.totals.present : 0;
  const late = stats ? stats.totals.late : 0;
  const afk = stats ? stats.totals.unexcused_absent : 0;
  const usedLeave = stats ? stats.totals.leave : 0;
  const strikes = stats ? stats.user.strike_count : 0;

  let fallbackRisk = "🟢 Low Risk — ပုံမှန်ခွင့်တိုင်ကြားမှုဖြစ်ပြီး ခွင့်ပြုရန် သင့်လျော်ပါသည်။";
  if (afk > 0 || strikes > 0) {
    fallbackRisk = `🔴 High Risk — ခွင့်မဲ့ပျက်ရက် (${afk} ရက်) / Strike (${strikes}) ရှိထားသဖြင့် စိစစ်ပြီးမှ ခွင့်ပြုသင့်ပါသည်။`;
  } else if (patternDay !== "Standard_Day" || usedLeave >= 3) {
    fallbackRisk = `🟡 Medium Risk — ${patternDay} (စနေ/တနင်္ဂနွေ ဆက်ရက်) ဖြစ်နေပါသဖြင့် လုပ်ငန်းခွင်လူအင်အား စစ်ဆေးပါ။`;
  }

  const prompt = `You are GBF HR Risk Advisor for G.B.F. Service Co., Ltd. Evaluate this Leave Request and respond in ONE concise Burmese sentence starting with 🟢 Low Risk, 🟡 Medium Risk, or 🔴 High Risk.
Employee: ${empName} (${empId})
Leave Type: ${leaveType}, Days: ${totalDays} (${startDate} to ${endDate}), Day Pattern: ${patternDay}
Reason: "${reason}"
Current Month Stats: Present=${present} days, Late=${late}, Unexcused_AFK=${afk}, Approved_Leave_So_Far=${usedLeave}, Strikes=${strikes}/3.`;

  const aiResponse = callGeminiApi_(prompt, { thinkingLevel: "low", maxOutputTokens: 250 });
  return aiResponse ? aiResponse.replace(/\n+/g, " ") : fallbackRisk;
}

function evaluateAdvanceRiskWithGemini(empId, empName, reqAmt, reason, stats) {
  const maxLimit = stats ? stats.wallet.max_advance_limit : 200000;
  const usedBefore = stats ? (stats.wallet.used_advance + stats.wallet.pending_advance) : 0;
  const remainingAfter = Math.max(0, maxLimit - (usedBefore + reqAmt));
  const afk = stats ? stats.totals.unexcused_absent : 0;
  const late = stats ? stats.totals.late : 0;
  const ratioPct = maxLimit > 0 ? Math.round(((usedBefore + reqAmt) / maxLimit) * 100) : 100;

  let fallbackRisk = `🟢 Low Risk — 50% Limit အတွင်း (${ratioPct}% အသုံးပြု) ရှိပြီး ရက်မှန်ကြေး Active ဖြစ်ပါသည်။`;
  if (afk > 0) {
    fallbackRisk = `🔴 High Risk — ခွင့်မဲ့ပျက်ရက် (${afk} ရက်) ရှိသဖြင့် 50,000 MMK Bonus ပျက်ပြယ်ထားပါသည်။`;
  } else if (ratioPct >= 85) {
    fallbackRisk = `🟡 Medium Risk — 50% Limit ၏ ${ratioPct}% အထိ ထုတ်ယူမည်ဖြစ်၍ လကုန်လက်ကျန်လစာ နည်းပါးနိုင်ပါသည်။`;
  }

  const prompt = `You are GBF Payroll & Financial Risk Advisor. Evaluate this 50% Advance Salary request and reply in ONE concise Burmese sentence starting with 🟢 Low Risk, 🟡 Medium Risk, or 🔴 High Risk.
Employee: ${empName} (${empId})
Requested Amount: ${reqAmt} MMK, 50% Max Limit: ${maxLimit} MMK, Already Used: ${usedBefore} MMK, Remaining After Request: ${remainingAfter} MMK (${ratioPct}% of limit)
Reason: "${reason}"
Attendance Health: Unexcused_AFK=${afk}, Late_Count=${late}, Attendance_Bonus_Active=${stats ? stats.wallet.bonus_active : true}.`;

  const aiResponse = callGeminiApi_(prompt, { thinkingLevel: "low", maxOutputTokens: 250 });
  return aiResponse ? aiResponse.replace(/\n+/g, " ") : fallbackRisk;
}

/**
 * 💬 Classifies HR Voice feedback sentiment & generates a polite Burmese auto-reply via Gemini 3.8 Flash.
 */
function analyzeVoiceFeedbackWithGemini(category, message) {
  const defaultResult = {
    sentiment: "🟡 Neutral",
    reply: "တင်ပြပေးသည့် အချက်အား GBF HR-AI မှ မှတ်တမ်းတင်ထားပြီး ဖြစ်ပါသည်။ HR နှင့် စီမံခန့်ခွဲမှုအဖွဲ့မှ အမြန်ဆုံး ညှိနှိုင်းဆောင်ရွက်ပေးပါမည်။"
  };

  const prompt = `You are GBF HR-AI Assistant for G.B.F. Service Co., Ltd. (Yangon FTTx & Telecom Operations).
Analyze this employee feedback and return ONLY valid JSON with two keys:
1. "sentiment": strictly one of "🟢 Positive", "🟡 Neutral", or "🔴 Urgent"
2. "reply": ONE or TWO polite, empathetic Burmese sentences acknowledging the issue.

Category: ${category}
Employee Message: "${String(message || "").slice(0, 600)}"`;

  const raw = callGeminiApi_(prompt, { thinkingLevel: "low", temperature: 0.25, maxOutputTokens: 300 });
  if (!raw) return defaultResult;

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validSentiments = ["🟢 Positive", "🟡 Neutral", "🔴 Urgent"];
      const sentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : "🟡 Neutral";
      const reply = (typeof parsed.reply === "string" && parsed.reply.trim()) ? parsed.reply.trim() : defaultResult.reply;
      return { sentiment: sentiment, reply: reply };
    }
  } catch (e) {}

  return {
    sentiment: /urgent|emergency|error|not ok|စိတ်ညစ်|အခက်အခဲ|ပျက်/i.test(message) ? "🔴 Urgent" : "🟡 Neutral",
    reply: raw.replace(/```json|```/g, "").trim() || defaultResult.reply
  };
}

function handleConversationalAIMessage(chatId, firstName, text) {
  let empContext = "";
  try {
    const initial = getInitialData(String(chatId), Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM"));
    if (initial && initial.sso_matched && initial.sso_data) {
      const s = initial.sso_data;
      empContext = `\nEmployee Context (Verified Telegram SSO): Name=${s.user.name}, Role=${s.user.role}, Month=${s.selected_month}, Present=${s.totals.present} days, MVP=${s.totals.mvp}, Late=${s.totals.late}, AFK=${s.totals.unexcused_absent}, Remaining_Advance=${s.wallet.remaining_advance} MMK.`;
    }
  } catch (e) {}

  const prompt = `You are GBF HR-AI Assistant for G.B.F. Service Co., Ltd. (Yangon FTTx & Telecom Operations).
Policy Summary: MVP <= 09:00 (+1,000 MMK/day, 5-day weekly streak +10,000 MMK), On-Time <= 09:15, Late > 09:15 (3 free grace/month, 4th+ late = -2,000 MMK each), Zero-AFK Bonus = 50,000 MMK, 3+ AFK forfeits bonuses, 50% Advance Salary Limit.${empContext}
Reply politely, helpfully, and concisely in Burmese to ${firstName}: "${text}"`;

  const aiResponse = callGeminiApi_(prompt, { thinkingLevel: "low", maxOutputTokens: 450 });
  const replyText = aiResponse || `လူကြီးမင်း၏ ဆွေးနွေးချက် "${text}" အား မှတ်တမ်းတင်ထားပါသည်။ Mini App မှတစ်ဆင့် HR-AI Ticket တင်ပြနိုင်ပါသည်။`;
  const formattedBody = formatAiToTelegramHtml(replyText);

  const kb = buildPrivatePortalKeyboard_(chatId, {
    rowButtons: [
      { text: "💰 ဒီလ ရရှိငွေ", callback_data: "CMD_ASKQ_EARN" },
      { text: "🏆 KPI Rank", callback_data: "CMD_MYKPI" }
    ]
  });
  sendTelegramHTML(chatId, `🤖 <b>GBF HR-AI Assistant</b>\n\n${formattedBody}\n\n— <b>GBF HR AI Management Team</b>`, kb);
}
