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
let monthlyCdRevenue = 0;
let monthlyTieUpRevenue = 0;

function createMonthlyLedger() {
  return { income: [], expense: [] };
}

let monthlyLedger = createMonthlyLedger();
let pendingMonthlyReport = null;
let promoSongId = '';
let crisisCheckWeekKey = '';
let crisisEventWeekKey = '';
let crisisEventType = '';
let pendingCrisisResponse = null;
let pendingRandomEvent = null;
let randomEventCheckWeekKey = '';
let armedRandomEvents = [];   
let pendingSelectionEvent = null;
let selectionLock = null;
let lastAnnouncedCenterId = null;
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

// ==========================================
// 競合チーム（leagueTeams）の定義を先行して行う
// ==========================================
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

let leagueTeams = createInitialLeagueTeams();
let rivalLiveBookings = [];

// ==========================================
// ライバルおよび全グループのスケジュール自動生成（1年分対応版）
// ==========================================
// ==========================================
// ライバルおよび全グループのスケジュール自動生成（曜日重みづけ完全再現版）
// ==========================================
function generateRivalsAndGeneralSchedule(year, startMonth, generateFullYear = false) {
  const newRivalBookings = [];
  const monthSpan = generateFullYear ? 12 : 6;
  
  const targetYearNum = Number(year) || 1;
  const actualYear = 2025 + targetYearNum; // 1年目＝2026年、2年目＝2027年

  // ご指定の曜日ごとの重みづけ（土日 ＞ 金 ＞ 火水 ＞ 木 ＞ 月）
  // 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土
  const dayWeights = {
    0: 12, // 日 (高)
    6: 12, // 土 (高)
    5: 8,  // 金 (中高)
    2: 5,  // 火 (中)
    3: 5,  // 水 (中)
    4: 3,  // 木 (低)
    1: 1   // 月 (最安)
  };

  if (Array.isArray(leagueTeams) && typeof VENUE_DATA !== 'undefined') {
    leagueTeams.forEach(team => {
      if (team.id === 'player') return; // 自グループは除外

      const power = team.basePower || 50;
      const baseCountPerHalf = Math.min(30, Math.max(18, Math.round((power / 92) * 26)));
      const targetLiveCount = generateFullYear ? baseCountPerHalf * 2 : baseCountPerHalf;

      // 1. ライバルたちのライブ予定生成（曜日ごとの確率を厳密に反映）
      for (let i = 0; i < targetLiveCount; i++) {
        const randomMonthOffset = Math.floor(Math.random() * monthSpan);
        const targetMonth = ((startMonth - 1 + randomMonthOffset) % 12) + 1;
        const targetYearOffset = Math.floor((startMonth - 1 + randomMonthOffset) / 12);
        const bookingYear = actualYear + targetYearOffset;

        const lastDay = new Date(bookingYear, targetMonth, 0).getDate();
        
        // 重みづけ抽選：条件に合う日まで最大30回ランダム試行
        let selectedDateObj = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          const randomDay = 1 + Math.floor(Math.random() * lastDay);
          const dObj = new Date(bookingYear, targetMonth - 1, randomDay);
          const dayOfWeek = dObj.getDay(); // 0〜6
          const weight = dayWeights[dayOfWeek] || 1;

          // 1〜15の乱数に対して重みが上回れば採用
          if (Math.random() * 15 < weight) {
            selectedDateObj = dObj;
            break;
          }
        }

        // 万が一漏れた場合のフォールバック（その月のランダムな日）
        if (!selectedDateObj) {
          const randomDay = 1 + Math.floor(Math.random() * lastDay);
          selectedDateObj = new Date(bookingYear, targetMonth - 1, randomDay);
        }

        const mm = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(selectedDateObj.getDate()).padStart(2, '0');
        const dateStr = `${bookingYear}-${mm}-${dd}`;
        
        const venue = VENUE_DATA[Math.floor(Math.random() * VENUE_DATA.length)];

        newRivalBookings.push({
          groupId: team.id,
          groupName: team.name,
          liveVenue: venue.name,
          liveName: `${team.name} 単独公演`,
          liveDate: dateStr,
          liveDates: [dateStr],
          status: 'confirmed',
          type: 'live'
        });
      }

      // 2. ライバルたちのCD発売予定生成（水曜日固定）
      const cdReleaseCount = generateFullYear ? 4 : 2;
      for (let j = 0; j < cdReleaseCount; j++) {
        const cdMonthOffset = Math.floor((j * (monthSpan / cdReleaseCount)) + Math.random() * 2);
        const targetCdMonth = ((startMonth - 1 + cdMonthOffset) % 12) + 1;
        const targetCdYearOffset = Math.floor((startMonth - 1 + cdMonthOffset) / 12);
        const cdBookingYear = actualYear + targetCdYearOffset;

        let wednesdayStr = '';
        try {
          wednesdayStr = getRandomWednesdayKey(cdBookingYear, targetCdMonth);
        } catch (err) {
          wednesdayStr = `${cdBookingYear}-${String(targetCdMonth).padStart(2, '0')}-15`;
        }
        
        newRivalBookings.push({
          groupId: team.id,
          groupName: team.name,
          liveVenue: '',
          liveName: `${team.name} 新曲リリース`,
          liveDate: wednesdayStr,
          liveDates: [wednesdayStr],
          status: 'confirmed',
          type: 'release'
        });
      }
    });
  }

  rivalLiveBookings = newRivalBookings;
  console.log(`【ライバル先行配置完了】(曜日重みづけ適用) 総数: ${rivalLiveBookings.length}件`, rivalLiveBookings[0]);
}
// ==========================================
// ★一番最初の起動時は「1年分（1〜12月）」をまとめて生成する！
// ==========================================
try {
  if (typeof leagueTeams !== 'undefined') {
    generateRivalsAndGeneralSchedule(1, 1, true); // 第3引数を true にして1年分生成
  }
} catch (e) {
  console.warn('Initial generateRivalsAndGeneralSchedule warning:', e);
}// 指定月内のランダムな水曜日を取得（CD発売用）
function getRandomWednesdayKey(year, month) {
  const wednesdays = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 3) {
      wednesdays.push(toDateKey(date));
    }
  }
  if (wednesdays.length === 0) return `${year}-${String(month).padStart(2, '0')}-15`;
  return wednesdays[Math.floor(Math.random() * wednesdays.length)];
}

