// ==========================================
// 6か月計画UI・モーダル・セーブ
// ==========================================
// 6か月カレンダーで使う共通ヘルパ ----------------------------------------------

// 計画対象の月が暦の上ではどの年になるか
function getPlanMonthCalendarYear(month) {
  return calendarYear + (planYearTarget - currentYear);
}

function getPlanMonthList() {
  const months = [];
  for (let month = planStartM; month <= planEndM; month++) months.push(month);
  return months;
}

function getPlanEventType(benefitId) {
  return PLAN_EVENT_TYPES.find(type => type.id === benefitId) || null;
}

// プリセットでCD発売が確定している月か（2月・6月）
function isPresetReleaseMonth(month) {
  return PRESET_RELEASE_MONTHS.includes(Number(month));
}

function getPlanMonthCalendarDate(month, day) {
  return toDateKey(new Date(getPlanMonthCalendarYear(month), month - 1, day, 12));
}

// 「9月12日」のような短い表記
function formatPlanDayLabel(dateKey) {
  if (!dateKey) return '未設定';
  const date = getGameDateObject(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// 発売日の既定値（未指定なら従来どおり当月の最終水曜）
function getDefaultPlanReleaseDate(month) {
  return toDateKey(getLastWednesday(getPlanMonthCalendarYear(month), month - 1));
}

function getPlanReleaseDate(month) {
  return planReleaseDates[month] || '';
}

function getPlanMonthEventDrafts(month) {
  const list = planEventDrafts[month];
  return Array.isArray(list) ? list.filter(item => item && item.date) : [];
}

function createPlanEventId(month) {
  planEventIdSeq += 1;
  return `plan-event-${planYearTarget}-${month}-${planEventIdSeq}`;
}

// 計画画面を開いた時点で保存済みの計画を読み込む
function initPlanCalendarDrafts() {
  planReleaseDates = {};
  planEventDrafts = {};
  planBoothDraft = {};
  planCalendarSelection = [];
  planCalendarAnchorKey = '';
  getPlanMonthList().forEach(month => {
    const saved = productionSchedule[`${planYearTarget}-${month}`] || {};
    planReleaseDates[month] = saved.releaseDate || '';
    planEventDrafts[month] = (Array.isArray(saved.planEvents) ? saved.planEvents : [])
      .filter(item => item && item.date)
      .map(item => ({
        id: item.id || createPlanEventId(month),
        date: item.date,
        benefitId: getPlanEventType(item.benefitId) ? item.benefitId : DEFAULT_PLAN_EVENT_ID,
        completed: Boolean(item.completed)
      }));
    const savedLives = getMonthLiveEntries(saved).slice(0, MAX_LIVE_VENUES_PER_MONTH);
    planBoothDraft[month] = {
      release: saved.release || 'none',
      songName: saved.songName || '',
      releaseBenefit: saved.releaseBenefit || 'none',
      slots: savedLives.length
        ? savedLives.map(entry => ({
            liveVenue: entry.liveVenue,
            liveName: entry.liveName || entry.liveVenue || '',
            liveDate: entry.liveDate || '',
            liveDates: Array.isArray(entry.liveDates) ? [...entry.liveDates] : [],
            seatPrices: entry.seatPrices || {},
            seatOptions: entry.seatOptions || {}
          }))
        : [createEmptyLiveSlot()]
    };
  });
}

// ブースの入力内容をドラフトへ取り込む（カレンダーを開閉しても編集内容を保つ）
function syncPlanBoothsIntoDrafts() {
  getPlanMonthList().forEach(month => {
    const releaseSelect = document.getElementById(`sel-rel-${month}`);
    if (!releaseSelect) return;
    const benefitSelect = document.getElementById(`sel-benefit-${month}`);
    const songInput = document.getElementById(`song-name-${month}`);
    planBoothDraft[month] = {
      release: releaseSelect.value,
      songName: songInput ? songInput.value : '',
      releaseBenefit: benefitSelect ? benefitSelect.value : 'none',
      slots: readLiveSlotInputs(month)
    };
  });
}

// 選んだ日程を月ごとにまとめる
function groupPlanDatesByMonth(dateKeys) {
  const grouped = new Map();
  dateKeys.forEach(dateKey => {
    const month = Number(dateKey.slice(5, 7));
    if (!grouped.has(month)) grouped.set(month, []);
    grouped.get(month).push(dateKey);
  });
  return new Map([...grouped.entries()].sort((a, b) => a[0] - b[0]));
}

function buildPlanDateRange(fromKey, toKey) {
  const from = getGameDateObject(fromKey);
  const to = getGameDateObject(toKey);
  const start = from.getTime() <= to.getTime() ? from : to;
  const end = from.getTime() <= to.getTime() ? to : from;
  const keys = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

// 会場の予約期間（球場・ドームは180日前、小会場は45日前）を満たしているか
function isPlanBookableDate(dateKey, leadDays) {
  const earliest = new Date(`${gameDate}T12:00:00`);
  earliest.setDate(earliest.getDate() + leadDays);
  return dateKey >= toDateKey(earliest);
}

// ライブ日程を振るときの既定会場。同日に他のグループが予約している会場は避ける
function pickDefaultPlanVenue(dateKey) {
  const weekday = getGameDateObject(dateKey).getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const pool = VENUE_DATA.filter(item => !isStadiumVenue(item) && DEFAULT_PLAN_VENUE_CAPS.includes(item.cap));
  const preferred = pool.filter(item => (isWeekend ? item.name.includes('アリーナ') : true));
  const ranked = preferred.length ? preferred : pool;
  return ranked.find(item => !findRivalVenueConflict(item.name, dateKey)) || ranked[0] || null;
}

// 公演日の追加・削除・集計
function getSlotShowDateInputs(month, index) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.show-date-input')).map(input => input.value || '');
}

function getMonthPlannedShowCount(month) {
  const count = readLiveSlotInputs(month).reduce((sum, slot, index) => {
    if (!slot.liveVenue) return sum;
    return sum + Math.max(1, getSlotShowDateInputs(month, index).filter(Boolean).length);
  }, 0);
  return count;
}

function addShowDate(month, index) {
  const total = getMonthPlannedShowCount(month);
  if (total >= MAX_LIVE_SHOWS_PER_MONTH) {
    alert(`公演数が上限（${MAX_LIVE_SHOWS_PER_MONTH}公演）を超えています。`);
    return;
  }
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  const current = getSlotShowDateInputs(month, index);
  container.insertAdjacentHTML('beforeend', renderShowDateRow(month, index, current.length, ''));
  updateShowDateNote(month, index);
}

function removeShowDate(month, index, dateIndex) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  const rows = Array.from(container.querySelectorAll('.show-date-row'));
  const target = rows[dateIndex];
  if (target) target.remove();
  reindexShowDateRows(month, index);
  updateShowDateNote(month, index);
}

function reindexShowDateRows(month, index) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  Array.from(container.querySelectorAll('.show-date-row')).forEach((row, rowIndex) => {
    row.dataset.showIndex = rowIndex;
    const input = row.querySelector('.show-date-input');
    if (input) input.id = `show-date-${month}-${index}-${rowIndex}`;
    const button = row.querySelector('button');
    if (button) button.setAttribute('onclick', `removeShowDate(${month}, ${index}, ${rowIndex})`);
  });
}

