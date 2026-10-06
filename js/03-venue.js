// ==========================================
// 情報メディア（実績を報道する番組・サイト）
// ライブ後・CD発売後にメディアが掲載され、実績が告知される
// ==========================================

// 🌟 最優先で関数を定義し、参照エラーを完全に防ぐ
// ライブの日数を安全な範囲（1〜5日）に正規化する関数
function normalizeLiveDays(value) {
  const days = Number.parseInt(value, 10);
  const validOptions = typeof LIVE_DAY_OPTIONS !== 'undefined' ? LIVE_DAY_OPTIONS : [1, 2, 3, 4, 5];
  return validOptions.includes(days) ? days : 1;
}

// メディア定義：fans=新規ファン獲得係数, fee=出演料/記事料
const INFO_MEDIA = {
  thehour: {
    id: 'thehour', name: 'The Hour', isWeb: false, kind: 'live',
    fans: 0.05, fee: 0, label: '番組'
  },
  gutenmorgen: {
    id: 'gutenmorgen', name: 'グーテンモルゲン', isWeb: false, kind: 'release',
    fans: 0.15, fee: 2000000, label: '番組'
  },
  web: {
    id: 'web', name: 'アイドルWebメディア', isWeb: true, kind: 'both',
    fans: 0.08, fee: 0, label: 'サイト'
  },
  stacon: {
    id: 'stacon', name: 'スタコン', isWeb: true, kind: 'release',
    fans: 0.12, fee: 0, label: 'ファンサイト'
  },
  kahoo: {
    id: 'kahoo', name: 'kahoo news', isWeb: true, kind: 'live',
    fans: 0.10, fee: 0, label: 'ニュースサイト'
  }
};

// 各メディアの放送日倍率（何日後に放送／掲載されるか）
const INFO_MEDIA_DELAY = {
  thehour: 2, gutenmorgen: 1, web: 1, stacon: 1, kahoo: 1
};
// 情報メディアで得られる楽曲経験値
const INFO_MEDIA_SONG_EXPERIENCE = 20;

// メディア出演・報道時に付与する個別経験値（歌・ダンス各3000、人気5000）
const INFO_MEDIA_EXP_REWARDS = {
  vocal: 3000,
  dance: 3000,
  popularity: 5000
};

// 現在のセンター名（年齢つき）
function getCurrentCenterText() {
  const targets = idolRoster.filter(member => member.isSelected);
  const pool = targets.length ? targets : idolRoster;
  const center = pool.find(member => member.isCenter);
  if (!center) return '';
  const age = Number.isFinite(center.age) ? center.age : '';
  return age === '' ? center.name : `${center.name}（${age}歳）`;
}

// メディア結果を組み立てる
function buildInfoMediaArticle(media, data) {
  const d = data || {};
  if (media.kind === 'release' || (media.kind === 'both' && d.releaseType)) {
    const type = d.releaseType === 'album' ? 'アルバム' : 'シングル';
    const ORDINAL_SUFFIX = { 1: 'st', 2: 'nd', 3: 'rd' };
    const suffix = ORDINAL_SUFFIX[d.releaseNth] || 'th';
    const nth = d.releaseNth ? `${d.releaseNth}${suffix}` : '';
    const sales = (d.sales || 0).toLocaleString();
    const dateText = d.releaseDate ? `${d.releaseDate}発売` : '発売';
    const parts = [];
    if (media.id === 'gutenmorgen') {
      parts.push(`${nth}${type}「${d.songTitle || ''}」${dateText}。`);
      parts.push(`初週売上${sales}枚を記録。`);
      if (d.centerText) parts.push(`楽曲のセンター${d.centerText}がセンターを務める。`);
    } else {
      parts.push(`新曲『${d.songTitle || ''}』${nth ? `（${nth}${type}）` : type}、${dateText}。`);
      parts.push(`初週売上${sales}枚と報告されました。`);
    }
    return parts.join('');
  }
  const days = d.showDays || 1;
  const audience = (d.audience || 0).toLocaleString();
  if (media.id === 'kahoo') {
    return `${d.liveName || 'ライブ'}は${days}日間開催され、${audience}人が動員したと報道されました。`;
  }
  if (media.id === 'thehour') {
    const venue = d.venueName || '会場';
    const from = d.startDate ? `${d.startDate}から` : '';
    return `${venue}で${from}${days}日間開催し、計${audience}人が参戦。`;
  }
  const venue = d.venueName ? `${d.venueName}で` : '';
  return `ライブ「${d.liveName || ''}」が${venue}${days}日間開催され、動員${audience}人。`;
}