let idolRoster = [];

// 初期の半年計画（CD: 2/18, 6/17、ライブ: 5/16, 5/17 [両日配信]）
function createInitialProductionSchedule() {
  const schedule = {};
  
  schedule[`1-2`] = {
    release: 'single',
    songName: 'SnowDrops',
    releaseDate: '2026-02-18',
    releaseBenefit: 'none',
    liveVenue: null
  };

  schedule[`1-6`] = {
    release: 'single',
    songName: 'アジサイと風鈴',
    releaseDate: '2026-06-17',
    releaseBenefit: 'none',
    liveVenue: null
  };

  schedule[`1-5`] = {
    release: 'none',
    songName: '',
    liveVenue: INITIAL_LIVE_VENUE || '原宿体育館',
    liveName: INITIAL_LIVE_VENUE || 'Debut Live',
    liveDate: '2026-05-16',
    liveDates: ['2026-05-17'],
    streamDates: ['2026-05-16', '2026-05-17']
  };

  return schedule;
}

let productionSchedule = createInitialProductionSchedule();


let yearlyStats = { sales: 0, audience: 0 };
let lifetimeSales = 0;
let salesHistory = [];
let logHistory = [];
let funds = INITIAL_FUNDS;

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
  let maxSeq = 0;
  for (const name of used) {
    const match = /^新世代プロジェクト(\d+)期$/.exec(name);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  }
  return `新世代プロジェクト${maxSeq + 1}期`;
}

function createRivalTeamId() {
  let index = leagueTeams.length;
  let id = `rival_${index}`;
  while (leagueTeams.some(team => team.id === id)) id = `rival_${++index}`;
  return id;
}

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

const MANAGER_SURNAMES = ['桐生', '水無瀬', '南雲', '日和見', '早乙女', '如月', '峰岸', '真柴', '三雲', '花房', '天海', '和久井', '白石', '榊原'];
const MANAGER_GIVEN_NAMES = ['沙耶', '美咲', '彩乃', '结衣', '玲奈', '千尋', '雅代', '志穂', '真由', '亜紀', '深津', '志乃'];

function createManagerName() {
  const surname = MANAGER_SURNAMES[Math.floor(Math.random() * MANAGER_SURNAMES.length)];
  const given = MANAGER_GIVEN_NAMES[Math.floor(Math.random() * MANAGER_GIVEN_NAMES.length)];
  return `${surname} ${given}`;
}

