// ==========================================
// ライブ設定（会場・動員）
// ==========================================
// ==========================================
// 3. ライブ設定（1月あたり複数回開催）
// ==========================================
// 1か月の計画から、メインライブ＋追加ライブの開催情報を列挙する
// （旧セーブで保存された単一ライブ形式もそのまま扱える）
function getMonthLiveEntries(plan) {
  if (!plan) return [];
  const entries = [];
  if (plan.liveVenue) {
    entries.push({
      plan,
      planKey: '',
      isPrimary: true,
      liveVenue: plan.liveVenue,
      liveName: plan.liveName,
      liveDate: plan.liveDate || null,
      liveDays: normalizeLiveDays(plan.liveDays),
      liveDates: Array.isArray(plan.liveDates) ? plan.liveDates : [],
      seatPrices: plan.seatPrices || {},
      seatOptions: plan.seatOptions || {},
      completed: Boolean(plan.liveCompleted)
    });
  }
  const extras = Array.isArray(plan.additionalLives) ? plan.additionalLives : [];
  extras.forEach((live, index) => {
    if (!live || !live.liveVenue) return;
    entries.push({
      plan,
      planKey: '',
      isPrimary: false,
      extraIndex: index,
      liveVenue: live.liveVenue,
      liveName: live.liveName,
      liveDate: live.liveDate || null,
      liveDays: normalizeLiveDays(live.liveDays),
      liveDates: Array.isArray(live.liveDates) ? live.liveDates : [],
      seatPrices: live.seatPrices || {},
      seatOptions: live.seatOptions || {},
      completed: Boolean(live.liveCompleted)
    });
  });
  return entries;
}

// 開催日が未設定の場合は登録月の最終水曜に開催する
function getLiveEntryDate(entry, year, month) {
  if (entry.liveDate) return getGameDateObject(entry.liveDate);
  return getLastWednesday(year, month - 1);
}

// 会場の1公演あたりの使用料（ランク基準）
function getVenueFeePerShow(venue) {
  const rate = VENUE_FEE_RATES[venue.cap] ?? 2500;
  return Math.floor(CAPACITY_MAP[venue.cap] * rate);
}

// 会場使用料 = ランクの1日料金 + (日数-1)×0.2×ランクの1日料金
// 公演日程から会場使用料の曜日割引率を決める
// 日曜を含む=元値 / 日曜なし・土曜を含む=0.95倍 / 金曜が最終日=0.8倍 / それ以外=0.75倍
function getVenueWeekdayDiscount(dates) {
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  if (!list.length) return 1;
  const weekdays = list.map(dateKey => getGameDateObject(dateKey).getDay());
  if (weekdays.includes(0)) return 1;
  if (weekdays.includes(6)) return 0.95;
  if (weekdays[weekdays.length - 1] === 5) return 0.8;
  return 0.75;
}

// 会場使用料 = 曜日割引後の1日料金 + (日数-1)×0.2×曜日割引後の1日料金
function getVenueRentalFee(venue, days, dates = null) {
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  const count = list.length ? list.length : Math.max(1, normalizeLiveDays(days));
  const discounted = getVenueFeePerShow(venue) * getVenueWeekdayDiscount(list);
  return Math.round(discounted + (count - 1) * VENUE_EXTRA_DAY_RATE * discounted);
}

// 1つの会場枠が持つ公演日一覧（1公演=1日）
function getLiveEntryShowDates(entry) {
  const primary = toDateKey(getLiveEntryDate(entry, entry.calendarYear, entry.month));
  const extras = Array.isArray(entry.liveDates) ? entry.liveDates : [];
  // メイン公演日と重複する日は除外する
  const dates = extras.filter(key => typeof key === 'string' && key && key !== primary);
  return [primary, ...dates];
}

