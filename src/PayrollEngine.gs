/**
 * 💰 G.B.F. Enterprise HR & AI Management System — Gamified KPI, Burnout & Payroll Engine (PayrollEngine.gs v9.2)
 * Implements exact MLBB Gamified Policy rules, O(1) batch sheet reads, and reconciled PDF/HTML payslips.
 */

/**
 * 📅 Counts actual Mon–Sat workdays in `targetMonth` (`yyyy-MM`), capped at `nowDate` if current month.
 * Uses Date.UTC arithmetic so calculations are 100% deterministic across timezones.
 */
function countElapsedWorkDays_(targetMonth, nowDate) {
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) return 26;
  const parts = targetMonth.split("-");
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;

  const refDate = nowDate || new Date();
  const ygnDate = new Date(refDate.getTime() + 6.5 * 3600 * 1000);
  const curYear = ygnDate.getUTCFullYear();
  const curMonthIdx = ygnDate.getUTCMonth();
  const curDay = ygnDate.getUTCDate();

  if (year > curYear || (year === curYear && monthIdx > curMonthIdx)) {
    return 0;
  }

  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const lastDay = (year === curYear && monthIdx === curMonthIdx) ? Math.min(curDay, daysInMonth) : daysInMonth;

  let workDays = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dayOfWeek = new Date(Date.UTC(year, monthIdx, d)).getUTCDay();
    if (dayOfWeek !== 0) workDays++; // Sunday = 0 (off day)
  }
  return Math.max(1, workDays);
}

/**
 * 🗓️ Returns ISO week Monday (`yyyy-MM-dd`) for a given `yyyy-MM-dd` string.
 */
function getIsoWeekMonday_(dateIso) {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "";
  const p = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const mondayOffset = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - mondayOffset);
  return dt.toISOString().slice(0, 10);
}

/**
 * 🔥 Evaluates weekly MVP streaks (`>= weeklyTarget` MVP days within an ISO week Mon–Sun).
 */
function countWeeklyMvpStreaks_(attendanceRows, targetMonth, weeklyTarget) {
  const target = Math.max(1, parseInt(weeklyTarget, 10) || 5);
  const weekBuckets = {};
  (attendanceRows || []).forEach(row => {
    const dateStr = String(row.date || "").trim();
    if (!dateStr || (targetMonth && !dateStr.startsWith(targetMonth))) return;
    if (row.kpi === "MVP" || row.kpi === "Early") {
      const wk = getIsoWeekMonday_(dateStr);
      if (!wk) return;
      if (!weekBuckets[wk]) weekBuckets[wk] = new Set();
      weekBuckets[wk].add(dateStr);
    }
  });

  let achievedWeeks = 0;
  let maxWeekMvp = 0;
  const weekKeys = Object.keys(weekBuckets).sort();
  weekKeys.forEach(wk => {
    const cnt = weekBuckets[wk].size;
    if (cnt > maxWeekMvp) maxWeekMvp = cnt;
    if (cnt >= target) achievedWeeks++;
  });

  const currentWeekKey = weekKeys.length > 0 ? weekKeys[weekKeys.length - 1] : "";
  const currentWeekMvp = currentWeekKey ? weekBuckets[currentWeekKey].size : 0;

  return {
    achievedWeeks: achievedWeeks,
    maxWeekMvp: maxWeekMvp,
    currentWeekMvp: currentWeekMvp,
    unlocked: achievedWeeks > 0
  };
}

/**
 * 🏆 Pure Gamified KPI & Payroll Calculator aligned 1:1 with GBF Gamified HR Policy (MLBB Edition).
 */
