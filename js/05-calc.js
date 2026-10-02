// ==========================================
// 計算・総合力／経験値・体力・年収
// ==========================================
// ==========================================
// 4. 計算 ＆ 総合力ロジック
// ==========================================

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

function calculateSingleOverall(stats) {
  const sum = Object.values(stats).reduce((a, b) => a + b, 0);
  return Math.round(sum / Object.keys(stats).length);
}

// 個人推定ファン数（開始時のグループ合計がおよそ5万fanになるよう較正直している）
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
// ファン数の上限（1億人）
const GROUP_FAN_MAX = 100000000;
// 売上→ファン変換: fans = K × √(生涯累計売上) × (1 + 生涯累計売上 / ACCEL)
// K=82・根号曲線だと、累計売上 50万枚でD、100万枚でC、300万枚でB、500万枚でA、
// 1000万枚でS・SSがそれぞれ満席になるよう逆算した係数（±18%程度）。
const GROUP_FAN_SALES_COEFFICIENT = 82;
// 売上が10億枚を超えると成長が加速する（1億の上限に届けるため）
const GROUP_FAN_ACCELERATION_BASE = 1000000000;
// 能力値由来のファンを「基礎ファン」として使う割合（残りは売上駆動）
const GROUP_FAN_STAT_SEED_RATE = 0.2;
// 毎週、目標ファン数へ寄る割合（売上が伸びると増え、止まると緩やかに減る）
const GROUP_FAN_WEEKLY_PULL = 0.35;
// 毎週の自然減衰率（売上が無い週はファンが流失する）
const GROUP_FAN_WEEKLY_DECAY = 0.004;
// 売上から積み上がったファン（毎週更新される状態）
let fansFromSales = 0;

// 能力値から基礎ファンを求める
function getStatSeedFans() {
  const memberFanTotal = idolRoster.reduce((total, member) => total + calculateMemberFans(member), 0);
  return Math.round(memberFanTotal * 0.65 * GROUP_FAN_STAT_SEED_RATE);
}

// 生涯累計売上から目標ファン数を求める
function getTargetSalesFans() {
  const total = lifetimeSales || 0;
  if (total <= 0) return 0;
  const accelerated = GROUP_FAN_SALES_COEFFICIENT
    * Math.sqrt(total)
    * (1 + total / GROUP_FAN_ACCELERATION_BASE);
  return Math.min(GROUP_FAN_MAX, accelerated);
}

// 毎週更新：目標値へ寄りつつ、自然減衰で増減する
function updateWeeklyGroupFans() {
  const target = getTargetSalesFans();
  fansFromSales += (target - fansFromSales) * GROUP_FAN_WEEKLY_PULL;
  fansFromSales = Math.max(0, fansFromSales * (1 - GROUP_FAN_WEEKLY_DECAY));
  fansFromSales = Math.min(GROUP_FAN_MAX, fansFromSales);
}

function calculateGroupFans() {
  return Math.min(GROUP_FAN_MAX, getStatSeedFans() + Math.round(fansFromSales));
}

// 売上を計上し、ファン成長にも反映させる
function addGroupSales(copies) {
  yearlyStats.sales += copies;
  lifetimeSales = (lifetimeSales || 0) + copies;
}

// ファン階層（コア／ファン／ライト）の参加率（ライブは原案の1/4）
const FAN_TIER_PARTICIPATION = {
  live: { core: 0.2, fan: 0.125, light: 0.075 },
  event: { core: 0.7, fan: 0.5, light: 0.3 }
};
// 階層の配分レンジ（大小関係「コア＜ファン＜＝ライト」は常に保つ）
const FAN_TIER_SHARE_RANGE = {
  core: { min: 0.08, max: 0.26 },
  fan: { min: 0.30, max: 0.36 }
};

// 熱心度（0〜1）：歌唱・ダンス・人気が高いほどコア層が増え、ライト層が減る
function getFanTierIntensity() {
  const summary = calculateTeamAverages();
  const quality = ((summary.averages.vocal || 0) + (summary.averages.dance || 0)) / 2;
  const popularity = summary.averages.popularity || 0;
  return Math.max(0, Math.min(1, (quality * 0.45 + popularity * 0.55) / 100));
}

