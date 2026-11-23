import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

const GS_FILES = [
  'Config.gs',
  'Database.gs',
  'GeminiAI.gs',
  'TelegramBot.gs',
  'TelegramIdentity.gs',
  'PayrollEngine.gs',
  'Code.gs'
];

test('Test 1: All 7 GAS files parse cleanly with zero syntax errors and zero duplicate function declarations', () => {
  const seenFunctions = new Map();

  for (const file of GS_FILES) {
    const filePath = path.join(SRC_DIR, file);
    assert.ok(fs.existsSync(filePath), `Missing GAS file: ${file}`);
    const code = fs.readFileSync(filePath, 'utf8');

    // Parse syntax via V8 vm.Script
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: file });
    }, `Syntax error in ${file}`);

    // Ensure no accidental duplicate top-level function definitions across GAS global namespace
    const fnMatches = [...code.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)];
    for (const m of fnMatches) {
      const fnName = m[1];
      assert.ok(
        !seenFunctions.has(fnName),
        `Duplicate global GAS function "${fnName}" in ${file} (already defined in ${seenFunctions.get(fnName)})`
      );
      seenFunctions.set(fnName, file);
    }
    // Reject accidentally hardcoded production credentials anywhere in src/
    assert.equal(
      /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/.test(code),
      false,
      `Hardcoded Telegram BOT_TOKEN pattern found in ${file}`
    );
    assert.equal(
      /\b(?:AIza[A-Za-z0-9_-]{25,}|AQ\.Ab[A-Za-z0-9_-]{20,})\b/.test(code),
      false,
      `Hardcoded Google/Gemini API key pattern found in ${file}`
    );
  }
});

