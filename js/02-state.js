// ==========================================
// 02-state.js : 全機能完全復元・ライバルスケジュール統合版
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
let weeklySchedule = {};

// ==========================================
// 競合チーム（leagueTeams）の定義
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
// ライバルスケジュール自動生成（連日公演・曜日重みづけ完全対応版）
// ==========================================
function generateRivalsAndGeneralSchedule(year, startMonth, generateFullYear = false) {
  const newRivalBookings = [];
  const monthSpan = generateFullYear ? 12 : 6;
  
  const targetYearNum = Number(year) || 1;
  const actualYear = calendarYear && calendarYear > 2000 ? calendarYear : (2025 + targetYearNum);

  const dayWeights = {
    0: 12, // 日
    6: 12, // 土
    5: 8,  // 金
    2: 5,  // 火
    3: 5,  // 水
    4: 3,  // 木
    1: 1   // 月
  };

  if (Array.isArray(leagueTeams) && typeof VENUE_DATA !== 'undefined') {
    leagueTeams.forEach(team => {
      if (team.id === 'player') return;

      const power = team.basePower || 50;
      // ライブの総公演日数を決める
      const baseCountPerHalf = Math.min(30, Math.max(18, Math.round((power / 92) * 26)));
      const targetLiveCount = generateFullYear ? baseCountPerHalf * 2 : baseCountPerHalf;

      let generatedDaysCount = 0;
      let safetyCounter = 0;

      // 1. ライバルたちのライブ予定生成（連日公演を極力再現）
      while (generatedDaysCount < targetLiveCount && safetyCounter < 200) {
        safetyCounter++;
        const randomMonthOffset = Math.floor(Math.random() * monthSpan);
        const targetMonth = ((startMonth - 1 + randomMonthOffset) % 12) + 1;
        const targetYearOffset = Math.floor((startMonth - 1 + randomMonthOffset) / 12);
        const bookingYear = actualYear + targetYearOffset;

        const lastDay = new Date(bookingYear, targetMonth, 0).getDate();
        
        // 開始日の抽選
        let selectedDateObj = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          const randomDay = 1 + Math.floor(Math.random() * lastDay);
          const dObj = new Date(bookingYear, targetMonth - 1, randomDay);
          const dayOfWeek = dObj.getDay();
          const weight = dayWeights[dayOfWeek] || 1;

          if (Math.random() * 15 < weight) {
            selectedDateObj = dObj;
            break;
          }
        }

        if (!selectedDateObj) {
          const randomDay = 1 + Math.floor(Math.random() * lastDay);
          selectedDateObj = new Date(bookingYear, targetMonth - 1, randomDay);
        }

        const venue = VENUE_DATA[Math.floor(Math.random() * VENUE_DATA.length)];

        // 🌟 2日連続、あるいは3日連続のツアー公演にする確率判定（約40%の確率で連日にする）
        const isConsecutive = Math.random() < 0.4;
        const durationDays = isConsecutive ? (Math.random() < 0.7 ? 2 : 3) : 1;

        const liveDatesArr = [];
        const baseLiveName = `${team.name} ${venue.name} 公演`;

        for (let dIdx = 0; dIdx < durationDays; dIdx++) {
          const targetDate = new Date(selectedDateObj);
          targetDate.setDate(selectedDateObj.getDate() + dIdx);
          
          // 月をまたぐ場合はループを抜ける
          if (targetDate.getMonth() + 1 !== targetMonth) break;

          liveDatesArr.push(toDateKey(targetDate));
        }

        if (liveDatesArr.length > 0) {
          generatedDaysCount += liveDatesArr.length;
          const firstDateStr = liveDatesArr[0];

          newRivalBookings.push({
            groupId: team.id,
            groupName: team.name,
            liveVenue: venue.name,
            liveName: baseLiveName,
            liveDate: firstDateStr,
            liveDates: liveDatesArr,
            status: 'confirmed',
            type: 'live'
          });
        }
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
  console.log(`【ライバル先行配置完了】(連日公演・曜日重みづけ適用) 総数: ${rivalLiveBookings.length}件`);
}


// 初回起動時は1年分をまとめて生成
try {
  if (typeof leagueTeams !== 'undefined') {
    generateRivalsAndGeneralSchedule(1, 1, true);
  }
} catch (e) {
  console.warn('Initial generateRivalsAndGeneralSchedule warning:', e);
}

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

function createInitialProductionSchedule() {
  const schedule = {};
  schedule[`1-2`] = { release: 'single', songName: 'SnowDrops', releaseDate: '2026-02-18', releaseBenefit: 'none', liveVenue: null };
  schedule[`1-6`] = { release: 'single', songName: 'アジサイと風鈴', releaseDate: '2026-06-17', releaseBenefit: 'none', liveVenue: null };
  schedule[`1-5`] = { release: 'none', songName: '', liveVenue: INITIAL_LIVE_VENUE || '原宿体育館', liveName: 'Debut Live', liveDate: '2026-05-16', liveDates: ['2026-05-17'], streamDates: ['2026-05-16', '2026-05-17'] };
  return schedule;
}

let productionSchedule = createInitialProductionSchedule();
let yearlyStats = { sales: 0, audience: 0 };
let lifetimeSales = 0;
let salesHistory = [];
let logHistory = [];
let funds = INITIAL_FUNDS;

function createInitialOfficeUpgrades() {
  return { lessons: 0, dormitory: 0, analytics: 0, snsTraining: 0, liveProduction: 0, merchandise: 0 };
}

// ==========================================
// マネージャーシステム関連（完全復元）
// ==========================================
let managers = [];
let managerMarketCandidates = [];

const MANAGER_SURNAMES = ['桐生', '水無瀬', '南雲', '日和見', '早乙女', '如月', '峰岸', '真柴', '三雲', '花房', '天海', '和久井', '白石', '榊原'];
const MANAGER_GIVEN_NAMES = ['沙耶', '美咲', '彩乃', '結衣', '玲奈', '千尋', '雅代', '志穂', '真由', '亜紀', '深津', '志乃'];

function createManagerName() {
  const surname = MANAGER_SURNAMES[Math.floor(Math.random() * MANAGER_SURNAMES.length)];
  const given = MANAGER_GIVEN_NAMES[Math.floor(Math.random() * MANAGER_GIVEN_NAMES.length)];
  return `${surname} ${given}`;
}

function createManagerCandidate(age = null) {
  const managerAge = age ?? (MANAGER_AGE_MIN + Math.floor(Math.random() * (MANAGER_AGE_MAX - MANAGER_AGE_MIN + 1)));
  const skills = {};
  if (typeof MANAGER_SKILLS !== 'undefined') {
    MANAGER_SKILLS.forEach(skill => {
      skills[skill.id] = 1 + Math.floor(Math.random() * 4);
    });
  }
  return {
    id: `candidate-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: createManagerName(),
    birthYear: (calendarYear || 2026) - managerAge,
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
  const currentActualYear = calendarYear || (2025 + currentYear);
  return currentActualYear - manager.birthYear;
}

function getManagerSkillTotal(manager) {
  if (!manager.skills) return 0;
  return Object.values(manager.skills).reduce((sum, val) => sum + val, 0);
}

function getManagerMonthlySalary(manager) {
  return (MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL) / 12;
}

function getManagerAnnualSalary(manager) {
  return MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL;
}

function getTotalManagerMonthlySalary() {
  return managers.reduce((total, m) => total + getManagerMonthlySalary(m), 0);
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
  if (cost === null || funds < cost) return;
  funds -= cost;
  manager.skills[skillId] += 1;
  updateUI();
}

function refreshManagerMarket() {
  if (!Array.isArray(managerMarketCandidates)) managerMarketCandidates = [];
  const missing = MANAGER_MARKET_CANDIDATE_COUNT - managerMarketCandidates.length;
  if (missing <= 0) return;

  const takenNames = new Set([
    ...managers.map(m => m.name),
    ...managerMarketCandidates.map(c => c.name)
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
    alert(`マネージャーは最大${MANAGER_HIRE_LIMIT}名までです。`);
    return;
  }
  const candidate = managerMarketCandidates.find(item => item.id === candidateId);
  if (!candidate) return;
  if (funds < MANAGER_HIRE_COST) {
    alert('採用資金が不足しています。');
    return;
  }
  funds -= MANAGER_HIRE_COST;
  managers.push({
    id: `manager-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: candidate.name,
    birthYear: candidate.birthYear,
    age: candidate.age,
    skills: { ...candidate.skills },
    resignAge: candidate.resignAge,
    joinedYear: currentYear
  });
  managerMarketCandidates = managerMarketCandidates.filter(item => item.id !== candidateId);
  refreshManagerMarket();
  updateUI();
}

function fireManager(managerId) {
  const index = managers.findIndex(item => item.id === managerId);
  if (index < 0) return;
  const cost = getManagerFireCost(managers[index]);
  if (funds < cost) {
    alert('解雇料が不足しています。');
    return;
  }
  if (!confirm(`解雇料 ${formatMoney(cost)} を支払って解雇しますか？`)) return;
  funds -= cost;
  managers.splice(index, 1);
  updateUI();
}

function processManagerResignations() {
  managers = managers.filter(manager => {
    const age = getManagerAge(manager);
    const resignAge = Number.isFinite(manager.resignAge) ? manager.resignAge : MANAGER_RESIGN_AGE_MAX;
    return age < resignAge;
  });
  refreshManagerMarket();
}

function getManagerSkillTier(skillId) {
  const total = managers.reduce((sum, m) => sum + (m.skills?.[skillId] || 1), 0);
  let current = MANAGER_LEVEL_TIERS[MANAGER_LEVEL_TIERS.length - 1];
  for (let i = 0; i < MANAGER_LEVEL_TIERS.length; i++) {
    if (total >= MANAGER_LEVEL_TIERS[i].min) {
      current = MANAGER_LEVEL_TIERS[i];
      break;
    }
  }
  return { total, label: current.label, multiplier: current.multiplier };
}

function getSpecialTrainingMultiplier() {
  return Math.round(SPECIAL_TRAINING_MULTIPLIER * getManagerSkillTier('leadership').multiplier * 100) / 100;
}

function getSpecialTrainingTargetLimit() {
  const tier = getManagerSkillTier('scheduling');
  return tier.total >= 25 ? 3 : (tier.total >= 15 ? 2 : 1);
}

function getSpecialTrainingStaminaReduction() {
  return 0.5;
}

function getSpecialTrainingRiskReduction() {
  return 0.5;
}

// ==========================================
// ユーティリティ・補助関数（完全復元）
// ==========================================
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
