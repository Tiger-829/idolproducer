// ==========================================
// アイドル生成ロジック
// ==========================================
// ==========================================
// 3. アイドル生成ロジック
// ==========================================

// アイドル名前を生成する。
function generateIdolName() {
  const surname = SURNAMES_TOP200[Math.floor(Math.random() * SURNAMES_TOP200.length)];
  const readKeys = Object.keys(FEMALE_READINGS_MAP);
  const reading = readKeys[Math.floor(Math.random() * readKeys.length)];
  const kanjiList = FEMALE_READINGS_MAP[reading];
  const given = kanjiList[Math.floor(Math.random() * kanjiList.length)];
  return { fullName: `${surname} ${given}`, reading };
}

// ランダムステータスを生成する。
function generateRandomStats(biasPolicy = null, memberHeight = null) {
  const stats = {};
  STATUS_KEYS.forEach(k => {
    stats[k.id] = Math.floor(Math.random() * 50) + 25; // 25〜75
  });
  // スタイルは身長に比例させる（最下値は MEMBER_STYLE_MIN）
  stats.style = getStyleFromHeight(memberHeight);
  // ファッションは初期から比較的高く（下限 MEMBER_FASHION_MIN）
  stats.fashion = Math.max(MEMBER_FASHION_MIN, Math.floor(Math.random() * 20) + 65);
  if (biasPolicy === 'vocal') stats.vocal = Math.min(100, stats.vocal + 20);
  if (biasPolicy === 'dance') stats.dance = Math.min(100, stats.dance + 20);
  if (biasPolicy === 'talk') stats.talk = Math.min(100, stats.talk + 20);
  return stats;
}

// うるう年判定
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// その月の日数（生年が無い場合は平年の日数で計算する）
function getDaysInMonth(year, month) {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12) return 28;
  return month === 2 && isLeapYear(year) ? 29 : lengths[month - 1];
}

// 2月29日生まれは、平年では3月1日を誕生日として扱う
function getBirthdayDate(year, month, day) {
  if (month === 2 && day === 29 && !isLeapYear(year)) return new Date(year, 2, 1, 12);
  return new Date(year, month - 1, day, 12);
}

// 生年に存在しない日付（平年の2/29）は2/28に寄せる
function normalizeBirthDate(birthYear, month, day) {
  if (month === 2 && day === 29 && Number.isInteger(birthYear) && !isLeapYear(birthYear)) {
    return { month: 2, day: 28 };
  }
  return { month, day };
}

// 誕生日を引く（生年を渡すとその年の日数で拘束する。誕生日は重複してよい）
function generateBirthday(birthYear = null, preferredMonth = null, preferredWeek = null) {
  const referenceYear = Number.isInteger(birthYear) ? birthYear : 2001; // 生年不明は平年として扱う
  const available = [];
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= getDaysInMonth(referenceYear, month); day++) {
      const week = Math.ceil(day / 7);
      const matchesPreference = preferredMonth === null
        || (month === preferredMonth && (preferredWeek === null || week === preferredWeek));
      if (matchesPreference) available.push({ month, day, week });
    }
  }
  // 条件に合う組み合わせが空なら条件なしで引き直す
  if (!available.length) return generateBirthday(birthYear);
  return available[Math.floor(Math.random() * available.length)];
}

// 身長（cm）の範囲
const MEMBER_HEIGHT_MIN = 148.0;
const MEMBER_HEIGHT_MAX = 172.0;

// 身長を小数第一位で生成する（年齢を引数で受け取る仕様に変更）
function generateMemberHeight(age) {
  let upperLimit = MEMBER_HEIGHT_MAX;
  
  if (age === 14 || age === 15) {
    upperLimit = 158.0;
  } else if (age === 16 || age === 17) {
    upperLimit = 163.0;
  } else if (age === 18 || age === 19) {
    upperLimit = 168.0;
  }
  // 20歳以降（それ以降）は上限なしのため、MEMBER_HEIGHT_MAX をそのまま（または必要に応じた上限値に）使用します

  // 実際の最大値は、全体の上限（MEMBER_HEIGHT_MAX）と年齢別上限の低い方に合わせる
  const actualMax = Math.min(upperLimit, MEMBER_HEIGHT_MAX);
  const range = actualMax - MEMBER_HEIGHT_MIN;
  
  return Math.round((MEMBER_HEIGHT_MIN + Math.random() * Math.max(0, range)) * 10) / 10;
}

