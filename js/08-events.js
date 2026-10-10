// ==========================================
// 08-events.js : イベント・収入・リリース・ライブ（完全版・参照切れ防止対応）
// ==========================================

const RANDOM_EVENTS = [
  {
    id: 'viral-post',
    name: '日常投稿がバズる',
    text: '選抜メンバーの日常投稿が突然バズり、トレンド入りしました。',
    choices: [
      { label: 'バズに便乗して宣伝する', detail: '資金 +${gain} / 全員のSNSに経験点+3,000pt', apply: ctx => { funds += ctx.gain; addAllStatExp('sns', 3000); } },
      { label: '静かに受け流す', detail: '効果なし', apply: () => {} }
    ]
  },
  {
    id: 'magazine-cover',
    name: '雑誌の表紙掲載',
    text: '有名雑誌からの取材・表紙掲載の打診が届きました。',
    choices: [
      { label: '有名雑誌の特集ページに出稿する', detail: '資金 -${cost} / 選抜のファッションに経験点+5,000pt', apply: ctx => { funds -= ctx.cost; addSelectedStatExp('fashion', 5000); } },
      { label: 'webメディアに回す', detail: '費用は安くファッション経験点+1,500pt', apply: ctx => { funds -= Math.round(ctx.cost * 0.2); addSelectedStatExp('fashion', 1500); } }
    ]
  },
  {
    id: 'handshake-event',
    name: '握手会に長い行列ができる',
    text: '定期公演の会場で握手会の行列が想定以上に長くなりました。',
    choices: [
      { label: '時間を追加して握手会を延長する', detail: '資金 -${cost} / 選抜の人気に経験点+4,000pt / 連携に経験点+3,000pt', apply: ctx => { funds -= ctx.cost; addSelectedStatExp('popularity', 4000); addSelectedStatExp('coordination', 3000); } },
      { label: '予定通り終了する', detail: '効果なし', apply: () => {} }
    ]
  },
  {
    id: 'streamer-collab',
    name: '配信者とのコラボ',
    text: '人気配信者とのコラボ配信の誘いが届きました。',
    choices: [
      { label: '受ける', detail: '資金 +${gain} / 選抜のSNSに経験点+4,000pt', apply: ctx => { funds += ctx.gain; addSelectedStatExp('sns', 4000); } },
      { label: '断る', detail: '効果なし', apply: () => {} }
    ]
  },
  {
    id: 'radio-request',
    name: 'ラジオの深夜放送枠',
    text: '深夜ラジオへの出演打診が届きました。',
    choices: [
      { label: '出演する', detail: '資金 +${smallGain} / 選抜のトークに経験点+3,000pt', apply: ctx => { funds += ctx.smallGain; addSelectedStatExp('talk', 3000); } },
      { label: '見送る', detail: '効果なし', apply: () => {} }
    ]
  },
  {
    id: 'rumor',
    name: '噂の拡散',
    text: 'メンバーの体調不良に関する未確認の噂がインターネットで広まっています。',
    choices: [
      { label: '公式に否定する', detail: '連携力に経験点+5,000pt / 資金 -${cost}', apply: ctx => { addAllStatExp('coordination', 5000); funds -= Math.round(ctx.cost * 0.5); } },
      { label: '沈黙する', detail: '影響なし', apply: () => {} }
    ]
  },
  {
    id: 'charity-event',
    name: '慈善イベントへの出席',
    text: '慈善行事への参加打診が届きました。',
    choices: [
      { label: '参加する', detail: '資金 -${cost} / 選抜の人気に経験点+3,000pt / 連携に経験点+4,000pt', apply: ctx => { funds -= Math.round(ctx.cost * 0.6); addSelectedStatExp('popularity', 3000); addSelectedStatExp('coordination', 4000); } },
      { label: '不参加', detail: '効果なし', apply: () => {} }
    ]
  },
  {
    id: 'equipment-upgrade',
    name: '設備強化の打診',
    kind: 'equipment',
    text: '${reason}${facilityName}をLv.${facilityLevel}からLv.${nextLevel}へ強化する打診が届きました。',
    choices: [
      { label: '強化を引き受ける', detail: '開発費 -${cost} / 週間維持費 +${maintenance}', requiresFunds: true, apply: ctx => applyEquipmentUpgrade(ctx) },
      { label: '今回は見送る', detail: '効果なし', apply: () => {} }
    ]
  }
];

function addAllStatExp(statId, amount) {
  idolRoster.forEach(member => {
    addMemberStatExp(member, statId, amount);
  });
}

function addSelectedStatExp(statId, amount) {
  const selected = idolRoster.filter(member => member.isSelected);
  const targets = selected.length ? selected : idolRoster;
  targets.forEach(member => {
    addMemberStatExp(member, statId, amount);
  });
}

function applyEquipmentUpgrade(context) {
  const facility = OFFICE_FACILITIES.find(item => item.id === context.facilityId);
  if (!facility) return;
  const level = officeUpgrades[facility.id] || 0;
  const cost = getOfficeUpgradeCost(facility, level);
  if (level >= MAX_OFFICE_LEVEL || funds < cost) {
    setLog(`【設備強化】${facility.name}の提案を資金不足で見送りました。`);
    return;
  }
  funds -= cost;
  officeUpgrades[facility.id] = level + 1;
  setLog(`【設備強化】${facility.name}をLv.${level + 1}に強化しました（開発費 ${formatMoney(cost)}）。`);
}

function adjustAllPopularity(delta) {
  idolRoster.forEach(member => {
    member.stats.popularity = Math.max(0, Math.min(100, (member.stats.popularity || 0) + delta));
  });
}

function adjustTargetPopularity(delta) {
  const selected = idolRoster.filter(member => member.isSelected);
  const targets = selected.length ? selected : idolRoster;
  targets.forEach(member => {
    member.stats.popularity = Math.max(0, Math.min(100, (member.stats.popularity || 0) + delta));
  });
}

function adjustSelectedSns(delta) {
  idolRoster.forEach(member => {
    if (member.isSelected) member.stats.sns = Math.max(0, Math.min(100, (member.stats.sns || 0) + delta));
  });
}

function fillEventTemplate(text, context) {
  return String(text)
    .replace(/\$\{gain\}/g, formatMoney(context.gain))
    .replace(/\$\{smallGain\}/g, formatMoney(context.smallGain))
    .replace(/\$\{cost\}/g, formatMoney(context.cost))
    .replace(/\$\{maintenance\}/g, formatMoney(context.maintenance))
    .replace(/\$\{reason\}/g, context.reason || '')
    .replace(/\$\{facilityName\}/g, context.facilityName || '')
    .replace(/\$\{facilityLevel\}/g, context.facilityLevel ?? '')
    .replace(/\$\{nextLevel\}/g, context.nextLevel ?? '');
}

function buildRandomEvent(eventId) {
  const event = RANDOM_EVENTS.find(entry => entry.id === eventId);
  if (!event) return null;
  const fans = calculateGroupFans();
  const context = {
    gain: Math.round(Math.max(500000, fans * 0.12)),
    smallGain: Math.round(Math.max(200000, fans * 0.05)),
    cost: Math.round(500000 + fans * 0.02)
  };
  if (event.kind === 'equipment') {
    const candidate = pickEquipmentUpgradeCandidate();
    const facility = candidate ? OFFICE_FACILITIES.find(item => item.id === candidate.facilityId) : null;
    if (!facility) return null;
    const level = officeUpgrades[facility.id] || 0;
    Object.assign(context, {
      facilityId: facility.id,
      facilityName: facility.name,
      facilityLevel: level,
      nextLevel: level + 1,
      reason: candidate.reason,
      cost: getOfficeUpgradeCost(facility, level),
      maintenance: getOfficeMaintenanceCost(facility, level + 1) - getOfficeMaintenanceCost(facility, level)
    });
  }
  return {
    id: event.id,
    name: event.name,
    text: event.text,
    choices: event.choices,
    context
  };
}

// ★ 復元用関数（セーブデータ読込時のエラー防止）
function restorePendingRandomEvent(data) {
  if (!data || !data.id) return null;
  const event = RANDOM_EVENTS.find(entry => entry.id === data.id);
  if (!event) return null;
  return { ...data, name: event.name, text: event.text, choices: event.choices, context: data.context || {} };
}

// ★ サプライズ型ランダムイベント発生ロジック
function rollRandomEvent() {
  if (getGameDateObject().getDay() !== 3) return;
  if (pendingRandomEvent || pendingCrisisResponse) return;
  
  const weekKey = getCurrentWeekKey();
  if (randomEventCheckWeekKey === weekKey) return;
  randomEventCheckWeekKey = weekKey;

  if (Math.random() >= 0.16) return;

  const pool = RANDOM_EVENTS.filter(entry => entry.kind !== 'equipment' || getEquipmentUpgradeCandidates().length);
  if (!pool.length) return;

  const event = pool[Math.floor(Math.random() * pool.length)];
  const built = buildRandomEvent(event.id);
  if (built) {
    pendingRandomEvent = built;
  }
}