test('Test 2: src/Index.html DOM, CSS, Accessibility & Offline/URI Hardening integrity', () => {
  const htmlPath = path.join(SRC_DIR, 'Index.html');
  assert.ok(fs.existsSync(htmlPath), 'Missing src/Index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Validate inline <script> blocks parse with vm.Script
  const scriptBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1])
    .filter(src => src.trim().length > 0);
  assert.ok(scriptBlocks.length >= 2, 'Expected Tailwind config script and Application script');

  scriptBlocks.forEach((scriptBody, idx) => {
    assert.doesNotThrow(() => {
      new vm.Script(scriptBody, { filename: `Index.html#script-${idx}` });
    }, `JavaScript syntax error in Index.html script block #${idx}`);
    assert.equal(
      /(?<!\\)\/\//.test(scriptBody),
      false,
      `Unescaped '//' found inside Index.html script block #${idx} (risks GAS Caja ES5 // truncation on backtick template literals)`
    );
  });

  // 2. Validate every static getElementById(...) and inline on* handler in HTML markup
  const appScript = scriptBlocks[scriptBlocks.length - 1];
  const htmlMarkupOnly = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  const inlineHandlerRe = /\bon(click|change|input|submit|keydown|keyup|focus|blur|load|error)=(?:"([^"]*)"|'([^']*)')/gi;
  let handlerMatch;
  let inlineCount = 0;
  while ((handlerMatch = inlineHandlerRe.exec(htmlMarkupOnly)) !== null) {
    inlineCount++;
    const expr = (handlerMatch[2] !== undefined ? handlerMatch[2] : handlerMatch[3])
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const lineNo = htmlMarkupOnly.slice(0, handlerMatch.index).split(/\r?\n/).length;
    assert.doesNotThrow(() => {
      new vm.Script(`(function(event){ ${expr} })`, { filename: `Index.html#inline-L${lineNo}` });
    }, `Inline event handler syntax error at line ${lineNo}: ${handlerMatch[0]}`);
  }
  assert.ok(inlineCount >= 50, `Expected >=50 inline HTML handlers checked, found ${inlineCount}`);
  const declaredIds = new Set([...htmlMarkupOnly.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

  const staticIdRefs = new Set(
    [...appScript.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)].map(m => m[1])
  );
  assert.ok(staticIdRefs.size >= 40, `Expected >=40 static DOM references, found ${staticIdRefs.size}`);

  const missingIds = [...staticIdRefs].filter(id => !declaredIds.has(id));
  assert.deepEqual(missingIds, [], `Missing DOM IDs referenced in JS: ${missingIds.join(', ')}`);

  // Validate dynamic template IDs referenced in JS
  const expectedDynamicIds = [
    'pin-dot-0', 'pin-dot-1', 'pin-dot-2', 'pin-dot-3',
    'btn-chk-in', 'btn-chk-leave', 'btn-chk-pending',
    'home-dot-0', 'home-dot-1', 'home-dot-2',
    'kpi-flt-all', 'kpi-flt-mvp', 'kpi-flt-ontime', 'kpi-flt-late', 'kpi-flt-afk',
    'cal-mode-weekly', 'cal-mode-daily', 'cal-mode-monthly',
    'nav-home', 'nav-logs', 'nav-wallet', 'nav-voice', 'nav-ai',
    'tab-home', 'tab-kpi-detail', 'tab-logs', 'tab-wallet', 'tab-leave', 'tab-advance', 'tab-voice', 'tab-team', 'tab-ai'
  ];
  for (const dynId of expectedDynamicIds) {
    assert.ok(declaredIds.has(dynId), `Missing expected dynamic DOM ID: ${dynId}`);
  }

  // 3. CSS & Accessibility assertions
  assert.ok(html.includes('.tab-content.active > *'), 'Fixed CSS selector .tab-content.active > * missing');
  assert.ok(!html.includes('.tab-content.active> {') && !html.includes('.tab-content.active>,'), 'Corrupted CSS selector still present');
  assert.ok(html.includes('viewport-fit=cover'), 'Missing viewport-fit=cover');
  assert.ok(!html.includes('user-scalable=no'), 'WCAG violation: user-scalable=no must not be present');
  assert.ok(!html.includes('<\\/'), 'Escaped GAS closing tags (<\\/) must not exist in source Index.html');
  const withoutValidScriptlets = html.replace(/<\?[\s\S]*?\?>/g, '');
  assert.ok(!withoutValidScriptlets.includes('<?') && !withoutValidScriptlets.includes('?>'), 'Unclosed or stray GAS scriptlet marker found in Index.html');

  // 4. Enterprise UX & Hardening assertions
  assert.ok(html.includes('GBFOfflineStore'), 'Missing GBFOfflineStore IndexedDB engine');
  assert.ok(html.includes('ExternalUriDispatcher'), 'Missing ExternalUriDispatcher');
  assert.ok(html.includes('idempotencyKey'), 'Missing client idempotencyKey');
  assert.ok(html.includes('tabular-nums'), 'Missing tabular-nums');
  assert.ok(html.includes('line-height: 1.65'), 'Missing Myanmar line-height: 1.65');
  assert.ok(html.includes('gbf-tg-chat-id'), 'Missing gbf-tg-chat-id meta tag');
  assert.ok(html.includes('gbf-tg-chat-sig'), 'Missing gbf-tg-chat-sig meta tag');
  assert.ok(html.includes('resolveSignedTelegramIdentity'), 'Missing resolveSignedTelegramIdentity');
  assert.ok(html.includes('chat_sig'), 'Missing chat_sig client payload propagation');
  assert.ok(html.includes('adv-form-progress-bar') && html.includes('selectAdvanceChip'), 'Missing Advance 50% progress bar or quick chips');
  assert.ok(declaredIds.has('month-picker-btn') && declaredIds.has('month-picker-menu'), 'Missing compact month picker popover DOM IDs');
  assert.ok(appScript.includes('toggleMonthMenu') && appScript.includes('selectMonthOption') && appScript.includes('renderMonthPickerUI'), 'Missing month picker JS helpers');

  // 5. WCAG 2.1/2.2 Contrast, Focus-Visible, Label & Reduced-Motion guards
  const htmlLines = html.split(/\r?\n/);
  assert.equal(htmlLines.some(l => /\btext-error\b/.test(l) && !/dark:text-/.test(l)), false, 'text-error without dark:text- override fails dark mode contrast');
  assert.equal(htmlLines.some(l => /hover:bg-canvas-mint/.test(l) && !/dark:hover:/.test(l)), false, 'hover:bg-canvas-mint without dark:hover: override causes white-on-mint contrast bug');
  assert.equal(/(?<![a-zA-Z0-9:-])outline-none/.test(html), false, 'Bare outline-none without focus: prefix removes keyboard focus indicator');
  assert.ok(html.includes('button:focus-visible') && html.includes('prefers-reduced-motion: reduce') && html.includes('.ambient-orb-1'), 'Missing accessible focus-visible or reduced-motion orb suppression');
  assert.ok(html.includes('id="toast-container" aria-live="polite"'), 'Missing aria-live polite on toast-container');
  assert.equal([...htmlMarkupOnly.matchAll(/<label\b(?![^>]*\bfor=)[^>]*>/gi)].length, 0, 'All static HTML form labels must explicitly bind for="..."');
});