// 階層の配分（情勢で変動するが、大小関係は常に コア＜ファン＜＝ライト）
function getFanTierShares() {
  const intensity = getFanTierIntensity();
  const mix = range => range.min + (range.max - range.min) * intensity;
  const core = mix(FAN_TIER_SHARE_RANGE.core);
  const fan = mix(FAN_TIER_SHARE_RANGE.fan);
  return { core, fan, light: Math.max(0, 1 - core - fan), intensity };
}

// グループファンを3階層に分解する
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

// ライブ／イベントに実際に参加するファン数（階層ごとの参加率で決まる）
function getParticipatingFans(kind) {
  // 階層別参加率の加重平均（getTierParticipationRate）と一致させる
  return Math.floor(getFanTiers().total * getTierParticipationRate(kind));
}

// ==========================================
// 4.5 能力経験値システム・体力値・年収
// ==========================================

// 能力値を1上げるのに必要な経験値 = 100 × 1.05^(現在のレベル-1)
function getStatExpRequired(level) {
  return Math.round(100 * Math.pow(1.05, Math.max(0, level - 1)));
}

// 経験値を溜めて能力値を上げる（Lv.100で経験値は消費されない）
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

// 次のレベルまでの進捗率（0〜1）
function getStatExpProgress(member, statId) {
  const level = member.stats[statId] || 0;
  if (level >= 100) return 1;
  const current = member.statExp?.[statId] || 0;
  return Math.min(1, current / getStatExpRequired(level));
}

// 旧セーブに不足している回復力・連携力・経験値・体力値を補完する
function ensureMemberVitalState() {
  idolRoster.forEach(member => {
    if (!member.stats) member.stats = {};
    if (!Number.isFinite(member.stats.recovery)) member.stats.recovery = 40;
    // 連携力は後から追加した能力なので、旧セーブには新人が入会した時の初期値（30）を入れる
    if (!Number.isFinite(member.stats.coordination)) member.stats.coordination = 30;
    if (!member.statExp || typeof member.statExp !== 'object') member.statExp = {};
    if (!Number.isFinite(member.staminaValue)) member.staminaValue = MAX_STAMINA_VALUE;
    member.staminaValue = Math.max(0, Math.min(MAX_STAMINA_VALUE, Math.round(member.staminaValue)));
    if (!Number.isFinite(member.liveFatigue)) member.liveFatigue = 0;
    member.liveFatigue = Math.max(0, Math.min(MAX_LIVE_FATIGUE, Math.round(member.liveFatigue)));
    if (member.injury && (!Number.isFinite(member.injury.weeksLeft) || member.injury.weeksLeft <= 0)) {
      member.injury = null;
    }
  });
}

// メンバーの体力値を消費する（0未満にはならない）
function consumeMemberStamina(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.staminaValue = Math.max(0, Math.round((member.staminaValue ?? MAX_STAMINA_VALUE) - amount));
}

// メンバーの体力値を回復させる
function recoverMemberStamina(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.staminaValue = Math.min(MAX_STAMINA_VALUE, Math.round((member.staminaValue ?? 0) + amount));
}

// 毎週の自然回復量（回復力・寮設備・メンタルケアで変動）
function getMemberWeeklyRecovery(member, isRestDay) {
  const recoveryStat = member.stats?.recovery || 0;
  const dormitoryBonus = (officeUpgrades.dormitory || 0) * 4;
  // 自然回復はメンバーの回復力と寮のみで決まる（マネージャーはかからない）
  let recovery = STAMINA_BASE_RECOVERY + recoveryStat * STAMINA_RECOVERY_PER_STAT + dormitoryBonus;
  if (isRestDay) recovery *= STAMINA_REST_RECOVERY_MULTIPLIER;
  // ライブ疲労中は回復力が鈍る
  recovery *= getLiveFatigueRecoveryFactor(member);
  return Math.round(recovery);
}

// ライブ疲労による回復力の下落率（0〜LIVE_FATIGUE_RECOVERY_PENALTY）
function getLiveFatigueRecoveryPenalty(member) {
  const fatigue = member?.liveFatigue || 0;
  if (fatigue <= 0) return 0;
  return (fatigue / MAX_LIVE_FATIGUE) * LIVE_FATIGUE_RECOVERY_PENALTY;
}

// ライブ疲労中の回復力倍率（疲労が最大でも50%は保つ）
function getLiveFatigueRecoveryFactor(member) {
  return 1 - getLiveFatigueRecoveryPenalty(member);
}

