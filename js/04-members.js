// ==========================================
// アイドル生成ロジック
// ==========================================
// ==========================================
// 3. アイドル生成ロジック
// ==========================================

function generateIdolName() {
  const surname = SURNAMES_TOP200[Math.floor(Math.random() * SURNAMES_TOP200.length)];
  const readKeys = Object.keys(FEMALE_READINGS_MAP);
  const reading = readKeys[Math.floor(Math.random() * readKeys.length)];
  const kanjiList = FEMALE_READINGS_MAP[reading];
  const given = kanjiList[Math.floor(Math.random() * kanjiList.length)];
  return { fullName: `${surname} ${given}`, reading };
}

function generateRandomStats(biasPolicy = null) {
  const stats = {};
  STATUS_KEYS.forEach(k => {
    stats[k.id] = Math.floor(Math.random() * 50) + 25; // 25〜75
  });
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

// 身長を小数第一位で生成する
function generateMemberHeight() {
  const range = MEMBER_HEIGHT_MAX - MEMBER_HEIGHT_MIN;
  return Math.round((MEMBER_HEIGHT_MIN + Math.random() * range) * 10) / 10;
}

// 身長の表示（データが無い場合は "--"）
function formatHeight(value) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '--'}cm`;
}

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

// 年齢は生年月日から再計算する（加算カウンタは持たない）
function syncMemberAges(onDate = getGameDateObject()) {
  idolRoster.forEach(member => {
    if (!Number.isInteger(member.birthYear)) return;
    member.age = calculateAgeFromBirth(member.birthYear, onDate, member.birthdayMonth, member.birthdayDay);
  });
}

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
  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    name: nameData.fullName,
    reading: nameData.reading,
    age: ageValue,
    birthYear: birthYearValue,
    birthdayMonth: birthday.month,
    birthdayDay: birthday.day,
    birthdayWeek: Math.ceil(birthday.day / 7),
    height: generateMemberHeight(),
    joinAge: ageValue,
    yearsActive: 0,
    stats: generateRandomStats(policy),
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
  shownAbilityMemberIds = new Set();
  fanClub = null;
  fanClubFoundedYear = 0;
  pendingFanClubEvent = null;
  groupCrisis = 55;
  officeUpgrades = createInitialOfficeUpgrades();
  productionSchedule = {
    '1-2': { release: 'single', liveVenue: null },
    '1-5': { release: 'none', liveVenue: '原宿体育館' },
    '1-6': { release: 'single', liveVenue: null }
  };
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
  syncMemberAges();
  // 1年目の前年比はゼロ（1月頭のファン数を当年・前年とも同値として固定）
  groupFansAtYearStart = calculateGroupFans();
  previousYearGroupFansAtYearStart = groupFansAtYearStart;
}

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

function saveSlotKey(slot) {
  return `idol_manager_save_slot_${slot}`;
}

function migrateLegacySave() {
  const legacySave = localStorage.getItem(LEGACY_SAVE_KEY);
  if (!legacySave) return;
  const slotOneKey = saveSlotKey(1);
  if (localStorage.getItem(slotOneKey)) {
    localStorage.removeItem(LEGACY_SAVE_KEY);
    return;
  }
  try {
    JSON.parse(legacySave);
    localStorage.setItem(slotOneKey, legacySave);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch (error) {
    console.error(error);
  }
}

function readSaveSlot(slot) {
  const rawSave = localStorage.getItem(saveSlotKey(slot));
  if (!rawSave) return null;
  try {
    return JSON.parse(rawSave);
  } catch (error) {
    return { isCorrupt: true };
  }
}

function renderSaveSlots() {
  migrateLegacySave();
  const slots = document.getElementById('save-slots');
  slots.innerHTML = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
    const slot = index + 1;
    const save = readSaveSlot(slot);
    const corrupted = save && save.isCorrupt;
    const populated = save && !corrupted;
    const savedAt = populated && save.savedAt ? new Date(save.savedAt).toLocaleString() : '日時記録なし';
    const info = corrupted
      ? 'セーブデータを読み込めません。削除して新しく開始してください。'
      : populated
        ? `${save.currentYear || 1}年目 ${save.currentMonth || 1}月 第${save.currentWeek || 1}週${save.gameDate ? `<br>${new Date(`${save.gameDate}T12:00:00`).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}` : ''}<br>所属 ${save.idolRoster?.length || 0}名 / 資金 ${formatMoney(save.funds)}<br>最終保存: ${savedAt}`
        : '空き枠';
    const actions = corrupted
      ? `<button class="danger-btn slot-delete-btn" type="button" onclick="deleteSaveSlot(${slot})">削除</button>`
      : populated
        ? `<button class="main-btn" type="button" onclick="continueSavedGame(${slot})">続きから</button><button class="danger-btn" type="button" onclick="startNewGame(${slot})">新規開始</button><button class="danger-btn slot-delete-btn" type="button" aria-label="セーブ枠${slot}を削除" onclick="deleteSaveSlot(${slot})">削除</button>`
        : `<button class="main-btn" type="button" onclick="startNewGame(${slot})">新規開始</button>`;
    return `<section class="save-slot"><div class="save-slot-heading"><h2>セーブ枠 ${slot}</h2>${populated ? '<span>保存済み</span>' : ''}</div><div class="save-slot-info">${info}</div><div class="save-slot-actions">${actions}</div></section>`;
  }).join('');
}

function openTitleScreen() {
  document.getElementById('game-screen').hidden = true;
  document.getElementById('title-screen').hidden = false;
  renderSaveSlots();
}

function continueSavedGame(slot) {
  initGame(slot, false);
}

function startNewGame(slot) {
  if (readSaveSlot(slot) && !confirm(`セーブ枠${slot}のデータを上書きして新しく開始しますか？`)) return;
  initGame(slot, true);
}

function deleteSaveSlot(slot) {
  if (!confirm(`セーブ枠${slot}のデータを削除しますか？`)) return;
  localStorage.removeItem(saveSlotKey(slot));
  renderSaveSlots();
}

function returnToTitle() {
  updateUI();
  activeSaveSlot = null;
  openTitleScreen();
}

function initGame(slot, startFresh) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_SLOT_COUNT) return;
  migrateLegacySave();
  const saved = startFresh ? null : readSaveSlot(slot);
  if (saved?.isCorrupt) {
    alert('セーブデータを読み込めません。削除するか、新規開始してください。');
    openTitleScreen();
    return;
  }
  if (saved) applySavedGame(saved);
  else initializeNewGameState();
  activeSaveSlot = slot;
  document.getElementById('title-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
  updateUI();
  renderPageNav(DEFAULT_PAGE);
  document.getElementById('active-slot-label').textContent = `セーブ枠 ${slot}`;
  // ゲーム開始直後に当年7月〜12月の計画決定を行う
  if (startFresh) openDecisionModal('当年7月〜12月の計画策定', 1, 7, 12);
  else openPendingModal();
}