test('Test 3: Gemini 3.8 Flash Interactions API compliance (zero deprecated models/endpoints)', () => {
  const configCode = fs.readFileSync(path.join(SRC_DIR, 'Config.gs'), 'utf8');
  const geminiCode = fs.readFileSync(path.join(SRC_DIR, 'GeminiAI.gs'), 'utf8');
  const combined = configCode + '\n' + geminiCode;

  assert.ok(combined.includes('gemini-3.8-flash'), 'Must enforce gemini-3.8-flash');
  assert.ok(combined.includes('/v1beta/interactions'), 'Must call Interactions API endpoint /v1beta/interactions');
  assert.ok(combined.includes('x-goog-api-key'), 'Must pass x-goog-api-key header');
  assert.ok(combined.includes('thinking_level'), 'Must configure thinking_level');

  assert.ok(!combined.includes('gemini-2.5-'), 'Must NOT contain deprecated gemini-2.5-* model');
  assert.ok(!combined.includes('gemini-2.0-'), 'Must NOT contain deprecated gemini-2.0-* model');
  assert.ok(!combined.includes('gemini-1.5-'), 'Must NOT contain deprecated gemini-1.5-* model');
  assert.ok(!combined.includes(':generateContent'), 'Must NOT call legacy :generateContent endpoint');
});

test('Test 4: Gamified Payroll, KPI & 3-AFK Forfeiture Policy unit tests', () => {
  const configCode = fs.readFileSync(path.join(SRC_DIR, 'Config.gs'), 'utf8');
  const payrollCode = fs.readFileSync(path.join(SRC_DIR, 'PayrollEngine.gs'), 'utf8');

  const context = vm.createContext({
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    Utilities: { formatDate: () => '2026-11-19' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => null }
  });

  vm.runInContext(configCode, context);
  vm.runInContext(payrollCode, context);

  const rewardConfig = {
    mvp_per_day: 1000,
    weekly_mvp_target: 5,
    weekly_mvp_bonus: 10000,
    attendance_bonus: 50000,
    mythic_rank_bonus: 30000,
    legend_rank_bonus: 15000
  };

  // Case A: MYTHIC (0 AFK, 0 Late, 10 MVP, weekly streak unlocked)
  const attRowsMythic = [
    { date: '2026-11-02', kpi: 'MVP' },
    { date: '2026-11-03', kpi: 'MVP' },
    { date: '2026-11-04', kpi: 'MVP' },
    { date: '2026-11-05', kpi: 'MVP' },
    { date: '2026-11-06', kpi: 'MVP' },
    { date: '2026-11-09', kpi: 'MVP' },
    { date: '2026-11-10', kpi: 'MVP' },
    { date: '2026-11-11', kpi: 'MVP' },
    { date: '2026-11-12', kpi: 'MVP' },
    { date: '2026-11-13', kpi: 'MVP' }
  ];
  const streakMythic = context.countWeeklyMvpStreaks_(attRowsMythic, '2026-11', 5);
  assert.equal(streakMythic.unlocked, true);
  assert.equal(streakMythic.achievedWeeks, 2);

  const singleWeekStreak = { achievedWeeks: 1, maxWeekMvp: 5, unlocked: true };
  const mythicRes = context.computeEmployeeKpiAndPayroll_(
    { present: 26, mvp: 10, ontime: 16, late: 0, unexcused_absent: 0, advance: 100000 },
    500000,
    rewardConfig,
    singleWeekStreak,
    0
  );
  assert.equal(mythicRes.rank, 'MYTHIC');
  assert.equal(mythicRes.attendanceBonus, 50000);
  assert.equal(mythicRes.dailyMvpBonus, 10000);
  assert.equal(mythicRes.weeklyStreakBonus, 10000);
  assert.equal(mythicRes.rankBonus, 30000);
  assert.equal(mythicRes.totalBonuses, 100000);
  assert.equal(mythicRes.latePenalty, 0);
  assert.equal(mythicRes.absenceDeduction, 0);
  assert.equal(mythicRes.netPayable, 500000 + 100000 - 100000);

  // Case B: 3+ AFK forfeits ALL bonuses and applies exact absenceDeduction
  const afk3Res = context.computeEmployeeKpiAndPayroll_(
    { present: 20, mvp: 10, ontime: 10, late: 0, unexcused_absent: 3, advance: 0 },
    520000,
    rewardConfig,
    singleWeekStreak,
    0
  );
  assert.equal(afk3Res.monthlyBonusesForfeited, true);
  assert.equal(afk3Res.attendanceBonus, 0);
  assert.equal(afk3Res.rankBonus, 0);
  assert.equal(afk3Res.weeklyStreakBonus, 0);
  assert.equal(afk3Res.dailyMvpBonus, 0);
  assert.equal(afk3Res.totalBonuses, 0);
  assert.equal(afk3Res.dailyRate, 20000);
  assert.equal(afk3Res.absenceDeduction, 60000);
  assert.equal(afk3Res.netPayable, 520000 - 60000);

  // Case C: Late arrival grace period (3 free, 4th+ = 2,000 MMK each)
  const late3Res = context.computeEmployeeKpiAndPayroll_(
    { present: 20, mvp: 0, ontime: 17, late: 3, unexcused_absent: 0, advance: 0 },
    400000,
    rewardConfig,
    { achievedWeeks: 0, unlocked: false },
    0
  );
  assert.equal(late3Res.latePenalty, 0);

  const late5Res = context.computeEmployeeKpiAndPayroll_(
    { present: 20, mvp: 0, ontime: 15, late: 5, unexcused_absent: 0, advance: 0 },
    400000,
    rewardConfig,
    { achievedWeeks: 0, unlocked: false },
    0
  );
  assert.equal(late5Res.latePenalty, 4000);
  assert.equal(
    late5Res.netPayable,
    Math.max(0, (400000 + late5Res.totalBonuses) - (late5Res.advanceDeduction + late5Res.absenceDeduction + late5Res.latePenalty))
  );

  // Case D: Elapsed workdays check for 2026-11 up to Nov 19 (excludes Nov 1, 8, 15 Sundays -> 16 days)
  const elapsedNov19 = context.countElapsedWorkDays_('2026-11', new Date(Date.UTC(2026, 10, 19, 3, 0, 0)));
  assert.equal(elapsedNov19, 16);
});