function updateShowDateNote(month, index) {
  const note = document.getElementById(`show-date-note-${month}-${index}`);
  if (!note) return;
  const dates = getSlotShowDateInputs(month, index).filter(Boolean);
  const venueSelect = document.getElementById(`sel-ven-${month}-${index}`);
  const venue = VENUE_DATA.find(item => item.name === (venueSelect ? venueSelect.value : ''));
  const total = getMonthPlannedShowCount(month);
  if (!venue) {
    note.textContent = '会場を選択してください';
    return;
  }
  const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const detail = dates.map(dateKey => {
    const weekday = weekdayNames[getGameDateObject(dateKey).getDay()];
    return `${Number(dateKey.slice(-2))}日(${weekday})`;
  }).join(' / ');
  const fee = getVenueRentalFee(venue, dates.length, dates);
  note.innerHTML = `この会場は${dates.length}公演（${detail || '日程未設定'}）<br>会場使用料の目安: ${formatMoney(fee)}<br>今月の合計 ${total}/${MAX_LIVE_SHOWS_PER_MONTH}公演`;
}

// 計画画面に表示しているライブ枠を入力欄から読み取る
function readLiveSlotInputs(month) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.live-slot')).map(slotEl => {
    const index = Number(slotEl.dataset.slotIndex);
    const seatPrices = {};
    const seatOptions = {};
    const slotVenue = VENUE_DATA.find(v => v.name === document.getElementById(`sel-ven-${month}-${index}`)?.value) || null;
    SEAT_TYPES.forEach(seat => {
      const priceInput = document.getElementById(`seat-price-${month}-${index}-${seat.id}`);
      const price = Number.parseInt(priceInput ? priceInput.value : '', 10);
      seatPrices[seat.id] = Number.isFinite(price) && price >= 0 ? price : getStandardSeatPrice(slotVenue, seat.id);
      if (seat.optional) {
        const optionInput = document.getElementById(`seat-option-${month}-${index}-${seat.id}`);
        seatOptions[seat.id] = Boolean(optionInput && optionInput.checked);
      }
    });
    return {
      liveVenue: (document.getElementById(`sel-ven-${month}-${index}`) || {}).value || '',
      liveName: (document.getElementById(`live-name-${month}-${index}`) || {}).value?.trim() || '',
      liveDate: (document.getElementById(`live-date-${month}-${index}`) || {}).value || '',
      liveDates: getSlotShowDateInputs(month, index).filter(Boolean),
      seatPrices,
      seatOptions
    };
  });
}

function createEmptyLiveSlot() {
  return { liveVenue: '', liveName: '', liveDate: '', seatPrices: {}, seatOptions: {} };
}

function renderShowDateRow(month, index, dateIndex, dateKey) {
  return `
    <div class="show-date-row" data-show-index="${dateIndex}">
      <input type="date" class="show-date-input" id="show-date-${month}-${index}-${dateIndex}"
        value="${dateKey || ''}" onchange="updateShowDateNote(${month}, ${index})">
      <button class="danger-btn" type="button" onclick="removeShowDate(${month}, ${index}, ${dateIndex})">削除</button>
    </div>`;
}

function renderLiveSlotHtml(month, index, slot) {
  const isPrimary = index === 0;
  const seatPrices = slot.seatPrices || {};
  const seatOptions = slot.seatOptions || {};
  // 会場が未選択なら標準価格（Bティア）で入力欄の初期値を埋める
  const slotVenue = VENUE_DATA.find(v => v.name === slot.liveVenue) || null;
  return `
    <div class="live-slot" data-slot-index="${index}">
      <div class="live-slot-head">
        <span>ライブ${index + 1}${isPrimary ? '（定期公演）' : ''}</span>
        ${isPrimary ? '' : `<button class="danger-btn" type="button" onclick="removeLiveSlot(${month}, ${index})">削除</button>`}
      </div>
      <label class="weekly-member-target" for="sel-ven-${month}-${index}">会場
        <select id="sel-ven-${month}-${index}" onchange="applyVenueStandardPrices(${month}, ${index}); updateSeatPlanOptions(${month}, ${index}); updateLiveDateOptions(${month}, ${index}); updateShowDateNote(${month}, ${index})">
          <option value="">ライブなし</option>
          ${VENUE_DATA.map(v => `<option value="${v.name}" ${slot.liveVenue === v.name ? 'selected' : ''}>${v.name}(${v.cap}/${v.ease})</option>`).join('')}
        </select>
      </label>
      <label class="weekly-member-target" for="live-name-${month}-${index}">ライブ名
        <input type="text" id="live-name-${month}-${index}" maxlength="40" value="${escapeHtml(slot.liveName || '')}" placeholder="例: 春の全国ツアー">
      </label>
      <label class="weekly-member-target" for="live-date-${month}-${index}">ライブ開催日
        <input type="date" id="live-date-${month}-${index}" value="${slot.liveDate || ''}" onchange="updateLiveDateOptions(${month}, ${index})">
        <span id="live-date-note-${month}-${index}" style="color:#777;"></span>
      </label>
      <div style="margin-top:6px; font-size:11px;">
        <div style="color:#555; margin-bottom:3px;">公演日（1公演=1日 / 同じ会場で複数日開催可）</div>
        <div id="show-dates-${month}-${index}" class="show-date-list">
          ${(slot.liveDates || []).map((dateKey, dateIndex) => renderShowDateRow(month, index, dateIndex, dateKey)).join('')}
        </div>
        <div class="show-date-actions">
          <button class="plan-add-show-btn" type="button" onclick="addShowDate(${month}, ${index})">＋公演日を追加</button>
        </div>
        <div id="show-date-note-${month}-${index}" class="show-date-note"></div>
      </div>
      <details class="seat-settings">
        <summary>席種・チケット価格</summary>
        <div class="seat-settings-grid">
          ${SEAT_TYPES.map(seat => {
            // 入力欄は選択中会場の標準価格から開始する
            const price = seatPrices[seat.id] ?? getStandardSeatPrice(slotVenue, seat.id);
            const availability = seat.optional
              ? `<label class="seat-availability"><input type="checkbox" id="seat-option-${month}-${index}-${seat.id}" ${seatOptions[seat.id] ? 'checked' : ''}>設置する</label>`
              : '';
            return `<div class="seat-price-field" id="seat-row-${month}-${index}-${seat.id}"><label for="seat-price-${month}-${index}-${seat.id}">${seat.name}（円）</label><input type="number" id="seat-price-${month}-${index}-${seat.id}" min="0" step="500" value="${price}">${availability}</div>`;
          }).join('')}
        </div>
      </details>
    </div>
  `;
}