// 身長の表示（データが無い場合は "--"）
function formatHeight(value) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '--'}cm`;
}

// ==========================================
// スタイル（身長連動）・ファッション・身長成長
// ==========================================
// 身長からスタイルを決める（身長に比例。ただし最下値は MEMBER_STYLE_MIN で、低身長でも著しく低くならない）
function getStyleFromHeight(height) {
  const base = Number.isFinite(height) ? height : MEMBER_HEIGHT_MIN;
  const derived = MEMBER_STYLE_MIN + Math.max(0, base - MEMBER_HEIGHT_MIN) * MEMBER_STYLE_PER_CM;
  return Math.min(100, Math.max(MEMBER_STYLE_MIN, Math.round(derived)));
}

// スタイルは身長が伸びたときだけ上がる（下がらない）。身長から算出した下限を下回らない
function raiseStyleForHeight(member, previousHeight) {
  const nextHeight = member.height;
  if (!Number.isFinite(nextHeight)) return;
  const fromHeight = Number.isFinite(previousHeight) ? previousHeight : nextHeight;
  // 身長が伸びたぶん（1cmにつき1）のみ上昇させる
  const growth = Math.floor(nextHeight - fromHeight);
  if (growth <= 0) return;
  const floorValue = getStyleFromHeight(nextHeight);
  const target = Math.max(0, (member.stats.style || 0) + growth);
  member.stats.style = Math.min(100, Math.max(floorValue, target));
}

// 14〜17歳は確率で身長が年1%伸びる（成長期のため）
function tryGrowMemberHeight(member) {
  if (!member || !Number.isFinite(member.age)) return false;
  if (member.age < HEIGHT_GROWTH_AGE_MIN || member.age > HEIGHT_GROWTH_AGE_MAX) return false;
  if (Math.random() >= HEIGHT_GROWTH_CHANCE) return false;
  const before = member.height;
  if (!Number.isFinite(before)) return false;
  const grown = Math.round(before * (1 + HEIGHT_GROWTH_RATE) * 10) / 10;
  if (grown <= before) return false;
  member.height = grown;
  raiseStyleForHeight(member, before);
  return true;
}

// ファッションは初期値が高く、下限も MEMBER_FASHION_MIN（専属モデル就任・雑誌掲載で上昇）
function raiseMemberFashion(member, amount) {
  if (!member || !Number.isFinite(amount) || amount <= 0) return;
  member.stats.fashion = Math.min(100, Math.max(MEMBER_FASHION_MIN, (member.stats.fashion || 0) + amount));
}

// メンバーBirthdaysを整備する。
function ensureMemberBirthdays() {
  idolRoster.forEach(member => {
    if (!member.stats) member.stats = {};
    if (!Number.isFinite(member.stats.sns)) member.stats.sns = 45;
    if (!Array.isArray(member.eventSalesHistory)) member.eventSalesHistory = [];
    // 生年が無い古いデータは、現在の年齢から逆算して補う
    if (!Number.isInteger(member.birthYear) && Number.isFinite(member.age)) {
      member.birthYear = getGameDateObject().getFullYear() - member.age;
    }
    if (!Number.isInteger(member.birthdayMonth) || !Number.isInteger(member.birthdayDay)) {
      const hasWeekBirthday = Number.isInteger(member.birthdayMonth) && Number.isInteger(member.birthdayWeek);
      const birthday = generateBirthday(
        member.birthYear,
        hasWeekBirthday ? member.birthdayMonth : null,
        hasWeekBirthday ? member.birthdayWeek : null
      );
      member.birthdayMonth = birthday.month;
      member.birthdayDay = birthday.day;
      member.birthdayWeek = birthday.week;
    } else {
      // 生年に存在しない日付（平年の2/29など）は実在する日付に寄せる
      const normalized = normalizeBirthDate(member.birthYear, member.birthdayMonth, member.birthdayDay);
      member.birthdayMonth = normalized.month;
      member.birthdayDay = normalized.day;
    }
    member.birthdayWeek = Math.ceil(member.birthdayDay / 7);
  });
}

// 旧セーブで身長を持たないメンバーに身長を補完する
function ensureMemberHeights() {
  idolRoster.forEach(member => {
    if (!Number.isFinite(member.height)) member.height = generateMemberHeight();
  });
}

// 旧セーブのスタイル・ファッションを現行ルールへ移行する
// スタイルは身長に比例（最下値 MEMBER_STYLE_MIN）、ファッションは下限 MEMBER_FASHION_MIN
function ensureMemberStyleFashion() {
  idolRoster.forEach(member => {
    if (!member.stats) member.stats = {};
    const styleFloor = getStyleFromHeight(member.height);
    member.stats.style = Math.min(100, Math.max(styleFloor, member.stats.style ?? styleFloor));
    member.stats.fashion = Math.max(MEMBER_FASHION_MIN, member.stats.fashion ?? MEMBER_FASHION_MIN);
  });
}

// 年齢は生年月日から再計算する（加算カウンタは持たない）
function syncMemberAges(onDate = getGameDateObject()) {
  idolRoster.forEach(member => {
    if (!Number.isInteger(member.birthYear)) return;
    const previousAge = member.age;
    member.age = calculateAgeFromBirth(member.birthYear, onDate, member.birthdayMonth, member.birthdayDay);
    // 14〜17歳は確率で身長が年1%伸びる（スタイルも伸びぶんだけ上昇する）
    if (Number.isFinite(previousAge) && member.age === previousAge + 1 && tryGrowMemberHeight(member)) {
      setLog(`【成長】${member.name}の身長が伸びました（現在 ${member.height.toFixed(1)}cm / スタイル ${member.stats.style}）。`);
    }
  });
}

// メンバーを作成する。
function createMember(age = null, policy = null, birthYear = null) {
  const nameData = generateIdolName();
  const idolAge = age || (Math.floor(Math.random() * 8) + 13); // 13〜20
  const today = getGameDateObject();
  const givenBirthYear = Number.isInteger(birthYear);
  // 生年が確定している場合はその年の日数（うるう年の2/29も含む）で誕生日を引く
  const birthdayDraft = generateBirthday(givenBirthYear ? birthYear : today.getFullYear() - idolAge);
  const birthdayPassed = (today.getMonth() + 1) > birthdayDraft.month
    || ((today.getMonth() + 1) === birthdayDraft.month && today.getDate() >= birthdayDraft.day);
  // 誕生日がまだ来ていなければ生年を1つ前にずらし、記録する年齢と生年を一致させる
  const birthYearValue = givenBirthYear
    ? birthYear
    : today.getFullYear() - idolAge - (birthdayPassed ? 0 : 1);
  const birthday = normalizeBirthDate(birthYearValue, birthdayDraft.month, birthdayDraft.day);
  const ageValue = calculateAgeFromBirth(birthYearValue, today, birthday.month, birthday.day);
  const height = generateMemberHeight();
  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    name: nameData.fullName,
    reading: nameData.reading,
    age: ageValue,
    birthYear: birthYearValue,
    birthdayMonth: birthday.month,
    birthdayDay: birthday.day,
    birthdayWeek: Math.ceil(birthday.day / 7),
    height,
    joinAge: ageValue,
    yearsActive: 0,
    stats: generateRandomStats(policy, height),
    statExp: {},
    staminaValue: MAX_STAMINA_VALUE,
    liveFatigue: 0,
    injury: null,
    eventSalesHistory: [],
    isCenter: false,
    isSelected: false,
    retainedCount: 0
  };
}

// initializeNew試合Stateを処理する。
function initializeNewGameState() {
  currentYear = 1;
  currentMonth = 1;
  currentWeek = 1;
  gameDate = toDateKey(getFirstWednesday(new Date().getFullYear() + 1, 0));
  calendarYear = getGameDateObject().getFullYear();
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
  // 初期計画（2月・6月のCD発売は確定。ライブは5〜7月のランダム土日2days）
  productionSchedule = createInitialProductionSchedule();
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
  // マネージャー制度：初期状態で1人配備
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

  idolRoster = [];
  for (let i = 0; i < 30; i++) {
    const startAge = Math.floor(Math.random() * 9) + 14; // 14〜22歳
    const m = createMember(startAge);
    // 初期メンバーは全員が活動年数0からのスタート
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
  // 1年目の前年比はゼロ（1月頭のファン数を当年・前年とも同値として固定）
  groupFansAtYearStart = calculateGroupFans();
  previousYearGroupFansAtYearStart = groupFansAtYearStart;
}

// Saved試合を適用。
function applySavedGame(data) {
  currentYear = data.currentYear || 1;
  gameDate = data.gameDate || migrateLegacyGameDate(currentYear, data.currentMonth || 1, data.currentWeek || 1);
  calendarYear = data.calendarYear || getGameDateObject().getFullYear();
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
  // 当月の収支明細（旧セーブに無い場合は空から開始）
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
  // 旧セーブには生涯売上が無いので、今年度の売上から補完する
  lifetimeSales = Number.isFinite(data.lifetimeSales) ? data.lifetimeSales : (yearlyStats.sales || 0);
  // 旧セーブには売上推移の履歴が無いので空から始める（グラフは発売分から貯まる）
  salesHistory = Array.isArray(data.salesHistory) ? data.salesHistory : [];
  // ファンの積み上げも復元（無いセーブは売上から目標値を復元）
  fansFromSales = Number.isFinite(data.fansFromSales) ? data.fansFromSales : getTargetSalesFans();
  // 目標値の範囲に収める（壊れたセーブで異常なファン数にならないように）
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
  // マネージャー制度：旧セーブには1人だけ補完する
  managers = Array.isArray(data.managers) && data.managers.length ? data.managers : [createManager()];
  managers = managers.map(manager => {
    const birthYear = Number.isInteger(manager.birthYear) ? manager.birthYear : getGameDateObject().getFullYear() - (manager.age || MANAGER_AGE_MIN);
    return {
      ...manager,
      birthYear,
      age: manager.age ?? (getGameDateObject().getFullYear() - birthYear),
      resignAge: Number.isFinite(manager.resignAge) ? manager.resignAge : (MANAGER_RESIGN_AGE_MIN + Math.floor(Math.random() * (MANAGER_RESIGN_AGE_MAX - MANAGER_RESIGN_AGE_MIN + 1))),
      skills: Object.fromEntries(MANAGER_SKILLS.map(skill => [skill.id, manager?.skills?.[skill.id] || 1]))
    };
  });
  // マネージャー市場の求人
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