test('Test 5: ATT-<epoch_ms> Check-In Time Recovery produces exact hh:mm a string', () => {
  const dbCode = fs.readFileSync(path.join(SRC_DIR, 'Database.gs'), 'utf8');
  const context = vm.createContext({ Date, Number, String, isNaN });
  vm.runInContext(dbCode, context);

  const recovered = context.formatTimeFromAttId_('ATT-1793586515788');
  assert.match(recovered, /^\d{2}:\d{2} (AM|PM)$/);
  assert.equal(recovered, '08:58 AM');
  assert.ok(!recovered.includes('1899-12-30'));
});

test('Test 6: TelegramIdentity HMAC verification & Chat ID conflict/binding guards', () => {
  const tgIdCode = fs.readFileSync(path.join(SRC_DIR, 'TelegramIdentity.gs'), 'utf8');
  const propStore = { TG_LINK_SECRET: 'unit-test-hmac-secret-key' };
  const auditLogs = [];
  const rows = [
    ['Telegram_Chat_ID', 'Official_Emp_ID', 'Employee_Name', 'Role', 'Phone', 'Joined', 'Base', 'Status', 'PIN'],
    ['6062798917', '1001', 'Ko La Min Thar', 'CEO / TM', '', '', 800000, 'Active', '1001'],
    ['', '8888', 'AI-TL', 'TM', '', '', 1000000, 'Active', '8888']
  ];
  let flushCount = 0;
  const mockSheet = {
    getRange(r, c) {
      return { setValue(val) { rows[r - 1][c - 1] = val; } };
    }
  };

  const context = vm.createContext({
    String, Number, Array, Boolean, encodeURIComponent, parseInt,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => propStore[k] || null,
        setProperty: (k, v) => { propStore[k] = v; }
      })
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    SpreadsheetApp: { flush: () => { flushCount++; } },
    Utilities: {
      getUuid: () => '0000-0000',
      computeHmacSha256Signature: (msg, secret) => [...crypto.createHmac('sha256', secret).update(msg).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    getActiveWebAppUrl_: () => 'https://example.test/exec',
    getBotToken: () => '',
    getSettings: () => ({ HR_ADMIN_CHAT_ID: '' }),
    escapeHtmlText_: s => String(s),
    logToAudit: (action, empId, empName, details) => auditLogs.push({ action, empId, empName, details }),
    Logger: { log: () => {} }
  });
  vm.runInContext(tgIdCode, context);

  // Signed link verification & tamper rejection
  const signedUrl = context.buildSignedMiniAppUrl_('999888777');
  assert.ok(signedUrl.includes('tg_id=999888777&tg_sig='));
  const sig = context.signTelegramChatId_('999888777');
  assert.equal(context.resolveTrustedChatId_('999888777', sig), '999888777');
  assert.equal(context.resolveTrustedChatId_('999888777', 'forged-sig'), '');
  assert.equal(context.resolveTrustedChatId_('6062798917', sig), '');

  // Conflict guard: cannot bind Emp 1001's already-used Chat ID onto Emp 8888
  const conflictRes = context.bindTelegramChatIdToRow_(mockSheet, rows, 3, '6062798917', 'TEST');
  assert.equal(conflictRes.bound, false);
  assert.equal(conflictRes.reason, 'CHAT_USED_BY_OTHER');
  assert.equal(rows[2][0], '');
  assert.equal(auditLogs[0].action, 'CHAT_ID_BIND_CONFLICT');

  // Empty cell binds cleanly + flushes + logs CHAT_ID_BOUND
  const okRes = context.bindTelegramChatIdToRow_(mockSheet, rows, 3, '999888777', 'TEST');
  assert.equal(okRes.bound, true);
  assert.equal(okRes.reason, 'BOUND');
  assert.equal(rows[2][0], '999888777');
  assert.equal(flushCount, 1);
  assert.equal(auditLogs[1].action, 'CHAT_ID_BOUND');

  // Cannot overwrite already-bound row with another Telegram account
  const overwriteRes = context.bindTelegramChatIdToRow_(mockSheet, rows, 3, '111222333', 'TEST');
  assert.equal(overwriteRes.bound, false);
  assert.equal(overwriteRes.reason, 'ROW_HAS_OTHER_CHAT');
  assert.equal(rows[2][0], '999888777');
});

