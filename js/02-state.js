// ==========================================
// 02-state.js : 野球ペナント・ダミー隠蔽・全機能完全統合版
// ==========================================

let currentYear = 1;
let currentMonth = 1;
let currentWeek = 1;
let gameDate = '';
let calendarYear = new Date().getFullYear();
let lastRenderedCalendarDate = '';
let totalWeeksElapsed = 0;
let draftCount = 0;
let currentRosterTab = 'selected';

// グッズ管理変数
let merchandiseProducts = 0;
let merchandiseStock = 0;
let merchandiseUnitsSold = 0;
let merchandiseSellThrough = null;
let merchandiseItems = [];

// ライブ実績履歴（1日あたりの最大動員数ランキング用）
let liveHistory = [];

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

function isBaseballGameDay(venueName, dateStr) {
  if (!venueName || (!venueName.includes('球場') && !venueName.includes('ドーム'))) {
    return false;
  }
  const dObj = new Date(`${dateStr}T12:00:00`);
  if (isNaN(dObj)) return false;

  const m = dObj.getMonth() + 1;
  const d = dObj.getDate();
  const dayOfWeek = dObj.getDay();

  if (dayOfWeek === 1) return false;
  if ((m === 11 && d >= 5) || m === 12 || m === 1) return false;
  if (m === 2 || (m === 3 && d < 21)) return (d % 5 === 0);
  const subDay = (d - 1) % 7;
  return (subDay >= 1 && subDay <= 6);
}

function generateRivalsAndGeneralSchedule(year, startMonth, generateFullYear = false) {
  const newRivalBookings = [];
  const monthSpan = generateFullYear ? 12 : 6;
  const targetYearNum = Number(year) || 1;
  const baseYear = calendarYear && calendarYear > 2000 ? calendarYear : new Date().getFullYear();
  const actualYear = baseYear + targetYearNum - 1;
  const dayWeights = { 0: 12, 6: 12, 5: 8, 2: 5, 3: 5, 4: 3, 1: 1 };
  const venuePool = (typeof VENUE_DATA !== 'undefined' && Array.isArray(VENUE_DATA)) ? VENUE_DATA : [{ name: '市民会館', cap: 'B' }];
  const globalBusyDates = new Set();

  for (let mOffset = 0; mOffset < (generateFullYear ? 12 : 6); mOffset++) {
    const targetMonth = ((startMonth - 1 + mOffset) % 12) + 1;
    const targetYearOffset = Math.floor((startMonth - 1 + mOffset) / 12);
    const targetYear = actualYear + targetYearOffset;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();

    venuePool.forEach(stadium => {
      if (stadium.name.includes('球場') || stadium.name.includes('ドーム')) {
        for (let d = 1; d <= lastDay; d++) {
          const dObj = new Date(targetYear, targetMonth - 1, d, 12);
          const dKey = toDateKey(dObj);
          if (isBaseballGameDay(stadium.name, dKey)) {
            globalBusyDates.add(`${stadium.name}_${dKey}`);
          }
        }
      }
    });
  }

  rivalLiveBookings = newRivalBookings;
}

function getRandomWednesdayKey(year, month) {
  const wednesdays = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 3) wednesdays.push(toDateKey(date));
  }
  return wednesdays.length === 0 ? `${year}-${String(month).padStart(2, '0')}-15` : wednesdays[Math.floor(Math.random() * wednesdays.length)];
}

function getNearestWednesday(dateObj) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + (3 - d.getDay()));
  return d;
}

function getNearestSaturday(dateObj) {
  const d = new Date(dateObj);
  const diff = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff > 3 ? diff - 7 : diff));
  return d;
}

let idolRoster = [];