function openRandomEventModal() {
  if (!pendingRandomEvent) return;
  const event = pendingRandomEvent;
  const title = document.getElementById('random-event-title');
  if (title) title.textContent = event.name;
  document.getElementById('random-event-text').textContent = fillEventTemplate(event.text, event.context);
  document.getElementById('random-event-options').innerHTML = event.choices.map((choice, index) => {
    const disabled = Boolean(choice.requiresFunds) && funds < (event.context.cost || 0);
    const detail = `${fillEventTemplate(choice.detail, event.context)}${disabled ? ' / 資金不足' : ''}`;
    return `
    <button class="main-btn" type="button" style="text-align:left; padding:10px;" ${disabled ? 'disabled' : ''} onclick="resolveRandomEvent(${index})">
      <div style="font-size:13px;">${fillEventTemplate(choice.label, event.context)}</div>
      <div style="font-size:10px; font-weight:normal; opacity:0.9; margin-top:2px;">${detail}</div>
    </button>`;
  }).join('');
  document.getElementById('random-event-modal').style.display = 'flex';
}

function resolveRandomEvent(choiceIndex) {
  if (!pendingRandomEvent) return;
  const event = pendingRandomEvent;
  const choice = event.choices[choiceIndex];
  pendingRandomEvent = null;
  document.getElementById('random-event-modal').style.display = 'none';
  if (choice) choice.apply(event.context);
  setLog(`【ランダムイベント】${event.name} / ${fillEventTemplate(choice ? choice.label : '経過', event.context)}`);
  updateUI();
}

// ★ 計画イベントエントリ取得関数（ReferenceError防止用に追加）
function getPlanEventEntries() {
  const entries = [];
  if (typeof productionSchedule === 'undefined' || !productionSchedule) return entries;
  Object.entries(productionSchedule).forEach(([planKey, plan]) => {
    if (!plan || !Array.isArray(plan.planEvents)) return;
    plan.planEvents.forEach((event, index) => {
      if (!event || !event.date) return;
      entries.push({ plan, planKey, event, index });
    });
  });
  return entries;
}

function getPlanEventType(eventId, eventName = '') {
  const presetEvent = BENEFIT_EVENT_TYPE_OPTIONS.find(option => option.id === eventId || option.name === eventName);
  if (presetEvent) {
    return {
      id: presetEvent.id,
      profileId: presetEvent.profileId || presetEvent.id,
      name: presetEvent.name,
      cost: presetEvent.baseCost,
      kind: 'benefit'
    };
  }
  return PLAN_EVENT_TYPES.find(type => type.id === eventId) || null;
}

const FANCLUB_TIERS = [
  { id: 'light', name: 'ライト', fee: 500, benefit: 'デジタル会報の配信' },
  { id: 'standard', name: 'スタンダード', fee: 1500, benefit: '会報と先行配信' },
  { id: 'premium', name: 'プレミアム', fee: 3000, benefit: '会報・先行配信・握手会参加権' }
];

function getFanClubMemberTarget(tier) {
  return Math.max(0, Math.round(calculateGroupFans() * (0.25 - tier.fee / 20000)));
}

function openFanClubModal() {
  if (!pendingFanClubEvent) return;
  const event = pendingFanClubEvent;
  const isFounding = event.type === 'founding';
  const intro = isFounding
    ? '2年目の幕開けです。応援団体（ファンクラブ）を設立するか決めてください。'
    : 'ファンクラブの1年が経過しました。会費と特典を見直しましょう。';
  document.getElementById('fanclub-text').innerHTML =
    `<div style="margin-bottom:8px;">${intro}</div>${getFanClubStatusText()}`;
  document.getElementById('fanclub-options').innerHTML = FANCLUB_TIERS.map((tier, index) => `
    <button class="main-btn" type="button" style="text-align:left; padding:10px;" onclick="resolveFanClub(${index})">
      <div style="font-size:13px;">${tier.name}（会費 ${formatMoney(tier.fee)}/月）</div>
      <div style="font-size:10px; font-weight:normal; opacity:0.9; margin-top:2px;">特典: ${tier.benefit}${fanClub && fanClub.tierId === tier.id ? '（継続）' : ''}</div>
    </button>`).join('')
    + (isFounding ? '<button class="danger-btn" type="button" onclick="resolveFanClub(-1)">ファンクラブを設けない</button>' : '');
  document.getElementById('fanclub-modal').style.display = 'flex';
}

function getFanClubStatusText() {
  if (!fanClub) return '<div style="color:#777;">ファンクラブは未設立です</div>';
  return `<div>現在の会費: <strong>${formatMoney(fanClub.fee)}/月</strong> / 会員数: <strong>${Number(fanClub.members || 0).toLocaleString()}人</strong> / 毎月の収入: <strong>${formatMoney(fanClub.members * fanClub.fee)}</strong></div>`;
}

function resolveFanClub(tierIndex) {
  if (!pendingFanClubEvent) return;
  const event = pendingFanClubEvent;
  pendingFanClubEvent = null;
  document.getElementById('fanclub-modal').style.display = 'none';

  if (tierIndex < 0) {
    fanClub = null;
    setLog('【ファンクラブ】設立を見送りました。');
  } else {
    const tier = FANCLUB_TIERS[tierIndex];
    const isNew = !fanClub;
    const previousFee = fanClub ? fanClub.fee : 0;
    const previousMembers = fanClub ? fanClub.members : 0;
    const target = getFanClubMemberTarget(tier);
    const members = isNew ? target : Math.round(previousMembers * 0.5 + target * 0.5);
    fanClub = { tierId: tier.id, fee: tier.fee, members };
    fanClubFoundedYear = currentYear;
    setLog(isNew
      ? `【ファンクラブ】${tier.name}プランで設立しました（会費 ${formatMoney(tier.fee)}/月 / 会員 ${members.toLocaleString()}人）。`
      : `【ファンクラブ】会費を見直しました（${formatMoney(previousFee)} → ${formatMoney(tier.fee)}/月 / 会員 ${previousMembers.toLocaleString()} → ${members.toLocaleString()}人）。`);
  }
  updateUI();
}

function checkFanClubYearlyEvent() {
  if (pendingFanClubEvent) return;
  if (currentYear < 2) return;
  const isFounding = !fanClub && fanClubFoundedYear === 0;
  if (!isFounding && fanClubFoundedYear === currentYear) return;
  pendingFanClubEvent = {
    type: isFounding ? 'founding' : 'renewal',
    tierId: fanClub ? fanClub.tierId : null
  };
}

function applyFanClubMonthlyIncome() {
  if (!fanClub || !fanClub.members) return 0;
  const income = fanClub.members * fanClub.fee;
  funds += income;
  yearlyStats.fanClubIncome = (yearlyStats.fanClubIncome || 0) + income;
  return income;
}

function addMonthlyCdRevenue(grossRevenue) {
  const revenue = Math.round(grossRevenue * CD_REVENUE_MONTHLY_SHARE);
  monthlyCdRevenue += revenue;
  return revenue;
}

function rollMonthlyTieUps() {
  const fans = calculateGroupFans();
  const summary = calculateTeamAverages();
  const results = [];
  TIE_UPS.forEach(tieUp => {
    const chance = tieUp.chance * (0.5 + (summary.averages.popularity || 0) / 100);
    if (Math.random() >= chance) return;
    const revenue = Math.round(fans * tieUp.revenuePerFan);
    monthlyTieUpRevenue += revenue;
    
    const selected = idolRoster.filter(m => m.isSelected);
    const targets = selected.length ? selected : idolRoster;
    targets.forEach(member => {
      if (tieUp.id === 'magazine') {
        addMemberStatExp(member, 'fashion', 3000);
      } else if (tieUp.id === 'tv') {
        addMemberStatExp(member, 'popularity', 2000);
        addMemberStatExp(member, 'vocal', 2000);
      }
    });

    const song = findLatestReleasedSong();
    if (song) addSongExperience(song, tieUp.songExperience);
    results.push({ tieUp, revenue });
  });
  return results;
}

function settleMonthlyIncome() {
  const cdRevenue = monthlyCdRevenue;
  monthlyCdRevenue = 0;
  monthlyTieUpRevenue = 0;
  if (cdRevenue > 0) {
    funds += cdRevenue;
    yearlyStats.cdRevenue = (yearlyStats.cdRevenue || 0) + cdRevenue;
    recordMonthlyIncome('CD売上収入', cdRevenue);
    setLog(`【月末精算】CD売上収入（売上の${Math.round(CD_REVENUE_MONTHLY_SHARE * 100)}%相当） ${formatMoney(cdRevenue)} を入金しました。`);
  }
  const tieUps = rollMonthlyTieUps();
  const tieUpRevenue = monthlyTieUpRevenue;
  monthlyTieUpRevenue = 0;
  if (tieUps.length) {
    funds += tieUpRevenue;
    yearlyStats.tieUpRevenue = (yearlyStats.tieUpRevenue || 0) + tieUpRevenue;
    tieUps.forEach(item => recordMonthlyIncome(`${item.tieUp.name}（臨時収入）`, item.revenue));
    const detail = tieUps.map(item => `${item.tieUp.name} ${formatMoney(item.revenue)}`).join(' / ');
    setLog(`【タイアップ】${detail} （臨時収入 ${formatMoney(tieUpRevenue)}）`);
  }
  const fanClubIncome = applyFanClubMonthlyIncome();
  if (fanClubIncome > 0) {
    recordMonthlyIncome('ファンクラブ会費', fanClubIncome);
    setLog(`【ファンクラブ】月会費 ${formatMoney(fanClubIncome)}が振り込まれました。`);
  }
  const salary = applyMonthlySalary();
  if (salary.total > 0) {
    setLog(`【給与】メンバー ${formatMoney(salary.memberSalary)} / マネージャー ${formatMoney(salary.managerSalary)} を支払いました（合計 ${formatMoney(salary.total)}）。`);
  }
  return { cdRevenue, tieUpRevenue, fanClubIncome, salary: salary.total };
}