test('Test 7: Bot Option B Commands, CMD_* Inline Callbacks & Performer Receipts (Attendance/Leave/Advance/Team/Voice)', () => {
  const filesToLoad = ['Config.gs', 'Database.gs', 'TelegramIdentity.gs', 'PayrollEngine.gs', 'TelegramBot.gs', 'Code.gs'];
  const sentMessages = [];
  const callbackAnswers = [];
  const menuButtons = [];
  const auditLogs = [];

  const empRows = [
    ['Telegram_Chat_ID', 'Official_Emp_ID', 'Employee_Name', 'Role', 'Phone', 'Joined', 'Base', 'Status', 'PIN', 'Strike'],
    ['6062798917', '1001', 'La Min Thar', 'CEO / TM', '09111', '2024-01-01', 800000, 'Active', '1001', 0],
    ['777888999', '1002', 'Ko Aung', 'TL', '09222', '2024-01-01', 600000, 'Active', '1002', 0]
  ];
  const lvRows = [
    ['Leave_ID', 'Official_Emp_ID', 'Emp_Name', 'Leave_Type', 'Start_Date', 'End_Date', 'Total_Days', 'Reason', 'Pattern', 'HR_Status'],
    ['LV-1', '1001', 'La Min Thar', 'Casual', '23.11.2026', '24.11.2026', '2', 'Family', 'Standard_Day', 'Pending']
  ];
  const advRows = [
    ['Req_ID', 'Emp_ID', 'Emp_Name', 'Requested_Amount', 'Requested_Date', 'Reason', 'HR_Status', 'AI_Risk'],
    ['ADV-1', '1001', 'La Min Thar', '100000', '23.11.2026', 'Medical', 'Pending', 'Low']
  ];

  function makeMockSheet(rowsRef) {
    return {
      getLastRow: () => rowsRef.length,
      getLastColumn: () => rowsRef[0].length,
      getDataRange: () => ({ getValues: () => rowsRef, getDisplayValues: () => rowsRef.map(r => r.map(String)) }),
      getRange(r, c, numR, numC) {
        const rr = numR || 1;
        const cc = numC || 1;
        return {
          getValue: () => rowsRef[r - 1][c - 1],
          setValue: v => { rowsRef[r - 1][c - 1] = v; },
          getValues: () => rowsRef.slice(r - 1, r - 1 + rr).map(row => row.slice(c - 1, c - 1 + cc)),
          getDisplayValues: () => rowsRef.slice(r - 1, r - 1 + rr).map(row => row.slice(c - 1, c - 1 + cc).map(String))
        };
      }
    };
  }

  const sheets = {
    HR_Employees: makeMockSheet(empRows),
    Leave_Management: makeMockSheet(lvRows),
    Advance_Salary: makeMockSheet(advRows),
    System_Settings: makeMockSheet([['Setting_Key', 'Setting_Value', 'Description']]),
    System_Audit_Logs: makeMockSheet([['Timestamp', 'Action', 'Official_Emp_ID', 'Employee_Name', 'Details']]),
    Daily_Attendance: makeMockSheet([['Att_ID', 'Date', 'Official_Emp_ID', 'In', 'GPS', 'Out', 'OutGPS', 'Dist', 'Loc', 'KPI', 'Name']])
  };

  const propStore = {
    BOT_TOKEN: '12345:TEST_TOKEN',
    TG_LINK_SECRET: 'smoke-test-secret',
    WEB_APP_URL: 'https://script.google.com/macros/s/TEST/exec'
  };

  const context = vm.createContext({
    console, Date, Math, Number, String, Array, Object, Set, JSON, encodeURIComponent, parseInt, parseFloat, isNaN,
    Utilities: {
      getUuid: () => '1111-2222',
      formatDate: () => '2026-11-23',
      computeHmacSha256Signature: (msg, secret) => [...crypto.createHmac('sha256', secret).update(msg).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => propStore[k] || null,
        setProperty: (k, v) => { propStore[k] = v; },
        setProperties: obj => Object.assign(propStore, obj)
      })
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null }),
      flush: () => {}
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const body = opts && opts.payload ? JSON.parse(opts.payload) : {};
        if (url.endsWith('/sendMessage')) sentMessages.push(body);
        if (url.endsWith('/answerCallbackQuery')) callbackAnswers.push(body);
        if (url.endsWith('/setChatMenuButton')) menuButtons.push(body);
        return { getResponseCode: () => 200, getContentText: () => '{"ok":true,"result":{"message_id":99}}' };
      }
    },
    Logger: { log: () => {} }
  });

  for (const f of filesToLoad) {
    vm.runInContext(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'), context);
  }
  context.logToAudit = (action, empId, empName, details) => auditLogs.push({ action, empId, empName, details });

  const aiQueries = [];
  context.handleConversationalAIMessage = (chatId, firstName, q) => aiQueries.push({ chatId, firstName, q });

  // 1. GBF_BOT_COMMANDS covers expected live menu
  const cmdNames = [...vm.runInContext('GBF_BOT_COMMANDS', context)].map(c => c.command);
  for (const expected of ['start', 'checkin', 'mykpi', 'wallet', 'payslip', 'askai', 'link', 'id']) {
    assert.ok(cmdNames.includes(expected), `Missing command in GBF_BOT_COMMANDS: ${expected}`);
  }

  // 2. /start sets Menu button + quick inline buttons
  context.handleBotCommand_('6062798917', true, 'La Min Thar', '/start');
  assert.equal(menuButtons.length, 1);
  assert.ok(sentMessages.at(-1).reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'CMD_MYKPI'));
  assert.ok(sentMessages.at(-1).text.includes('1001'));

  // 3. /askai empty guides user; /askai@Bot question invokes Gemini AI
  context.handleBotCommand_('6062798917', true, 'La Min Thar', '/askai');
  assert.ok(sentMessages.at(-1).text.includes('GBF HR-AI Assistant'));
  context.handleBotCommand_('6062798917', true, 'La Min Thar', '/askai@GBF_HRMS_Bot နောက်ကျရင် ဘယ်လိုဖြတ်လဲ');
  assert.equal(aiQueries.length, 1);
  assert.equal(aiQueries[0].q, 'နောက်ကျရင် ဘယ်လိုဖြတ်လဲ');

  // 4. /checkin, /mykpi, /wallet, /payslip & CMD_MYKPI callback return cards with inline buttons
  for (const cmd of ['/checkin', '/mykpi', '/wallet', '/payslip', '/unknown_xyz']) {
    const before = sentMessages.length;
    context.handleBotCommand_('6062798917', true, 'La Min Thar', cmd);
    assert.equal(sentMessages.length, before + 1, `No reply for ${cmd}`);
    assert.ok(sentMessages.at(-1).reply_markup.inline_keyboard[0][0].web_app.url.includes('tg_id=6062798917'));
  }

  context.handleCallbackQuery({ id: 'cb1', data: 'CMD_PAYSLIP', from: { id: 6062798917 }, message: { chat: { id: 6062798917, type: 'private' } } });
  assert.equal(callbackAnswers.at(-1).callback_query_id, 'cb1');
  assert.ok(sentMessages.at(-1).text.includes('NET PAYABLE'));

  // 5. Performer confirmation receipts with inline buttons (Attendance, Leave, Advance, Team, Voice + Approver decision)
  const beforeReceipts = sentMessages.length;
  context.notifyPerformerAttendance_(
    { emp_id: '1001', emp_name: 'La Min Thar', type: 'Check In', lat: 16.8046, lng: 96.1771 },
    'MVP', 50, 'Normal', '08:55 AM',
    { system: { today_checked_in_list: [{ id: '1001', order: 1 }] } },
    { OFFICE_LAT: 16.804683, OFFICE_LNG: 96.177149, MAX_RADIUS: 500 },
    ''
  );
  assert.equal(sentMessages.at(-1).chat_id, '6062798917');
  assert.ok(sentMessages.at(-1).reply_markup.inline_keyboard[0][0].url.includes('google.com/maps'));

  context.notifyPerformerAdvanceSubmitted_(
    { emp_id: '1001', emp_name: 'La Min Thar' },
    100000, 300000, '🟢 Low Risk', { approverTierLabel: 'TM (Top Management)' }, ''
  );
  assert.ok(sentMessages.at(-1).text.includes('100,000 MMK'));
  assert.ok(sentMessages.at(-1).reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'CMD_WALLET'));

  context.notifyPerformerLeaveSubmitted_(
    { emp_id: '1001', emp_name: 'La Min Thar', total_days: 2 },
    'Casual', '23.11.2026', '24.11.2026', '🟢 Low Risk', { approverTierLabel: 'TM' }, ''
  );
  assert.ok(sentMessages.at(-1).text.includes('⏳ PENDING') && sentMessages.at(-1).text.includes('<blockquote>'));

  // Anonymous voice without verified chat_id must NOT look up emp_id or leak identity
  const countBeforeAnonVoice = sentMessages.length;
  context.notifyPerformerVoiceSubmitted_({ emp_id: '1001' }, 'VOC-1123', { sentiment: '🟡 Neutral', reply: 'OK' }, true, '');
  assert.equal(sentMessages.length, countBeforeAnonVoice);

  // Team receipt deduplicates overlapping creator + member
  const countBeforeTeam = sentMessages.length;
  context.notifyPerformerAndMembersTeam_(
    { emp_id: '1001', team_name: 'Team 1 (Alpha)', project: 'YTP' },
    [{ name: 'La Min Thar', role: 'Leader' }, { name: 'Ko Aung', role: 'Member' }],
    '2026-11-23', ''
  );
  assert.equal(sentMessages.length, countBeforeTeam + 2);

  // Approver decision notification includes Advance amount & inline buttons
  context.handleCallbackQuery({ id: 'cb2', data: 'ADV_APP_2_1001', from: { first_name: 'Boss' }, message: { chat: { id: 999, type: 'private' }, message_id: 50, text: 'Req' } });
  const advNotify = sentMessages.find(m => m.chat_id === '6062798917' && m.text.includes('ခွင့်ပြုလိုက်ပါပြီ'));
  assert.ok(advNotify, 'Expected enriched Advance approval receipt for performer');
  assert.ok(advNotify.text.includes('100,000 MMK'));
  assert.ok(advNotify.text.includes('<blockquote>'));
  assert.ok(advNotify.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'CMD_WALLET'));
  assert.ok(sentMessages.length > beforeReceipts + 4);
});