function renderLiveSlots(month, slots) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return;
  const canAdd = slots.length < MAX_LIVE_VENUES_PER_MONTH;
  container.innerHTML = slots.map((slot, index) => renderLiveSlotHtml(month, index, slot)).join('')
    + `<button class="plan-add-live-btn" type="button" onclick="addLiveSlot(${month})" ${canAdd ? '' : 'disabled'}>＋会場を追加（${slots.length}/${MAX_LIVE_VENUES_PER_MONTH}会場）</button>`;
  slots.forEach((slot, index) => {
    updateSeatPlanOptions(month, index);
    updateLiveDateOptions(month, index);
    updateShowDateNote(month, index);
  });
}

// 追加ライブ枠（1月あたり最大3回まで）
function addLiveSlot(month) {
  const slots = readLiveSlotInputs(month);
  if (slots.length >= MAX_LIVE_VENUES_PER_MONTH) return;
  slots.push(createEmptyLiveSlot());
  renderLiveSlots(month, slots);
}

function removeLiveSlot(month, index) {
  const slots = readLiveSlotInputs(month);
  if (index < 1 || index >= slots.length) return;
  slots.splice(index, 1);
  renderLiveSlots(month, slots);
}

// ==========================================
// 6か月計画カレンダー（日程の一括設定）
// ==========================================
const EMPTY_PLAN_CALENDAR_ENTRY = { release: false, live: [], event: [], rival: false, broadcast: null };

// 計画画面（ブース）から6か月カレンダーを開く（編集内容は保持する）
function openPlanCalendar() {
  if (!document.getElementById('plan-calendar-modal')) return;
  syncPlanBoothsIntoDrafts();
  const title = document.getElementById('modal-title').textContent.replace(/^【\d+年】/, '');
  openDecisionModal(title, planYearTarget, planStartM, planEndM);
  document.getElementById('plan-calendar-modal').style.display = 'flex';
}

// 事務所画面から指定期間の6か月カレンダーを開く
function openPlanCalendarForRange(title, y, sM, eM) {
  planDraftSignature = '';  // 明示的に期間を選ぶので保存済みの計画を読み直す
  openDecisionModal(title, y, sM, eM);
  document.getElementById('plan-calendar-modal').style.display = 'flex';
}

// カレンダーを閉じる（ブースの計画画面は開いたままにする）
function closePlanCalendar() {
  const modal = document.getElementById('plan-calendar-modal');
  if (modal) modal.style.display = 'none';
}

// 各月のライブ公演日（ブースの入力欄から読む）
function getPlanMonthShowDates(month) {
  const dates = [];
  readLiveSlotInputs(month).forEach(slot => {
    if (!slot.liveVenue) return;
    if (slot.liveDate) dates.push(slot.liveDate);
    (slot.liveDates || []).forEach(key => { if (key) dates.push(key); });
  });
  return dates;
}

// カレンダーに載る予定（発売・ライブ・イベント・競合・放送）を日付ごとに集める
function collectPlanCalendarEntries() {
  const map = new Map();
  const add = (dateKey, type, label) => {
    if (!dateKey) return;
    if (!map.has(dateKey)) map.set(dateKey, { ...EMPTY_PLAN_CALENDAR_ENTRY, live: [], event: [] });
    const entry = map.get(dateKey);
    if (type === 'release') { entry.release = true; return; }
    if (type === 'live') { if (!entry.live.includes(label)) entry.live.push(label); return; }
    if (type === 'event') { if (!entry.event.includes(label)) entry.event.push(label); return; }
    if (type === 'rival') { entry.rival = true; return; }
    if (type === 'broadcast') { entry.broadcast = label; }
  };
  getPlanMonthList().forEach(month => {
    const releaseKey = getPlanReleaseDate(month);
    if (releaseKey) add(releaseKey, 'release', 'CD発売');
    getPlanMonthShowDates(month).forEach(key => add(key, 'live', 'ライブ'));
    getPlanMonthEventDrafts(month).forEach(item => {
      add(item.date, 'event', getPlanEventType(item.benefitId)?.name || 'イベント');
    });
  });
  rivalLiveBookings.forEach(booking => {
    (booking.venueDates || [booking.liveDate]).filter(Boolean).forEach(key => add(key, 'rival', booking.groupName));
  });
  scheduledPerformances.forEach(performance => {
    if (performance.airDate) add(performance.airDate, 'broadcast', performance.name);
  });
  return map;
}

// 1ヶ月ぶんのカレンダーシート
function renderPlanCalendarMonth(month, entries) {
  const calendarY = getPlanMonthCalendarYear(month);
  const firstWeekday = new Date(calendarY, month - 1, 1, 12).getDay();
  const daysInMonth = new Date(calendarY, month, 0, 12).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<span class="plan-calendar-day plan-calendar-blank"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = getPlanMonthCalendarDate(month, day);
    const entry = entries.get(dateKey) || EMPTY_PLAN_CALENDAR_ENTRY;
    const isPast = dateKey < gameDate;
    const classes = ['plan-calendar-day'];
    if (isPast) classes.push('is-past');
    if (dateKey === gameDate) classes.push('is-today');
    if (entry.release) classes.push('has-release');
    if (entry.live.length) classes.push('has-live');
    if (entry.event.length) classes.push('has-event');
    if (entry.rival) classes.push('has-rival');
    if (planCalendarSelection.includes(dateKey)) classes.push('is-selected');
    const marks = [
      entry.release ? '<i class="mark-release"></i>' : '',
      entry.live.length ? '<i class="mark-live"></i>' : '',
      entry.event.length ? '<i class="mark-event"></i>' : '',
      entry.rival ? '<i class="mark-rival"></i>' : '',
      entry.broadcast ? '<i class="mark-broadcast"></i>' : ''
    ].join('');
    const title = [
      entry.release ? 'CD発売' : '',
      entry.live.length ? entry.live.join('、') : '',
      entry.event.length ? entry.event.join('、') : '',
      entry.rival ? '他グループの公演' : '',
      entry.broadcast ? `放送: ${entry.broadcast}` : ''
    ].filter(Boolean).join(' / ') || '予定なし';
    const click = isPast ? '' : ` onclick="togglePlanCalendarDate('${dateKey}')"`;
    cells.push(`<span class="${classes.join(' ')}"${click} title="${escapeHtml(title)}">${day}<span class="plan-calendar-marks">${marks}</span></span>`);
  }
  const weekdayRow = PLAN_CALENDAR_WEEKDAYS.map(label => `<span class="plan-calendar-weekday">${label}</span>`).join('');
  const releaseKey = getPlanReleaseDate(month);
  return `
    <div class="plan-calendar-month">
      <div class="plan-calendar-month-head">
        <strong>${month}月</strong>
        <button type="button" onclick="focusPlanMonthBooth(${month})">詳細</button>
      </div>
      <div class="plan-calendar-weekday-row">${weekdayRow}</div>
      <div class="plan-calendar-days">${cells.join('')}</div>
      <div class="plan-calendar-month-note">発売 ${releaseKey ? escapeHtml(formatPlanDayLabel(releaseKey)) : '未定'} / ライブ ${getPlanMonthShowDates(month).length}公演 / イベント ${getPlanMonthEventDrafts(month).length}件</div>
    </div>`;
}