function applyMonthlySalary() {
  const memberSalary = getTotalMemberMonthlySalary();
  const managerSalary = getTotalManagerMonthlySalary();
  const total = memberSalary + managerSalary;
  if (total <= 0) return { memberSalary: 0, managerSalary: 0, total: 0 };
  funds -= total;
  yearlyStats.salary = (yearlyStats.salary || 0) + total;
  if (memberSalary > 0) recordMonthlyExpense('メンバー給与', memberSalary);
  if (managerSalary > 0) recordMonthlyExpense('マネージャー給与', managerSalary);
  return { memberSalary, managerSalary, total };
}

function openPendingModal() {
  if (openNextPendingReport()) return;
  if (pendingMonthlyReport) return openPendingMonthlyReport();
  if (pendingSelectionEvent) return openSelectionModal();
  if (pendingCrisisResponse) return openCrisisResponseModal();
  if (pendingFanClubEvent) return openFanClubModal();
  if (pendingRandomEvent) return openRandomEventModal();
  if (pendingEquipmentEvent) return openEquipmentEventModal();
  if (pendingPerformanceOffers.length) return openMusicOfferModal();
}

function recordMonthlyIncome(label, amount) {
  const value = Math.round(Number(amount) || 0);
  if (!value) return 0;
  if (!monthlyLedger || !Array.isArray(monthlyLedger.income)) monthlyLedger = createMonthlyLedger();
  monthlyLedger.income.push({ label, amount: value });
  return value;
}

function recordMonthlyExpense(label, amount) {
  const value = Math.round(Number(amount) || 0);
  if (!value) return 0;
  if (!monthlyLedger || !Array.isArray(monthlyLedger.expense)) monthlyLedger = createMonthlyLedger();
  monthlyLedger.expense.push({ label, amount: value });
  return value;
}

function sumMonthlyLedger(list) {
  return (list || []).reduce((total, entry) => total + (entry.amount || 0), 0);
}

function isMonthEndDate(date = getGameDateObject()) {
  return date.getDate() === getDaysInMonth(date.getFullYear(), date.getMonth() + 1);
}

function showMonthlyReportModal(report) {
  const modal = document.getElementById('monthly-report-modal');
  const body = document.getElementById('monthly-report-body');
  const title = document.getElementById('monthly-report-title');
  if (!modal || !body || !report) return;
  title.textContent = `${report.year}年${report.month}月 収支報告`;

  const incomeTotal = sumMonthlyLedger(report.income);
  const expenseTotal = sumMonthlyLedger(report.expense);
  const balance = incomeTotal - expenseTotal;
  const rows = Math.max(report.income.length, report.expense.length);
  const MAX_ROWS = 8;
  const start = Math.max(0, rows - MAX_ROWS);
  const bodyRows = [];
  for (let i = start; i < rows; i++) {
    const inc = report.income[i];
    const exp = report.expense[i];
    bodyRows.push(`
      <tr>
        <td>${inc ? escapeHtml(inc.label) : ''}</td>
        <td class="num income">${inc ? formatMoney(inc.amount) : ''}</td>
        <td>${exp ? escapeHtml(exp.label) : ''}</td>
        <td class="num expense">${exp ? `-${formatMoney(exp.amount)}` : ''}</td>
      </tr>`);
  }
  const omitted = start > 0 ? `<tr class="omitted"><td colspan="4">…ほか ${start} 件</td></tr>` : '';
  const emptyRow = rows === 0 ? '<tr><td colspan="4" style="text-align:center; color:#888;">この月の収支はありません</td></tr>' : '';

  body.innerHTML = `
    <table class="monthly-report-table">
      <thead><tr><th>収入</th><th class="num">金額</th><th>支出</th><th class="num">金額</th></tr></thead>
      <tbody>${emptyRow}${omitted}${bodyRows.join('')}</tbody>
      <tfoot>
        <tr>
          <th>計</th>
          <th class="num income">${formatMoney(incomeTotal)}</th>
          <th>計</th>
          <th class="num expense">-${formatMoney(expenseTotal)}</th>
        </tr>
      </tfoot>
    </table>
    <p class="monthly-report-balance ${balance >= 0 ? 'is-profit' : 'is-loss'}">
      収支 ${balance >= 0 ? '+' : '-'}${formatMoney(Math.abs(balance))}
      <small>（${balance >= 0 ? '黒字' : '赤字'}）</small>
    </p>`;
  modal.style.display = 'flex';
}

function resumeProgressAfterReport() {
  if (Array.isArray(pendingReports) && pendingReports.length > 0) {
    openPendingModal();
    return;
  }
  if (typeof advanceUntilNextSchedulePoint === 'function') {
    advanceUntilNextSchedulePoint();
  } else if (typeof updateUI === 'function') {
    updateUI();
  }
}

function closeMonthlyReportModal() {
  const modal = document.getElementById('monthly-report-modal');
  if (modal) modal.style.display = 'none';
  pendingMonthlyReport = null;
  resumeProgressAfterReport();
}

function finalizeMonthlyLedger(year, month) {
  const report = {
    year,
    month,
    income: (monthlyLedger?.income || []).slice(),
    expense: (monthlyLedger?.expense || []).slice()
  };
  monthlyLedger = createMonthlyLedger();
  pendingMonthlyReport = report;
  return report;
}

function openPendingMonthlyReport() {
  if (!pendingMonthlyReport) return false;
  showMonthlyReportModal(pendingMonthlyReport);
  return true;
}

const LIVE_PARTICIPATION_MULTIPLIER = 1.67;

function getTierParticipationRate(kind) {
  const rates = FAN_TIER_PARTICIPATION[kind] || FAN_TIER_PARTICIPATION.live;
  const shares = getFanTierShares();
  const rate = shares.core * rates.core + shares.fan * rates.fan + shares.light * rates.light;
  return kind === 'live' ? rate * LIVE_PARTICIPATION_MULTIPLIER : rate;
}

const FAN_TIER_NEUTRAL_PARTICIPATION = 0.40;
function getEventParticipationFactor() {
  return getTierParticipationRate('event') / FAN_TIER_NEUTRAL_PARTICIPATION;
}

function recordIndividualEventSale(member, eventType, available) {
  const profile = INDIVIDUAL_EVENT_PROFILES[eventType];
  if (!profile || available <= 0) return { available: 0, unitsSold: 0, sellThrough: null };
  const popularity = member.stats.popularity || 0;
  const sns = member.stats.sns || 0;
  const base = (popularity * profile.popularityMultiplier + sns * profile.snsMultiplier) * getEventParticipationFactor();
  const demand = Math.floor(base);
  const unitsSold = Math.min(available, demand);
  const sellThrough = unitsSold / available;
  if (!Array.isArray(member.eventSalesHistory)) member.eventSalesHistory = [];
  member.eventSalesHistory.push({
    eventType,
    date: gameDate,
    available,
    unitsSold,
    sellThrough
  });
  if (member.eventSalesHistory.length > 24) member.eventSalesHistory.shift();
  return { available, unitsSold, sellThrough };
}

function recordReleaseBenefitSales(benefitId) {
  const participants = idolRoster.filter(member => member.isSelected);
  const results = participants.map(member =>
    recordIndividualEventSale(member, benefitId, INDIVIDUAL_EVENT_PROFILES[benefitId].capacity)
  );
  const available = results.reduce((sum, result) => sum + result.available, 0);
  const unitsSold = results.reduce((sum, result) => sum + result.unitsSold, 0);
  return { available, unitsSold, sellThrough: available ? unitsSold / available : 0 };
}

function sellMerchandiseAtLive() {
  if (merchandiseProducts <= 0 || merchandiseStock <= 0) {
    merchandiseSellThrough = merchandiseProducts > 0 ? 0 : null;
    return { unitsSold: 0, revenue: 0 };
  }
  const participants = idolRoster.length ? idolRoster : [];
  if (!participants.length) return { unitsSold: 0, revenue: 0 };
  const startingStock = merchandiseStock;
  const baseStockPerMember = Math.floor(startingStock / participants.length);
  let remainder = startingStock % participants.length;
  let availableTotal = 0;
  let unitsSold = 0;
  participants.forEach(member => {
    const share = baseStockPerMember + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    const available = Math.min(share, INDIVIDUAL_EVENT_PROFILES.merchandise.capacity + merchandiseProducts * 20);
    const sale = recordIndividualEventSale(member, 'merchandise', available);
    availableTotal += sale.available;
    unitsSold += sale.unitsSold;
  });
  merchandiseStock -= unitsSold;
  merchandiseUnitsSold += unitsSold;
  merchandiseSellThrough = availableTotal ? unitsSold / availableTotal : 0;
  return { unitsSold, revenue: unitsSold * 2500 };
}