test('Test 8: Telegram HTML formatter, /askai 4 Quick Buttons & Check-Out duration hours', () => {
  const filesToLoad = ['Config.gs', 'Database.gs', 'TelegramIdentity.gs', 'PayrollEngine.gs', 'TelegramBot.gs', 'GeminiAI.gs', 'Code.gs'];
  const sentMessages = [];
  const empRows = [
    ['Telegram_Chat_ID', 'Official_Emp_ID', 'Employee_Name', 'Role', 'Phone', 'Joined', 'Base', 'Status', 'PIN', 'Strike'],
    ['6062798917', '1001', 'Ko La Min Thar', 'CEO / TM', '09111', '2024-01-01', 800000, 'Active', '1001', 0]
  ];
  const sheets = {
    HR_Employees: { getLastRow: () => empRows.length, getLastColumn: () => 10, getDataRange: () => ({ getValues: () => empRows }) },
    System_Settings: { getLastRow: () => 1, getLastColumn: () => 3, getDataRange: () => ({ getValues: () => [['K', 'V', 'D']] }) },
    Daily_Teams: {
      getLastRow: () => 2,
      getLastColumn: () => 5,
      getRange: () => ({ getDisplayValues: () => [['TEAM-1', '2026-11-24', 'Team 1 (Alpha)', 'YTP', 'Ko La Min Thar (Leader), Ko Aung (Tech)']] })
    },
    Daily_Attendance: { getLastRow: () => 1, getLastColumn: () => 11, getRange: () => ({ getDisplayValues: () => [] }) },
    Leave_Management: { getLastRow: () => 1, getLastColumn: () => 10, getRange: () => ({ getDisplayValues: () => [] }) },
    Advance_Salary: { getLastRow: () => 1, getLastColumn: () => 8, getRange: () => ({ getDisplayValues: () => [] }) },
    HR_Voice_Feedback: { getLastRow: () => 1, getLastColumn: () => 9, getRange: () => ({ getDisplayValues: () => [] }) }
  };
  const propStore = { BOT_TOKEN: '12345:TEST', TG_LINK_SECRET: 'sec', WEB_APP_URL: 'https://example.test/exec' };
  const context = vm.createContext({
    console, Date, Math, Number, String, Array, Object, Set, JSON, encodeURIComponent, parseInt, parseFloat, isNaN,
    Utilities: {
      getUuid: () => 'uuid-1',
      formatDate: () => '2026-11-24',
      computeHmacSha256Signature: (m, s) => [...crypto.createHmac('sha256', s).update(m).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => propStore[k] || null, setProperty: (k, v) => { propStore[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null }), flush: () => {} },
    UrlFetchApp: {
      fetch: (url, opts) => {
        if (url.endsWith('/sendMessage') && opts?.payload) sentMessages.push(JSON.parse(opts.payload));
        return { getResponseCode: () => 200, getContentText: () => '{"ok":true,"result":{"message_id":1}}' };
      }
    },
    Logger: { log: () => {} }
  });
  for (const f of filesToLoad) vm.runInContext(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'), context);

  // 1. formatAiToTelegramHtml converts Markdown bold/italic/code/bullets safely without crossing HTML tags
  const htmlOut = context.formatAiToTelegramHtml('မင်္ဂလာပါ **ကိုလမင်းသာ** `2 ရက်`\n* item <tag>');
  assert.ok(!htmlOut.includes('**'), 'Markdown ** must be converted');
  assert.ok(htmlOut.includes('<b>ကိုလမင်းသာ</b>'));
  assert.ok(htmlOut.includes('<code>2 ရက်</code>'));
  assert.ok(htmlOut.includes('• item &lt;tag&gt;'));

  const crossing = context.formatAiToTelegramHtml('`a **b` c** and __x *y__ z* and ```code **inside**```');
  assert.ok(!crossing.includes('<code>a <b>'), 'Code spans must stay opaque to bold markers');
  assert.ok(!crossing.includes('<b>x <i>'), 'Bold spans must stay opaque to italic markers');
  assert.ok(crossing.includes('<pre>code **inside**</pre>'), 'Pre blocks must stay untouched');

  // 2. Conversational AI removes raw ** via formatAiToTelegramHtml
  context.callGeminiApi_ = () => '**ရုံးတက်ရက်** ၂ ရက်၊ ခန့်မှန်း `50,000 MMK`';
  context.handleConversationalAIMessage('6062798917', 'La Min Thar', 'ဒီလ ဘယ်လောက်ရပြီလဲ');
  assert.ok(sentMessages.at(-1).text.includes('<b>ရုံးတက်ရက်</b>'));
  assert.ok(!sentMessages.at(-1).text.includes('**'));

  // 3. /askai removes Gemini 3.8 Flash label & exposes 4 Quick Question Inline Buttons
  context.handleBotCommand_('6062798917', true, 'La Min Thar', '/askai');
  const askMsg = sentMessages.at(-1);
  assert.ok(!askMsg.text.includes('3.8 Flash'), 'Must not expose internal model version in /askai');
  const askCbs = askMsg.reply_markup.inline_keyboard.flat().map(b => b.callback_data).filter(Boolean);
  for (const k of ['CMD_ASKQ_EARN', 'CMD_WALLET', 'CMD_ASKQ_LATE', 'CMD_MYKPI']) {
    assert.ok(askCbs.includes(k), `Missing quick button callback ${k}`);
  }

  // 4. CMD_ASKQ_EARN and CMD_ASKQ_LATE callbacks respond cleanly with <blockquote>
  context.handleCallbackQuery({ id: 'cb-earn', data: 'CMD_ASKQ_EARN', message: { chat: { id: 6062798917, type: 'private' } } });
  assert.ok(sentMessages.at(-1).text.includes('<blockquote>'));
  context.handleCallbackQuery({ id: 'cb-late', data: 'CMD_ASKQ_LATE', message: { chat: { id: 6062798917, type: 'private' } } });
  assert.ok(sentMessages.at(-1).text.includes('2,000 MMK'));

  // 5. Check-In MVP EARLY (+1,000 MMK) & Check-Out duration hours calculation
  assert.equal(context.computeWorkedDurationText_('08:30 AM', '05:15 PM'), '8 နာရီ 45 မိနစ် (8h 45m)');
  context.notifyPerformerAttendance_(
    { emp_id: '1001', emp_name: 'Ko La Min Thar', type: 'Check In', lat: 16.8046, lng: 96.1771 },
    'MVP', 42, 'Normal', '08:40 AM', { system: { today_checked_in_list: [{ id: '1001', order: 1, time: '08:40 AM' }] } },
    { OFFICE_LAT: 16.804683, OFFICE_LNG: 96.177149, MAX_RADIUS: 500, REWARD_MVP_PER_DAY: 1000 }, ''
  );
  assert.ok(sentMessages.at(-1).text.includes('MVP EARLY (+1,000 MMK)'));

  context.notifyPerformerAttendance_(
    { emp_id: '1001', emp_name: 'Ko La Min Thar', type: 'Check Out', lat: 16.8046, lng: 96.1771 },
    'MVP', 42, 'Normal', '05:25 PM', { system: { today_checked_in_list: [{ id: '1001', order: 1, time: '08:40 AM' }] }, today_state: { time_in: '08:40 AM' } },
    { OFFICE_LAT: 16.804683, OFFICE_LNG: 96.177149, MAX_RADIUS: 500 }, ''
  );
  assert.ok(sentMessages.at(-1).text.includes('8 နာရီ 45 မိနစ် (8h 45m)'));

  // 6. Consolidated Daily Team Rollout formatting
  const teamHtml = context.buildConsolidatedTeamsGroupMessage_(sheets.Daily_Teams, '2026-11-24', '', '', []);
  assert.ok(teamHtml.includes('Team 1 (Alpha)') && teamHtml.includes('Lead:') && teamHtml.includes('Tech:'));
});