function renderPlanCalendar() {
  const grid = document.getElementById('plan-calendar-grid');
  if (!grid) return;
  const title = document.getElementById('plan-calendar-title');
  if (title) title.textContent = `【${planYearTarget}年】${planStartM}月〜${planEndM}月 計画カレンダー`;
  const entries = collectPlanCalendarEntries();
  grid.innerHTML = getPlanMonthList().map(month => renderPlanCalendarMonth(month, entries)).join('');
  renderPlanCalendarSelectionSummary();
}

function renderPlanCalendarSelectionSummary() {
  const summary = document.getElementById('plan-calendar-selection');
  if (!summary) return;
  if (!planCalendarSelection.length) {
    summary.textContent = '日程が未選択です。日付をタップすると選択できます（同じ日をもう一度タップすると解除）。';
    return;
  }
  const sorted = [...planCalendarSelection].sort();
  summary.innerHTML = `<strong>${sorted.length}日を選択中</strong><br>${escapeHtml(sorted.map(formatPlanDayLabel).join('、'))}`;
}

// 日付の選択・解除。「範囲選択」モードでは直前にタップした日を基準にまとめて選ぶ
function togglePlanCalendarDate(dateKey) {
  if (dateKey < gameDate) return;
  const index = planCalendarSelection.indexOf(dateKey);
  if (index >= 0) {
    planCalendarSelection.splice(index, 1);
    planCalendarAnchorKey = '';
  } else if (planCalendarRangeMode && planCalendarAnchorKey) {
    const already = new Set(planCalendarSelection);
    buildPlanDateRange(planCalendarAnchorKey, dateKey)
      .filter(key => key >= gameDate)
      .forEach(key => { if (!already.has(key)) planCalendarSelection.push(key); });
    planCalendarAnchorKey = dateKey;
  } else {
    planCalendarSelection.push(dateKey);
    planCalendarAnchorKey = dateKey;
  }
  renderPlanCalendar();
}

function togglePlanCalendarRangeMode() {
  planCalendarRangeMode = !planCalendarRangeMode;
  planCalendarAnchorKey = '';
  const button = document.getElementById('plan-calendar-range-toggle');
  if (button) {
    button.classList.toggle('ghost', !planCalendarRangeMode);
    button.textContent = planCalendarRangeMode ? '範囲選択: ON' : '範囲選択: OFF';
  }
  renderPlanCalendar();
}