function getPlanReleaseTriggerKey(plan, year, monthIndex) {
  if (plan && plan.releaseDate) return plan.releaseDate;
  return toDateKey(getLastWednesday(year, monthIndex));
}

function isPlanReleaseDue(plan, reachDate = gameDate) {
  if (!plan || !plan.release || plan.release === 'none' || plan.releaseCompleted) return false;
  const target = getPlanReleaseTriggerKey(plan, calendarYear, currentMonth - 1);
  return reachDate >= target;
}

function isPlanEventDue(entry, reachDate = gameDate) {
  const dates = Array.isArray(entry.event.dates) && entry.event.dates.length
    ? entry.event.dates
    : [entry.event.date];
  return !entry.event.completed
    && dates.includes(reachDate)
    && !(entry.event.completedDates || []).includes(reachDate);
}

function processPlanEvents(reachDate = gameDate) {
  getPlanEventEntries().forEach(entry => {
    if (!isPlanEventDue(entry, reachDate)) return;
    const type = getPlanEventType(entry.event.benefitId, entry.event.name);
    if (!type) {
      entry.plan.planEvents.splice(entry.index, 1);
      return;
    }
    if (!Array.isArray(entry.event.completedDates)) entry.event.completedDates = [];
    const isFirstEventDate = entry.event.completedDates.length === 0;
    entry.event.completedDates.push(reachDate);
    const eventDates = Array.isArray(entry.event.dates) && entry.event.dates.length
      ? entry.event.dates
      : [entry.event.date];
    entry.event.completed = eventDates.every(date => entry.event.completedDates.includes(date));
    if (isFirstEventDate && type.cost) funds -= type.cost;
    if (type.kind === 'goods') {
      const goods = sellMerchandiseAtLive();
      setLog(`【${type.name}】${formatPlanDayLabel(entry.event.date)} に開催（売上: ${formatMoney(goods.revenue)} / 販売数: ${goods.unitsSold.toLocaleString()}個）。`);
    } else {
      const result = recordReleaseBenefitSales(type.profileId || type.id);
      setLog(`【${type.name}】${formatPlanDayLabel(entry.event.date)} に開催（経費: ${formatMoney(type.cost)} / 参加メンバー平均完売率 ${Math.round(result.sellThrough * 100)}%）。`);
    }
  });
}

// ライブエントリ登録・予約時に決定時ファン数を保存するフックの統合
function ensureLiveEntryDeterminedFans(entry) {
  if (entry && !Number.isFinite(entry.determinedFans)) {
    entry.determinedFans = calculateGroupFans();
  }
}

function processMonthlyReleaseAndLive(reachDate = gameDate) {
  const planKey = `${currentYear}-${currentMonth}`;
  const plan = productionSchedule[planKey] || null;
  const summary = calculateTeamAverages();

  if (plan && isPlanReleaseDue(plan, reachDate)) {
    const isSingle = (plan.release === 'single');
    const song = ensureScheduledSong(currentYear, currentMonth, plan);
    const quality = (summary.averages.popularity * 0.6) + (summary.averages.vocal * 0.2) + (summary.averages.dance * 0.2);
    const multiplier = 1.0 + (summary.overall / 100);
    const base = isSingle ? 5000 : 7500;
    const songMultiplier = 1 + ((song.level - 1) * 0.02);
    const promoAlpha = (song.promoCount || 0) * RELEASE_PROMO_ALPHA_STEP;
    const promoMultiplier = 1 + promoAlpha;
    const qualitySales = quality * base * multiplier * songMultiplier * promoMultiplier;
    const fanDemand = calculateGroupFans() * (isSingle ? 0.35 : 0.5);
    const sales = Math.floor(qualitySales * 0.6 + fanDemand * 0.4) + Math.floor(Math.random() * 30000);

    addGroupSales(sales);
    addMonthlyCdRevenue(sales * getSongUnitPrice(song));
    song.totalSales = (song.totalSales || 0) + sales;
    song.released = true;
    song.releaseDateKey = gameDate;
    song.releasePromoAlpha = promoAlpha;
    song.firstWeekSales = sales;
    song.salesHistory = [{ weekKey: gameDate, sales }];
    const benefit = CD_BENEFITS.find(item => item.id === plan.releaseBenefit);
    if (benefit) {
      funds -= benefit.cost;
      recordMonthlyExpense(`CD特典（${benefit.name}）`, benefit.cost);
    }
    const benefitSales = benefit ? recordReleaseBenefitSales(benefit.id) : null;
    plan.releaseCompleted = true;
    const benefitText = benefit
      ? ` ${benefit.name}経費: ${formatMoney(benefit.cost)} / 参加メンバー平均完売率 ${Math.round(benefitSales.sellThrough * 100)}%。`
      : '';
    scheduleInfoMedia('release', {
      releaseType: plan.release,
      songTitle: song.title,
      sales,
      songId: song.id,
      releaseNth: songs.filter(s => s.releaseType === plan.release).length,
      releaseDate: formatPlanDayLabel(gameDate),
      centerText: getCurrentCenterText()
    });
    setLog(`【発売】${isSingle ? 'シングル' : 'アルバム'}発売！ 売上: ${sales.toLocaleString()}枚！${benefitText}`);
  }

  const allLiveEntries = getScheduledLiveEntries();
  allLiveEntries.forEach(entry => ensureLiveEntryDeterminedFans(entry));

  const todayLiveEntries = allLiveEntries.filter(entry =>
    !entry.completed && toDateKey(getLiveEntryDate(entry, entry.calendarYear, entry.month)) === gameDate
  );
  const liveLogs = [];
  const liveFinanceRows = [];
  let liveExperience = null;

  todayLiveEntries.forEach(entry => {
    const v = VENUE_DATA.find(item => item.name === entry.liveVenue);
    if (!v) return;
    const seatCapacities = getLiveSeatCapacities(v, entry.seatOptions);
    const livePromotionMultiplier = 1 + (nextLivePromotionPoints * 0.1) + (Math.max(0, officeUpgrades.liveProduction - 1) * 0.05);

    const showDates = getLiveEntryShowDates(entry);
    const totalShowCount = showDates.length;
    const isMultiDay = totalShowCount > 1;
    const yesterday = new Date(getGameDateObject());
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = lastLiveDate === toDateKey(yesterday);
    const remainingDates = showDates.filter(dateKey => dateKey !== gameDate);
    const isFinale = isMultiDay && remainingDates.length === 0;
    const priceFactor = getPriceDemandFactor(v, entry);
    let remainingDemand = Math.floor(
      getLiveAudienceDemand(v, getGameDateObject(), isFinale ? LIVE_FINALE_RATE : null, priceFactor) * livePromotionMultiplier
    );
    let totalAudience = 0;
    let totalRevenue = 0;
    seatCapacities.forEach(seat => {
      const sold = Math.min(seat.capacity, remainingDemand);
      totalAudience += sold;
      remainingDemand -= sold;
      totalRevenue += sold * getEffectiveSeatPrice(v, entry, seat);
    });

    const firstDayFans = calculateGroupFans();
    const determinedFans = Number.isFinite(entry.determinedFans) ? entry.determinedFans : firstDayFans;
    const currentStock = typeof merchandiseStock !== 'undefined' ? merchandiseStock : 0;
    const salesCap = 5000 * (firstDayFans * 3 - determinedFans * 2);
    const stockCap = 5000 * currentStock;
    const totalMerchandise = Math.max(0, Math.min(salesCap, stockCap));
    const unitsSoldCalc = Math.round(totalMerchandise / 5000);

    merchandiseStock = Math.max(0, currentStock - (firstDayFans * 3 + determinedFans * 2));
    merchandiseUnitsSold = (merchandiseUnitsSold || 0) + unitsSoldCalc;

    const streamBuyers = getStreamTicketBuyers(getGameDateObject());
    const streamRevenue = streamBuyers * STREAM_TICKET_PRICE;

    const venueCost = getVenueRentalFee(v, totalShowCount, showDates);
    const totalRevenueWithGoods = totalRevenue + totalMerchandise + streamRevenue;
    const profit = totalRevenueWithGoods - venueCost - STREAM_PRODUCTION_COST;

    yearlyStats.audience += totalAudience;
    yearlyStats.streamRevenue = (yearlyStats.streamRevenue || 0) + streamRevenue;
    yearlyStats.streamCost = (yearlyStats.streamCost || 0) + STREAM_PRODUCTION_COST;
    funds += profit;

    const target0 = entry.isPrimary ? entry.plan : entry.plan.additionalLives[entry.extraIndex];
    if (!target0.liveTotalShowCount) {
      target0.liveTotalShowCount = totalShowCount;
      target0.liveTotalAudience = 0;
    }
    const grandShowCount = target0.liveTotalShowCount || totalShowCount;
    target0.liveTotalAudience = (target0.liveTotalAudience || 0) + totalAudience;
    const grandAudience = target0.liveTotalAudience;
    const stamina = applyLiveStaminaCost(v, isMultiDay, isConsecutive);
    lastLiveDate = gameDate;
    if (!weeklyRecoveryDone) {
      applyLiveWeekRecovery();
      weeklyRecoveryDone = true;
    }

    if (!remainingDates.length) {
      liveExperience = applyLiveExperience(v, grandAudience, grandShowCount);
    }

    const target = entry.isPrimary ? entry.plan : entry.plan.additionalLives[entry.extraIndex];
    if (remainingDates.length) {
      target.liveDate = remainingDates[0];
      target.liveDates = remainingDates.slice(1);
    } else {
      markLiveEntryCompleted(entry);
    }
    const fatigueNote = stamina.fatigueGain >= LIVE_FATIGUE_GAIN + LIVE_FATIGUE_MULTI_DAY_BONUS
      ? '・疲労が大きく累積'
      : (stamina.fatigueGain > LIVE_FATIGUE_GAIN ? '・疲労が累積' : '');
    const profitText = `収支: ${profit > 0 ? '+' : ''}${formatMoney(profit)}`;
    liveFinanceRows.push({
      date: gameDate,
      venueName: v.name,
      liveName: entry.liveName || v.name,
      isFinale,
      audience: totalAudience,
      ticketRevenue: totalRevenue,
      merchandise: totalMerchandise,
      streamBuyers,
      streamRevenue,
      streamCost: STREAM_PRODUCTION_COST,
      revenue: totalRevenueWithGoods,
      venueCost,
      profit,
      staminaCost: stamina.cost,
      fatigueGain: stamina.fatigueGain,
      fatigueNote
    });
    liveLogs.push(`【ライブ成功】${entry.liveName || v.name}（${v.name} / ${totalShowCount}公演中・残り${remainingDates.length}${isFinale ? '・千秋楽' : ''}）`);
    if (liveExperience) {
      liveExperienceLogs.push({
        venue: v.name,
        showDays: grandShowCount,
        audience: grandAudience,
        ...liveExperience
      });
      const expText = Object.entries(liveExperience.gained)
        .map(([statId, amount]) => `${STATUS_KEYS.find(s => s.id === statId)?.name || statId}+${amount}`)
        .join(' / ');
      liveLogs.push(` ▼経験値 基礎${liveExperience.total}（${expText}）${liveExperience.levelUps ? ` / 能力UP ${liveExperience.levelUps}件` : ''}`);
    }
    if (!remainingDates.length) {
      scheduleInfoMedia('live', {
        liveName: entry.liveName || v.name,
        venueName: v.name,
        audience: grandAudience,
        showDays: grandShowCount,
        startDate: formatPlanDayLabel(showDates[0] || gameDate),
        endDate: formatPlanDayLabel(showDates[showDates.length - 1] || gameDate)
      });
    }
    liveLogs.push(` ▼当日 動員 ${totalAudience.toLocaleString()}人 / 配信 ${streamBuyers.toLocaleString()}人・${formatMoney(streamRevenue)}（制作費 -${formatMoney(STREAM_PRODUCTION_COST)}） / 売上: ${formatMoney(totalRevenueWithGoods)} / 会場使用料: ${formatMoney(venueCost)} / ${profitText} / 体力 -${stamina.cost}・疲労 +${stamina.fatigueGain}${fatigueNote}`);
  });
  if (todayLiveEntries.length) nextLivePromotionPoints = 0;
  if (liveLogs.length) setLog(liveLogs.join(' '));
  if (liveFinanceRows.length) showLiveFinanceModal(liveFinanceRows);

  const reachedDate = getGameDateObject(reachDate);
  if (isMonthEndDate(reachedDate)) {
    settleMonthlyIncome();
    finalizeMonthlyLedger(reachedDate.getFullYear(), reachedDate.getMonth() + 1);
  }
  processScheduledPerformances(reachDate);
  processYearEndEvents(reachDate);
  processSpecialLiveEvents(reachDate);
}