function getLiveEntryDateRange(entry) {
  const start = getLiveEntryDate(entry, entry.calendarYear, entry.month);
  const days = normalizeLiveDays(entry.liveDays);
  const dates = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function markLiveEntryCompleted(entry) {
  if (entry.isPrimary) {
    entry.plan.liveCompleted = true;
    return;
  }
  if (!Array.isArray(entry.plan.additionalLives)) entry.plan.additionalLives = [];
  const live = entry.plan.additionalLives[entry.extraIndex];
  if (live) live.liveCompleted = true;
}

// スケジュール全体（両年分）のライブを日付つきで列挙
function getScheduledLiveEntries() {
  const entries = [];
  Object.entries(productionSchedule).forEach(([key, plan]) => {
    const [year, month] = key.split('-').map(Number);
    const planCalendarYear = calendarYear + (year - currentYear);
    getMonthLiveEntries(plan).forEach(entry => {
      entry.planKey = key;
      entry.year = year;
      entry.month = month;
      entry.calendarYear = planCalendarYear;
      entry.date = getLiveEntryDate(entry, planCalendarYear, month);
      entries.push(entry);
    });
  });
  return entries;
}

// 自分のライブと、同じ会場・同じ日程の重複がないか確認する
// ignorePlanKey は編集中の月（保存前の旧計画）を除外するために使う
function findOwnLiveConflict(liveVenue, liveDate, ignorePlanKey = null) {
  return getScheduledLiveEntries().find(entry =>
    !entry.completed
    && entry.planKey !== ignorePlanKey
    && entry.liveVenue === liveVenue
    && entry.liveDate === liveDate
  ) || null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getGameDateObject(value = gameDate) {
  return new Date(`${value}T12:00:00`);
}

function getFirstWednesday(year, monthIndex = 0) {
  const date = new Date(year, monthIndex, 1, 12);
  const offset = (3 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + offset);
  return date;
}

function getNextWednesday(date) {
  const nextDate = new Date(date);
  const daysUntilWednesday = (3 - nextDate.getDay() + 7) % 7 || 7;
  nextDate.setDate(nextDate.getDate() + daysUntilWednesday);
  return nextDate;
}

function getLastWednesday(year, monthIndex) {
  const date = new Date(year, monthIndex + 1, 0, 12);
  const daysSinceWednesday = (date.getDay() - 3 + 7) % 7;
  date.setDate(date.getDate() - daysSinceWednesday);
  return date;
}

// Rival tour bookings. Requirement 5: a rival may hold several shows in one month.
// 競合チームの公演予約を生成する。venueDates で公演日を並べることで連日公演も表現する。
function ensureRivalLiveBookings(gameYear, month) {
  const actualYear = calendarYear + (gameYear - currentYear);
  leagueTeams.filter(team => team.id !== 'player').forEach(team => {
    const monthKey = `${actualYear}-${month}`;
    if (rivalLiveBookings.some(booking => booking.groupId === team.id && booking.monthKey === monthKey)) return;
    // 開催頻度：影響力が高いほど高い
    const frequency = team.basePower >= 90 ? 0.75
      : team.basePower >= 80 ? 0.6
      : team.basePower >= 70 ? 0.45
      : 0.3;
    if (Math.random() >= frequency) return;

    const isBigTeam = team.basePower >= 80;
    // 公演回数：強者为多（1〜4公演）
    const maxShows = isBigTeam ? 4 : 2;
    const showCount = 1 + Math.floor(Math.random() * maxShows);
    // 連日公演の確率
    const isConsecutive = Math.random() < 0.35;
    const consecutiveDays = isConsecutive ? Math.min(showCount, 2 + Math.floor(Math.random() * 3)) : 1;

    const venuePool = Math.random() < 0.35
      ? VENUE_DATA.filter(venue => ['A', 'S', 'SS'].includes(venue.cap))
      : VENUE_DATA;
    const venue = venuePool[Math.floor(Math.random() * venuePool.length)];
    const lastDay = new Date(actualYear, month, 0).getDate();
    const startDay = Math.floor(Math.random() * Math.max(1, Math.min(28, lastDay) - consecutiveDays + 1)) + 1;

    // 公演日を並べる（同じ会場で連日開催）
    const venueDates = [];
    for (let i = 0; i < showCount; i++) {
      const day = isConsecutive ? startDay + (i % consecutiveDays) : startDay + i;
      if (day > lastDay) break;
      const liveDate = toDateKey(new Date(actualYear, month - 1, day, 12));
      if (rivalLiveBookings.some(booking => booking.venue === venue.name && booking.liveDate === liveDate)) continue;
      if (rivalLiveBookings.some(booking => booking.groupId === team.id && booking.liveDate === liveDate)) continue;
      venueDates.push(liveDate);
    }
    if (!venueDates.length) return;

    rivalLiveBookings.push({
      id: `${team.id}-${actualYear}-${month}-0`,
      groupId: team.id,
      monthKey,
      groupName: team.name,
      venue: venue.name,
      liveDate: venueDates[0],
      venueDates,
      consecutive: isConsecutive
    });
  });
}

function findRivalVenueConflict(venueName, dateKey) {
  // 連日公演を含むすべての公演日が対象
  return rivalLiveBookings.find(booking =>
    booking.venue === venueName && (booking.venueDates || [booking.liveDate]).includes(dateKey)
  ) || null;
}

function syncGameCalendar() {
  const date = getGameDateObject();
  if (calendarYear && date.getFullYear() !== calendarYear) {
    currentYear += date.getFullYear() - calendarYear;
  }
  calendarYear = date.getFullYear();
  currentMonth = date.getMonth() + 1;
  currentWeek = Math.ceil(date.getDate() / 7);
}

function migrateLegacyGameDate(year, month, week) {
  const firstWednesday = getFirstWednesday(new Date().getFullYear() + 1 + year - 1, month - 1);
  firstWednesday.setDate(firstWednesday.getDate() + (week - 1) * 7);
  return toDateKey(firstWednesday);
}
