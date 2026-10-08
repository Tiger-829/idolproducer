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
let merchandiseProducts = 0;
let merchandiseStock = 0;
let merchandiseUnitsSold = 0;
let merchandiseSellThrough = null;
let merchandiseItems = []; // グッズ開発日管理（1年自動減衰用）
let liveHistory = [];      // ライブ1日あたり最大動員数ランキング用実績保存配列

let nextLivePromotionPoints = 0;
let monthlyCdRevenue = 0;
let monthlyTieUpRevenue = 0;

// 月次台帳を作成する。
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

// Initialリーグチームを作成する。
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

const INDIE_GROUP_NAMES = [
  'アリス・イン・アンダーグラウンド', 'ネオン・パレット', 'プラネット・シスターズ', 
  'ベール・ド・ノワール', '東京メルヘン倶楽部', 'チェリー・ブロッサムズ', 
  'サイバー・ドールズ', '月下美人', 'ルーキー・ファクトリー', 'ステラ・ノヴァ'
];

// ==========================================
// ⚾ プロ野球公式戦の開催判定関数（バリデーション用）
// ==========================================
function isBaseballGameDay(venueName, dateStr) {
  if (!venueName || (!venueName.includes('球場') && !venueName.includes('ドーム'))) {
    return false;
  }
  const dObj = new Date(`${dateStr}T12:00:00`);
  if (isNaN(dObj)) return false;

  const m = dObj.getMonth() + 1;
  const d = dObj.getDate();
  const dayOfWeek = dObj.getDay();

  if (dayOfWeek === 1) return false; // 月曜休み

  if ((m === 11 && d >= 5) || m === 12 || m === 1) {
    return false; // オフシーズン
  }
  if (m === 2 || (m === 3 && d < 21)) {
    return (d % 5 === 0); // キャンプ・オープン戦（月の約2割）
  }
  const subDay = (d - 1) % 7;
  return (subDay >= 1 && subDay <= 6); // ペナントレース（火〜日曜）
}