function computeEmployeeKpiAndPayroll_(totals, baseSalary, rewardConfig, weeklyStreakInfo, strikeCount) {
  const cfg = rewardConfig || {};
  const mvp = Number(totals.mvp) || 0;
  const ontime = Number(totals.ontime) || 0;
  const late = Number(totals.late) || 0;
  const present = Number(totals.present) || 0;
  const afk = Number(totals.unexcused_absent) || 0;
  const usedAdvance = Number(totals.advance) || 0;
  const strikes = Number(strikeCount) || 0;

  const totalChecks = mvp + ontime + late;
  const medals = mvp + ontime;
  const targetDays = 26;

  const winRate = totalChecks > 0 ? Math.round((medals / totalChecks) * 100) : 100;
  const reliabilityScore = Math.min(40, ((Math.max(0, targetDays - afk)) / targetDays) * 40);
  const punctualityScore = totalChecks > 0 ? ((medals / totalChecks) * 40) : 40;
  const behaviorScore = Math.max(0, 20 - (late * 3) - (afk * 10) - (strikes * 2));
  const kpiScore = present > 0 ? Math.min(100, Math.max(0, Math.round(reliabilityScore + punctualityScore + behaviorScore))) : 0;

  let rank = "WARRIOR";
  let stars = 1;
  if (present === 0) {
    rank = "WARRIOR";
    stars = 1;
  } else if (kpiScore >= 90) {
    rank = "MYTHIC";
    stars = 5;
  } else if (kpiScore >= 80) {
    rank = "LEGEND";
    stars = 4;
  } else if (kpiScore >= 60) {
    rank = "EPIC";
    stars = 3;
  } else if (kpiScore >= 40) {
    rank = "ELITE";
    stars = 2;
  }

  // Policy Rule: 3+ AFK drops Rank & forfeits all monthly performance bonuses automatically
  const monthlyBonusesForfeited = afk >= 3;
  if (monthlyBonusesForfeited && (rank === "MYTHIC" || rank === "LEGEND" || rank === "EPIC")) {
    rank = "ELITE";
    stars = 2;
  }

  const mvpPerDay = Number(cfg.mvp_per_day != null ? cfg.mvp_per_day : 1000);
  const weeklyStreakAmt = Number(cfg.weekly_mvp_bonus != null ? cfg.weekly_mvp_bonus : 10000);
  const fullAttendanceAmt = Number(cfg.attendance_bonus != null ? cfg.attendance_bonus : 50000);
  const mythicAmt = Number(cfg.mythic_rank_bonus != null ? cfg.mythic_rank_bonus : 30000);
  const legendAmt = Number(cfg.legend_rank_bonus != null ? cfg.legend_rank_bonus : 15000);

  const attendanceBonus = (present > 0 && afk === 0) ? fullAttendanceAmt : 0;
  const dailyMvpBonus = monthlyBonusesForfeited ? 0 : (mvp * mvpPerDay);
  const achievedWeeks = (weeklyStreakInfo && weeklyStreakInfo.achievedWeeks) ? weeklyStreakInfo.achievedWeeks : 0;
  const weeklyStreakBonus = (!monthlyBonusesForfeited && present > 0 && achievedWeeks > 0)
    ? (achievedWeeks * weeklyStreakAmt)
    : 0;
  const rankBonus = (present > 0 && !monthlyBonusesForfeited)
    ? (rank === "MYTHIC" ? mythicAmt : (rank === "LEGEND" ? legendAmt : 0))
    : 0;

  const totalBonuses = attendanceBonus + dailyMvpBonus + weeklyStreakBonus + rankBonus;
  const dailyRate = Math.round((Number(baseSalary) || 400000) / 26);
  const absenceDeduction = afk * dailyRate;
  const latePenalty = late > 3 ? (late - 3) * 2000 : 0;
  const netPayable = Math.max(0, (baseSalary + totalBonuses) - (usedAdvance + absenceDeduction + latePenalty));

  return {
    winRate: winRate,
    kpiScore: kpiScore,
    rank: rank,
    stars: stars,
    monthlyBonusesForfeited: monthlyBonusesForfeited,
    attendanceBonus: attendanceBonus,
    dailyMvpBonus: dailyMvpBonus,
    weeklyStreakBonus: weeklyStreakBonus,
    mvpAndStreakBonus: dailyMvpBonus + weeklyStreakBonus,
    rankBonus: rankBonus,
    totalBonuses: totalBonuses,
    dailyRate: dailyRate,
    advanceDeduction: usedAdvance,
    absenceDeduction: absenceDeduction,
    latePenalty: latePenalty,
    netPayable: netPayable
  };
}

/**
 * ⚡ O(1) Batch Context Loader: Reads all required HR sheets ONCE per month for Analytics/Payroll.
 */