function processYearEndEvents(reachDate = gameDate) {
  const startDate = getGameDateObject();
  const limitDate = getGameDateObject(reachDate);
  const spanDays = Math.max(0, Math.round((limitDate - startDate) / 86400000));
  for (let offset = 0; offset <= spanDays; offset++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + offset);
    if (date.getMonth() + 1 !== 12) continue;

    if (date.getDate() === AWARD_DATE.day && !yearEndAwardProcessed) {
      yearEndAwardProcessed = true;
      executeYearEndAwards();
    }

    if (date.getDate() === KOHAKU_DATE.day && !yearEndKohakuProcessed) {
      yearEndKohakuProcessed = true;
      executeKohaku();
    }
  }
}

function executeKohaku() {
  const sorted = [...leagueTeams].sort((a, b) =>
    ((b.sales * 0.6) + (b.audience * 0.4)) - ((a.sales * 0.6) + (a.audience * 0.4))
  );
  const qualified = sorted.slice(0, 2).some(team => team.id === 'player');
  if (qualified) {
    idolRoster.forEach(member => {
      if (typeof STATUS_KEYS !== 'undefined') {
        STATUS_KEYS.forEach(k => addMemberStatExp(member, k.id, 15000));
      }
    });
    setLog(`【赤白歌合戦】出演決定。`);
  } else {
    setLog('【赤白歌合戦】選出されませんでした。');
  }
}

function processSpecialLiveEvents(reachDate = gameDate) {
  const startDate = getGameDateObject();
  const limitDate = getGameDateObject(reachDate);
  specialLiveEvents.forEach(event => {
    if (event.completed || !event.liveDate) return;
    const liveDate = getGameDateObject(event.liveDate);
    if (liveDate > limitDate || (liveDate < startDate && event.liveDate !== gameDate)) return;
    const venue = VENUE_DATA.find(item => item.name === event.venue);
    if (!venue) return;

    const capacity = CAPACITY_MAP[venue.cap];
    const eventMultiplier = (event.type === 'festival' ? 1.4 : 1.2) + (Math.max(0, officeUpgrades.liveProduction - 1) * 0.05);
    const audience = Math.min(capacity, Math.floor(
      getLiveAudienceDemand(venue, liveDate) * eventMultiplier
    ));
    const ticketRevenue = audience * 8000;
    const merchandiseSales = sellMerchandiseAtLive();
    const venueCost = capacity * 2500;
    const profit = ticketRevenue + merchandiseSales.revenue - venueCost;
    yearlyStats.audience += audience;
    funds += profit;
    event.completed = true;
    setLog(`【${event.name}】${venue.name}（動員 ${audience.toLocaleString()}人 / 収支 ${profit > 0 ? '+' : ''}${formatMoney(profit)}）。`);
  });
}

const LIVE_DAY_OPTIONS = [1, 2, 3, 4, 5];
const LIVE_DAY_LABELS = { 1: 'ワンデイ', 2: '2day', 3: '3day', 4: '4day', 5: '5day' };
const VENUE_TIER_RATE = { SS: 0.8, S: 0.75, A: 0.7, B: 0.65, C: 0.6, D: 0.55 };
const VENUE_TIER_DEFAULT_RATE = 0.6;
const LIVE_WEEKDAY_WEIGHT = { 0: 1.0, 6: 1.0, 5: 0.9, 1: 0.8 };
const LIVE_WEEKDAY_DEFAULT_WEIGHT = 0.7;
const GRADUATION_LIVE_RATE = 0.95;
const LIVE_FINALE_RATE = 0.9;
let liveFinanceReportPage = 0;
let liveFinanceReportTitle = '';

function getVenueTierRate(venue) {
  return VENUE_TIER_RATE[venue?.cap] ?? VENUE_TIER_DEFAULT_RATE;
}

function getLiveDayWeight(date) {
  if (!date || typeof date.getDay !== 'function') return LIVE_WEEKDAY_DEFAULT_WEIGHT;
  return LIVE_WEEKDAY_WEIGHT[date.getDay()] ?? LIVE_WEEKDAY_DEFAULT_WEIGHT;
}

