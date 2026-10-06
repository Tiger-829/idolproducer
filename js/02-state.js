// ==========================================
// 02-state.js : 全機能完全復元・ライバルスケジュール・実世界西暦（2026年等）同期版
// ==========================================

let currentYear = 1;
let currentMonth = 1;
let currentWeek = 1; // 1〜4週
let gameDate = '';
let calendarYear = new Date().getFullYear(); // 🌟 実世界の西暦を動的に取得・同期
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
  const baseYear = calendarYear && calendarYear > 2000 ? calendarYear : new Date().getFullYear();
  const actualYear = baseYear + targetYearNum - 1;

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
      const baseCountPerHalf = Math.min(30, Math.max(18, Math.round((power / 92) * 26)));
      const targetLiveCount = generateFullYear ? baseCountPerHalf * 2 : baseCountPerHalf;

      let generatedDaysCount = 0;
      let safetyCounter = 0;

      while (generatedDaysCount < targetLiveCount && safetyCounter < 200) {
        safetyCounter++;
        const randomMonthOffset = Math.floor(Math.random() * monthSpan);
        const targetMonth = ((startMonth - 1 + randomMonthOffset) % 12) + 1;
        const targetYearOffset = Math.floor((startMonth - 1 + randomMonthOffset) / 12);
        const bookingYear = actualYear + targetYearOffset;

        const lastDay = new Date(bookingYear, targetMonth, 0).getDate();
        
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

        const isConsecutive = Math.random() < 1;
        let durationDays = 1;
        if (isConsecutive) {
          const rand = Math.random();
          if (rand < 0.50) {
            durationDays = 2;
          } else if (rand < 0.80) {
            durationDays = 3;
          } else if (rand < 0.95) {
            durationDays = 4;
          } else {
            durationDays = 5;
          }
        }
        const liveDatesArr = [];
        const baseLiveName = `${team.name} ${venue.name} 公演`;

        for (let dIdx = 0; dIdx < durationDays; dIdx++) {
          const targetDate = new Date(selectedDateObj);
          targetDate.setDate(selectedDateObj.getDate() + dIdx);
          
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
}

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
  const baseYear = calendarYear || new Date().getFullYear();
  const schedule = {};
  schedule[`1-2`] = { release: 'single', songName: 'SnowDrops', releaseDate: `${baseYear}-02-18`, releaseBenefit: 'none', liveVenue: null };
  schedule[`1-6`] = { release: 'single', songName: 'アジサイと風鈴', releaseDate: `${baseYear}-06-17`, releaseBenefit: 'none', liveVenue: null };
  schedule[`1-5`] = { release: 'none', songName: '', liveVenue: INITIAL_LIVE_VENUE || '原宿体育館', liveName: 'Debut Live', liveDate: `${baseYear}-05-16`, liveDates: [`${baseYear}-05-17`], streamDates: [`${baseYear}-05-16`, `${baseYear}-05-17`] };
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
// マネージャーシステム関連
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
    birthYear: (calendarYear || new Date().getFullYear()) - managerAge,
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
  const currentActualYear = calendarYear || new Date().getFullYear();
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
// ユーティリティ・補助関数
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

// 🌟 カレンダー同期処理（実システムの西暦ベース）
function syncGameCalendar() {
  const date = getGameDateObject();
  if (!calendarYear) {
    calendarYear = new Date().getFullYear();
  }
  currentMonth = date.getMonth() + 1;
  currentWeek = Math.ceil(date.getDate() / 7);
}

function normalizeLeagueTeams(teams) {
  if (!Array.isArray(teams)) return createInitialLeagueTeams();
  return teams;
}

function initializeNewGameState() {
  currentYear = 1;
  currentMonth = 1;
  currentWeek = 1;
  calendarYear = new Date().getFullYear(); // 🌟 実世界の西暦に動的同期
  productionSchedule = createInitialProductionSchedule();
  gameDate = toDateKey(getFirstWednesday(calendarYear, 0));
  totalWeeksElapsed = 0;
  draftCount = 0;
  currentRosterTab = 'selected';
  merchandiseProducts = 0;
  merchandiseStock = 0;
  merchandiseUnitsSold = 0;
  merchandiseSellThrough = null;
  nextLivePromotionPoints = 0;
  monthlyCdRevenue = 0;
  monthlyTieUpRevenue = 0;
  monthlyLedger = createMonthlyLedger();
  pendingMonthlyReport = null;
  promoSongId = '';
  crisisCheckWeekKey = '';
  crisisEventWeekKey = '';
  crisisEventType = '';
  industryOfferCheckWeekKey = '';
  pendingIndustryOffer = null;
  specialLiveEvents = [];
  pendingEquipmentEvent = null;
  equipmentDowngradeCheckWeekKey = '';
  pendingCrisisResponse = null;
  randomEventCheckWeekKey = '';
  pendingRandomEvent = null;
  armedRandomEvents = [];
  pendingSelectionEvent = null;
  selectionLock = null;
  lastAnnouncedCenterId = null;
  shownAbilityMemberIds = new Set();
  fanClub = null;
  fanClubFoundedYear = 0;
  pendingFanClubEvent = null;
  groupCrisis = 55;
  officeUpgrades = createInitialOfficeUpgrades();
  yearlyStats = { sales: 0, audience: 0 };
  lifetimeSales = 0;
  salesHistory = [];
  fansFromSales = 0;
  funds = INITIAL_FUNDS;
  leagueTeams = createInitialLeagueTeams();
  songs = [];
  pendingPerformanceOffers = [];
  scheduledPerformances = [];
  specialOffersSent = [];
  rivalLiveBookings = [];
  managers = [createManager()];
  managerMarketCandidates = [];
  refreshManagerMarket();
  weeklySchedule = null;
  lastWeekSchedule = null;
  savedCleanWeekSchedule = null;
  previousYearGroupFansAtYearStart = 0;
  groupFansAtYearStart = 0;
  yearEndAwardProcessed = false;
  yearEndKohakuProcessed = false;

  generateRivalsAndGeneralSchedule(currentYear, currentMonth, true);

  idolRoster = [];
  for (let i = 0; i < 30; i++) {
    const startAge = Math.floor(Math.random() * 9) + 14;
    const m = createMember(startAge);
    m.yearsActive = 0;
    m.joinAge = startAge;
    m.isSelected = (i < 16);
    m.isCenter = (i === 0);
    idolRoster.push(m);
  }
  ensureMemberBirthdays();
  ensureMemberHeights();
  ensureMemberVitalState();
  ensureMemberStyleFashion();
  syncMemberAges();
  groupFansAtYearStart = calculateGroupFans();
  previousYearGroupFansAtYearStart = groupFansAtYearStart;
}

function applySavedGame(data) {
  currentYear = data.currentYear || 1;
  calendarYear = data.calendarYear || new Date().getFullYear();
  gameDate = data.gameDate || migrateLegacyGameDate(currentYear, data.currentMonth || 1, data.currentWeek || 1);
  syncGameCalendar();
  totalWeeksElapsed = data.totalWeeksElapsed || 0;
  draftCount = data.draftCount || 0;
  merchandiseProducts = data.merchandiseProducts || 0;
  merchandiseStock = data.merchandiseStock ?? merchandiseProducts * 2000;
  merchandiseUnitsSold = data.merchandiseUnitsSold || 0;
  merchandiseSellThrough = data.merchandiseSellThrough ?? null;
  nextLivePromotionPoints = data.nextLivePromotionPoints || 0;
  monthlyCdRevenue = data.monthlyCdRevenue || 0;
  monthlyTieUpRevenue = data.monthlyTieUpRevenue || 0;
  monthlyLedger = data.monthlyLedger && Array.isArray(data.monthlyLedger.income)
    ? { income: data.monthlyLedger.income, expense: data.monthlyLedger.expense || [] }
    : createMonthlyLedger();
  pendingMonthlyReport = data.pendingMonthlyReport || null;
  promoSongId = data.promoSongId || '';
  crisisCheckWeekKey = data.crisisCheckWeekKey || '';
  crisisEventWeekKey = data.crisisEventWeekKey || '';
  crisisEventType = data.crisisEventType || '';
  pendingCrisisResponse = data.pendingCrisisResponse || null;
  randomEventCheckWeekKey = data.randomEventCheckWeekKey || '';
  pendingRandomEvent = restorePendingRandomEvent(data.pendingRandomEvent);
  armedRandomEvents = Array.isArray(data.armedRandomEvents) ? data.armedRandomEvents : [];
  pendingSelectionEvent = data.pendingSelectionEvent || null;
  selectionLock = data.selectionLock || null;
  lastAnnouncedCenterId = data.lastAnnouncedCenterId || null;
  fanClub = data.fanClub || null;
  fanClubFoundedYear = data.fanClubFoundedYear || 0;
  pendingFanClubEvent = data.pendingFanClubEvent || null;
  industryOfferCheckWeekKey = data.industryOfferCheckWeekKey || '';
  pendingIndustryOffer = data.pendingIndustryOffer || null;
  specialLiveEvents = data.specialLiveEvents || [];
  pendingEquipmentEvent = data.pendingEquipmentEvent || null;
  equipmentDowngradeCheckWeekKey = data.equipmentDowngradeCheckWeekKey || '';
  groupCrisis = data.groupCrisis ?? 55;
  officeUpgrades = { ...createInitialOfficeUpgrades(), ...(data.officeUpgrades || {}) };
  funds = data.funds ?? INITIAL_FUNDS;
  yearlyStats = data.yearlyStats || { sales: 0, audience: 0 };
  lifetimeSales = Number.isFinite(data.lifetimeSales) ? data.lifetimeSales : (yearlyStats.sales || 0);
  salesHistory = Array.isArray(data.salesHistory) ? data.salesHistory : [];
  fansFromSales = Number.isFinite(data.fansFromSales) ? data.fansFromSales : getTargetSalesFans();
  fansFromSales = Math.max(0, Math.min(fansFromSales, getTargetSalesFans()));
  idolRoster = data.idolRoster || [];
  ensureMemberBirthdays();
  ensureMemberHeights();
  ensureMemberVitalState();
  ensureMemberStyleFashion();
  syncMemberAges();
  productionSchedule = data.productionSchedule || {};
  leagueTeams = data.leagueTeams || createInitialLeagueTeams();
  songs = data.songs || [];
  pendingPerformanceOffers = data.pendingPerformanceOffers || [];
  scheduledPerformances = data.scheduledPerformances || [];
  specialOffersSent = data.specialOffersSent || [];
  rivalLiveBookings = data.rivalLiveBookings || [];
  managers = Array.isArray(data.managers) && data.managers.length ? data.managers : [createManager()];
  managers = managers.map(manager => {
    const birthYear = Number.isInteger(manager.birthYear) ? manager.birthYear : (calendarYear || new Date().getFullYear()) - (manager.age || MANAGER_AGE_MIN);
    return {
      ...manager,
      birthYear,
      age: manager.age ?? ((calendarYear || new Date().getFullYear()) - birthYear),
      resignAge: Number.isFinite(manager.resignAge) ? manager.resignAge : (MANAGER_RESIGN_AGE_MIN + Math.floor(Math.random() * (MANAGER_RESIGN_AGE_MAX - MANAGER_RESIGN_AGE_MIN + 1))),
      skills: Object.fromEntries(MANAGER_SKILLS.map(skill => [skill.id, manager?.skills?.[skill.id] || 1]))
    };
  });
  managerMarketCandidates = Array.isArray(data.managerMarketCandidates) ? data.managerMarketCandidates : [];
  refreshManagerMarket();
  groupFansAtYearStart = data.groupFansAtYearStart ?? calculateGroupFans();
  previousYearGroupFansAtYearStart = data.previousYearGroupFansAtYearStart ?? groupFansAtYearStart;
  yearEndAwardProcessed = Boolean(data.yearEndAwardProcessed);
  yearEndKohakuProcessed = Boolean(data.yearEndKohakuProcessed);
  lastLiveDate = data.lastLiveDate || '';
  weeklyRecoveryDone = false;
  normalizeLeagueTeams();
}