function loadMonthlyBatchContext_(ss, targetMonth) {
  const settings = getSettings();
  const now = new Date();
  const elapsedWorkDays = countElapsedWorkDays_(targetMonth, now);
  const rewardConfig = {
    mvp_per_day: parseFloat(settings.REWARD_MVP_PER_DAY) || 1000,
    weekly_mvp_target: parseInt(settings.REWARD_WEEKLY_MVP_TARGET, 10) || 5,
    weekly_mvp_bonus: parseFloat(settings.REWARD_WEEKLY_MVP_BONUS) || 10000,
    attendance_bonus: parseFloat(settings.REWARD_ATTENDANCE_BONUS) || 50000,
    mythic_rank_bonus: parseFloat(settings.REWARD_MYTHIC_BONUS) || 30000,
    legend_rank_bonus: parseFloat(settings.REWARD_LEGEND_BONUS) || 15000
  };

  const empSheet = ss.getSheetByName("HR_Employees");
  const attSheet = ss.getSheetByName("Daily_Attendance");
  const lvSheet = ss.getSheetByName("Leave_Management");
  const advSheet = ss.getSheetByName("Advance_Salary");

  const empRows = empSheet && empSheet.getLastRow() > 1 ? empSheet.getDataRange().getValues().slice(1) : [];
  const attRows = attSheet && attSheet.getLastRow() > 1 ? attSheet.getDataRange().getDisplayValues().slice(1) : [];
  const lvRows = lvSheet && lvSheet.getLastRow() > 1 ? lvSheet.getDataRange().getDisplayValues().slice(1) : [];
  const advRows = advSheet && advSheet.getLastRow() > 1 ? advSheet.getDataRange().getDisplayValues().slice(1) : [];

  const attByEmp = {};
  attRows.forEach(r => {
    const dStr = normalizeDateStr(r[1]);
    if (!dStr.startsWith(targetMonth)) return;
    const id = String(r[2] || "").trim();
    if (!id) return;
    if (!attByEmp[id]) attByEmp[id] = [];
    attByEmp[id].push({ date: dStr, kpi: String(r[9] || "On-Time").trim() });
  });

  const lvByEmp = {};
  lvRows.forEach(r => {
    const startMonth = normalizeMonthFromDate(r[4]);
    if (startMonth && startMonth !== targetMonth) return;
    const id = String(r[1] || "").trim();
    if (!id) return;
    if (!lvByEmp[id]) lvByEmp[id] = { approvedDays: 0, totalRequests: 0, bridgeRequests: 0 };
    lvByEmp[id].totalRequests++;
    const pattern = String(r[8] || "").trim();
    if (pattern === "Monday_Bridge" || pattern === "Friday_Bridge") {
      lvByEmp[id].bridgeRequests++;
    }
    if (String(r[9] || "").trim() === "Approved") {
      lvByEmp[id].approvedDays += parseInt(r[6], 10) || 1;
    }
  });

  const advByEmp = {};
  advRows.forEach(r => {
    const reqMonth = normalizeMonthFromDate(r[4]);
    if (reqMonth && reqMonth !== targetMonth) return;
    const id = String(r[1] || "").trim();
    if (!id) return;
    if (!advByEmp[id]) advByEmp[id] = 0;
    if (String(r[6] || "").trim() === "Approved") {
      advByEmp[id] += parseFloat(String(r[3] || "0").replace(/,/g, "")) || 0;
    }
  });

  const employees = [];
  empRows.forEach(r => {
    const empId = String(r[1] || "").trim();
    const empName = String(r[2] || "").trim();
    const status = String(r[7] || "Active").trim();
    if (!empId || !empName || status.toLowerCase() === "inactive") return;

    const role = String(r[3] || "Staff").trim();
    const baseSalary = parseFloat(String(r[6] || "400000").replace(/,/g, "")) || 400000;
    const strikeCount = parseInt(r[9], 10) || 0;

    const empAtt = attByEmp[empId] || [];
    let mvp = 0, ontime = 0, late = 0;
    empAtt.forEach(a => {
      if (a.kpi === "MVP" || a.kpi === "Early") mvp++;
      else if (a.kpi === "On-Time") ontime++;
      else if (a.kpi === "Late") late++;
    });
    const present = empAtt.length;
    const leaveMeta = lvByEmp[empId] || { approvedDays: 0, totalRequests: 0, bridgeRequests: 0 };
    const accounted = present + leaveMeta.approvedDays;
    const unexcusedAbsent = present > 0 ? Math.max(0, elapsedWorkDays - accounted) : 0;
    const usedAdvance = advByEmp[empId] || 0;

    const totals = {
      present: present,
      mvp: mvp,
      ontime: ontime,
      late: late,
      leave: leaveMeta.approvedDays,
      unexcused_absent: unexcusedAbsent,
      advance: usedAdvance
    };

    const streakInfo = countWeeklyMvpStreaks_(empAtt, targetMonth, rewardConfig.weekly_mvp_target);
    const calc = computeEmployeeKpiAndPayroll_(totals, baseSalary, rewardConfig, streakInfo, strikeCount);

    employees.push({
      empId: empId,
      empName: empName,
      role: role,
      baseSalary: baseSalary,
      strikeCount: strikeCount,
      totals: totals,
      leaveMeta: leaveMeta,
      streakInfo: streakInfo,
      calc: calc
    });
  });

  return { targetMonth: targetMonth, rewardConfig: rewardConfig, employees: employees };
}