function showLiveFinanceModal(rows) {
  const modal = document.getElementById('live-finance-modal');
  if (!modal || !rows.length) return;
  liveFinanceReportPage = 0;
  const nextButton = document.getElementById('live-finance-next-button');
  if (nextButton) nextButton.textContent = '閉じる';
  const title = modal.querySelector('.page-title');
  if (title) title.textContent = 'ライブ収支';
  const zero = { audience: 0, ticketRevenue: 0, merchandise: 0, streamRevenue: 0,
    streamCost: 0, venueCost: 0, profit: 0 };
  const total = rows.reduce((sum, r) => ({
    audience: sum.audience + r.audience,
    ticketRevenue: sum.ticketRevenue + r.ticketRevenue,
    merchandise: sum.merchandise + r.merchandise,
    streamRevenue: sum.streamRevenue + r.streamRevenue,
    streamCost: sum.streamCost + r.streamCost,
    venueCost: sum.venueCost + r.venueCost,
    profit: sum.profit + r.profit
  }), zero);

  const yens = v => `${v > 0 ? '+' : ''}${formatMoney(v)}`;
  const minus = v => `-${formatMoney(v)}`;
  const body = modal.querySelector('.live-finance-body');
  body.innerHTML = `
    <table class="live-finance-table">
      <thead>
        <tr>
          <th>公演日</th><th>会場</th><th>動員</th>
          <th>チケット</th><th>グッズ</th><th>配信</th><th>配信制作費</th>
          <th>売上合計</th><th>会場使用料</th><th>収支</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.date)}${r.isFinale ? '<small class="tag-finale">千秋楽</small>' : ''}</td>
            <td>${escapeHtml(r.venueName)}</td>
            <td class="num">${r.audience.toLocaleString()}</td>
            <td class="num">${formatMoney(r.ticketRevenue)}</td>
            <td class="num">${formatMoney(r.merchandise)}</td>
            <td class="num">${formatMoney(r.streamRevenue)}<small>${r.streamBuyers.toLocaleString()}人</small></td>
            <td class="num minus">${minus(r.streamCost)}</td>
            <td class="num">${formatMoney(r.revenue)}</td>
            <td class="num minus">${minus(r.venueCost)}</td>
            <td class="num ${r.profit > 0 ? 'plus' : 'minus'}">${yens(r.profit)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="2">合計（${rows.length}公演日）</th>
          <td class="num">${total.audience.toLocaleString()}</td>
          <td class="num">${formatMoney(total.ticketRevenue)}</td>
          <td class="num">${formatMoney(total.merchandise)}</td>
          <td class="num">${formatMoney(total.streamRevenue)}</td>
          <td class="num minus">${minus(total.streamCost)}</td>
          <td class="num">${formatMoney(total.revenue)}</td>
          <td class="num minus">${minus(total.venueCost)}</td>
          <td class="num ${total.profit > 0 ? 'plus' : 'minus'}">${yens(total.profit)}</td>
        </tr>
      </tfoot>
    </table>
    <p class="live-finance-note">配信購入者にはライブの配信も放送されています。動員は会場の収容人数で頭打ちになります。</p>
  `;
  modal.style.display = 'flex';
}

function closeLiveFinanceModal() {
  const modal = document.getElementById('live-finance-modal');
  if (modal) modal.style.display = 'none';
}

function getLiveAudienceDemand(venue, date = getGameDateObject(), specialRate = null, priceFactor = 1) {
  const weight = specialRate ?? getLiveDayWeight(date);
  const rate = getVenueTierRate(venue) * priceFactor;
  return Math.floor(getParticipatingFans('live') * rate * weight);
}

const STREAM_TICKET_PRICE = 5000;
const STREAM_PRODUCTION_COST = 100000000;
const STREAM_BUYER_RATE = { 0: 0.9, 6: 0.9, 1: 0.8, 5: 0.8, 2: 0.85, 3: 0.85, 4: 0.85 };
const STREAM_BUYER_DEFAULT_RATE = 0.85;

function getStreamBuyerRate(date = getGameDateObject()) {
  if (!date || typeof date.getDay !== 'function') return STREAM_BUYER_DEFAULT_RATE;
  return STREAM_BUYER_RATE[date.getDay()] ?? STREAM_BUYER_DEFAULT_RATE;
}

function getStreamTicketBuyers(date = getGameDateObject()) {
  const fans = calculateGroupFans();
  const liveRate = getTierParticipationRate('live');
  return Math.floor(fans * (1 - liveRate) * getStreamBuyerRate(date));
}

function getEffectiveSeatPrice(venue, entry, seat) {
  const configured = Number(entry?.seatPrices?.[seat.id]);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return getStandardSeatPrice(venue, seat.id);
}

function getPriceDemandFactor(venue, entry) {
  const seats = getLiveSeatCapacities(venue, entry?.seatOptions || {});
  let configuredTotal = 0;
  let standardTotal = 0;
  seats.forEach(seat => {
    configuredTotal += getEffectiveSeatPrice(venue, entry, seat) * seat.capacity;
    standardTotal += getStandardSeatPrice(venue, seat.id) * seat.capacity;
  });
  if (configuredTotal <= 0 || standardTotal <= 0) return 1;
  return Math.max(0.1, Math.min(5, standardTotal / configuredTotal));
}

function getLiveDayLabel(days) {
  return LIVE_DAY_LABELS[days] || LIVE_DAY_LABELS[1];
}

function getLiveSeatCapacities(venue, seatOptions = {}) {
  const capacity = CAPACITY_MAP[venue.cap];
  const isDome = venue.name.includes('ドーム');
  const shares = isDome
    ? { arena: 0.28, stand1: 0.30, stand2: 0.24, stand3: 0.12, stand4: 0.06 }
    : { arena: 0.40, stand1: 0.35, stand2: 0.25 };
  const baseSeatIds = Object.keys(shares);
  let assignedCapacity = 0;

  return SEAT_TYPES.filter(seat => !seat.domeOnly || isDome)
    .filter(seat => !seat.optional || seatOptions[seat.id])
    .map(seat => {
      let seatCapacity;
      if (seat.optional) {
        seatCapacity = Math.floor(capacity * (seat.id === 'annotation' ? 0.05 : 0.10));
      } else if (seat.id === baseSeatIds[baseSeatIds.length - 1]) {
        seatCapacity = capacity - assignedCapacity;
      } else {
        seatCapacity = Math.floor(capacity * shares[seat.id]);
        assignedCapacity += seatCapacity;
      }
      return { ...seat, capacity: seatCapacity };
    });
}

function ensureScheduledSong(year, month, plan) {
  let song = songs.find(item => item.id === plan.songId);
  if (!song) {
    const id = `song-${year}-${month}`;
    song = songs.find(item => item.id === id);
    if (!song) {
      const title = plan.songName || SONG_TITLES[Math.floor(Math.random() * SONG_TITLES.length)];
      song = { id, title, releaseYear: year, releaseMonth: month, releaseType: plan.release, experience: 0, level: 1, released: false };
      songs.push(song);
    }
    plan.songId = song.id;
  }
  if (plan.songName) song.title = plan.songName;
  song.releaseType = plan.release;
  return song;
}

function getSongLevelExpRequired(level) {
  const base = Math.max(0, (level || 1) - 1);
  return Math.round(SONG_LEVEL_EXP_BASE * Math.pow(SONG_LEVEL_EXP_GROWTH, base));
}

function addSongExperience(song, amount) {
  if (!song || !Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(song.experience)) song.experience = 0;
  if (!Number.isFinite(song.level)) song.level = 1;
  if (song.level >= MAX_SONG_LEVEL) return 0;
  song.experience += amount;
  let gained = 0;
  let level = song.level;
  while (level < MAX_SONG_LEVEL) {
    const required = getSongLevelExpRequired(level);
    if (song.experience < required) break;
    song.experience -= required;
    level += 1;
    gained += 1;
  }
  if (level >= MAX_SONG_LEVEL) song.experience = 0;
  if (gained > 0) song.level = level;
  return gained;
}

function getSongLevelExpProgress(song) {
  if (!song || !Number.isFinite(song.level)) return 0;
  if (song.level >= MAX_SONG_LEVEL) return 1;
  const current = song.experience || 0;
  return Math.min(1, current / getSongLevelExpRequired(song.level));
}

const SONG_UNIT_PRICE = { single: 300, album: 600 };
function getSongUnitPrice(song) {
  return SONG_UNIT_PRICE[song?.releaseType] || SONG_UNIT_PRICE.single;
}
const SINGLE_PROMO_FAN_RATIO = 1.5;
const ALBUM_PROMO_FAN_RATIO = 2;
const RELEASE_PROMO_ALPHA_STEP = 0.005;
const PROMO_DIVISOR_RELEASE_WEEK = 8;
const PROMO_DIVISOR_NORMAL = 10;
const PROMO_DIVISOR_PAST_WORK = 100;
const CD_REVENUE_MONTHLY_SHARE = 0.8;
const TIE_UPS = [
  { id: 'magazine', name: '雑誌掲載', chance: 0.28, revenuePerFan: 500, popularityGain: 2, songExperience: 4 },
  { id: 'tv', name: 'TVタイアップ', chance: 0.18, revenuePerFan: 1500, popularityGain: 1, songExperience: 10 }
];

function getPromotionCumulativeSales(baseSales, divisors) {
  const base = Math.max(0, Math.round(Number(baseSales) || 0));
  if (!base || !Array.isArray(divisors) || !divisors.length) return 0;
  let total = 0;
  let factor = 1;
  divisors.forEach(divisor => {
    const d = Number(divisor) > 1 ? Number(divisor) : PROMO_DIVISOR_NORMAL;
    total += base * factor;
    factor /= d;
  });
  return Math.ceil(total - 1e-6);
}

function trainSongs(summary) {
  const weeklyExperience = Math.max(1, Math.round((summary.averages.vocal + summary.averages.dance) / 40));
  songs.forEach(song => addSongExperience(song, weeklyExperience));
}

