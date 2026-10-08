// ==========================================
// 計算・総合力／経験値・体力・年収
// ==========================================
// ==========================================
// 4. 計算 ＆ 総合力ロジック
// ==========================================

// チームAveragesを計算する。
function calculateTeamAverages() {
  const active = idolRoster.filter(m => m.isSelected);
  const targets = active.length > 0 ? active : idolRoster;
  const count = targets.length;

  const averages = {};
  let total = 0;
  STATUS_KEYS.forEach(k => {
    const sum = targets.reduce((acc, m) => acc + (m.stats[k.id] || 0), 0);
    const avg = Math.round((sum / count) * 10) / 10;
    averages[k.id] = avg;
    total += avg;
  });

  let overall = total / STATUS_KEYS.length;
  const center = targets.find(m => m.isCenter);
  if (center) {
    const centerPower = (center.stats.popularity + center.stats.vocal + center.stats.dance) / 3;
    const teamCoreAvg = (averages.popularity + averages.vocal + averages.dance) / 3;
    if (centerPower > teamCoreAvg) {
      overall += Math.min(5, (centerPower - teamCoreAvg) * 0.1);
    }
  }

  const finalScore = Math.min(100, Math.round(overall));
  const rankData = getRankData(finalScore);

  return { averages, overall: finalScore, rankData, centerName: center ? center.name : 'なし' };
}

// SingleOverallを計算する。
function calculateSingleOverall(stats) {
  const sum = Object.values(stats).reduce((a, b) => a + b, 0);
  return Math.round(sum / Object.keys(stats).length);
}

// ==========================================
// アイドル力（表現5能力＋体調2能力の平均）
// ==========================================
function calculateIdolPower(stats) {
  const source = stats || {};
  const total = IDOL_POWER_STATS.reduce((sum, statId) => sum + (source[statId] || 0), 0);
  return Math.round(total / IDOL_POWER_STATS.length);
}

// 選抜チームのアイドル力（平均）
function calculateTeamIdolPower() {
  const active = idolRoster.filter(m => m.isSelected);
  const targets = active.length > 0 ? active : idolRoster;
  if (!targets.length) return 0;
  const total = targets.reduce((sum, m) => sum + calculateIdolPower(m.stats), 0);
  return Math.round(total / targets.length);
}

// 個人推定ファン数
function calculateMemberFans(member) {
  const stats = member.stats || {};
  return Math.round(
    (stats.popularity || 0) * 28 +
    ((stats.vocal || 0) + (stats.dance || 0)) * 9 +
    (stats.talk || 0) * 5
  );
}

function getMemberEventSalesSummary(member) {
  const history = Array.isArray(member.eventSalesHistory) ? member.eventSalesHistory : [];
  const recentGoods = history.filter(event => event.eventType === 'merchandise').slice(-3);
  const recentBenefits = history.filter(event => event.eventType !== 'merchandise').slice(-3);
  const average = events => events.length
    ? Math.round(events.reduce((total, event) => total + event.sellThrough, 0) / events.length * 100)
    : null;
  const goodsRate = average(recentGoods);
  const benefitRate = average(recentBenefits);
  return `グッズ${goodsRate === null ? '未実施' : `${goodsRate}%`} / 特典${benefitRate === null ? '未実施' : `${benefitRate}%`}`;
}

// ==========================================
// グループファン数の成長モデル
// ==========================================
const GROUP_FAN_MAX = 100000000;
const GROUP_FAN_SALES_COEFFICIENT = 82;
const GROUP_FAN_ACCELERATION_BASE = 1000000000;
const GROUP_FAN_STAT_SEED_RATE = 0.2;
const GROUP_FAN_WEEKLY_PULL = 0.35;
const GROUP_FAN_WEEKLY_DECAY = 0.004;
let fansFromSales = 0;

function getStatSeedFans() {
  const memberFanTotal = idolRoster.reduce((total, member) => total + calculateMemberFans(member), 0);
  return Math.round(memberFanTotal * 0.65 * GROUP_FAN_STAT_SEED_RATE);
}

function getTargetSalesFans() {
  const total = lifetimeSales || 0;
  if (total <= 0) return 0;
  const accelerated = GROUP_FAN_SALES_COEFFICIENT
    * Math.sqrt(total)
    * (1 + total / GROUP_FAN_ACCELERATION_BASE);
  return Math.min(GROUP_FAN_MAX, accelerated);
}