/**
 * ✍️ Upserts multiple rows into a sheet using a single read and batch write.
 */
function batchUpsertById_(sheet, keyColIndex, numCols, newRows) {
  if (!sheet || !newRows || newRows.length === 0) return;
  const data = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
  const rowNumByKey = {};
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][keyColIndex] || "").trim();
    if (k) rowNumByKey[k] = i + 1;
  }

  const rowsToAppend = [];
  newRows.forEach(row => {
    const k = String(row[keyColIndex] || "").trim();
    if (k && rowNumByKey[k]) {
      sheet.getRange(rowNumByKey[k], 1, 1, numCols).setValues([row]);
    } else {
      rowsToAppend.push(row);
    }
  });

  if (rowsToAppend.length > 0) {
    const startRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(startRow, 1, rowsToAppend.length, numCols).setValues(rowsToAppend);
  }
}

function runAIPredictionsForMonth(targetMonth, requestedEmpId) {
  const auth = assertAuthorizedRole_(requestedEmpId, ["TM", "MM", "TL"]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const ss = getGBFSpreadsheet_();
  const aiSheet = ss.getSheetByName("AI_Predictive_Analytics");
  if (!aiSheet) return { success: false, message: "AI_Predictive_Analytics sheet not found." };

  const month = targetMonth || Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM");
  const ctx = loadMonthlyBatchContext_(ss, month);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const predictions = [];
    const sheetRows = [];

    ctx.employees.forEach(emp => {
      const bridgeRatio = emp.leaveMeta.totalRequests > 0
        ? Math.round((emp.leaveMeta.bridgeRequests / emp.leaveMeta.totalRequests) * 100)
        : 0;
      const winRate = emp.calc.winRate;
      const burnoutScore = Math.min(100, Math.max(5,
        15 +
        (winRate < 80 ? 25 : 0) +
        (emp.totals.unexcused_absent * 12) +
        (bridgeRatio >= 50 ? 15 : 0) +
        (emp.strikeCount * 10)
      ));
      const predictedLeaves = burnoutScore >= 70 ? 3 : (burnoutScore >= 45 ? 2 : 1);
      const recommendation = burnoutScore >= 60
        ? "🔴 High Burnout: Needs 1-on-1 counseling & Buddy support."
        : (burnoutScore >= 40 ? "🟡 Moderate Watch: Monitor Mon/Fri bridge & late frequency." : "🟢 Performance is stable.");

      const recId = `AIP-${month.replace("-", "")}-${emp.empId}`;
      sheetRows.push([
        recId, month, emp.empId, emp.empName, emp.role,
        `${winRate}%`, `${bridgeRatio}%`, `${burnoutScore}%`, predictedLeaves, recommendation
      ]);
      predictions.push({
        emp_id: emp.empId,
        name: emp.empName,
        burnout_score: burnoutScore,
        bridge_ratio: bridgeRatio,
        recommendation: recommendation,
        win_rate: winRate,
        predicted_leaves: predictedLeaves
      });
    });

    batchUpsertById_(aiSheet, 0, 10, sheetRows);
    SpreadsheetApp.flush();
    logToAudit("AI_PREDICTIONS_RUN", auth.empId, auth.empName, `Analyzed ${predictions.length} active staff for ${month}`);

    return { success: true, total_analyzed: predictions.length, predictions: predictions };
  } finally {
    lock.releaseLock();
  }
}