function getNthWeekdayOfMonth(year, month, weekday, week) {
  let count = 0;
  const lastDay = getDaysInMonth(year, month);
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day, 12);
    if (date.getDay() !== weekday) continue;
    count += 1;
    if (count === week) return toDateKey(date);
  }
  return null;
}

function getFixedDateOfMonth(year, month, day) {
  const clampedDay = Math.min(day, getDaysInMonth(year, month));
  return toDateKey(new Date(year, month - 1, clampedDay, 12));
}

function getSpecialBroadcastDate(broadcast, year) {
  if (Number.isFinite(broadcast.weekday) && Number.isFinite(broadcast.week)) {
    return getNthWeekdayOfMonth(year, broadcast.month, broadcast.weekday, broadcast.week);
  }
  return getFixedDateOfMonth(year, broadcast.month, broadcast.day);
}

function getSpecialBroadcastGameDate(broadcast, year) {
  const dateKey = getSpecialBroadcastDate(broadcast, year);
  return dateKey ? getGameDateObject(dateKey) : null;
}

function findNearestProgramDate(year, month) {
  const latestReleased = [...songs]
    .filter(song => song.released)
    .sort((a, b) => b.releaseYear - a.releaseYear || b.releaseMonth - a.releaseMonth)[0];
  if (latestReleased) return latestReleased.id;
  const upcoming = findUpcomingSinglePlan();
  if (upcoming) return ensureScheduledSong(upcoming.year, upcoming.month, upcoming.plan).id;
  const draftSong = [...songs].sort((a, b) => b.releaseYear - a.releaseYear || b.releaseMonth - a.releaseMonth)[0];
  return draftSong ? draftSong.id : null;
}

// ==========================================
// 定例歌番組オファー生成（CD発売日の1ヶ月前 ＆ 最短曜日調整版）
// ==========================================

// 指定された基準日（発売日など）から、前後いずれかで最も近い特定の曜日（0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土）の日付（YYYY-MM-DD）を取得する関数
function getNearestWeekdayDate(baseDateStr, targetWeekday) {
  const baseDate = new Date(`${baseDateStr}T12:00:00`);
  if (isNaN(baseDate.getTime())) return null;

  let bestDate = null;
  let minDiff = Infinity;

  // 前後7日間の範囲で該当する曜日を探す
  for (let i = -7; i <= 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    if (d.getDay() === targetWeekday) {
      const diff = Math.abs(i);
      if (diff < minDiff) {
        minDiff = diff;
        bestDate = d;
      }
    }
  }
  return bestDate ? toDateKey(bestDate) : null;
}

function checkMusicProgramOffers() {
  const todayStr = gameDate;
  if (!productionSchedule) return;

  Object.entries(productionSchedule).forEach(([planKey, plan]) => {
    if (!plan || !plan.release || plan.release === 'none' || plan.musicOfferSent) return;
    if (!plan.releaseDate) return;

    const releaseDateObj = new Date(`${plan.releaseDate}T12:00:00`);
    if (isNaN(releaseDateObj.getTime())) return;

    // 発売日の約1ヶ月前を算出
    const offerDateObj = new Date(releaseDateObj);
    offerDateObj.setMonth(offerDateObj.getMonth() - 1);
    
    const todayObj = getGameDateObject(todayStr);
    const diffDays = Math.round((todayObj - offerDateObj) / 86400000);

    // ★ 修正：ぴったりその日だけでなく、「1ヶ月前を過ぎた前後数日」や「1ヶ月前以降」にオファーを出すようにする
    if (diffDays >= 0 && diffDays <= 7 && !plan.musicOfferSent) {
      const song = ensureScheduledSong(plan.year || currentYear, plan.month || currentMonth, plan);
      if (!song || !Array.isArray(MUSIC_PROGRAMS)) return;

      MUSIC_PROGRAMS.forEach(program => {
        const offerId = `offer-${plan.releaseDate}-${program.id}`;
        if (!Array.isArray(pendingPerformanceOffers)) pendingPerformanceOffers = [];
        if (!pendingPerformanceOffers.some(o => o && o.id === offerId)) {
          const airDateKey = getNearestWeekdayDate(plan.releaseDate, program.weekday);
          if (!airDateKey) return;
          const airDateObj = new Date(`${airDateKey}T12:00:00`);

          pendingPerformanceOffers.push({
            id: offerId,
            name: program.name,
            airYear: airDateObj.getFullYear(),
            airMonth: airDateObj.getMonth() + 1,
            airDate: airDateKey,
            isSpecial: false,
            songId: song.id
          });
        }
      });
      plan.musicOfferSent = true;
    }
  });
}
function checkSpecialBroadcastOffers() {
  const currentGameDate = getGameDateObject();
  SPECIAL_BROADCASTS.forEach(broadcast => {
    const candidates = [
      { year: calendarYear, date: getSpecialBroadcastGameDate(broadcast, calendarYear) },
      { year: calendarYear + 1, date: getSpecialBroadcastGameDate(broadcast, calendarYear + 1) }
    ].filter(candidate => candidate.date);
    candidates.forEach(candidate => {
      const diffDays = Math.round((candidate.date - currentGameDate) / 86400000);
      if (diffDays < 0 || diffDays > SPECIAL_OFFER_LEAD_DAYS) return;
      const offerKey = `${candidate.year}-${broadcast.id}`;
      if (specialOffersSent.includes(offerKey)) return;
      specialOffersSent.push(offerKey);
      pendingPerformanceOffers.push({
        id: `special-${offerKey}`,
        name: broadcast.name,
        airYear: currentYear + (candidate.year - calendarYear),
        airMonth: broadcast.month,
        airDate: toDateKey(candidate.date),
        isSpecial: true,
        broadcastId: broadcast.id,
        extraNextDay: Boolean(broadcast.extraNextDay),
        popularityMultiplier: broadcast.popularityMultiplier,
        songExperience: broadcast.songExperience,
        appearanceFee: broadcast.appearanceFee,
        songId: findNearestProgramDate(candidate.year, broadcast.month)
      });
    });
  });
}

function processScheduledPerformances(reachDate = null) {
  const startKey = gameDate;
  const limitKey = reachDate || startKey;
  const remaining = [];
  const logs = [];

  scheduledPerformances.forEach(performance => {
    if (!performance.airDate || performance.airDate > limitKey || (reachDate && performance.airDate < startKey)) {
      remaining.push(performance);
      return;
    }
    const song = songs.find(item => item.id === performance.songId);
    const prepMultiplier = performance.prepared ? MUSIC_PREP_BONUS_MULTIPLIER : 1;

    if (performance.isInfoMedia) {
      processInfoMedia(performance);
      return;
    }

    const selected = idolRoster.filter(m => m.isSelected);
    const targets = selected.length ? selected : idolRoster;

    if (performance.isSpecial) {
      targets.forEach(member => {
        if (typeof STATUS_KEYS !== 'undefined') {
          STATUS_KEYS.forEach(k => addMemberStatExp(member, k.id, 10000));
        }
      });
      if (song) addSongExperience(song, (performance.songExperience ?? 30) * prepMultiplier);
      const fee = performance.appearanceFee || 3000000;
      funds += fee;
      logs.push(`【大型特番】${performance.name}で「${song ? song.title : '楽曲'}」を披露（メンバー全員の全能力に経験点+10,000pt / 出演料 ${formatMoney(fee)}）。`);
    } else {
      targets.forEach(member => {
        addMemberStatExp(member, 'popularity', 3000);
        addMemberStatExp(member, 'talk', 2000);
      });
      if (song) addSongExperience(song, REGULAR_PROGRAM_SONG_EXPERIENCE * prepMultiplier);
      const fee = REGULAR_PROGRAM_APPEARANCE_FEE;
      funds += fee;
      logs.push(`【テレビ出演】${performance.name}で「${song ? song.title : '楽曲'}」を披露（人気+3,000pt / トーク+2,000pt / 出演料 ${formatMoney(fee)}）。`);
    }
  });

  scheduledPerformances = remaining;
  if (logs.length) setLog(logs.join(' '));
}

function checkSenbatsuTrigger() {
  if (!isFirstWednesdayOfMonth()) return;
  if (pendingSelectionEvent) return;
  const targetDate = getGameDateObject();
  targetDate.setDate(targetDate.getDate() + SENBATSU_LEAD_DAYS);
  const targetYear = currentYear + targetDate.getFullYear() - calendarYear;
  const targetMonth = targetDate.getMonth() + 1;
  const targetKey = `${targetYear}-${targetMonth}`;

  const plan = productionSchedule[targetKey];
  if (!plan || !plan.release || plan.release === 'none') return;
  if (plan.senbatsuAnnounced) return;
  plan.senbatsuAnnounced = true;

  selectionLock = null;

  pendingSelectionEvent = createSelectionEvent({
    trigger: 'release',
    year: targetYear,
    month: targetMonth,
    releaseType: plan.release
  });
}