function updateWeeklyGroupFans() {
  const target = getTargetSalesFans();
  fansFromSales += (target - fansFromSales) * GROUP_FAN_WEEKLY_PULL;
  fansFromSales = Math.max(0, fansFromSales * (1 - GROUP_FAN_WEEKLY_DECAY));
  fansFromSales = Math.min(GROUP_FAN_MAX, fansFromSales);
}

function calculateGroupFans() {
  return Math.min(GROUP_FAN_MAX, getStatSeedFans() + Math.round(fansFromSales));
}

// 週ごとのファン数履歴を記録し、直近52週分を超えたデータを自動削除
function recordWeeklyFanHistory(currentDate, currentFans) {
  if (typeof player === 'undefined' || !player) {
    window.player = window.player || {};
  }
  if (!player.fanHistory) {
    player.fanHistory = [];
  }

  const lastEntry = player.fanHistory[player.fanHistory.length - 1];
  if (!lastEntry || lastEntry.date !== currentDate) {
    player.fanHistory.push({
      date: currentDate,
      fans: currentFans
    });
  }

  const MAX_WEEKS = 52;
  if (player.fanHistory.length > MAX_WEEKS) {
    player.fanHistory.shift();
  }
}

function addGroupSales(copies) {
  yearlyStats.sales += copies;
  lifetimeSales = (lifetimeSales || 0) + copies;
  recordGroupSalesHistory();
}

const SALES_HISTORY_WEEKS = 52;
const SONG_HISTORY_WEEKS = 52;

function recordGroupSalesHistory() {
  if (!Array.isArray(salesHistory)) salesHistory = [];
  const weekKey = gameDate;
  const entry = { weekKey, sales: lifetimeSales || 0 };
  const last = salesHistory[salesHistory.length - 1];
  if (last && last.weekKey === weekKey) salesHistory[salesHistory.length - 1] = entry;
  else salesHistory.push(entry);
  if (salesHistory.length > SALES_HISTORY_WEEKS) {
    salesHistory = salesHistory.slice(-SALES_HISTORY_WEEKS);
  }
}

function recordSongSalesHistory(song) {
  if (!song || !song.released) return;
  if (!Array.isArray(song.salesHistory)) song.salesHistory = [];
  const weekKey = gameDate;
  const entry = { weekKey, sales: song.totalSales || 0 };
  const last = song.salesHistory[song.salesHistory.length - 1];
  if (last && last.weekKey === weekKey) song.salesHistory[song.salesHistory.length - 1] = entry;
  else song.salesHistory.push(entry);
  if (song.salesHistory.length > SONG_HISTORY_WEEKS + 1) {
    song.salesHistory = song.salesHistory.slice(-(SONG_HISTORY_WEEKS + 1));
  }
}

function recordAllSongSalesHistory() {
  songs.forEach(song => recordSongSalesHistory(song));
}

function normalizeSalesHistory(history, limitWeeks) {
  if (!Array.isArray(history) || !history.length) return [];
  const list = history
    .filter(entry => entry && typeof entry.weekKey === 'string')
    .map(entry => ({ weekKey: entry.weekKey, sales: Math.max(0, Math.round(Number(entry.sales) || 0)) }));
  const limit = limitWeeks || SALES_HISTORY_WEEKS;
  return list.slice(-(limit + 1));
}

const FAN_TIER_PARTICIPATION = {
  live: { core: 0.2, fan: 0.125, light: 0.075 },
  event: { core: 0.7, fan: 0.5, light: 0.3 }
};
const FAN_TIER_SHARE_RANGE = {
  core: { min: 0.08, max: 0.26 },
  fan: { min: 0.30, max: 0.36 }
};

function getFanTierIntensity() {
  const summary = calculateTeamAverages();
  const quality = ((summary.averages.vocal || 0) + (summary.averages.dance || 0)) / 2;
  const popularity = summary.averages.popularity || 0;
  return Math.max(0, Math.min(1, (quality * 0.45 + popularity * 0.55) / 100));
}

function getFanTierShares() {
  const intensity = getFanTierIntensity();
  const mix = range => range.min + (range.max - range.min) * intensity;
  const core = mix(FAN_TIER_SHARE_RANGE.core);
  const fan = mix(FAN_TIER_SHARE_RANGE.fan);
  return { core, fan, light: Math.max(0, 1 - core - fan), intensity };
}

function getFanTiers() {
  const total = calculateGroupFans();
  const shares = getFanTierShares();
  return {
    core: Math.round(total * shares.core),
    fan: Math.round(total * shares.fan),
    light: Math.round(total * shares.light),
    total,
    shares
  };
}

