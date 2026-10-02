// ==========================================
// ゲーム状態（ステート）
// ==========================================
// ==========================================
// 2. ゲーム状態（ステート）
// ==========================================

let currentYear = 1;
let currentMonth = 1;
let currentWeek = 1; // 1〜4週
let gameDate = '';
let calendarYear = 0;
let lastRenderedCalendarDate = '';
let totalWeeksElapsed = 0;
let draftCount = 0;
let currentRosterTab = 'selected';
let merchandiseProducts = 0;
let merchandiseStock = 0;
let merchandiseUnitsSold = 0;
let merchandiseSellThrough = null;
let nextLivePromotionPoints = 0;
// 月末に入金するCD売上収入（売上の8割）とタイアップの臨時収入
let monthlyCdRevenue = 0;
let monthlyTieUpRevenue = 0;
// 販促効果が乗っている作品（販促効果は1作のみ）
let promoSongId = '';
let crisisCheckWeekKey = '';
let crisisEventWeekKey = '';
let crisisEventType = '';
let pendingCrisisResponse = null;
let pendingRandomEvent = null;
let randomEventCheckWeekKey = '';
// 予約中のランダムイベント。発生する週を隠すため、数週間前に予約する
let armedRandomEvents = [];   // [{ eventId, targetDate }]
// 選抜・センターの選定待ち（新曲発売10週前に発生。編成ページからも手動で開ける）
let pendingSelectionEvent = null;
// 選抜のロック（発表時に確定。スキャンダル等が発生するまで変更不可）
let selectionLock = null;
const MIN_SELECTION_SIZE = 3;
const SENBATSU_LEAD_DAYS = 70;
let pendingFanClubEvent = null;
let fanClub = null;
let fanClubFoundedYear = 0;
let industryOfferCheckWeekKey = '';
let pendingIndustryOffer = null;
let specialLiveEvents = [];
let pendingEquipmentEvent = null;
let equipmentDowngradeCheckWeekKey = '';
let groupCrisis = 55;
let officeUpgrades = createInitialOfficeUpgrades();
let activeSaveSlot = null;
const SAVE_SLOT_COUNT = 3;
const LEGACY_SAVE_KEY = 'idol_manager_save';
let songs = [];
let pendingPerformanceOffers = [];
let scheduledPerformances = [];
let specialOffersSent = [];
let rivalLiveBookings = [];

// マネージャー制度（初期状態で1人配備）
let managers = [];
// 市场上的求人（5名）
let managerMarketCandidates = [];
// 当該年の1月頭／前年1月頭のグループファン数（メンバー年収の算定に使う）
let groupFansAtYearStart = 0;
let previousYearGroupFansAtYearStart = 0;
// 週間スケジュールの下書き（その週に組むレッスン／休養の枠）
let weeklySchedule = null;
// 年末イベント（日本CD大賞 12/30 ／ 赤白歌合戦 12/31）の処理済みフラグ
let yearEndAwardProcessed = false;
let yearEndKohakuProcessed = false;

let idolRoster = [];
let productionSchedule = {
  "1-2": { release: "single", liveVenue: null },
  "1-5": { release: "none",   liveVenue: "原宿体育館" },
  "1-6": { release: "single", liveVenue: null }
};

let yearlyStats = { sales: 0, audience: 0 };
// 生涯累計売上（年を跨いでも積み上がり、ファン成長に使う）
let lifetimeSales = 0;
let funds = INITIAL_FUNDS;

// 競合チーム（初期6チーム）
function createInitialLeagueTeams() {
  return [
    { id: 'player', name: '自グループ', sales: 0, audience: 0, basePower: 50 },
    { id: 'rival_1', name: 'スターライト・クイーン', sales: 0, audience: 0, basePower: 92 },
    { id: 'rival_2', name: 'ネオ・エレメンツ', sales: 0, audience: 0, basePower: 85 },
    { id: 'rival_3', name: 'サクラ・シンフォニー', sales: 0, audience: 0, basePower: 78 },
    { id: 'rival_4', name: 'ハピネス・プロジェクト', sales: 0, audience: 0, basePower: 70 },
    { id: 'rival_5', name: 'アンダー・グラウンド', sales: 0, audience: 0, basePower: 65 }
  ];
}