function generateMonthlyPayroll(targetMonth, requestedEmpId) {
  const auth = assertAuthorizedRole_(requestedEmpId, ["TM", "MM", "TL"]);
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const ss = getGBFSpreadsheet_();
  const paySheet = ss.getSheetByName("Payroll_Prep_Ledger");
  if (!paySheet) return { success: false, message: "Payroll_Prep_Ledger sheet not found." };

  const month = targetMonth || Utilities.formatDate(new Date(), GBF_CONFIG.GMT_OFFSET, "yyyy-MM");
  const ctx = loadMonthlyBatchContext_(ss, month);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const payrollList = [];
    const sheetRows = [];

    ctx.employees.forEach(emp => {
      const c = emp.calc;
      const payId = `PAY-${month.replace("-", "")}-${emp.empId}`;
      sheetRows.push([
        payId, month, emp.empId, emp.empName, emp.role,
        emp.baseSalary,
        c.attendanceBonus,
        c.mvpAndStreakBonus, // SLA_Bonus column holds Daily MVP + Weekly Streak Bonus
        c.rankBonus,         // Team_Shared_Bonus column holds Season Rank Bonus (Mythic/Legend)
        0,                   // Installation_Bonus
        c.advanceDeduction,
        c.absenceDeduction,
        c.latePenalty,
        c.netPayable,
        "Approved"
      ]);
      payrollList.push({ pay_id: payId, emp_id: emp.empId, name: emp.empName, net_payable: c.netPayable });
    });

    batchUpsertById_(paySheet, 0, 15, sheetRows);
    SpreadsheetApp.flush();
    logToAudit("PAYROLL_GENERATED", auth.empId, auth.empName, `Generated ${payrollList.length} payroll records for ${month}`);

    return { success: true, total_records: payrollList.length, payroll: payrollList };
  } finally {
    lock.releaseLock();
  }
}

function getEmployeePayslipData(empId, month) {
  const ss = getGBFSpreadsheet_();
  const paySheet = ss.getSheetByName("Payroll_Prep_Ledger");
  if (paySheet && paySheet.getLastRow() > 1) {
    const data = paySheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim() === String(empId).trim() && String(data[i][1]).trim() === String(month).trim()) {
        const attBonus = Number(data[i][6]) || 0;
        const mvpStreakBonus = Number(data[i][7]) || 0;
        const rankBonus = Number(data[i][8]) || 0;
        const instBonus = Number(data[i][9]) || 0;
        return {
          success: true,
          payslip: {
            payroll_id: data[i][0],
            month: data[i][1],
            name: data[i][3],
            role: data[i][4],
            base_salary: Number(data[i][5]) || 0,
            attendance_bonus: attBonus,
            mvp_streak_bonus: mvpStreakBonus,
            rank_bonus: rankBonus + instBonus,
            total_bonuses: attBonus + mvpStreakBonus + rankBonus + instBonus,
            advance_deduction: Number(data[i][10]) || 0,
            absence_deduction: Number(data[i][11]) || 0,
            late_penalty: Number(data[i][12]) || 0,
            net_payable: Number(data[i][13]) || 0,
            status: data[i][14] || "Approved"
          }
        };
      }
    }
  }

  const empSheet = ss.getSheetByName("HR_Employees");
  if (empSheet) {
    const empData = empSheet.getDataRange().getValues();
    for (let i = 1; i < empData.length; i++) {
      if (String(empData[i][1]).trim() === String(empId).trim()) {
        const empName = String(empData[i][2]).trim();
        const stats = getFullSystemState(empId, empName, null, month);
        if (stats) {
          const streakInfo = stats.weekly_streak || { achievedWeeks: 0 };
          const calc = computeEmployeeKpiAndPayroll_(stats.totals, stats.wallet.base_salary, stats.reward_config, streakInfo, stats.user.strike_count);
          return {
            success: true,
            payslip: {
              payroll_id: `EST-${String(month).replace("-", "")}-${empId}`,
              month: month,
              name: empName,
              role: stats.user.role,
              base_salary: stats.wallet.base_salary,
              attendance_bonus: calc.attendanceBonus,
              mvp_streak_bonus: calc.mvpAndStreakBonus,
              rank_bonus: calc.rankBonus,
              total_bonuses: calc.totalBonuses,
              advance_deduction: calc.advanceDeduction,
              absence_deduction: calc.absenceDeduction,
              late_penalty: calc.latePenalty,
              net_payable: calc.netPayable,
              status: "Live Preview"
            }
          };
        }
      }
    }
  }

  return { success: false };
}