// カレンダーの「詳細」から該当月のブースへ移動
function focusPlanMonthBooth(month) {
  closePlanCalendar();
  const panel = document.getElementById(`plan-month-panel-${month}`);
  if (panel && typeof panel.scrollIntoView === 'function') {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearPlanCalendarSelection() {
  planCalendarSelection = [];
  planCalendarAnchorKey = '';
  renderPlanCalendar();
}

// 選択した日程に一括で設定を適用する
function applyPlanCalendarMark(mark) {
  if (!planCalendarSelection.length) {
    alert('先に日程を選んでください。');
    return;
  }
  const dateKeys = [...planCalendarSelection].sort();
  if (mark === 'release') applyPlanCalendarRelease(dateKeys);
  if (mark === 'live') applyPlanCalendarLive(dateKeys);
  if (mark === 'event') applyPlanCalendarEvent(dateKeys);
  if (mark === 'clear') clearPlanCalendarMarks(dateKeys);
  planCalendarSelection = [];
  planCalendarAnchorKey = '';
  renderPlanCalendar();
}

// CD発売は1か月に1つだけ。複数日を選んだ場合は各月の最初の日付を採用する
function applyPlanCalendarRelease(dateKeys) {
  const messages = [];
  groupPlanDatesByMonth(dateKeys).forEach((monthDates, month) => {
    const releaseKey = monthDates[0];
    const select = document.getElementById(`sel-rel-${month}`);
    if (select) {
      if (!select.value || select.value === 'none') select.value = 'single';
      updateReleaseBenefitOptions(month);
    }
    planReleaseDates[month] = releaseKey;
    renderPlanMonthReleaseDate(month);
    messages.push(`${month}月の発売日を${formatPlanDayLabel(releaseKey)}に設定しました。`);
    if (monthDates.length > 1) {
      messages.push(`※${month}月の発売日は1つだけなので、${monthDates.slice(1).map(formatPlanDayLabel).join('、')}は無視しました。`);
    }
  });
  if (messages.length) alert(messages.join('\n'));
}

function applyPlanCalendarLive(dateKeys) {
  const messages = [];
  groupPlanDatesByMonth(dateKeys).forEach((monthDates, month) => {
    const planKey = `${planYearTarget}-${month}`;
    const slots = readLiveSlotInputs(month);
    const added = [];
    const skipped = [];
    let venueCount = slots.filter(slot => slot.liveVenue).length;
    let showCount = slots.reduce((sum, slot) =>
      sum + (slot.liveVenue ? Math.max(1, (slot.liveDates || []).filter(Boolean).length) : 0), 0);

    monthDates.forEach(dateKey => {
      if (slots.some(slot => slot.liveVenue && (slot.liveDate === dateKey || (slot.liveDates || []).includes(dateKey)))) return;
      if (showCount >= MAX_LIVE_SHOWS_PER_MONTH) {
        skipped.push(`${formatPlanDayLabel(dateKey)}（公演数が上限${MAX_LIVE_SHOWS_PER_MONTH}公演）`);
        return;
      }
      const venue = pickDefaultPlanVenue(dateKey);
      if (!venue) {
        skipped.push(`${formatPlanDayLabel(dateKey)}（会場が見つかりません）`);
        return;
      }
      const leadDays = getLiveBookingLeadDays(venue);
      if (!isPlanBookableDate(dateKey, leadDays)) {
        skipped.push(`${formatPlanDayLabel(dateKey)}（${venue.name}は開催日の${leadDays}日前からのみ予約可）`);
        return;
      }
      const rival = findRivalVenueConflict(venue.name, dateKey);
      if (rival) {
        skipped.push(`${formatPlanDayLabel(dateKey)}（${venue.name}は${rival.groupName}が予約済み）`);
        return;
      }
      // 既存会場で空いているところがあればそこへ追加する
      const host = slots.find(slot =>
        slot.liveVenue
        && !findOwnLiveConflict(slot.liveVenue, dateKey, planKey)
        && !findRivalVenueConflict(slot.liveVenue, dateKey)
      );
      if (host) {
        if (host.liveDate) host.liveDates = [...(host.liveDates || []), dateKey];
        else host.liveDate = dateKey;
        showCount += 1;
        added.push(dateKey);
        return;
      }
      if (venueCount >= MAX_LIVE_VENUES_PER_MONTH) {
        skipped.push(`${formatPlanDayLabel(dateKey)}（会場が上限${MAX_LIVE_VENUES_PER_MONTH}か所）`);
        return;
      }
      // 会場が空いている枠があればそこを使い、ライブ1（定期公演）を保つ
      const newSlot = { liveVenue: venue.name, liveName: '', liveDate: dateKey, liveDates: [], seatPrices: {}, seatOptions: {} };
      const emptyIndex = slots.findIndex(slot => !slot.liveVenue);
      if (emptyIndex >= 0) slots[emptyIndex] = newSlot;
      else slots.push(newSlot);
      venueCount += 1;
      showCount += 1;
      added.push(dateKey);
    });

    if (added.length) {
      renderLiveSlots(month, slots);
      messages.push(`${month}月: ${added.map(formatPlanDayLabel).join('、')} をライブに設定しました（会場は詳細で変更できます）。`);
    }
    if (skipped.length) messages.push(`${month}月: ${skipped.join('、')} は設定できませんでした。`);
  });
  if (messages.length) alert(messages.join('\n'));
}

function applyPlanCalendarEvent(dateKeys) {
  const messages = [];
  groupPlanDatesByMonth(dateKeys).forEach((monthDates, month) => {
    const drafts = getPlanMonthEventDrafts(month).map(item => ({ ...item }));
    const added = [];
    const skipped = [];
    monthDates.forEach(dateKey => {
      if (drafts.some(item => item.date === dateKey)) return;
      if (drafts.length >= MAX_PLAN_EVENTS_PER_MONTH) {
        skipped.push(`${formatPlanDayLabel(dateKey)}（${month}月の上限${MAX_PLAN_EVENTS_PER_MONTH}件）`);
        return;
      }
      drafts.push({ id: createPlanEventId(month), date: dateKey, benefitId: DEFAULT_PLAN_EVENT_ID, completed: false });
      added.push(dateKey);
    });
    planEventDrafts[month] = drafts;
    renderPlanMonthEvents(month);
    if (added.length) {
      messages.push(`${month}月: ${added.map(formatPlanDayLabel).join('、')} にイベントを設定しました（${getPlanEventType(DEFAULT_PLAN_EVENT_ID).name}）。`);
    }
    if (skipped.length) messages.push(`${month}月: ${skipped.join('、')} は設定できませんでした。`);
  });
  if (messages.length) alert(messages.join('\n'));
}

// ライブ日程とイベント日程を取り消す（CD発売は月単位の設定なので残す）
function clearPlanCalendarMarks(dateKeys) {
  const target = new Set(dateKeys);
  const messages = [];
  groupPlanDatesByMonth(dateKeys).forEach((monthDates, month) => {
    let removed = 0;
    const slots = readLiveSlotInputs(month);
    slots.forEach(slot => {
      if (!slot.liveVenue) return;
      if (target.has(slot.liveDate)) {
        slot.liveDate = '';
        removed += 1;
      }
      const before = (slot.liveDates || []).filter(key => target.has(key)).length;
      slot.liveDates = (slot.liveDates || []).filter(key => !target.has(key));
      removed += before;
      // メイン日程が空になったら追加日程を繰り上げる
      if (!slot.liveDate) slot.liveDate = slot.liveDates.shift() || '';
      // 日程が1日も残らない会場は「ライブなし」に戻す
      if (!slot.liveDate && !slot.liveDates.length) {
        slot.liveVenue = '';
        slot.liveName = '';
        slot.liveDates = [];
      }
    });
    if (removed) renderLiveSlots(month, slots);

    const events = getPlanMonthEventDrafts(month);
    const kept = events.filter(item => !target.has(item.date));
    const eventRemoved = events.length - kept.length;
    if (eventRemoved) {
      planEventDrafts[month] = kept;
      renderPlanMonthEvents(month);
    }
    if (removed || eventRemoved) {
      messages.push(`${month}月: ライブ${removed}公演・イベント${eventRemoved}件を解除しました。`);
    }
  });
  if (messages.length) alert(messages.join('\n'));
}

function openDecisionModal(title, y, sM, eM) {
  planYearTarget = y; planStartM = sM; planEndM = eM;
  // 別の計画期間を開いたときだけ保存済みの計画を読み直す
  const signature = `${y}-${sM}-${eM}`;
  if (signature !== planDraftSignature) {
    planDraftSignature = signature;
    initPlanCalendarDrafts();
  }
  for (let month = sM; month <= eM; month++) ensureRivalLiveBookings(y, month);
  document.getElementById('modal-title').textContent = `【${y}年】${title}`;
  const rows = document.getElementById('plan-rows');
  rows.innerHTML = '';

  for (let m = sM; m <= eM; m++) {
    const actualYear = calendarYear + (y - currentYear);
    const monthPrefix = `${actualYear}-${String(m).padStart(2, '0')}-`;
    const rivalMonthSchedule = rivalLiveBookings
      .filter(booking => (booking.venueDates || [booking.liveDate]).some(dateKey => dateKey.startsWith(monthPrefix)))
      .map(booking => {
        const days = (booking.venueDates || [booking.liveDate])
          .filter(dateKey => dateKey.startsWith(monthPrefix))
          .map(dateKey => Number(dateKey.slice(-2)));
        const dayText = days.length > 1 ? `${days[0]}〜${days[days.length - 1]}日` : `${days[0]}日`;
        const note = booking.consecutive && days.length > 1 ? '・連日' : (days.length > 1 ? `・${days.length}公演` : '');
        return `${dayText} ${booking.groupName}（${booking.venue}）${note}`;
      });
    const draft = planBoothDraft[m] || {};
    const liveSlots = (draft.slots && draft.slots.length) ? draft.slots : [createEmptyLiveSlot()];
    rows.innerHTML += `
      <div class="plan-month" id="plan-month-panel-${m}" style="margin-bottom:8px; padding:6px; background:#f9f9f9; border-radius:4px; font-size:11px;">
        <span style="font-weight:bold;">${m}月</span>
        <button class="plan-booth-btn" type="button" onclick="openPlanCalendar()">📅 カレンダーで日程を選ぶ</button>
        ${rivalMonthSchedule.length ? `<div style="margin-top:4px; color:#777;">他グループ予定: ${escapeHtml(rivalMonthSchedule.join(' / '))}</div>` : ''}
        <label class="weekly-member-target" for="sel-rel-${m}" style="margin-top:6px;">リリース${isPresetReleaseMonth(m) ? '<small style="margin-left:4px; color:#b5651d;">（プリセットで確定）</small>' : ''}
          <select id="sel-rel-${m}" onchange="updateReleaseBenefitOptions(${m})" ${isPresetReleaseMonth(m) ? 'disabled' : ''}>
            <option value="none" ${!isPresetReleaseMonth(m) && draft.release !== 'single' && draft.release !== 'album' ? 'selected' : ''}>リリースなし</option>
            <option value="single" ${isPresetReleaseMonth(m) || draft.release === 'single' ? 'selected' : ''}>シングル発売</option>
            <option value="album" ${draft.release === 'album' ? 'selected' : ''}>アルバム発売</option>
          </select>
        </label>
        <label class="weekly-member-target" for="release-date-${m}" style="margin-top:6px;">発売日
          <input type="date" id="release-date-${m}" onchange="updatePlanReleaseDate(${m}, this.value)">
          <span id="release-date-note-${m}" class="show-date-note"></span>
        </label>
        <label class="weekly-member-target" for="song-name-${m}" style="margin-top:6px;">楽曲名（空欄は自動設定）
          <input type="text" id="song-name-${m}" maxlength="40" value="${escapeHtml(draft.songName || '')}" placeholder="好きな楽曲名を入力">
        </label>
        <select id="sel-benefit-${m}" style="width:100%; margin-top:6px; font-size:11px;">
          <option value="none" ${!draft.releaseBenefit || draft.releaseBenefit === 'none' ? 'selected' : ''}>CD特典なし</option>
          ${CD_BENEFITS.map(benefit => `<option value="${benefit.id}" ${draft.releaseBenefit === benefit.id ? 'selected' : ''}>${benefit.name}（経費 ${formatMoney(benefit.cost)}）</option>`).join('')}
        </select>
        <div class="plan-live-heading" style="margin-top:8px; font-weight:bold;">ライブ（1月あたり最大${MAX_LIVE_VENUES_PER_MONTH}会場・計${MAX_LIVE_SHOWS_PER_MONTH}公演）</div>
        <div id="live-slots-${m}"></div>
        <div class="plan-live-heading" style="margin-top:8px; font-weight:bold;">CD関連イベント（1月あたり最大${MAX_PLAN_EVENTS_PER_MONTH}件）</div>
        <div id="plan-events-${m}"></div>
      </div>
    `;
    renderLiveSlots(m, liveSlots);
    renderPlanMonthEvents(m);
  }
  for (let m = sM; m <= eM; m++) updateReleaseBenefitOptions(m);
  document.getElementById('decision-modal').style.display = 'flex';
  renderPlanCalendar();
}

// 発売日欄の描画（未指定なら当月の最終水曜を既定にする）
function renderPlanMonthReleaseDate(month) {
  const input = document.getElementById(`release-date-${month}`);
  const note = document.getElementById(`release-date-note-${month}`);
  if (!input) return;
  const releaseSelect = document.getElementById(`sel-rel-${month}`);
  const isNone = !releaseSelect || releaseSelect.value === 'none';
  if (isNone) {
    delete planReleaseDates[month];
    input.value = '';
    input.disabled = true;
    if (note) note.textContent = 'リリースなし';
    return;
  }
  const defaultKey = getDefaultPlanReleaseDate(month);
  const current = getPlanReleaseDate(month);
  input.disabled = false;
  input.value = current || defaultKey;
  planReleaseDates[month] = input.value;
  if (note) {
    note.textContent = current
      ? `${formatPlanDayLabel(current)}に発売します。`
      : `未指定（既定は最終水曜 ${formatPlanDayLabel(defaultKey)}）`;
  }
}

function updatePlanReleaseDate(month, value) {
  if (!value) {
    delete planReleaseDates[month];
  } else {
    const date = getGameDateObject(value);
    if (date.getFullYear() !== getPlanMonthCalendarYear(month) || date.getMonth() + 1 !== month) {
      alert(`発売日は${getPlanMonthCalendarYear(month)}年${month}月内で選択してください。`);
      renderPlanMonthReleaseDate(month);
      return;
    }
    if (value < gameDate) {
      alert('発売日は今日以降の日付で設定してください。');
      renderPlanMonthReleaseDate(month);
      return;
    }
    planReleaseDates[month] = value;
  }
  renderPlanMonthReleaseDate(month);
  renderPlanCalendar();
}

// CD関連イベント欄（ブース側の詳細設定）
function renderPlanMonthEvents(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (!container) return;
  const drafts = getPlanMonthEventDrafts(month);
  const rows = drafts.map((item, index) => `
    <div class="plan-event-row" data-event-index="${index}">
      <input type="date" class="plan-event-date" value="${item.date}" min="${gameDate}"
        onchange="updatePlanEvent(${month}, ${index}, 'date', this.value)">
      <select class="plan-event-kind" onchange="updatePlanEvent(${month}, ${index}, 'benefitId', this.value)">
        ${PLAN_EVENT_TYPES.map(type => `<option value="${type.id}" ${item.benefitId === type.id ? 'selected' : ''}>${type.name}${type.cost ? `（${formatMoney(type.cost)}）` : ''}</option>`).join('')}
      </select>
      <button class="danger-btn" type="button" onclick="removePlanEvent(${month}, ${index})">削除</button>
    </div>`).join('');
  const addButton = drafts.length < MAX_PLAN_EVENTS_PER_MONTH
    ? `<button class="plan-add-show-btn" type="button" onclick="addPlanEvent(${month})">＋イベントを追加（${drafts.length}/${MAX_PLAN_EVENTS_PER_MONTH}件）</button>`
    : `<div class="show-date-note">1月あたりの上限（${MAX_PLAN_EVENTS_PER_MONTH}件）に達しています。</div>`;
  container.className = 'plan-event-list';
  container.innerHTML = rows + addButton;
}

function addPlanEvent(month) {
  const drafts = getPlanMonthEventDrafts(month).map(item => ({ ...item }));
  if (drafts.length >= MAX_PLAN_EVENTS_PER_MONTH) return;
  const used = new Set(drafts.map(item => item.date));
  const daysInMonth = new Date(getPlanMonthCalendarYear(month), month, 0, 12).getDate();
  let dateKey = '';
  for (let day = 1; day <= daysInMonth; day++) {
    const candidate = getPlanMonthCalendarDate(month, day);
    if (!used.has(candidate)) {
      dateKey = candidate;
      break;
    }
  }
  drafts.push({ id: createPlanEventId(month), date: dateKey, benefitId: DEFAULT_PLAN_EVENT_ID, completed: false });
  planEventDrafts[month] = drafts;
  renderPlanMonthEvents(month);
}

function updatePlanEvent(month, index, field, value) {
  const drafts = getPlanMonthEventDrafts(month).map(item => ({ ...item }));
  const target = drafts[index];
  if (!target) return;
  if (field === 'date') {
    if (!value) {
      target.date = '';
    } else {
      const date = getGameDateObject(value);
      if (date.getFullYear() !== getPlanMonthCalendarYear(month) || date.getMonth() + 1 !== month) {
        alert(`イベント日は${getPlanMonthCalendarYear(month)}年${month}月内で選択してください。`);
        renderPlanMonthEvents(month);
        return;
      }
      if (value < gameDate) {
        alert('イベント日は今日以降の日付で設定してください。');
        renderPlanMonthEvents(month);
        return;
      }
      target.date = value;
    }
  } else if (field === 'benefitId') {
    target.benefitId = getPlanEventType(value) ? value : DEFAULT_PLAN_EVENT_ID;
  }
  planEventDrafts[month] = drafts;
  renderPlanMonthEvents(month);
  renderPlanCalendar();
}

function removePlanEvent(month, index) {
  planEventDrafts[month] = getPlanMonthEventDrafts(month).filter((item, itemIndex) => itemIndex !== index);
  renderPlanMonthEvents(month);
  renderPlanCalendar();
}

// リリース無しにしたときは発売日も消す
function updateReleaseBenefitOptions(month) {
  const releaseSelect = document.getElementById(`sel-rel-${month}`);
  const benefitSelect = document.getElementById(`sel-benefit-${month}`);
  if (!releaseSelect || !benefitSelect) return;
  const isNone = releaseSelect.value === 'none';
  benefitSelect.disabled = isNone;
  if (isNone) delete planReleaseDates[month];
  renderPlanMonthReleaseDate(month);
}

// 会場を選び直したら、チケット価格欄をその会場の標準価格にリセットする
function applyVenueStandardPrices(month, index = 0) {
  const venueSelect = document.getElementById(`sel-ven-${month}-${index}`);
  const venue = VENUE_DATA.find(item => item.name === (venueSelect ? venueSelect.value : ''));
  if (!venue) return;
  SEAT_TYPES.forEach(seat => {
    const input = document.getElementById(`seat-price-${month}-${index}-${seat.id}`);
    if (input) input.value = getStandardSeatPrice(venue, seat.id);
  });
  updateShowDateNote(month, index);
}

function updateSeatPlanOptions(month, index = 0) {
  const venueSelect = document.getElementById(`sel-ven-${month}-${index}`);
  if (!venueSelect) return;
  const venue = VENUE_DATA.find(item => item.name === venueSelect.value);
  const isDome = Boolean(venue && venue.name.includes('ドーム'));
  ['stand3', 'stand4'].forEach(seatId => {
    const row = document.getElementById(`seat-row-${month}-${index}-${seatId}`);
    if (row) row.style.display = isDome ? '' : 'none';
  });
}

// 既定の開催日を決める（同じ月に使う日程を重複させない）
function pickDefaultLiveDate(planCalendarYear, month, index, minimumKey, monthEndKey, usedDates) {
  const base = getLastWednesday(planCalendarYear, month - 1);
  const monthStartKey = toDateKey(new Date(planCalendarYear, month - 1, 1, 12));
  for (let shift = index; shift <= index + 6; shift++) {
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() - (7 * shift));
    const key = toDateKey(candidate);
    if (key < monthStartKey) break;
    if (key <= monthEndKey && key >= minimumKey && !usedDates.has(key)) return key;
  }
  return minimumKey <= monthEndKey ? minimumKey : '';
}

function updateLiveDateOptions(month, index = 0) {
  const dateInput = document.getElementById(`live-date-${month}-${index}`);
  const note = document.getElementById(`live-date-note-${month}-${index}`);
  const venueSelect = document.getElementById(`sel-ven-${month}-${index}`);
  if (!dateInput || !note) return;
  const venue = VENUE_DATA.find(item => item.name === (venueSelect ? venueSelect.value : ''));
  if (!venue) {
    dateInput.value = '';
    dateInput.disabled = true;
    note.textContent = '会場を選択してください';
    return;
  }

  const planCalendarYear = calendarYear + (planYearTarget - currentYear);
  const monthStart = new Date(planCalendarYear, month - 1, 1, 12);
  const monthEnd = new Date(planCalendarYear, month, 0, 12);
  const leadDays = getLiveBookingLeadDays(venue);
  const minimumDate = new Date(`${gameDate}T12:00:00`);
  minimumDate.setDate(minimumDate.getDate() + leadDays);
  const minimumKey = toDateKey(minimumDate);
  const monthStartKey = toDateKey(monthStart);
  const monthEndKey = toDateKey(monthEnd);
  dateInput.min = minimumKey;
  dateInput.max = monthEndKey;
  if (minimumDate > monthEnd) {
    dateInput.value = '';
    dateInput.disabled = true;
    note.textContent = `この会場は開催日の${leadDays}日以上前に予約が必要です（最短 ${minimumKey}）`;
    return;
  }

  dateInput.disabled = false;
  const otherSlots = readLiveSlotInputs(month).filter((slot, slotIndex) => slotIndex !== index);
  // 既定日程を他枠と重ならないようにする（利用者が選んだ日付はそのまま保持する）
  const usedDates = new Set(otherSlots.map(slot => slot.liveDate).filter(Boolean));
  const currentValue = dateInput.value;
  if (!currentValue || currentValue < minimumKey || currentValue < monthStartKey) {
    dateInput.value = pickDefaultLiveDate(planCalendarYear, month, index, minimumKey, monthEndKey, usedDates);
  }
  note.textContent = isStadiumVenue(venue)
    ? `野球日程調整のため${leadDays}日前から予約（最短 ${minimumKey}）`
    : `開催日の${leadDays}日前から予約（最短 ${minimumKey}）`;
  if (!dateInput.value) return;
  // 複数日開催の場合は月の末尾を越えないようにする
  const daysSelect = document.getElementById(`live-days-${month}-${index}`);
  const liveDays = normalizeLiveDays(daysSelect ? daysSelect.value : 1);
  const startDate = getGameDateObject(dateInput.value);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + liveDays - 1);
  if (endDate > monthEnd) {
    const latestStart = new Date(monthEnd);
    latestStart.setDate(latestStart.getDate() - (liveDays - 1));
    if (latestStart < minimumDate) {
      note.textContent += ` / ${month}月内に${getLiveDayLabel(liveDays)}ぶんの日程が取れません`;
    } else {
      dateInput.value = toDateKey(latestStart);
      note.textContent += ` / ${getLiveDayLabel(liveDays)}が${month}月内に収まるよう開始日を${dateInput.value}に変更`;
    }
  } else {
    note.textContent += ` / ${getLiveDayLabel(liveDays)}（${['日', '月', '火', '水', '木', '金', '土'][startDate.getDay()]}曜始まり）`;
  }
  // 複数日開催では期間中のどの日かが他公演とぶつからないか確認する
  const occupiedDates = [];
  for (let i = 0; i < liveDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    occupiedDates.push(toDateKey(date));
  }
  if (occupiedDates.length) {
    const start = getGameDateObject(occupiedDates[0]);
    const end = getGameDateObject(occupiedDates[occupiedDates.length - 1]);
    const rivalClash = rivalLiveBookings.find(booking =>
      booking.venue === venue.name && occupiedDates.includes(booking.liveDate)
    );
    if (rivalClash) note.textContent += ` / ${rivalClash.groupName}が${rivalClash.liveDate}に予約済み`;
    const ownClash = getScheduledLiveEntries().find(other =>
      other.planKey !== `${planYearTarget}-${month}`
      && !other.completed
      && other.liveVenue === venue.name
      && other.liveDate
      && occupiedDates.includes(other.liveDate)
    );
    if (ownClash) note.textContent += ' / 他の月の予定と重複';
    const sameMonthClash = otherSlots.find(slot =>
      slot.liveVenue === venue.name && slot.liveDate && occupiedDates.includes(slot.liveDate)
    );
    if (sameMonthClash) note.textContent += ' / 同月のライブと重複';
    if (start > end) note.textContent += ' / 日程が不正です';
  }
}