// 既存と重複しない新世代グループの名前を引く（前半語×後半語。枯渇時は期数を添える）
function generateRivalGroupName(usedNames = []) {
  const used = new Set(usedNames);
  const candidates = [];
  for (const head of RIVAL_NAME_HEADS) {
    for (const tail of RIVAL_NAME_TAILS) {
      const name = `${head}・${tail}`;
      if (!used.has(name)) candidates.push(name);
    }
  }
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  // 語彙を使い切った場合は、既存名に現れる最大の期数より大きい期数を添える
  let maxSeq = 0;
  for (const name of used) {
    const match = /^新世代プロジェクト(\d+)期$/.exec(name);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  }
  return `新世代プロジェクト${maxSeq + 1}期`;
}

// 既存チームと衝突しない競合チームの ID を採番する
function createRivalTeamId() {
  let index = leagueTeams.length;
  let id = `rival_${index}`;
  while (leagueTeams.some(team => team.id === id)) id = `rival_${++index}`;
  return id;
}

// 旧セーブで重複していた ID を整理する（公演予約はグループ名で照合して付け替える）
function normalizeLeagueTeams() {
  const usedIds = new Set();
  leagueTeams.forEach(team => {
    const originalId = team.id || 'rival';
    let id = originalId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${originalId}_${suffix++}`;
    team.id = id;
    usedIds.add(id);
    if (id === originalId) return;
    rivalLiveBookings.forEach(booking => {
      if (booking.groupId === originalId && booking.groupName === team.name) booking.groupId = id;
    });
  });
}

function createInitialOfficeUpgrades() {
  return { lessons: 0, dormitory: 0, analytics: 0, snsTraining: 0, liveProduction: 0, merchandise: 0 };
}

// ==========================================
// マネージャー制度（Lv.1〜Lv.10／レベルアップのみ）
// ==========================================

const MANAGER_SURNAMES = ['桐生', '水無瀬', '南雲', '日和見', '早乙女', '如月', '峰岸', '真柴', '三雲', '花房', '天海', '和久井', '白石', '榊原'];
const MANAGER_GIVEN_NAMES = ['沙耶', '美咲', '彩乃', '结衣', '玲奈', '千尋', '雅代', '志穂', '真由', '亜紀', '深津', '志乃'];

function createManagerName() {
  const surname = MANAGER_SURNAMES[Math.floor(Math.random() * MANAGER_SURNAMES.length)];
  const given = MANAGER_GIVEN_NAMES[Math.floor(Math.random() * MANAGER_GIVEN_NAMES.length)];
  return `${surname} ${given}`;
}

// 25〜35歳のマネージャー候補を1人生成する（退職年齢は40〜45歳でランダム）
function createManagerCandidate(age = null) {
  const managerAge = age ?? (MANAGER_AGE_MIN + Math.floor(Math.random() * (MANAGER_AGE_MAX - MANAGER_AGE_MIN + 1)));
  const skills = {};
  MANAGER_SKILLS.forEach(skill => {
    skills[skill.id] = 1 + Math.floor(Math.random() * 4); // Lv.1〜Lv.4
  });
  return {
    id: `candidate-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: createManagerName(),
    birthYear: getGameDateObject().getFullYear() - managerAge,
    age: managerAge,
    skills,
    resignAge: MANAGER_RESIGN_AGE_MIN + Math.floor(Math.random() * (MANAGER_RESIGN_AGE_MAX - MANAGER_RESIGN_AGE_MIN + 1))
  };
}

// 新規にマネージャーとして採用する（初期状態用）
function createManager() {
  const candidate = createManagerCandidate();
  return {
    id: `manager-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: candidate.name,
    birthYear: candidate.birthYear,
    age: candidate.age,
    skills: candidate.skills,
    resignAge: candidate.resignAge,
    joinedYear: currentYear
  };
}

// マネージャーの年齢（生年から再計算する）
function getManagerAge(manager) {
  if (!Number.isInteger(manager.birthYear)) return manager.age ?? MANAGER_AGE_MIN;
  return calculateAgeFromBirth(manager.birthYear, getGameDateObject(), 1, 1);
}

// マネージャーの能力合計
function getManagerSkillTotal(manager) {
  return MANAGER_SKILLS.reduce((total, skill) => total + (manager.skills?.[skill.id] || 1), 0);
}

// マネージャー年収 = (300000 + 4項目のレベル総和×15000)×12
function getManagerAnnualSalary(manager) {
  return (MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL) * 12;
}

// マネージャー給与（月額）
function getManagerMonthlySalary(manager) {
  return getManagerAnnualSalary(manager) / 12;
}

function getTotalManagerMonthlySalary() {
  return managers.reduce((total, manager) => total + getManagerMonthlySalary(manager), 0);
}

// 解雇料 = 4か月分の給料
function getManagerFireCost(manager) {
  return getManagerMonthlySalary(manager) * MANAGER_FIRE_MONTHS;
}

// レベルアップ費用（レベルが高いほど高い。ダウングレードは存在しない）
function getManagerSkillUpCost(manager, skillId) {
  const level = manager.skills?.[skillId] || 1;
  if (level >= MAX_MANAGER_LEVEL) return null;
  return Math.round(MANAGER_SKILL_COST_BASE * (MANAGER_SKILL_COST_GROWTH ** (level - 1)));
}

function levelUpManagerSkill(managerId, skillId) {
  const manager = managers.find(item => item.id === managerId);
  if (!manager) return;
  if (!manager.skills) manager.skills = {};
  if (!Number.isFinite(manager.skills[skillId])) manager.skills[skillId] = 1;
  const cost = getManagerSkillUpCost(manager, skillId);
  if (cost === null) {
    setLog(`【マネージャー】${manager.name}の${getManagerSkillName(skillId)}はすでに最大レベルです。`);
    return;
  }
  if (funds < cost) {
    setLog(`【マネージャー】資金が不足しています（必要額 ${formatMoney(cost)}）。`);
    return;
  }
  funds -= cost;
  manager.skills[skillId] += 1;
  setLog(`【マネージャー】${manager.name}の${getManagerSkillName(skillId)}がLv.${manager.skills[skillId]}に上昇しました（費用 ${formatMoney(cost)}）。`);
  updateUI();
}

function getManagerSkillName(skillId) {
  return MANAGER_SKILLS.find(skill => skill.id === skillId)?.name || skillId;
}

// ==========================================
// マネージャー市場（常に開いている）
// ==========================================

// 市場にいる候補を補充する（足りない枠だけを追加する）
function refreshManagerMarket() {
  if (!Array.isArray(managerMarketCandidates)) managerMarketCandidates = [];
  const missing = MANAGER_MARKET_CANDIDATE_COUNT - managerMarketCandidates.length;
  if (missing <= 0) return;

  const takenNames = new Set([
    ...managers.map(manager => manager.name),
    ...managerMarketCandidates.map(candidate => candidate.name)
  ]);
  let guard = 0;
  while (managerMarketCandidates.length < MANAGER_MARKET_CANDIDATE_COUNT && guard++ < 60) {
    const candidate = createManagerCandidate();
    if (takenNames.has(candidate.name)) continue;
    takenNames.add(candidate.name);
    managerMarketCandidates.push(candidate);
  }
}

// 市場から候補を採用する
function hireManagerFromMarket(candidateId) {
  if (managers.length >= MANAGER_HIRE_LIMIT) {
    setLog(`【マネージャー】上限の${MANAGER_HIRE_LIMIT}名まで採用済みです。`);
    return;
  }
  const candidate = managerMarketCandidates.find(item => item.id === candidateId);
  if (!candidate) {
    setLog('【マネージャー】その候補はすでに採用されたか、市場から消えています。');
    return;
  }
  if (funds < MANAGER_HIRE_COST) {
    setLog(`【マネージャー】採用資金が不足しています（必要額 ${formatMoney(MANAGER_HIRE_COST)}）。`);
    return;
  }
  funds -= MANAGER_HIRE_COST;
  const hired = {
    id: `manager-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: candidate.name,
    birthYear: candidate.birthYear,
    age: candidate.age,
    skills: { ...candidate.skills },
    resignAge: candidate.resignAge,
    joinedYear: currentYear
  };
  managers.push(hired);
  managerMarketCandidates = managerMarketCandidates.filter(item => item.id !== candidateId);
  // 空いた枠だけを補充する（他の求人はそのまま残る）
  refreshManagerMarket();
  setLog(`【マネージャー】${hired.name}（${getManagerAge(hired)}歳）を採用しました（採用費 ${formatMoney(MANAGER_HIRE_COST)} / 月給 ${formatMoney(getManagerMonthlySalary(hired))}）。`);
  updateUI();
}

// マネージャーを解雇する（4か月分の給料を支払う）
function fireManager(managerId) {
  const index = managers.findIndex(item => item.id === managerId);
  if (index < 0) return;
  const manager = managers[index];
  const cost = getManagerFireCost(manager);
  if (funds < cost) {
    setLog(`【マネージャー】解雇料 ${formatMoney(cost)} を支払えないため解雇できません。`);
    return;
  }
  if (!confirm(`${manager.name}を解雇しますか？\n解雇料: ${formatMoney(cost)}（4か月分の給料）`)) return;
  funds -= cost;
  managers.splice(index, 1);
  setLog(`【マネージャー】${manager.name}を解雇しました（解雇料 ${formatMoney(cost)}）。`);
  updateUI();
}

// 40〜45歳で任意退職する
function processManagerResignations() {
  const resigned = [];
  managers = managers.filter(manager => {
    const age = getManagerAge(manager);
    const resignAge = Number.isFinite(manager.resignAge) ? manager.resignAge : MANAGER_RESIGN_AGE_MAX;
    if (age < resignAge) return true;
    resigned.push(`${manager.name}（${age}歳）`);
    return false;
  });
  if (!resigned.length) return;
  // 退職で空いた枠を補充する
  refreshManagerMarket();
  setLog(`【マネージャー】${resigned.join('、')}が退職しました。マネージャー市場の求人は増加します。`);
}

// マネージャーの平均レベル（複数在籍なら平均を使う）
function getManagerAverageLevel(skillId) {
  if (!managers.length) return 1;
  const total = managers.reduce((sum, manager) => sum + (manager.skills?.[skillId] || 1), 0);
  return total / managers.length;
}

// 項目別の合計レベル（在籍マネージャーの該当能力をすべて足す）
function getManagerSkillLevelTotal(skillId) {
  return managers.reduce((sum, manager) => sum + (manager.skills?.[skillId] || 1), 0);
}

// 合計レベルがどの段階に当たるか（E/D/C/B/A/S/SS/極）
function getManagerSkillTier(skillId) {
  const total = getManagerSkillLevelTotal(skillId);
  // MANAGER_LEVEL_TIERS は降順なので、「合計レベルに達する最も高い段階」を探す
  let current = MANAGER_LEVEL_TIERS[MANAGER_LEVEL_TIERS.length - 1];
  let currentIndex = MANAGER_LEVEL_TIERS.length - 1;
  for (let i = 0; i < MANAGER_LEVEL_TIERS.length; i++) {
    if (total >= MANAGER_LEVEL_TIERS[i].min) {
      current = MANAGER_LEVEL_TIERS[i];
      currentIndex = i;
      break;
    }
  }
  // 次に上げる段階（より小さいしきい値側のひとつ）
  const next = currentIndex > 0 ? MANAGER_LEVEL_TIERS[currentIndex - 1] : null;
  const progress = next
    ? Math.min(100, Math.round(((total - current.min) / (next.min - current.min)) * 100))
    : 100;
  return {
    total,
    label: current.label,
    multiplier: current.multiplier,
    // 段階番号（0=E … 6=SS … 7=極）。週の枠数などに使う
    tier: MANAGER_LEVEL_TIERS.length - 1 - currentIndex,
    currentMin: current.min,
    nextLabel: next ? next.label : null,
    nextMin: next ? next.min : null,
    remain: next ? Math.max(0, next.min - total) : 0,
    progress
  };
}

// ==========================================
// マネージャーの効果（すべて「特別強化」に効く）
// 週間スケジュール自体は点名制限なしで自由に組める
// ==========================================

// 段階倍率を「最大段階（極）を1とする 0〜1」に正規化する
// 倍率表を引き下げても効果幅が変わらないよう、
// ハードコードした係数ではなく MANAGER_LEVEL_TIERS の上限を参照する
function getManagerTierGain(skillId) {
  const top = MANAGER_LEVEL_TIERS[0].multiplier;
  const bottom = MANAGER_LEVEL_TIERS[MANAGER_LEVEL_TIERS.length - 1].multiplier;
  const span = top - bottom;
  if (span <= 0) return 0;
  const multiplier = getManagerSkillTier(skillId).multiplier;
  return Math.max(0, Math.min(1, (multiplier - bottom) / span));
}

// 統率力：特別強化の倍率（基礎10倍 × 段階倍率）
// 浮動小数点の誤差（10.600000000000001など）がUIに出ないよう丸める
function getSpecialTrainingMultiplier() {
  const multiplier = SPECIAL_TRAINING_MULTIPLIER * getManagerSkillTier('leadership').multiplier;
  return Math.round(multiplier * 100) / 100;
}

// スケジュール管理力：特別強化できる人数（E/D/C=1人、B以上=2人、極=3人）
function getSpecialTrainingTargetLimit() {
  const tier = getManagerSkillTier('scheduling');
  if (tier.tier >= MANAGER_LEVEL_TIERS.length - 1) return 3; // 極
  if (tier.tier >= 3) return 2;                              // B以上
  return 1;                                                   // E/D/C
}

// メンタルケア：特別強化時の体力消費軽減率（0〜0.75）
function getSpecialTrainingStaminaReduction() {
  return getManagerTierGain('mentalCare') * 0.75;
}

// リスクマネジメント：特別強化中のケガ・体調不良リスク軽減率（0〜0.75）
function getSpecialTrainingRiskReduction() {
  return getManagerTierGain('riskControl') * 0.75;
}

let leagueTeams = createInitialLeagueTeams();

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 球場・ドームは野球日程調整のため長期間の予約が必要
function isStadiumVenue(venue) {
  return Boolean(venue && (venue.name.includes('球場') || venue.name.includes('ドーム')));
}

function getLiveBookingLeadDays(venue) {
  return isStadiumVenue(venue) ? 180 : 45;
}

// 金額の表示単位: 5桁までは円、6桁以上は万円、9桁以上は億円
function formatMoney(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs < 100000) return `${sign}${abs.toLocaleString()}円`;
  if (abs < 1000000000) {
    const man = abs / 10000;
    // 1億円以上になる手前の端数は億円表記に切り替える
    if (man < 9999.95) {
      const digits = man < 100 ? 1 : 0;
      return `${sign}${Number(man.toFixed(digits))}万円`;
    }
  }
  const oku = abs / 100000000;
  const okuDigits = oku < 10 ? 2 : (oku < 100 ? 1 : 0);
  return `${sign}${Number(oku.toFixed(okuDigits))}億円`;
}

// ファン数の表示単位: 5桁までは人、6桁以上は万人、9桁以上は億人
function formatFanCount(value) {
  const count = Math.max(0, Math.round(Number(value) || 0));
  if (count < 100000) return `${count.toLocaleString()}人`;
  if (count < 100000000) {
    const man = count / 10000;
    const digits = man < 100 ? 1 : 0;
    return `${Number(man.toFixed(digits))}万人`;
  }
  const oku = count / 100000000;
  const okuDigits = oku < 10 ? 2 : (oku < 100 ? 1 : 0);
  return `${Number(oku.toFixed(okuDigits))}億人`;
}