function createInitialProductionSchedule() {
  const baseYear = calendarYear || new Date().getFullYear();
  const schedule = {};
  const febWednesday = getNearestWednesday(new Date(baseYear, 1, 18, 12));
  const junWednesday = getNearestWednesday(new Date(baseYear, 5, 17, 12));
  const liveSaturday = getNearestSaturday(new Date(baseYear, 4, 16, 12));
  const liveSunday = new Date(liveSaturday);
  liveSunday.setDate(liveSaturday.getDate() + 1);

  schedule[`1-2`] = { release: 'single', songName: 'SnowDrops', releaseDate: toDateKey(febWednesday), releaseBenefit: 'none', liveVenue: null };
  schedule[`1-6`] = { release: 'single', songName: 'アジサイと風鈴', releaseDate: toDateKey(junWednesday), releaseBenefit: 'none', liveVenue: null };
  schedule[`1-5`] = { release: 'none', songName: '', liveVenue: INITIAL_LIVE_VENUE || '原宿体育館', liveName: 'Debut Live', liveDate: toDateKey(liveSaturday), liveDates: [toDateKey(liveSaturday), toDateKey(liveSunday)], streamDates: [toDateKey(liveSaturday), toDateKey(liveSunday)] };
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

let managers = [];
let managerMarketCandidates = [];
const MANAGER_SURNAMES = ['桐生', '水無瀬', '南雲', '日和見', '早乙女', '如月', '峰岸', '真柴', '三雲', '花房', '天海', '和久井', '白石', '榊原'];
const MANAGER_GIVEN_NAMES = ['沙耶', '美咲', '彩乃', '結衣', '玲奈', '千尋', '雅代', '志穂', '真由', '亜紀', '深津', '志乃'];

function createManagerName() {
  return `${MANAGER_SURNAMES[Math.floor(Math.random() * MANAGER_SURNAMES.length)]} ${MANAGER_GIVEN_NAMES[Math.floor(Math.random() * MANAGER_GIVEN_NAMES.length)]}`;
}

function createManagerCandidate(age = null) {
  const managerAge = age ?? (MANAGER_AGE_MIN + Math.floor(Math.random() * (MANAGER_AGE_MAX - MANAGER_AGE_MIN + 1)));
  const skills = {};
  if (typeof MANAGER_SKILLS !== 'undefined') {
    MANAGER_SKILLS.forEach(skill => { skills[skill.id] = 1 + Math.floor(Math.random() * 4); });
  }
  return { id: `candidate-${Date.now()}-${Math.floor(Math.random() * 100000)}`, name: createManagerName(), birthYear: (calendarYear || new Date().getFullYear()) - managerAge, age: managerAge, skills, resignAge: MANAGER_RESIGN_AGE_MIN + Math.floor(Math.random() * (MANAGER_RESIGN_AGE_MAX - MANAGER_RESIGN_AGE_MIN + 1)) };
}

function createManager() {
  const candidate = createManagerCandidate();
  return { id: `manager-${Date.now()}-${Math.floor(Math.random() * 10000)}`, name: candidate.name, birthYear: candidate.birthYear, age: candidate.age, skills: candidate.skills, resignAge: candidate.resignAge, joinedYear: currentYear };
}

function getManagerAge(manager) {
  if (!Number.isInteger(manager.birthYear)) return manager.age ?? MANAGER_AGE_MIN;
  return (calendarYear || new Date().getFullYear()) - manager.birthYear;
}

function getManagerSkillTotal(manager) {
  if (!manager.skills) return 0;
  return Object.values(manager.skills).reduce((sum, val) => sum + val, 0);
}

function getManagerMonthlySalary(manager) {
  return (MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL) / 12;
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
  const cost = getManagerSkillUpCost(manager, skillId);
  if (cost === null || funds < cost) return;
  funds -= cost;
  manager.skills[skillId] = (manager.skills[skillId] || 1) + 1;
  updateUI();
}

function refreshManagerMarket() {
  if (!Array.isArray(managerMarketCandidates)) managerMarketCandidates = [];
  const missing = MANAGER_MARKET_CANDIDATE_COUNT - managerMarketCandidates.length;
  if (missing <= 0) return;
  const takenNames = new Set([...managers.map(m => m.name), ...managerMarketCandidates.map(c => c.name)]);
  let guard = 0;
  while (managerMarketCandidates.length < MANAGER_MARKET_CANDIDATE_COUNT && guard++ < 60) {
    const candidate = createManagerCandidate();
    if (takenNames.has(candidate.name)) continue;
    takenNames.add(candidate.name);
    managerMarketCandidates.push(candidate);
  }
}

function hireManagerFromMarket(candidateId) {
  if (managers.length >= MANAGER_HIRE_LIMIT) return;
  const candidate = managerMarketCandidates.find(item => item.id === candidateId);
  if (!candidate || funds < MANAGER_HIRE_COST) return;
  funds -= MANAGER_HIRE_COST;
  managers.push({ id: `manager-${Date.now()}-${Math.floor(Math.random() * 10000)}`, name: candidate.name, birthYear: candidate.birthYear, age: candidate.age, skills: { ...candidate.skills }, resignAge: candidate.resignAge, joinedYear: currentYear });
  managerMarketCandidates = managerMarketCandidates.filter(item => item.id !== candidateId);
  refreshManagerMarket();
  updateUI();
}

function fireManager(managerId) {
  const index = managers.findIndex(item => item.id === managerId);
  if (index < 0) return;
  const cost = getManagerFireCost(managers[index]);
  if (funds < cost || !confirm(`解雇料 ${formatMoney(cost)} を支払って解雇しますか？`)) return;
  funds -= cost;
  managers.splice(index, 1);
  updateUI();
}

function processManagerResignations() {
  managers = managers.filter(manager => getManagerAge(manager) < (manager.resignAge || MANAGER_RESIGN_AGE_MAX));
  refreshManagerMarket();
}

function getManagerSkillTier(skillId) {
  const total = managers.reduce((sum, m) => sum + (m.skills?.[skillId] || 1), 0);
  let current = MANAGER_LEVEL_TIERS[MANAGER_LEVEL_TIERS.length - 1];
  for (let i = 0; i < MANAGER_LEVEL_TIERS.length; i++) {
    if (total >= MANAGER_LEVEL_TIERS[i].min) { current = MANAGER_LEVEL_TIERS[i]; break; }
  }
  return { total, label: current.label, multiplier: current.multiplier };
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMoney(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs < 100000) return `${sign}${abs.toLocaleString()}円`;
  if (abs < 1000000000) return `${sign}${Number((abs / 10000).toFixed(abs < 1000000 ? 1 : 0))}万円`;
  return `${sign}${Number((abs / 100000000).toFixed(2))}億円`;
}

function formatFanCount(value) {
  const count = Math.max(0, Math.round(Number(value) || 0));
  if (count < 100000) return `${count.toLocaleString()}人`;
  if (count < 100000000) return `${Number((count / 10000).toFixed(1))}万人`;
  return `${Number((count / 100000000).toFixed(2))}億人`;
}

function syncGameCalendar() {
  const date = getGameDateObject();
  if (!calendarYear) calendarYear = new Date().getFullYear();
  currentMonth = date.getMonth() + 1;
  currentWeek = Math.ceil(date.getDate() / 7);
}

function initializeNewGameStateBase() {
  currentYear = 1; currentMonth = 1; currentWeek = 1;
  calendarYear = new Date().getFullYear();
  productionSchedule = createInitialProductionSchedule();
  gameDate = toDateKey(getFirstWednesday(calendarYear, 0));
  totalWeeksElapsed = 0; draftCount = 0; currentRosterTab = 'selected';
  merchandiseProducts = 0; merchandiseStock = 0; merchandiseUnitsSold = 0; merchandiseSellThrough = null; merchandiseItems = [];
  liveHistory = [];
  nextLivePromotionPoints = 0; monthlyCdRevenue = 0; monthlyTieUpRevenue = 0;
  monthlyLedger = createMonthlyLedger(); pendingMonthlyReport = null; promoSongId = '';
  funds = INITIAL_FUNDS; leagueTeams = createInitialLeagueTeams(); songs = [];
  pendingPerformanceOffers = []; scheduledPerformances = []; specialOffersSent = [];
  weeklySchedule = null; lastWeekSchedule = null; savedCleanWeekSchedule = null;
  idolRoster = [];
  for (let i = 0; i < 30; i++) {
    const startAge = Math.floor(Math.random() * 9) + 14;
    const m = createMember(startAge);
    m.yearsActive = 0; m.joinAge = startAge; m.isSelected = (i < 16); m.isCenter = (i === 0);
    idolRoster.push(m);
  }
  ensureMemberBirthdays(); ensureMemberHeights(); ensureMemberVitalState(); ensureMemberStyleFashion(); syncMemberAges();
  groupFansAtYearStart = calculateGroupFans();
  previousYearGroupFansAtYearStart = groupFansAtYearStart;
}

function applySavedGameBase(data) {
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
  merchandiseItems = Array.isArray(data.merchandiseItems) ? data.merchandiseItems : [];
  liveHistory = Array.isArray(data.liveHistory) ? data.liveHistory : [];
  nextLivePromotionPoints = data.nextLivePromotionPoints || 0;
  monthlyCdRevenue = data.monthlyCdRevenue || 0;
  monthlyTieUpRevenue = data.monthlyTieUpRevenue || 0;
  monthlyLedger = data.monthlyLedger && Array.isArray(data.monthlyLedger.income) ? data.monthlyLedger : createMonthlyLedger();
  funds = data.funds ?? INITIAL_FUNDS;
  yearlyStats = data.yearlyStats || { sales: 0, audience: 0 };
  lifetimeSales = Number.isFinite(data.lifetimeSales) ? data.lifetimeSales : (yearlyStats.sales || 0);
  salesHistory = Array.isArray(data.salesHistory) ? data.salesHistory : [];
  idolRoster = data.idolRoster || [];
  ensureMemberBirthdays(); ensureMemberHeights(); ensureMemberVitalState(); ensureMemberStyleFashion(); syncMemberAges();
  productionSchedule = data.productionSchedule || {};
  leagueTeams = data.leagueTeams || createInitialLeagueTeams();
  songs = data.songs || [];
  pendingPerformanceOffers = data.pendingPerformanceOffers || [];
  scheduledPerformances = data.scheduledPerformances || [];
  specialOffersSent = data.specialOffersSent || [];
  rivalLiveBookings = data.rivalLiveBookings || [];
  managers = Array.isArray(data.managers) && data.managers.length ? data.managers : [createManager()];
  managerMarketCandidates = Array.isArray(data.managerMarketCandidates) ? data.managerMarketCandidates : [];
  refreshManagerMarket();
  groupFansAtYearStart = data.groupFansAtYearStart ?? calculateGroupFans();
  previousYearGroupFansAtYearStart = data.previousYearGroupFansAtYearStart ?? groupFansAtYearStart;
}