function validatePlanLiveSlots(month, slots) {
  const planKey = `${planYearTarget}-${month}`;
  const targetCalendarYear = calendarYear + (planYearTarget - currentYear);
  const bookingKeys = new Set();
  for (const slot of slots) {
    const venue = VENUE_DATA.find(item => item.name === slot.liveVenue);
    const leadDays = getLiveBookingLeadDays(venue);
    const earliestDate = new Date(`${gameDate}T12:00:00`);
    earliestDate.setDate(earliestDate.getDate() + leadDays);
    const earliestKey = toDateKey(earliestDate);
    if (!slot.liveDate || slot.liveDate < earliestKey) {
      alert(`${slot.liveVenue}は開催日の${leadDays}日以前からのみ予約できます。`);
      return false;
    }
    const selectedLiveDate = getGameDateObject(slot.liveDate);
    if (selectedLiveDate.getFullYear() !== targetCalendarYear || selectedLiveDate.getMonth() + 1 !== month) {
      alert(`${month}月のライブ日は${targetCalendarYear}年${month}月内で選択してください。`);
      return false;
    }
    const rivalConflict = findRivalVenueConflict(slot.liveVenue, slot.liveDate);
    if (rivalConflict) {
      alert(`${slot.liveDate}は${rivalConflict.groupName}が${slot.liveVenue}を予約しています。別の日程を選んでください。`);
      return false;
    }
    if (findOwnLiveConflict(slot.liveVenue, slot.liveDate, planKey)) {
      alert(`${slot.liveDate}の${slot.liveVenue}は別の月の予定と重複しています。別の会場か日程を選んでください。`);
      return false;
    }
    const bookingKey = `${slot.liveVenue}@${slot.liveDate}`;
    if (bookingKeys.has(bookingKey)) {
      alert(`${month}月のライブで${slot.liveVenue}の${slot.liveDate}が重複しています。`);
      return false;
    }
    bookingKeys.add(bookingKey);
  }
  return true;
}