// メディアへの掲載／放送を予約する
function scheduleInfoMedia(kind, payload) {
  const candidates = Object.values(INFO_MEDIA).filter(m =>
    m.kind === kind || m.kind === 'both'
  );
  if (!candidates.length) return null;
  const media = candidates[Math.floor(Math.random() * candidates.length)];
  const delay = INFO_MEDIA_DELAY[media.id] || 1;
  const airDate = new Date(getGameDateObject());
  airDate.setDate(airDate.getDate() + delay);
  const summary = calculateTeamAverages();
  const scale = 0.7 + summary.overall / 100;
  
  const base = kind === 'live' ? (payload.audience || 0) : (payload.sales || 0);
  const bonusFans = Math.round(base * media.fans);
  const fee = Math.round(media.fee * scale);

  scheduledPerformances.push({
    id: `info-${media.id}-${gameDate}-${Math.floor(Math.random() * 1e6)}`,
    name: media.name,
    mediaId: media.id,
    isWebMedia: media.isWeb,
    mediaLabel: media.label,
    airDate: toDateKey(airDate),
    isInfoMedia: true,
    infoKind: kind,
    liveName: payload.liveName || '',
    venueName: payload.venueName || '',
    audience: payload.audience || 0,
    showDays: payload.showDays || 1,
    startDate: payload.startDate || '',
    endDate: payload.endDate || '',
    sales: payload.sales || 0,
    releaseType: payload.releaseType || '',
    releaseNth: payload.releaseNth || 0,
    releaseDate: payload.releaseDate || '',
    songTitle: payload.songTitle || '',
    centerText: payload.centerText || '',
    songId: payload.songId || null,
    bonusFans,
    fee
  });
  return scheduledPerformances[scheduledPerformances.length - 1];
}

// 情報メディアの放送／掲載を処理する
function processInfoMedia(performance) {
  const media = INFO_MEDIA[performance.mediaId] || INFO_MEDIA.web;
  
  const selected = idolRoster.filter(member => member.isSelected);
  const participants = selected.length ? selected : idolRoster;
  
  participants.forEach(member => {
    Object.entries(INFO_MEDIA_EXP_REWARDS).forEach(([statId, amount]) => {
      addMemberStatExp(member, statId, amount);
    });
  });

  const fee = performance.fee || 0;
  if (fee) funds += fee;
  if (performance.songId) {
    const song = songs.find(item => item.id === performance.songId);
    if (song) addSongExperience(song, INFO_MEDIA_SONG_EXPERIENCE);
  }
  
  fansFromSales = Math.min(GROUP_FAN_MAX, fansFromSales + (performance.bonusFans || 0));
  const article = buildInfoMediaArticle(media, performance);
  const result = `（新規ファン +${(performance.bonusFans || 0).toLocaleString()}人${fee ? ` / ${performance.mediaLabel}料 ${formatMoney(fee)}` : ''}）`;
  setLog(`【${media.label}】${article}${result}`);
}

// 1か月の計画から、メインライブ＋追加ライブの開催情報を列挙する
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

function getVenueWeekdayDiscount(dates) {
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  if (!list.length) return 1;
  const weekdays = list.map(dateKey => getGameDateObject(dateKey).getDay());
  if (weekdays.includes(0)) return 1;
  if (weekdays.includes(6)) return 0.95;
  if (weekdays[weekdays.length - 1] === 5) return 0.8;
  return 0.75;
}

function getVenueRentalFee(venue, days, dates = null) {
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  const count = list.length ? list.length : Math.max(1, normalizeLiveDays(days));
  const discounted = getVenueFeePerShow(venue) * getVenueWeekdayDiscount(list);
  return Math.round(discounted + (count - 1) * VENUE_EXTRA_DAY_RATE * discounted);
}

function getLiveEntryShowDates(entry) {
  const primary = toDateKey(getLiveEntryDate(entry, entry.calendarYear, entry.month));
  const extras = Array.isArray(entry.liveDates) ? entry.liveDates : [];
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

function getWeekAnchorDate(date = getGameDateObject()) {
  const anchor = new Date(date);
  const daysSinceWednesday = (anchor.getDay() - 3 + 7) % 7;
  anchor.setDate(anchor.getDate() - daysSinceWednesday);
  return anchor;
}

function getLastWednesday(year, monthIndex) {
  const date = new Date(year, monthIndex + 1, 0, 12);
  const daysSinceWednesday = (date.getDay() - 3 + 7) % 7;
  date.setDate(date.getDate() - daysSinceWednesday);
  return date;
}

function ensureRivalLiveBookings(gameYear, month) {
  const actualYear = calendarYear + (gameYear - currentYear);
  leagueTeams.filter(team => team.id !== 'player').forEach(team => {
    const monthKey = `${actualYear}-${month}`;
    if (rivalLiveBookings.some(booking => booking.groupId === team.id && booking.monthKey === monthKey)) return;
    const frequency = team.basePower >= 90 ? 0.75
      : team.basePower >= 80 ? 0.6
      : team.basePower >= 70 ? 0.45
      : 0.3;
    if (Math.random() >= frequency) return;

    const isBigTeam = team.basePower >= 80;
    const maxShows = isBigTeam ? 4 : 2;
    const showCount = 1 + Math.floor(Math.random() * maxShows);
    const isConsecutive = Math.random() < 0.35;
    const consecutiveDays = isConsecutive ? Math.min(showCount, 2 + Math.floor(Math.random() * 3)) : 1;

    const venuePool = Math.random() < 0.35
      ? VENUE_DATA.filter(venue => ['A', 'S', 'SS'].includes(venue.cap))
      : VENUE_DATA;
    const venue = venuePool[Math.floor(Math.random() * venuePool.length)];
    const lastDay = new Date(actualYear, month, 0).getDate();
    const startDay = Math.floor(Math.random() * Math.max(1, Math.min(28, lastDay) - consecutiveDays + 1)) + 1;

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