function getPayrollSlipHtml(empId, month) {
  const slipRes = getEmployeePayslipData(empId, month);
  if (!slipRes.success) return `<h3>⚠️ Payslip Not Available</h3>`;
  const s = slipRes.payslip;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GBF Payslip</title><style>body{font-family:'Inter',sans-serif;background:#f1f5f9;padding:20px;color:#0f172a} .slip-box{max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:16px;border-top:6px solid #005d42;box-shadow:0 8px 24px rgba(15,23,42,.08)} table{width:100%;border-collapse:collapse;margin:20px 0;} th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;font-variant-numeric:tabular-nums;} .net-box{background:#ecfdf5;border:1px solid #10b981;padding:16px;text-align:center;border-radius:12px;} button{display:block;width:100%;padding:12px;background:#005d42;color:#fff;font-weight:bold;border:none;border-radius:10px;cursor:pointer;} @media print{button{display:none;}}</style></head>
  <body><div class="slip-box"><h2 style="text-align:center;color:#005d42;margin-bottom:4px;">G.B.F. SERVICE CO., LTD.</h2><p style="text-align:center;margin-top:0;color:#475569;">PAY PERIOD: ${escapeHtmlText_(s.month)} (${escapeHtmlText_(s.status)}) • ID: ${escapeHtmlText_(s.payroll_id)}</p>
  <p><strong>Name:</strong> ${escapeHtmlText_(s.name)} <br><strong>Role:</strong> ${escapeHtmlText_(s.role)}</p>
  <table><tr><th>Item</th><th style="text-align:right">Amount (MMK)</th></tr>
  <tr><td>Base Salary</td><td style="text-align:right">${Number(s.base_salary).toLocaleString()}</td></tr>
  <tr><td>Zero-AFK Attendance Bonus</td><td style="text-align:right;color:#059669">+${Number(s.attendance_bonus || 0).toLocaleString()}</td></tr>
  <tr><td>Daily MVP &amp; Weekly Streak Bonus</td><td style="text-align:right;color:#059669">+${Number(s.mvp_streak_bonus || 0).toLocaleString()}</td></tr>
  <tr><td>MLBB Season Rank Bonus</td><td style="text-align:right;color:#059669">+${Number(s.rank_bonus || 0).toLocaleString()}</td></tr>
  <tr><td>Advance Deduction</td><td style="text-align:right;color:#dc2626">-${Number(s.advance_deduction || 0).toLocaleString()}</td></tr>
  <tr><td>Absence Deduction</td><td style="text-align:right;color:#dc2626">-${Number(s.absence_deduction || 0).toLocaleString()}</td></tr>
  <tr><td>Late Penalty</td><td style="text-align:right;color:#dc2626">-${Number(s.late_penalty || 0).toLocaleString()}</td></tr></table>
  <div class="net-box"><h3 style="margin:0 0 4px 0;font-size:13px;color:#065f46;">NET TAKE-HOME PAY</h3><h2 style="color:#047857;margin:0">${Number(s.net_payable).toLocaleString()} MMK</h2></div>
  <br><button onclick="window.print()">🖨️ Print / Save as PDF</button></div></body></html>`;
}

function savePayslipPdfToDrive(empId, month) {
  try {
    const htmlContent = getPayrollSlipHtml(empId, month);
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML, `GBF_Payslip_${empId}_${month}.html`).getAs(MimeType.PDF);
    blob.setName(`GBF_Payslip_${empId}_${month}.pdf`);

    const folderId = PropertiesService.getScriptProperties().getProperty("PAYSLIP_FOLDER_ID");
    let targetFolder = null;
    if (folderId) {
      try { targetFolder = DriveApp.getFolderById(folderId); } catch (e) {}
    }
    if (!targetFolder) {
      targetFolder = DriveApp.getRootFolder();
    }

    const pdfFile = targetFolder.createFile(blob);
    logToAudit("DRIVE_PAYSLIP_SAVED", empId, "System", `Saved ${pdfFile.getName()} to Google Drive`);

    return {
      success: true,
      file_url: pdfFile.getUrl(),
      message: "☁️ Payslip PDF ကို Google Drive ထဲသို့ သိမ်းဆည်းပြီးပါပြီ!"
    };
  } catch (err) {
    return { success: false, message: "Drive Export Error: " + err.message };
  }
}