function createManagerCandidate(age = null) {
  const managerAge = age ?? (MANAGER_AGE_MIN + Math.floor(Math.random() * (MANAGER_AGE_MAX - MANAGER_AGE_MIN + 1)));
  const skills = {};
  MANAGER_SKILLS.forEach(skill => {
    skills[skill.id] = 1 + Math.floor(Math.random() * 4);
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

function getManagerAge(manager) {
  if (!Number.isInteger(manager.birthYear)) return manager.age ?? MANAGER_AGE_MIN;
  return calculateAgeFromBirth(manager.birthYear, getGameDateObject(), 1, 1);
}

function getManagerSkillTotal(manager) {
  return MANAGER_SKILLS.reduce((total, skill) => total + (manager.skills?.[skill.id] || 1), 0);
}

function getManagerAnnualSalary(manager) {
  return (MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL) * 12;
}

function getManagerMonthlySalary(manager) {
  return getManagerAnnualSalary(manager) / 12;
}

function getTotalManagerMonthlySalary() {
  return managers.reduce((total, manager) => total + getManagerMonthlySalary(manager), 0);
}

function getManagerFireCost(manager) {
  return getManagerMonthlySalary(manager) * MANAGER_FIRE_MONTHS;
}

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
  refreshManagerMarket();
  setLog(`【マネージャー】${hired.name}（${getManagerAge(hired)}歳）を採用しました（採用費 ${formatMoney(MANAGER_HIRE_COST)} / 月給 ${formatMoney(getManagerMonthlySalary(hired))}）。`);
  updateUI();
}

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
  refreshManagerMarket();
  setLog(`【マネージャー】${resigned.join('、')}が退職しました。マネージャー市場の求人は増加します。`);
}

function getManagerAverageLevel(skillId) {
  if (!managers.length) return 1;
  const total = managers.reduce((sum, manager) => sum + (manager.skills?.[skillId] || 1), 0);
  return total / managers.length;
}

function getManagerSkillLevelTotal(skillId) {
  return managers.reduce((sum, manager) => sum + (manager.skills?.[skillId] || 1), 0);
}

function getManagerSkillTier(skillId) {
  const total = getManagerSkillLevelTotal(skillId);
  let current = MANAGER_LEVEL_TIERS[MANAGER_LEVEL_TIERS.length - 1];
  let currentIndex = MANAGER_LEVEL_TIERS.length - 1;
  for (let i = 0; i < MANAGER_LEVEL_TIERS.length; i++) {
    if (total >= MANAGER_LEVEL_TIERS[i].min) {
      current = MANAGER_LEVEL_TIERS[i];
      currentIndex = i;
      break;
    }
  }
  const next = currentIndex > 0 ? MANAGER_LEVEL_TIERS[currentIndex - 1] : null;
  const progress = next
    ? Math.min(100, Math.round(((total - current.min) / (next.min - current.min)) * 100))
    : 100;
  return {
    total,
    label: current.label,
    multiplier: current.multiplier,
    tier: MANAGER_LEVEL_TIERS.length - 1 - currentIndex,
    currentMin: current.min,
    nextLabel: next ? next.label : null,
    nextMin: next ? next.min : null,
    remain: next ? Math.max(0, next.min - total) : 0,
    progress
  };
}

function getManagerTierGain(skillId) {
  const top = MANAGER_LEVEL_TIERS[0].multiplier;
  const bottom = MANAGER_LEVEL_TIERS[MANAGER_LEVEL_TIERS.length - 1].multiplier;
  const span = top - bottom;
  if (span <= 0) return 0;
  const multiplier = getManagerSkillTier(skillId).multiplier;
  return Math.max(0, Math.min(1, (multiplier - bottom) / span));
}

function getSpecialTrainingMultiplier() {
  const multiplier = SPECIAL_TRAINING_MULTIPLIER * getManagerSkillTier('leadership').multiplier;
  return Math.round(multiplier * 100) / 100;
}

function getSpecialTrainingTargetLimit() {
  const tier = getManagerSkillTier('scheduling');
  if (tier.tier >= MANAGER_LEVEL_TIERS.length - 1) return 3; 
  if (tier.tier >= 3) return 2;                            
  return 1;                                                   
}

function getSpecialTrainingStaminaReduction() {
  return getManagerTierGain('mentalCare') * 0.75;
}

function getSpecialTrainingRiskReduction() {
  return getManagerTierGain('riskControl') * 0.75;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isStadiumVenue(venue) {
  return Boolean(venue && (venue.name.includes('球場') || venue.name.includes('ドーム')));
}

function getLiveBookingLeadDays(venue) {
  return isStadiumVenue(venue) ? 180 : 45;
}

function formatMoney(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs < 100000) return `${sign}${abs.toLocaleString()}円`;
  if (abs < 1000000000) {
    const man = abs / 10000;
    if (man < 9999.95) {
      const digits = man < 100 ? 1 : 0;
      return `${sign}${Number(man.toFixed(digits))}万円`;
    }
  }
  const oku = abs / 100000000;
  const okuDigits = oku < 10 ? 2 : (oku < 100 ? 1 : 0);
  return `${sign}${Number(oku.toFixed(okuDigits))}億円`;
}

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