function getParticipatingFans(kind) {
  return Math.floor(getFanTiers().total * getTierParticipationRate(kind));
}

function getStatExpRequired(level) {
  return Math.round(100 * Math.pow(1.05, Math.max(0, level - 1)));
}

function addMemberStatExp(member, statId, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return 0;
  if (!member.statExp) member.statExp = {};
  const currentLevel = member.stats[statId] || 0;
  if (currentLevel >= 100) return 0;
  member.statExp[statId] = (member.statExp[statId] || 0) + amount;
  let gained = 0;
  let level = currentLevel;
  while (level < 100) {
    const required = getStatExpRequired(level);
    if (member.statExp[statId] < required) break;
    member.statExp[statId] -= required;
    level += 1;
    gained += 1;
  }
  if (level >= 100) member.statExp[statId] = 0;
  if (gained > 0) member.stats[statId] = level;
  return gained;
}

function getStatExpProgress(member, statId) {
  const level = member.stats[statId] || 0;
  if (level >= 100) return 1;
  const current = member.statExp?.[statId] || 0;
  return Math.min(1, current / getStatExpRequired(level));
}

function ensureMemberVitalState() {
  idolRoster.forEach(member => {
    if (!member.stats) member.stats = {};
    if (!Number.isFinite(member.stats.recovery)) member.stats.recovery = 40;
    if (!Number.isFinite(member.stats.coordination)) member.stats.coordination = 30;
    if (!member.statExp || typeof member.statExp !== 'object') member.statExp = {};
    if (!Number.isFinite(member.staminaValue)) member.staminaValue = MAX_STAMINA_VALUE;
    member.staminaValue = Math.max(0, Math.min(MAX_STAMINA_VALUE, Math.round(member.staminaValue)));
    if (!Number.isFinite(member.liveFatigue)) member.liveFatigue = 0;
    member.liveFatigue = Math.max(0, Math.min(MAX_LIVE_FATIGUE, Math.round(member.liveFatigue)));
    if (member.injury) {
      if (!Number.isFinite(member.injury.weeksLeft) || member.injury.weeksLeft <= 0) {
        member.injury = null;
      } else if (!Number.isFinite(member.injury.totalWeeks)) {
        member.injury.totalWeeks = member.injury.weeksLeft;
      }
    }
  });
}

function consumeMemberStamina(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.staminaValue = Math.max(0, Math.round((member.staminaValue ?? MAX_STAMINA_VALUE) - amount));
}

function recoverMemberStamina(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.staminaValue = Math.min(MAX_STAMINA_VALUE, Math.round((member.staminaValue ?? 0) + amount));
}

function getMemberWeeklyRecovery(member, isRestDay) {
  const recoveryStat = member.stats?.recovery || 0;
  const dormitoryBonus = (officeUpgrades.dormitory || 0) * 4;
  let recovery = STAMINA_BASE_RECOVERY + recoveryStat * STAMINA_RECOVERY_PER_STAT + dormitoryBonus;
  if (isRestDay) recovery *= STAMINA_REST_RECOVERY_MULTIPLIER;
  recovery *= getLiveFatigueRecoveryFactor(member);
  return Math.round(recovery);
}

function getLiveFatigueRecoveryPenalty(member) {
  const fatigue = member?.liveFatigue || 0;
  if (fatigue <= 0) return 0;
  return (fatigue / MAX_LIVE_FATIGUE) * LIVE_FATIGUE_RECOVERY_PENALTY;
}

function getLiveFatigueRecoveryFactor(member) {
  return 1 - getLiveFatigueRecoveryPenalty(member);
}

function addLiveFatigue(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.liveFatigue = Math.min(MAX_LIVE_FATIGUE, Math.round((member.liveFatigue || 0) + amount));
}

function decayLiveFatigue() {
  idolRoster.forEach(member => {
    if (!member.liveFatigue) return;
    member.liveFatigue = Math.max(0, Math.round(member.liveFatigue - LIVE_FATIGUE_WEEKLY_DECAY));
  });
}

function getLiveStaminaCost(venue, isConsecutive) {
  const factor = LIVE_VENUE_SIZE_FACTORS[venue?.cap] ?? 1;
  const consecutiveCost = isConsecutive ? 1.15 : 1;
  return Math.round(LIVE_STAMINA_COST_BASE * factor * consecutiveCost);
}