// ==========================================
// 🌟 ライバル・ダミー・プロ野球連動スケジュール生成
// ==========================================
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

  if (Array.isArray(leagueTeams)) {
    leagueTeams.forEach(team => {
      if (team.id === 'player') return;

      const power = team.basePower || 50;
      const baseCountPerHalf = Math.min(28, Math.max(16, Math.round((power / 92) * 24)));
      const targetLiveCount = generateFullYear ? baseCountPerHalf * 2 : baseCountPerHalf;

      let generatedToursCount = 0;
      let safetyCounter = 0;
      const teamBookedDates = new Set();

      while (generatedToursCount < targetLiveCount && safetyCounter < 600) {
        safetyCounter++;
        const randomMonthOffset = Math.floor(Math.random() * monthSpan);
        const targetMonth = ((startMonth - 1 + randomMonthOffset) % 12) + 1;
        const targetYearOffset = Math.floor((startMonth - 1 + randomMonthOffset) / 12);
        const bookingYear = actualYear + targetYearOffset;

        const lastDay = new Date(bookingYear, targetMonth, 0).getDate();
        let selectedDateObj = null;
        for (let attempt = 0; attempt < 35; attempt++) {
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

        const chosenVenueObj = venuePool[Math.floor(Math.random() * venuePool.length)];
        const venueName = chosenVenueObj?.name || '市民会館';
        const isStadium = venueName.includes('球場') || venueName.includes('ドーム');

        const durationDays = 2 + Math.floor(Math.random() * 3);
        const candidateDates = [];
        let hasConflict = false;

        for (let dIdx = 0; dIdx < durationDays; dIdx++) {
          const targetDate = new Date(selectedDateObj);
          targetDate.setDate(selectedDateObj.getDate() + dIdx);
          if (targetDate.getMonth() + 1 !== targetMonth) break;
          const dKey = toDateKey(targetDate);

          if ((isStadium && isBaseballGameDay(venueName, dKey)) || globalBusyDates.has(`${venueName}_${dKey}`) || teamBookedDates.has(dKey)) {
            hasConflict = true;
            break;
          }
          candidateDates.push(dKey);
        }

        if (!hasConflict && candidateDates.length > 0) {
          candidateDates.forEach(dKey => {
            teamBookedDates.add(dKey);
            globalBusyDates.add(`${venueName}_${dKey}`);
          });
          generatedToursCount++;
          const baseLiveName = `${team.name} ${venueName} 公演`;

          newRivalBookings.push({
            id: `${team.id}-${actualYear}-${targetMonth}-${safetyCounter}`,
            groupId: team.id,
            groupName: team.name,
            liveVenue: venueName,
            venue: venueName,
            place: venueName,
            liveName: baseLiveName,
            liveDate: candidateDates[0],
            liveDates: candidateDates,
            venueDates: candidateDates,
            status: 'confirmed',
            type: 'live',
            hiddenFromPlayer: false
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

        if (!teamBookedDates.has(wednesdayStr)) {
          teamBookedDates.add(wednesdayStr);
          newRivalBookings.push({
            id: `${team.id}-rel-${cdBookingYear}-${targetCdMonth}-${j}`,
            groupId: team.id,
            groupName: team.name,
            liveVenue: '',
            venue: '',
            place: '',
            liveName: `${team.name} 新曲リリース`,
            liveDate: wednesdayStr,
            liveDates: [wednesdayStr],
            venueDates: [wednesdayStr],
            status: 'confirmed',
            type: 'release',
            hiddenFromPlayer: false
          });
        }
      }
    });
  }

  const dummyGroupCount = 100;
  for (let dIdx = 0; dIdx < dummyGroupCount; dIdx++) {
    const randomMonthOffset = Math.floor(Math.random() * monthSpan);
    const targetMonth = ((startMonth - 1 + randomMonthOffset) % 12) + 1;
    const targetYearOffset = Math.floor((startMonth - 1 + randomMonthOffset) / 12);
    const bookingYear = actualYear + targetYearOffset;

    const lastDay = new Date(bookingYear, targetMonth, 0).getDate();
    const randomDay = 1 + Math.floor(Math.random() * lastDay);
    const dObj = new Date(bookingYear, targetMonth - 1, randomDay);
    const dKey = toDateKey(dObj);

    const chosenVenueObj = venuePool[Math.floor(Math.random() * venuePool.length)];
    const venueName = chosenVenueObj?.name || '市民会館';
    const isStadium = venueName.includes('球場') || venueName.includes('ドーム');

    if ((isStadium && isBaseballGameDay(venueName, dKey)) || globalBusyDates.has(`${venueName}_${dKey}`)) {
      continue;
    }

    globalBusyDates.add(`${venueName}_${dKey}`);
    newRivalBookings.push({
      id: `dummy-group-${dIdx}`,
      groupId: 'dummy',
      groupName: '',
      liveVenue: venueName,
      venue: venueName,
      place: venueName,
      liveName: '貸切公演',
      liveDate: dKey,
      liveDates: [dKey],
      venueDates: [dKey],
      status: 'confirmed',
      type: 'dummy',
      hiddenFromPlayer: true
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

// ランダムWednesdayキーを取得する。
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

// NearestWednesdayを取得する。
function getNearestWednesday(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diff = 3 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// NearestSaturdayを取得する。
function getNearestSaturday(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  if (diff > 3) {
    d.setDate(d.getDate() - (7 - diff));
  } else {
    d.setDate(d.getDate() + diff);
  }
  return d;
}

let idolRoster = [];

// Initial制作スケジュールを作成する。
function createInitialProductionSchedule() {
  const baseYear = calendarYear || new Date().getFullYear();
  const schedule = {};

  const rawFebRel = new Date(baseYear, 1, 18, 12);
  const febWednesday = getNearestWednesday(rawFebRel);

  const rawJunRel = new Date(baseYear, 5, 17, 12);
  const junWednesday = getNearestWednesday(rawJunRel);

  const rawLiveDate = new Date(baseYear, 4, 16, 12);
  const liveSaturday = getNearestSaturday(rawLiveDate);
  const liveSunday = new Date(liveSaturday);
  liveSunday.setDate(liveSaturday.getDate() + 1);

  schedule[`1-2`] = { 
    release: 'single', 
    songName: 'SnowDrops', 
    releaseDate: toDateKey(febWednesday), 
    releaseBenefit: 'none', 
    liveVenue: null 
  };

  schedule[`1-6`] = { 
    release: 'single', 
    songName: 'アジサイと風鈴', 
    releaseDate: toDateKey(junWednesday), 
    releaseBenefit: 'none', 
    liveVenue: null 
  };

  schedule[`1-5`] = { 
    release: 'none', 
    songName: '', 
    liveVenue: INITIAL_LIVE_VENUE || '原宿体育館', 
    liveName: 'Debut Live', 
    liveDate: toDateKey(liveSaturday), 
    liveDates: [toDateKey(liveSaturday), toDateKey(liveSunday)], 
    streamDates: [toDateKey(liveSaturday), toDateKey(liveSunday)] 
  };

  return schedule;
}

let productionSchedule = createInitialProductionSchedule();
let yearlyStats = { sales: 0, audience: 0 };
let lifetimeSales = 0;
let salesHistory = [];
let logHistory = [];
let funds = INITIAL_FUNDS;

// Initial事務所アップグレードを作成する。
function createInitialOfficeUpgrades() {
  return { lessons: 0, dormitory: 0, analytics: 0, snsTraining: 0, liveProduction: 0, merchandise: 0 };
}

let managers = [];
let managerMarketCandidates = [];

const MANAGER_SURNAMES = ['桐生', '水無瀬', '南雲', '日和見', '早乙女', '如月', '峰岸', '真柴', '三雲', '花房', '天海', '和久井', '白石', '榊原'];
const MANAGER_GIVEN_NAMES = ['沙耶', '美咲', '彩乃', '結衣', '玲奈', '千尋', '雅代', '志穂', '真由', '亜紀', '深津', '志乃'];

// マネージャー名前を作成する。
function createManagerName() {
  const surname = MANAGER_SURNAMES[Math.floor(Math.random() * MANAGER_SURNAMES.length)];
  const given = MANAGER_GIVEN_NAMES[Math.floor(Math.random() * MANAGER_GIVEN_NAMES.length)];
  return `${surname} ${given}`;
}

// マネージャーCandidateを作成する。
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

// マネージャーを作成する。
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

// マネージャー年齢を取得する。
function getManagerAge(manager) {
  if (!Number.isInteger(manager.birthYear)) return manager.age ?? MANAGER_AGE_MIN;
  const currentActualYear = calendarYear || new Date().getFullYear();
  return currentActualYear - manager.birthYear;
}

// マネージャーSkill合計を取得する。
function getManagerSkillTotal(manager) {
  if (!manager.skills) return 0;
  return Object.values(manager.skills).reduce((sum, val) => sum + val, 0);
}

// マネージャー月次給与を取得する。
function getManagerMonthlySalary(manager) {
  return (MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL) / 12;
}

// マネージャー年間給与を取得する。
function getManagerAnnualSalary(manager) {
  return MANAGER_YEARLY_BASE + getManagerSkillTotal(manager) * MANAGER_YEARLY_PER_LEVEL;
}

// 合計マネージャー月次給与を取得する。
function getTotalManagerMonthlySalary() {
  return managers.reduce((total, m) => total + getManagerMonthlySalary(m), 0);
}

// マネージャーFireCostを取得する。
function getManagerFireCost(manager) {
  return getManagerMonthlySalary(manager) * MANAGER_FIRE_MONTHS;
}

// マネージャーSkillUpCostを取得する。
function getManagerSkillUpCost(manager, skillId) {
  const level = manager.skills?.[skillId] || 1;
  if (level >= MAX_MANAGER_LEVEL) return null;
  return Math.round(MANAGER_SKILL_COST_BASE * (MANAGER_SKILL_COST_GROWTH ** (level - 1)));
}

// levelUpマネージャーSkillを処理する。
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

// refreshマネージャーMarketを処理する。
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

// hireマネージャーMarketを処理する。
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

// fireマネージャーを処理する。
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

// マネージャーResignationsを処理する。
function processManagerResignations() {
  managers = managers.filter(manager => {
    const age = getManagerAge(manager);
    const resignAge = Number.isFinite(manager.resignAge) ? manager.resignAge : MANAGER_RESIGN_AGE_MAX;
    return age < resignAge;
  });
  refreshManagerMarket();
}

// マネージャーSkill階層を取得する。
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

// Special育成Multiplierを取得する。
function getSpecialTrainingMultiplier() {
  return Math.round(SPECIAL_TRAINING_MULTIPLIER * getManagerSkillTier('leadership').multiplier * 100) / 100;
}

// Special育成TargetLimitを取得する。
function getSpecialTrainingTargetLimit() {
  const tier = getManagerSkillTier('scheduling');
  return tier.total >= 25 ? 3 : (tier.total >= 15 ? 2 : 1);
}

// Special育成体力Reductionを取得する。
function getSpecialTrainingStaminaReduction() {
  return 0.5;
}

// Special育成RiskReductionを取得する。
function getSpecialTrainingRiskReduction() {
  return 0.5;
}

// 日付文字列をキー化する。
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Stadium会場を判定する。
function isStadiumVenue(venue) {
  return Boolean(venue && (venue.name.includes('球場') || venue.name.includes('ドーム')));
}

// ライブ予約進行日を取得する。
function getLiveBookingLeadDays(venue) {
  return isStadiumVenue(venue) ? 180 : 45;
}

// 資金を整形する。
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

// ファンCountを整形する。
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

// 試合カレンダーを同期する。
function syncGameCalendar() {
  const date = getGameDateObject();
  if (!calendarYear) {
    calendarYear = new Date().getFullYear();
  }
  currentMonth = date.getMonth() + 1;
  currentWeek = Math.ceil(date.getDate() / 7);
}

// リーグチームを整形する。
function normalizeLeagueTeams(teams) {
  if (!Array.isArray(teams)) return createInitialLeagueTeams();
  return teams;
}

// initializeNew試合StateBaseを処理する。
function initializeNewGameStateBase() {
  currentYear = 1;
  currentMonth = 1;
  currentWeek = 1;
  calendarYear = new Date().getFullYear();
  productionSchedule = createInitialProductionSchedule();
  gameDate = toDateKey(getFirstWednesday(calendarYear, 0));
  totalWeeksElapsed = 0;
  draftCount = 0;
  currentRosterTab = 'selected';
  merchandiseProducts = 0;
  merchandiseStock = 0;
  merchandiseUnitsSold = 0;
  merchandiseSellThrough = null;
  merchandiseItems = [];
  liveHistory = [];
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

// Saved試合Baseを適用。
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