function createSelectionEvent({ trigger = 'manual', year = 0, month = 0, releaseType = null } = {}) {
  const currentSelected = idolRoster.filter(member => member.isSelected);
  const currentCenter = idolRoster.find(member => member.isCenter);
  const base = currentSelected.length >= MIN_SELECTION_SIZE
    ? currentSelected
    : [...idolRoster].sort((a, b) => calculateSingleOverall(b.stats) - calculateSingleOverall(a.stats))
        .slice(0, Math.max(MIN_SELECTION_SIZE, 16));
  const centerId = base.some(member => member.id === currentCenter?.id) ? currentCenter.id : base[0]?.id ?? null;
  return {
    trigger,
    year,
    month,
    releaseType,
    selectedIds: base.map(member => member.id),
    centerId
  };
}

function showLiveDetailedFinanceModal(report) {
  const modal = document.getElementById('live-finance-modal');
  if (!modal || !report) return;

  const yens = v => `${v >= 0 ? '+' : ''}${formatMoney(v)}`;
  const minus = v => `-${formatMoney(v)}`;

  const seatRows = (report.seatDetails || []).map(seat => {
    const fillRate = seat.totalCapacity > 0 ? Math.round((seat.soldCount / seat.totalCapacity) * 100) : 0;
    return `
      <tr>
        <td style="font-weight:bold;">${escapeHtml(seat.name)}</td>
        <td class="num">${formatMoney(seat.unitPrice)}</td>
        <td class="num">${seat.soldCount.toLocaleString()} / ${seat.totalCapacity.toLocaleString()}枚 <small style="color:#666;">(${fillRate}%)</small></td>
        <td class="num plus" style="font-weight:bold;">${formatMoney(seat.totalSales)}</td>
      </tr>
    `;
  }).join('');

  const body = modal.querySelector('.live-finance-body');
  if (!body) return;

  const titleEl = modal.querySelector('.page-title');
  liveFinanceReportPage = 1;
  liveFinanceReportTitle = `【${report.isMultiDay ? '千秋楽完走' : '単独公演'}】`;
  if (titleEl) {
    titleEl.textContent = `${liveFinanceReportTitle}ライブ公演報告（1/2）`;
  }
  const nextButton = document.getElementById('live-finance-next-button');
  if (nextButton) nextButton.textContent = '収支報告へ';

  const streamInfoText = report.streamDaysCount > 0
    ? `配信実施: 全${report.showCount}公演中 ${report.streamDaysCount}公演（1日あたり ${formatMoney(report.streamCostPerDay)}）`
    : '配信実施なし';
  const dailyCdRows = (report.liveCdSalesByDate || []).map(day => `
    <tr>
      <td>${formatPlanDayLabel(day.date)}</td>
      <td>${escapeHtml(day.songTitle || '対象楽曲なし')}</td>
      <td class="num">${day.unitsSold.toLocaleString()}枚</td>
      <td class="num plus">${formatMoney(day.revenue)}</td>
    </tr>`).join('');

  body.innerHTML = `
    <section class="live-report-page" data-report-page="1">
      <div style="margin-bottom:12px; padding:10px; background:#f5f7fa; border-radius:6px; font-size:12px; line-height:1.6;">
        <div><strong>公演名:</strong> ${escapeHtml(report.liveName)}（会場: ${escapeHtml(report.venueName)} / ${report.venueCap}ランク）</div>
        <div><strong>日程:</strong> ${report.showDates.map(d => formatPlanDayLabel(d)).join('・')}（全${report.showCount}公演）</div>
        <div><strong>動員・配信:</strong> 会場動員 <strong>${report.totalAudience.toLocaleString()}人</strong> / 配信 <strong>${report.streamBuyers.toLocaleString()}人</strong></div>
        <div style="color:#555;"><small>※${streamInfoText}</small></div>
      </div>
      <h4 style="margin:12px 0 6px; font-size:13px; color:#333;">◆ ライブ日CD売上</h4>
      <table class="live-finance-table" style="width:100%;">
        <thead><tr><th>公演日</th><th>対象楽曲</th><th class="num">販売枚数</th><th class="num">売上</th></tr></thead>
        <tbody>${dailyCdRows || '<tr><td colspan="4">対象となる発売済み楽曲はありません</td></tr>'}</tbody>
        <tfoot><tr><th colspan="2">合計</th><td class="num">${(report.liveCdSalesUnits || 0).toLocaleString()}枚</td><td class="num plus">${formatMoney(report.liveCdSalesRevenue || 0)}</td></tr></tfoot>
      </table>
      <h4 style="margin:12px 0 6px; font-size:13px; color:#333;">◆ ライブグッズ売上</h4>
      <table class="live-finance-table" style="width:100%;">
        <tbody><tr><th>販売個数</th><td class="num">${(report.merchandiseSold || 0).toLocaleString()}個</td><th>売上金額</th><td class="num plus">${formatMoney(report.merchandiseRevenue || 0)}</td></tr></tbody>
      </table>
    </section>

    <section class="live-report-page" data-report-page="2" style="display:none;">
      <h4 style="margin:12px 0 6px; font-size:13px; color:#333;">◆ 席種別 チケット売上明細</h4>
      <table class="live-finance-table" style="margin-bottom:14px; width:100%;">
      <thead>
        <tr>
          <th>席種</th>
          <th class="num">単価</th>
          <th class="num">販売数 / 総席数</th>
          <th class="num">売上金額</th>
        </tr>
      </thead>
      <tbody>
        ${seatRows}
      </tbody>
      <tfoot>
        <tr>
          <th colspan="2">チケット計</th>
          <td class="num"><strong>${report.totalAudience.toLocaleString()}枚</strong></td>
          <td class="num plus"><strong>${formatMoney(report.ticketRevenue)}</strong></td>
        </tr>
      </tfoot>
      </table>

      <h4 style="margin:12px 0 6px; font-size:13px; color:#333;">◆ 興行総合収支明細（売上・諸経費）</h4>
      <table class="live-finance-table" style="width:100%;">
      <thead>
        <tr>
          <th>項目</th>
          <th>詳細 / 内訳</th>
          <th class="num">金額</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>チケット売上</td>
          <td>会場来場者全席分（${report.totalAudience.toLocaleString()}人）</td>
          <td class="num plus">${formatMoney(report.ticketRevenue)}</td>
        </tr>
        <tr>
          <td>グッズ売上</td>
          <td>会場物販販売（販売数 ${report.merchandiseSold.toLocaleString()}個）</td>
          <td class="num plus">${formatMoney(report.merchandiseRevenue)}</td>
        </tr>
        <tr>
          <td>配信チケット売上</td>
          <td>${report.streamDaysCount > 0 ? `配信購入者（${report.streamBuyers.toLocaleString()}人 × ${formatMoney(STREAM_TICKET_PRICE)}）` : '配信なし'}</td>
          <td class="num plus">${formatMoney(report.streamRevenue)}</td>
        </tr>
        <tr style="background:#fff9f9;">
          <td style="color:#c0392b;">諸経費 (基本)</td>
          <td>会場・設営・人件費等固定費（${report.showCount}公演）</td>
          <td class="num minus">${minus(report.baseCost)}</td>
        </tr>
        <tr style="background:#fff9f9;">
          <td style="color:#c0392b;">配信追加費用</td>
          <td>中継・配信設営費（${report.streamDaysCount}公演分）</td>
          <td class="num minus">${minus(report.streamCost)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="font-size:13px;">
          <th colspan="2">売上合計</th>
          <td class="num plus"><strong>${formatMoney(report.grossRevenue)}</strong></td>
        </tr>
        <tr style="font-size:13px;">
          <th colspan="2">出費</th>
          <td class="num minus"><strong>${minus(report.totalCost)}</strong></td>
        </tr>
        <tr style="font-size:14px; background:#f0f8ff;">
          <th colspan="2"><strong>最終収支</strong></th>
          <td class="num ${report.profit >= 0 ? 'plus' : 'minus'}" style="font-size:15px; font-weight:bold;">
            ${yens(report.profit)}
          </td>
        </tr>
      </tfoot>
      </table>
    </section>
  `;

  modal.style.display = 'flex';
}

function advanceLiveFinanceReportPage() {
  const modal = document.getElementById('live-finance-modal');
  const body = modal?.querySelector('.live-finance-body');
  const firstPage = body?.querySelector('[data-report-page="1"]');
  const secondPage = body?.querySelector('[data-report-page="2"]');

  if (liveFinanceReportPage === 1 && firstPage && secondPage) {
    liveFinanceReportPage = 2;
    firstPage.style.display = 'none';
    secondPage.style.display = 'block';
    const title = modal.querySelector('.page-title');
    if (title) title.textContent = `${liveFinanceReportTitle}ライブ収支報告（2/2）`;
    const nextButton = document.getElementById('live-finance-next-button');
    if (nextButton) nextButton.textContent = '報告を閉じる';
    body.scrollTop = 0;
    return;
  }

  closeLiveFinanceModal();
}

window.closeLiveFinanceModal = function() {
  const modal = document.getElementById('live-finance-modal');
  if (modal) modal.style.display = 'none';
  liveFinanceReportPage = 0;
  resumeProgressAfterReport();
};