function getLiveFatigueGain(isMultiDay, isConsecutive) {
  let gain = LIVE_FATIGUE_GAIN;
  if (isMultiDay) gain += LIVE_FATIGUE_MULTI_DAY_BONUS;
  if (isConsecutive) gain += LIVE_FATIGUE_CONSECUTIVE_BONUS;
  return gain;
}

const liveExperienceLogs = [];

function getLiveExperienceGain(venue, audience, showDays = 1) {
  const capacity = CAPACITY_MAP[venue?.cap] || 0;
  const fillRate = capacity > 0 ? audience / capacity : 0;
  const fillMultiplier = 1 + Math.min(fillRate, LIVE_FILL_RATE_CAP);
  const easeMultiplier = LIVE_EASE_MULTIPLIER[venue?.ease] ?? 1;
  const days = Math.max(1, showDays || 1);
  const dayMultiplier = 1 + (days - 1) * LIVE_MULTI_DAY_BONUS;
  return Math.max(1, Math.round(
    LIVE_BASE_EXP * fillMultiplier * easeMultiplier * dayMultiplier
  ));
}

function applyLiveExperience(venue, audience, showDays = 1) {
  const total = getLiveExperienceGain(venue, audience, showDays);
  const selected = idolRoster.filter(member => member.isSelected);
  const participants = selected.length ? selected : idolRoster;
  let levelUps = 0;
  const gained = {};
  Object.entries(LIVE_STAT_WEIGHTS).forEach(([statId, weight]) => {
    const amount = Math.max(1, Math.round(total * weight));
    gained[statId] = amount;
    participants.forEach(member => {
      levelUps += addMemberStatExp(member, statId, amount);
    });
  });
  return { total, gained, levelUps, memberCount: participants.length };
}

function applyLiveStaminaCost(venue, isMultiDay, isConsecutive) {
  const selected = idolRoster.filter(member => member.isSelected);
  const participants = selected.length ? selected : idolRoster;
  const cost = getLiveStaminaCost(venue, isConsecutive);
  const fatigueGain = getLiveFatigueGain(isMultiDay, isConsecutive);
  participants.forEach(member => {
    consumeMemberStamina(member, cost);
    addLiveFatigue(member, fatigueGain);
  });
  return { cost, fatigueGain, memberCount: participants.length };
}

function applyLiveWeekRecovery() {
  const selected = idolRoster.filter(member => member.isSelected);
  const participants = selected.length ? selected : idolRoster;
  participants.forEach(member => {
    const recovery = getMemberWeeklyRecovery(member, false);
    recoverMemberStamina(member, recovery);
    if (member.injury) recoverMemberStamina(member, Math.round(recovery * 0.5));
  });
}

function rollMemberInjury(member, extraReduction = 0) {
  if ((member.staminaValue ?? 0) >= STAMINA_WARNING_THRESHOLD) return false;
  const severity = (STAMINA_WARNING_THRESHOLD - member.staminaValue) / STAMINA_WARNING_THRESHOLD;
  const risk = severity * INJURY_BASE_RATE * Math.max(0, 1 - extraReduction);
  if (Math.random() >= risk) return false;
  const isAccident = Math.random() < INJURY_ACCIDENT_RATE;
  const [minWeeks, maxWeeks] = INJURY_ACCIDENT_WEEKS_RANGE;
  const weeks = isAccident
    ? minWeeks + Math.floor(Math.random() * (maxWeeks - minWeeks + 1))
    : INJURY_ILLNESS_WEEKS;
  member.injury = {
    type: isAccident ? 'ケガ' : '体調不良',
    weeksLeft: weeks,
    totalWeeks: weeks,
    since: gameDate
  };
  return true;
}

function formatInjuryWeeks(injury) {
  if (!injury) return '';
  const left = Math.max(0, Number.isFinite(injury.weeksLeft) ? injury.weeksLeft : 0);
  const total = Number.isFinite(injury.totalWeeks) && injury.totalWeeks > 0 ? injury.totalWeeks : 0;
  if (total > 0) return `残り${left}週／全${total}週`;
  return `残り${left}週`;
}

function processMemberInjuries() {
  idolRoster.forEach(member => {
    if (!member.injury) return;
    member.injury.weeksLeft = Math.max(0, member.injury.weeksLeft - 1);
    if (member.injury.weeksLeft <= 0) {
      setLog(`【復帰】${member.name}の${member.injury.type}が治りました（${formatInjuryWeeks(member.injury)}）。`);
      member.injury = null;
    }
  });
}