function saveDecisionPlan() {
  for (let m = planStartM; m <= planEndM; m++) {
    // 2月・6月はプリセットで発売が確定している（変更できない）
    const release = isPresetReleaseMonth(m)
      ? PRESET_RELEASE_TYPE
      : document.getElementById(`sel-rel-${m}`).value;
    const songName = document.getElementById(`song-name-${m}`).value.trim();
    const planKey = `${planYearTarget}-${m}`;
    const previousPlan = productionSchedule[planKey] || {};
    // 会場が入った枠だけを対象に検証する
    const liveSlots = readLiveSlotInputs(m).filter(slot => slot.liveVenue).slice(0, MAX_LIVE_VENUES_PER_MONTH);
    // 会場数と合計公演数の上限チェック
    if (liveSlots.length > MAX_LIVE_VENUES_PER_MONTH) {
      alert(`1か月あたりの会場は最大${MAX_LIVE_VENUES_PER_MONTH}会場までです。`);
      return;
    }
    const plannedShows = liveSlots.reduce((sum, slot) =>
      sum + Math.max(1, (slot.liveDates || []).filter(Boolean).length), 0);
    if (plannedShows > MAX_LIVE_SHOWS_PER_MONTH) {
      alert(`1か月あたりの公演は最大${MAX_LIVE_SHOWS_PER_MONTH}公演までです（現在${plannedShows}公演）。`);
      return;
    }
    if (!validatePlanLiveSlots(m, liveSlots)) return;

    // 既存と同じ会場・日程のライブは開催済みフラグを引き継ぐ
    const previousLives = getMonthLiveEntries(previousPlan);
    const findCompleted = slot => {
      const matched = previousLives.find(entry => entry.liveVenue === slot.liveVenue && (entry.liveDate || '') === (slot.liveDate || ''));
      return matched ? matched.completed : false;
    };
    const primary = liveSlots[0] || null;
    const plan = {
      release,
      songName: songName || null,
      releaseDate: release === 'none' ? null : (getPlanReleaseDate(m) || null),
      planEvents: getPlanMonthEventDrafts(m).map(item => ({
        id: item.id,
        date: item.date,
        benefitId: item.benefitId,
        completed: Boolean(item.completed)
      })),
      liveVenue: primary ? primary.liveVenue : null,
      liveName: primary ? (primary.liveName || primary.liveVenue) : null,
      liveDate: primary ? (primary.liveDate || null) : null,
      liveDates: primary ? primary.liveDates : [],
      releaseBenefit: release === 'none' ? 'none' : document.getElementById(`sel-benefit-${m}`).value,
      seatPrices: primary ? primary.seatPrices : (previousPlan.seatPrices || {}),
      seatOptions: primary ? primary.seatOptions : (previousPlan.seatOptions || {}),
      additionalLives: liveSlots.slice(1).map(slot => ({
        liveVenue: slot.liveVenue,
        liveName: slot.liveName || slot.liveVenue,
        liveDate: slot.liveDate || null,
        liveDates: slot.liveDates,
        seatPrices: slot.seatPrices,
        seatOptions: slot.seatOptions
      }))
    };
    if (primary) plan.liveCompleted = findCompleted(primary);
    plan.additionalLives.forEach((live, index) => {
      live.liveCompleted = findCompleted(liveSlots[index + 1]);
    });
    if (plan.release === previousPlan.release) {
      plan.releaseCompleted = previousPlan.releaseCompleted;
      plan.musicOfferSent = previousPlan.musicOfferSent;
    }
    if (plan.release !== 'none') ensureScheduledSong(planYearTarget, m, plan);
    productionSchedule[planKey] = plan;
  }
  closePlanCalendar();
  document.getElementById('decision-modal').style.display = 'none';
  setLog(`【計画確定】${planYearTarget}年${planStartM}月〜${planEndM}月の活動方針を決定しました。`);
  updateUI();
}

function openPlanningManual() {
  if (currentMonth <= 6) openDecisionModal("当年7月〜12月の計画", currentYear, 7, 12);
  else openDecisionModal("翌年1月〜6月の計画", currentYear + 1, 1, 6);
}

// 事務所画面から6か月カレンダーを開く
function openPlanningCalendar() {
  if (currentMonth <= 6) openPlanCalendarForRange("当年7月〜12月の計画カレンダー", currentYear, 7, 12);
  else openPlanCalendarForRange("翌年1月〜6月の計画カレンダー", currentYear + 1, 1, 6);
}

// サービスワーカー登録（開発時はローカルホストで無効化して自動更新を優先）
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  const swUrl = `./sw.js?v=${Date.now()}`;
  navigator.serviceWorker.register(swUrl).catch(() => {});
}

// タイトル画面
openTitleScreen();

// ページタブは初回描画時に用意しておく
renderPageNav(DEFAULT_PAGE);