// ライブ疲労を蓄積させる（0〜MAXで頭打ち）
function addLiveFatigue(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.liveFatigue = Math.min(MAX_LIVE_FATIGUE, Math.round((member.liveFatigue || 0) + amount));
}

// ライブ疲労は毎週少しずつ解ける（一時的なもの）
function decayLiveFatigue() {
  idolRoster.forEach(member => {
    if (!member.liveFatigue) return;
    member.liveFatigue = Math.max(0, Math.round(member.liveFatigue - LIVE_FATIGUE_WEEKLY_DECAY));
  });
}

// ライブ1日あたりの体力消費（会場規模で変動）
function getLiveStaminaCost(venue, isConsecutive) {
  const factor = LIVE_VENUE_SIZE_FACTORS[venue?.cap] ?? 1;
  const consecutiveCost = isConsecutive ? 1.15 : 1;
  return Math.round(LIVE_STAMINA_COST_BASE * factor * consecutiveCost);
}

// ライブ開催に伴う疲労のつき方
function getLiveFatigueGain(isMultiDay, isConsecutive) {
  let gain = LIVE_FATIGUE_GAIN;
  if (isMultiDay) gain += LIVE_FATIGUE_MULTI_DAY_BONUS;
  if (isConsecutive) gain += LIVE_FATIGUE_CONSECUTIVE_BONUS;
  return gain;
}

// ライブの体力消費と疲労の蓄積（選抜全員）
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

// ライブ週は週間スケジュールを組めないため、代わりに自然回復を1回だけ適用する
function applyLiveWeekRecovery() {
  const selected = idolRoster.filter(member => member.isSelected);
  const participants = selected.length ? selected : idolRoster;
  participants.forEach(member => {
    const recovery = getMemberWeeklyRecovery(member, false);
    recoverMemberStamina(member, recovery);
    if (member.injury) recoverMemberStamina(member, Math.round(recovery * 0.5));
  });
}

// ケガ・体調不良の発生判定（体力値が低い状態で練習すると起きやすい）
// extraReduction は特別強化中のみ指定する（リスクマネジメントの効果）
function rollMemberInjury(member, extraReduction = 0) {
  if ((member.staminaValue ?? 0) >= STAMINA_WARNING_THRESHOLD) return false;
  const severity = (STAMINA_WARNING_THRESHOLD - member.staminaValue) / STAMINA_WARNING_THRESHOLD;
  const risk = severity * 0.45 * Math.max(0, 1 - extraReduction);
  if (Math.random() >= risk) return false;
  const isAccident = Math.random() < 0.5;
  const weeks = isAccident ? 2 + Math.floor(Math.random() * 2) : 1;
  member.injury = {
    type: isAccident ? 'ケガ' : '体調不良',
    weeksLeft: weeks,
    since: gameDate
  };
  return true;
}

// ケガ・体調不良の回復判定
function processMemberInjuries() {
  idolRoster.forEach(member => {
    if (!member.injury) return;
    member.injury.weeksLeft -= 1;
    if (member.injury.weeksLeft <= 0) {
      setLog(`【復帰】${member.name}の${member.injury.type}が治りました。`);
      member.injury = null;
    }
  });
}

// ==========================================
// 年収・給与システム
// ==========================================

// メンバーの年収 = ファン数×8×365 + (当年1月頭のグループファン数 - 前年1月頭のファン数)×6
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

// 全メンバーの月次給与合計
function getTotalMemberMonthlySalary() {
  return idolRoster.reduce((total, member) => total + getMemberMonthlySalary(member), 0);
}

// 給与の月次合計（メンバー＋マネージャー）
function getTotalMonthlySalary() {
  return getTotalMemberMonthlySalary() + getTotalManagerMonthlySalary();
}

// ==========================================
// 危機対応（謝罪・謹慎・罰金・懲戒処分）
// ==========================================
const CRISIS_FINE_BASE = 2000000;

function getCrisisSeverity() {
  // 危機回避力が低いほど深刻度が高い（1.0〜2.0倍）
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
  // 対応が終われば危機状態は解消する
  crisisEventWeekKey = '';
  crisisEventType = '';
  // スキャンダル対応の結果として選抜の編成を見直す必要がある
  unlockSelection(`${subject}への対応`);
  updateUI();
}