function getMemberAnnualSalary(member) {
  const fans = calculateMemberFans(member);
  const fanGrowth = Math.max(0, (groupFansAtYearStart || 0) - (previousYearGroupFansAtYearStart || 0));
  return Math.round(
    fans * MEMBER_SALARY_FAN_FACTOR * MEMBER_SALARY_FAN_DAYS +
    fanGrowth * MEMBER_SALARY_GROUP_GROWTH_FACTOR
  );
}

function getMemberMonthlySalary(member) {
  return getMemberAnnualSalary(member) / 12;
}

function getTotalMemberMonthlySalary() {
  return idolRoster.reduce((total, member) => total + getMemberMonthlySalary(member), 0);
}

function getTotalMonthlySalary() {
  return getTotalMemberMonthlySalary() + getTotalManagerMonthlySalary();
}

const CRISIS_FINE_BASE = 2000000;

function getCrisisSeverity() {
  return 1 + (100 - calculateGroupCrisisResilience()) / 100;
}

function adjustSelectedPopularity(delta) {
  idolRoster.forEach(member => {
    if (!member.isSelected) return;
    member.stats.popularity = Math.max(0, Math.min(100, (member.stats.popularity || 0) + delta));
  });
}

function getCrisisResponseOptions() {
  const fine = Math.round(CRISIS_FINE_BASE * getCrisisSeverity());
  return [
    {
      id: 'apology',
      label: '謝罪してお詫びを出す',
      detail: `資金 -${formatMoney(Math.round(fine * 0.3))} / 危機回避力 +2 / 人気 -1`,
      effect: () => {
        funds -= Math.round(fine * 0.3);
        groupCrisis = Math.min(100, groupCrisis + 2);
        adjustSelectedPopularity(-1);
      }
    },
    {
      id: 'suspension',
      label: '謹慎（短期活動休止）を発表',
      detail: '資金 据え置き / 危機回避力 -6 / 人気 -3',
      effect: () => {
        groupCrisis = Math.max(0, groupCrisis - 6);
        adjustSelectedPopularity(-3);
      }
    },
    {
      id: 'fine',
      label: '罰金（賠償金）を支払う',
      detail: `資金 -${formatMoney(fine)} / 危機回避力 +4 / 人気 据え置き`,
      effect: () => {
        funds -= fine;
        groupCrisis = Math.min(100, groupCrisis + 4);
      }
    },
    {
      id: 'discipline',
      label: '懲戒処分（該当メンバーを活動停止）',
      detail: '危機回避力 -10 / 選抜メンバーの人気 -6',
      effect: () => {
        groupCrisis = Math.max(0, groupCrisis - 10);
        adjustSelectedPopularity(-6);
      }
    }
  ];
}

function openCrisisResponseModal() {
  if (!pendingCrisisResponse) return;
  const type = pendingCrisisResponse.type;
  document.getElementById('crisis-response-text').textContent = type === 'information-leak'
    ? '内部情報の流出が報道されました。事務所としての対応方針を選んでください。'
    : 'メンバーのSNS発言が世論の批判を招きました。対応方針を選んでください。';
  document.getElementById('crisis-response-options').innerHTML = getCrisisResponseOptions().map(option => `
    <button class="main-btn" type="button" style="text-align:left; padding:10px;" onclick="resolveCrisisResponse('${option.id}')">
      <div style="font-size:13px;">${option.label}</div>
      <div style="font-size:10px; font-weight:normal; opacity:0.9; margin-top:2px;">${option.detail}</div>
    </button>`).join('');
  document.getElementById('crisis-response-modal').style.display = 'flex';
}

function resolveCrisisResponse(optionId) {
  if (!pendingCrisisResponse) return;
  const type = pendingCrisisResponse.type;
  pendingCrisisResponse = null;
  document.getElementById('crisis-response-modal').style.display = 'none';
  const option = getCrisisResponseOptions().find(item => item.id === optionId);
  if (!option) return;
  option.effect();
  const labelMap = { apology: '謝罪', suspension: '謹慎', fine: '罰金', discipline: '懲戒処分' };
  const subject = type === 'information-leak' ? '情報漏洩' : 'SNSスキャンダル';
  setLog(`【危機対応】${labelMap[optionId]}で対応しました（${subject}）。`);
  crisisEventWeekKey = '';
  crisisEventType = '';
  unlockSelection(`${subject}への対応`);
  updateUI();
}
