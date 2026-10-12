// ==========================================
// 18-ui-plan-save.js : 全機能完全保持 ＆ 特典イベント日付カウント連動版
// ==========================================

let planYearTarget = 1;
let planStartM = 1;
let planEndM = 6;
let planAllowPastMonths = false;
let planIsAddMode = false;
let planMonthEventDrafts = {};
let planMultiSelectModes = {}; 
let planCalendarSelections = {}; 

let pendingActiveSlot = null;
let customGroupName = "スタースコープ";
let customFirstSong = "はじまりの光";
let customSecondSong = "青春の軌跡";
let customFirstLiveName = "1stデビューライブ";

const BENEFIT_EVENT_TYPE_OPTIONS = [
  { id: 'online-meeguri', name: 'オンラインミーグリ', baseCost: 3000000, profileId: 'web-greeting' },
  { id: 'online-sign', name: 'オンラインサイン会', baseCost: 6000000, profileId: 'web-sign' },
  { id: 'real-meeguri', name: 'リアルミーグリ', baseCost: 5000000, profileId: 'real-greeting' },
  { id: 'real-sign', name: 'リアルサイン会', baseCost: 10000000, profileId: 'real-sign' }
];

// Presetリリース月を判定する。
function isPresetReleaseMonth(month) {
  return planYearTarget === 1 && typeof PRESET_RELEASE_MONTHS !== 'undefined' && PRESET_RELEASE_MONTHS.includes(month);
}

// 計画カレンダー日付を取得する。
function getPlanCalendarDate(month, day) {
  const actualYear = getPlanActualYear();
  return new Date(actualYear, month - 1, day, 12);
}

function getPlanActualYear() {
  return calendarYear && calendarYear > 2000
    ? calendarYear + (planYearTarget - currentYear)
    : 2026 + (planYearTarget - currentYear);
}

function initializePlanDateInput(input, month) {
  if (!input || input.value) return;
  const firstDay = getPlanCalendarDate(month, 1);
  input.value = toDateKey(firstDay);
  input.dataset.calendarInitialized = 'true';
}

// 計画月イベントDraftsを取得する。
function getPlanMonthEventDrafts(month) {
  if (!Array.isArray(planMonthEventDrafts[month])) {
    const planKey = `${planYearTarget}-${month}`;
    const plan = (typeof productionSchedule !== 'undefined' && productionSchedule[planKey]) ? productionSchedule[planKey] : {};
    planMonthEventDrafts[month] = Array.isArray(plan.planEvents)
      ? plan.planEvents.map(event => ({ ...event }))
      : [];
  }
  return planMonthEventDrafts[month];
}

// 計画リリース日付を取得する。
function getPlanReleaseDate(month) {
  return (document.getElementById(`rel-date-${month}`) || {}).value || '';
}

// Standard席価格を取得する。
function getStandardSeatPrice(venue, seatId) {
  if (!venue || typeof SEAT_PRICE_GROUP === 'undefined' || typeof STANDARD_SEAT_PRICE === 'undefined') return 0;
  const group = SEAT_PRICE_GROUP[seatId];
  const base = STANDARD_SEAT_PRICE[group] || 0;
  const rate = (typeof VENUE_TIER_PRICE_RATE !== 'undefined' && VENUE_TIER_PRICE_RATE[venue.cap]) 
    ? VENUE_TIER_PRICE_RATE[venue.cap] 
    : (typeof VENUE_TIER_DEFAULT_PRICE_RATE !== 'undefined' ? VENUE_TIER_DEFAULT_PRICE_RATE : 1.0);
  return Math.round(base * rate);
}

// リリース日のデフォルト水曜を返す。
function getPlanReleaseDefaultWednesday(month) {
  const actualYear = getPlanActualYear();
  if (typeof getLastWednesday === 'function') {
    return toDateKey(getLastWednesday(actualYear, month - 1));
  }
  const d = new Date(actualYear, month, 0, 12);
  while (d.getDay() !== 3) {
    d.setDate(d.getDate() - 1);
  }
  return toDateKey(d);
}

// イベントExpensesを計算する。
function calculateEventExpenses(eventName, venue, dates) {
  const option = BENEFIT_EVENT_TYPE_OPTIONS.find(opt => opt.name === eventName) || BENEFIT_EVENT_TYPE_OPTIONS[0];
  const baseCost = option.baseCost;
  
  let venueFee = 0;
  const daysCount = Array.isArray(dates) ? dates.filter(Boolean).length : 0;
  if (venue && daysCount > 0 && typeof getVenueFeePerShow === 'function') {
    const singleFee = getVenueFeePerShow(venue);
    venueFee = singleFee * (daysCount + 1);
  }

  return {
    baseCost: baseCost,
    venueFee: venueFee,
    totalCost: baseCost + venueFee
  };
}

// プレイヤーCDリリース一覧を取得する。
function getPlayerCdReleaseList() {
  const cdList = [];
  let count = 0;
  
  for (let y = 1; y <= planYearTarget; y++) {
    const displayYear = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined') 
      ? calendarYear + (y - currentYear) 
      : y;

    const maxM = (y === planYearTarget) ? planEndM : 12;
    for (let m = 1; m <= maxM; m++) {
      const pKey = `${y}-${m}`;
      const plan = (typeof productionSchedule !== 'undefined' && productionSchedule[pKey]) ? productionSchedule[pKey] : {};
      const relVal = plan.release;
      if (relVal && relVal !== 'none') {
        count++;
        const ordinal = count === 1 ? '1st' : count === 2 ? '2nd' : count === 3 ? '3rd' : `${count}th`;
        const typeStr = relVal === 'album' ? 'アルバム' : 'シングル';
        const sName = plan.songName ? `「${plan.songName}」` : '';
        cdList.push({
          id: `cd_${y}_${m}`,
          label: `${ordinal} ${typeStr}${sName} (${displayYear}年${m}月)`
        });
      }
    }
  }

  for (let m = planStartM; m <= planEndM; m++) {
    const selRel = document.getElementById(`sel-rel-${m}`);
    if (selRel && selRel.value !== 'none') {
      const displayYear = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined') 
        ? calendarYear + (planYearTarget - currentYear) 
        : planYearTarget;

      const existingId = `cd_${planYearTarget}_${m}`;
      if (!cdList.some(cd => cd.id === existingId)) {
        count++;
        const ordinal = count === 1 ? '1st' : count === 2 ? '2nd' : count === 3 ? '3rd' : `${count}th`;
        const typeStr = selRel.value === 'album' ? 'アルバム' : 'シングル';
        const songInput = document.getElementById(`song-name-${m}`);
        const sName = songInput && songInput.value.trim() ? `「${songInput.value.trim()}」` : '';
        
        cdList.push({
          id: existingId,
          label: `${ordinal} ${typeStr}${sName} (${displayYear}年${m}月 [編集中])`
        });
      }
    }
  }

  if (cdList.length === 0) {
    cdList.push({ id: 'cd_default', label: '1st シングル (標準)' });
  }
  return cdList;
}

// 予定の日付フォーマット関数（例: 2027 7/21-22 または 2027 7/23）
function formatEventDateRange(dates, yearVal) {
  if (!Array.isArray(dates) || dates.length === 0) return `${yearVal} 未定`;
  const sorted = [...dates].filter(Boolean).sort();
  if (sorted.length === 0) return `${yearVal} 未定`;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const [fY, fM, fD] = first.split('-').map(Number);
  const [lY, lM, lD] = last.split('-').map(Number);

  if (sorted.length === 1 || (fY === lY && fM === lM && fD === lD)) {
    return `${yearVal} ${fM}/${fD}`;
  }

  if (fY === lY && fM === lM) {
    return `${yearVal} ${fM}/${fD}-${lD}`;
  }
  return `${yearVal} ${fM}/${fD}-${lM}/${lD}`;
}

function getConsecutiveDateGroups(dates) {
  const sorted = [...new Set((Array.isArray(dates) ? dates : []).filter(Boolean))].sort();
  const groups = [];
  sorted.forEach(date => {
    const previous = groups[groups.length - 1]?.[groups[groups.length - 1].length - 1];
    if (previous) {
      const next = getGameDateObject(previous);
      next.setDate(next.getDate() + 1);
      if (toDateKey(next) === date) {
        groups[groups.length - 1].push(date);
        return;
      }
    }
    groups.push([date]);
  });
  return groups;
}

function getEventSessionDrafts(event) {
  if (Array.isArray(event.sessions) && event.sessions.length) {
    return event.sessions.map(session => ({ ...session, dates: [...(session.dates || [])] }));
  }
  const dates = Array.isArray(event.dates) && event.dates.length ? event.dates : (event.date ? [event.date] : []);
  return [{
    name: event.name || BENEFIT_EVENT_TYPE_OPTIONS[0].name,
    venue: event.venue || '',
    dates,
    seatPrices: { ...(event.seatPrices || {}) }
  }];
}

// 日付Rowを表示する。（プレフィックスに応じてクラス名を正確に付与）
function renderShowDateRow(month, index, dateIndex, dateKey, isStream = true, prefix = 'show') {
  const inputClass = prefix === 'show' ? 'show-date-input' : 'event-show-date-input';
  const rowClass = prefix === 'show' ? 'show-date-row' : 'event-show-date-row';
  const onChangeHandler = prefix === 'show' 
    ? `updateShowDateNote(${month}, ${index});` 
    : `updateEventDateNote(${month}, ${index});`;
  
  return `
    <div class="${rowClass}" data-show-index="${dateIndex}" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
      <input type="date" class="${inputClass}" id="${prefix}-date-${month}-${index}-${dateIndex}"
        value="${dateKey || ''}" onfocus="initializePlanDateInput(this, ${month})" onchange="${onChangeHandler} renderEmbeddedPlanCalendars();">
      ${prefix === 'show' ? `
      <label style="font-size:11px; display:flex; align-items:center; gap:2px; white-space:nowrap; cursor:pointer;">
        <input type="checkbox" class="show-stream-input" id="show-stream-${month}-${index}-${dateIndex}"
          ${isStream ? 'checked' : ''} onchange="updateShowDateNote(${month}, ${index})">
        配信あり
      </label>` : ''}
      <button class="danger-btn" type="button" onclick="removeShowDate(${month}, ${index}, ${dateIndex}, '${prefix}', this)">削除</button>
    </div>`;
}

// ライブ枠HTMLを描画する。
function renderLiveSlotHtml(month, index, slot) {
  const isPrimary = index === 0;
  const seatPrices = slot.seatPrices || {};
  const seatOptions = slot.seatOptions || {};
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const slotVenue = venues.find(v => v.name === slot.liveVenue) || null;
  const streamDates = new Set(Array.isArray(slot.streamDates) ? slot.streamDates : []);
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];
  const hasDates = Array.isArray(slot.liveDates) && slot.liveDates.length > 0;
  const hasVenue = Boolean(slot.liveVenue);
  const showDetails = hasVenue || hasDates;

  return `
    <div class="live-slot" data-slot-index="${index}" style="border:1px solid #eadde1; padding:8px; border-radius:6px; margin-bottom:6px; background:#fff;">
      <div class="live-slot-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:12px; font-weight:bold; color:var(--primary);">ライブ枠 ${index + 1}</span>
        ${isPrimary ? '' : `<button class="danger-btn" type="button" onclick="removeLiveSlot(${month},${index})">削除</button>`}
      </div>
      <label class="weekly-member-target" for="sel-ven-${month}-${index}">会場
        <select id="sel-ven-${month}-${index}" onchange="onVenueSelectChange(${month}, ${index})" style="width:100%; padding:6px; font-size:11px; margin-top:3px;">
          <option value="">会場を選択</option>
          ${venues.map(v => `<option value="${v.name}" ${slot.liveVenue === v.name ? 'selected' : ''}>${v.name}(${v.cap}/${v.ease})</option>`).join('')}
        </select>
      </label>

      <div id="live-details-container-${month}-${index}" style="display: ${showDetails ? 'block' : 'none'}; margin-top:8px; border-top:1px dashed #eee; paddingTop:6px;">
        <label class="weekly-member-target" for="live-name-${month}-${index}">ライブ名
          <input type="text" id="live-name-${month}-${index}" maxlength="40" value="${escapeHtml(slot.liveName || '')}" placeholder="例: 春の全国ツアー" style="width:100%; padding:6px; font-size:11px; margin-top:3px; box-sizing:border-box;">
        </label>
        <div style="margin-top:6px; font-size:11px;">
          <div style="color:#555; margin-bottom:3px;">公演日・配信設定</div>
          <div id="show-dates-${month}-${index}" class="show-date-list">
             ${(slot.liveDates || []).map((dateKey, dateIndex) => 
              renderShowDateRow(month, index, dateIndex, dateKey, streamDates.has(dateKey), 'show')
            ).join('')}
          </div>
          <div class="show-date-actions" style="margin-top:4px;">
            <button class="plan-add-show-btn" type="button" onclick="addShowDate(${month}, ${index}, 'show')">＋公演日を追加</button>
          </div>
          <div id="show-date-note-${month}-${index}" class="show-date-note" style="margin-top:4px; font-size:10px; color:#666;"></div>
        </div>

        <details class="seat-settings" style="margin-top:6px;">
          <summary style="font-size:11px; cursor:pointer; font-weight:bold;">席種・チケット価格</summary>
          <div class="seat-settings-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-top:6px;">
            ${seatTypes.map(seat => {
              const price = seatPrices[seat.id] ?? getStandardSeatPrice(slotVenue, seat.id);
              const availability = seat.optional
                ? `<label class="seat-availability" style="font-size:10px;"><input type="checkbox" id="seat-option-${month}-${index}-${seat.id}" ${seatOptions[seat.id] ? 'checked' : ''}>設置する</label>`
                : '';
              return `<div class="seat-price-field" id="seat-row-${month}-${index}-${seat.id}" style="font-size:10px;"><label for="seat-price-${month}-${index}-${seat.id}" style="display:block;">${seat.name}（円）</label><input type="number" id="seat-price-${month}-${index}-${seat.id}" min="0" step="500" value="${price}" style="width:100%; padding:4px; font-size:10px; box-sizing:border-box;">${availability}</div>`;
            }).join('')}
          </div>
        </details>
      </div>
    </div>
  `;
}

// イベント枠HTMLを描画する。
function renderEventSlotHtml(month, index, event) {
  const allVenues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const venues = allVenues.filter(v => v.name.includes('パルス'));

  const cdList = getPlayerCdReleaseList();
  const currentCdId = event.targetCdId || (cdList[0] ? cdList[0].id : '');
  const sessions = getEventSessionDrafts(event);
  const hasDates = sessions.some(session => session.dates?.length);
  const hasVenue = sessions.some(session => session.venue);
  const showDetails = hasVenue || hasDates;

  return `
    <div class="plan-event-slot" data-event-slot-index="${index}" style="border:1px solid #eadde1; padding:8px; border-radius:6px; margin-bottom:6px; background:#fdf8f9;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:12px; font-weight:bold; color:#b8742a;">🎁 特典イベント枠 ${index + 1}</span>
        <button class="danger-btn" type="button" onclick="removePlanEvent(${month}, ${index})">削除</button>
      </div>

      <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#555; margin-bottom:6px;">
        <span>紐づくCD:</span>
        <select id="event-cd-${month}-${index}" style="font-size:11px; padding:4px; flex:1;">
          ${cdList.map(cd => `<option value="${cd.id}" ${cd.id === currentCdId ? 'selected' : ''}>${cd.label}</option>`).join('')}
        </select>
      </div>

      <div id="event-details-container-${month}-${index}" style="display: ${showDetails ? 'block' : 'none'}; margin-top:8px; border-top:1px dashed #eee; paddingTop:6px;">
        <div id="event-sessions-${month}-${index}">
          ${sessions.map((session, sessionIndex) => renderEventSessionHtml(month, index, sessionIndex, session)).join('')}
        </div>
        <button class="plan-add-show-btn" type="button" onclick="addEventShowDate(${month}, ${index})">＋開催日を追加</button>
        <button class="plan-add-show-btn" type="button" onclick="splitEventSessions(${month}, ${index})">日程を分離</button>
        <div id="event-date-note-${month}-${index}" style="margin-top:4px; font-size:10px; color:#666;"></div>
      </div>
    </div>
  `;
}

function renderEventSessionHtml(month, eventIndex, sessionIndex, session) {
  const venues = (typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : []).filter(v => v.name.includes('パルス'));
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];
  const venue = (typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : []).find(v => v.name === session.venue);
  const dates = session.dates || [];
  return `
    <div class="event-session" data-session-index="${sessionIndex}" style="border:1px solid #eadde1; padding:6px; margin:5px 0; border-radius:5px;">
      <div style="font-size:10px; color:#8a5a12; font-weight:bold;">設定単位 ${sessionIndex + 1}（${formatEventDateRange(dates, '')}）</div>
      <label style="display:block; font-size:11px; margin-top:4px;">イベント概要
        <select id="event-name-${month}-${eventIndex}-${sessionIndex}" onchange="updateEventDateNote(${month}, ${eventIndex})" style="width:100%; padding:5px;">
          ${BENEFIT_EVENT_TYPE_OPTIONS.map(opt => `<option value="${opt.name}" ${session.name === opt.name ? 'selected' : ''}>${opt.name} (${formatMoney(opt.baseCost)})</option>`).join('')}
        </select>
      </label>
      <label style="display:block; font-size:11px; margin-top:4px;">会場
        <select id="event-ven-${month}-${eventIndex}-${sessionIndex}" onchange="onEventVenueSelectChange(${month}, ${eventIndex}, ${sessionIndex})" style="width:100%; padding:5px;">
          <option value="">会場を選択</option>
          ${venues.map(v => `<option value="${v.name}" ${session.venue === v.name ? 'selected' : ''}>${v.name}(${v.cap}/${v.ease})</option>`).join('')}
        </select>
      </label>
      <div class="event-show-date-list" data-session-index="${sessionIndex}" style="margin-top:4px;">
        ${dates.map((dateKey, dateIndex) => renderShowDateRow(month, eventIndex, sessionIndex * 100 + dateIndex, dateKey, true, 'event-show')).join('')}
      </div>
      <details class="seat-settings" style="margin-top:5px;">
        <summary style="font-size:10px; cursor:pointer;">席種・チケット価格</summary>
        <div class="seat-settings-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:5px; margin-top:5px;">
          ${seatTypes.map(seat => `<div style="font-size:10px;"><label>${seat.name}（円）</label><input type="number" class="event-session-seat-price" data-seat-id="${seat.id}" min="0" step="500" value="${session.seatPrices?.[seat.id] ?? getStandardSeatPrice(venue, seat.id)}" style="width:100%; padding:4px;"></div>`).join('')}
        </div>
      </details>
    </div>`;
}

// 会場SelectChangeを処理する。
function onVenueSelectChange(month, index) {
  const selVen = document.getElementById(`sel-ven-${month}-${index}`);
  const detailsContainer = document.getElementById(`live-details-container-${month}-${index}`);
  const hasVenue = Boolean(selVen && selVen.value);

  if (detailsContainer) {
    detailsContainer.style.display = hasVenue ? 'block' : 'none';
  }

  if (hasVenue) {
    applyVenueStandardPrices(month, index);
    updateSeatPlanOptions(month, index);
    updateShowDateNote(month, index);
  }
  renderEmbeddedPlanCalendars();
}

// イベント会場SelectChangeを処理する。
function onEventVenueSelectChange(month, index, sessionIndex = 0) {
  const selVen = document.getElementById(`event-ven-${month}-${index}-${sessionIndex}`);
  const detailsContainer = document.getElementById(`event-details-container-${month}-${index}`);
  const hasVenue = Boolean(selVen && selVen.value);

  if (detailsContainer) {
    detailsContainer.style.display = hasVenue ? 'block' : 'none';
  }

  if (hasVenue) {
    updateEventDateNote(month, index);
  }
  renderEmbeddedPlanCalendars();
}

// ライブ枠Inputsを取得する。
function readLiveSlotInputs(month) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return [];
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];

  return Array.from(container.querySelectorAll('.live-slot')).map(slotEl => {
    const index = Number(slotEl.dataset.slotIndex);
    const venueVal = (document.getElementById(`sel-ven-${month}-${index}`) || {}).value || '';
    
    const dateInputs = slotEl.querySelectorAll('.show-date-input');
    const streamInputs = slotEl.querySelectorAll('.show-stream-input');
    const liveDates = [];
    const streamDates = [];

    dateInputs.forEach((dInput, dIdx) => {
      const val = dInput.value;
      if (val) {
        liveDates.push(val);
        if (streamInputs[dIdx] && streamInputs[dIdx].checked) {
          streamDates.push(val);
        }
      }
    });

    if (!venueVal && liveDates.length === 0) return null;

    const seatPrices = {};
    const seatOptions = {};
    const slotVenue = venues.find(v => v.name === venueVal) || null;

    seatTypes.forEach(seat => {
      const priceInput = document.getElementById(`seat-price-${month}-${index}-${seat.id}`);
      const price = Number.parseInt(priceInput ? priceInput.value : '', 10);
      seatPrices[seat.id] = Number.isFinite(price) && price >= 0 ? price : getStandardSeatPrice(slotVenue, seat.id);
      if (seat.optional) {
        const optionInput = document.getElementById(`seat-option-${month}-${index}-${seat.id}`);
        seatOptions[seat.id] = Boolean(optionInput && optionInput.checked);
      }
    });

    return {
      liveVenue: venueVal,
      liveName: (document.getElementById(`live-name-${month}-${index}`) || {}).value?.trim() || '',
      liveDate: liveDates[0] || '',
      liveDates: liveDates,
      streamDates: streamDates,
      seatPrices,
      seatOptions
    };
  }).filter(Boolean);
}

// イベント枠Inputsを取得する。
function readEventSlotInputs(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (!container) return [];
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];

  return Array.from(container.querySelectorAll('.plan-event-slot')).map(slotEl => {
    const index = Number(slotEl.dataset.eventSlotIndex);
    const targetCdId = (document.getElementById(`event-cd-${month}-${index}`) || {}).value || 'cd_default';
    const sessions = Array.from(slotEl.querySelectorAll('.event-session')).map((sessionEl, sessionIndex) => {
      const name = (document.getElementById(`event-name-${month}-${index}-${sessionIndex}`) || {}).value
        || BENEFIT_EVENT_TYPE_OPTIONS[0].name;
      const venue = (document.getElementById(`event-ven-${month}-${index}-${sessionIndex}`) || {}).value || '';
      const dates = Array.from(sessionEl.querySelectorAll('.event-show-date-input')).map(input => input.value).filter(Boolean);
      const seatPrices = {};
      sessionEl.querySelectorAll('.event-session-seat-price').forEach(input => {
        const price = Number.parseInt(input.value, 10);
        seatPrices[input.dataset.seatId] = Number.isFinite(price) && price >= 0
          ? price
          : getStandardSeatPrice(venues.find(v => v.name === venue), input.dataset.seatId);
      });
      return { name, venue, dates, seatPrices };
    }).filter(session => session.venue || session.dates.length);
    const dates = sessions.flatMap(session => session.dates).sort();
    const firstSession = sessions[0] || { name: BENEFIT_EVENT_TYPE_OPTIONS[0].name, venue: '', seatPrices: {} };

    if (!sessions.length && dates.length === 0) return null;

    if (sessions.some(session => {
      const venue = venues.find(v => v.name === session.venue);
      return venue && !venue.name.includes('パルス');
    })) {
      alert(`特典イベントには「パルス」に関連する会場のみ設定できます。`);
      return null;
    }

    return {
      slotIndex: index,
      name: firstSession.name,
      benefitId: BENEFIT_EVENT_TYPE_OPTIONS.find(option => option.name === firstSession.name)?.id || 'online-meeguri',
      venue: firstSession.venue,
      date: dates[0] || '',
      dates: dates,
      targetCdId: targetCdId,
      seatPrices: firstSession.seatPrices,
      sessions,
      completed: false
    };
  }).filter(Boolean);
}

// 日付メモを表示する。
function updateShowDateNote(month, index) {
  const note = document.getElementById(`show-date-note-${month}-${index}`);
  if (!note) return;
  const slotEl = document.querySelector(`#live-slots-${month} .live-slot[data-slot-index="${index}"]`);
  const venueSelect = document.getElementById(`sel-ven-${month}-${index}`);
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const venue = venues.find(item => item.name === (venueSelect ? venueSelect.value : ''));
  if (!venue) {
    note.textContent = '会場を選択してください';
    return;
  }

  const rows = slotEl ? slotEl.querySelectorAll('.show-date-row') : [];
  const dates = [];
  let streamCount = 0;

  rows.forEach(row => {
    const dInput = row.querySelector('.show-date-input');
    if (dInput && dInput.value) {
      dates.push(dInput.value);
      if (row.querySelector('.show-stream-input')?.checked) streamCount++;
    }
  });

  const exp = typeof calculateLiveExpenses === 'function'
    ? calculateLiveExpenses(venue.cap, dates.length, streamCount)
    : { baseCost: 0, streamCost: 0, totalCost: 0 };

  note.innerHTML = `公演数: ${dates.length}公演（配信${streamCount}公演）<br>諸経費(基本): ${formatMoney(exp.baseCost)} / 配信費用: ${formatMoney(exp.streamCost)}（合計 ${formatMoney(exp.totalCost)}）`;
  renderEmbeddedPlanCalendars();
}

// イベント日付メモを更新する。
function updateEventDateNote(month, index) {
  const note = document.getElementById(`event-date-note-${month}-${index}`);
  if (!note) return;
  const slotEl = document.querySelector(`#plan-events-${month} .plan-event-slot[data-event-slot-index="${index}"]`);
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const sessions = slotEl ? Array.from(slotEl.querySelectorAll('.event-session')).map((sessionEl, sessionIndex) => {
    const name = document.getElementById(`event-name-${month}-${index}-${sessionIndex}`)?.value || BENEFIT_EVENT_TYPE_OPTIONS[0].name;
    const venue = venues.find(item => item.name === document.getElementById(`event-ven-${month}-${index}-${sessionIndex}`)?.value);
    const dates = Array.from(sessionEl.querySelectorAll('.event-show-date-input')).map(input => input.value).filter(Boolean);
    return { name, venue, dates };
  }).filter(session => session.dates.length || session.venue) : [];
  const summaries = sessions.map(session => {
    const exp = calculateEventExpenses(session.name, session.venue, session.dates);
    return `${session.venue?.name || '会場未選択'} / ${formatMoney(exp.venueFee)}`;
  });
  note.innerHTML = summaries.length ? summaries.join('<br>') : '開催日と会場を設定してください';
  renderEmbeddedPlanCalendars();
}

// 日付を表示する。
function addShowDate(month, index, prefix = 'show') {
  const container = document.getElementById(prefix === 'show' ? `show-dates-${month}-${index}` : `event-show-dates-${month}-${index}`);
  if (!container) return;
  const dateIndex = container.querySelectorAll(`.${prefix === 'show' ? 'show-date-row' : 'event-show-date-row'}`).length;
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderShowDateRow(month, index, dateIndex, '', true, prefix);
  container.appendChild(tempWrapper.firstElementChild);
  if (prefix === 'show') updateShowDateNote(month, index);
  else updateEventDateNote(month, index);
  renderEmbeddedPlanCalendars();
}

// イベント公演日付を追加する。
function addEventShowDate(month, index) {
  const container = document.getElementById(`event-sessions-${month}-${index}`);
  const session = container?.lastElementChild;
  if (!session) return;
  const dateIndex = session.querySelectorAll('.event-show-date-row').length;
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderShowDateRow(month, index, Number(session.dataset.sessionIndex) * 100 + dateIndex, '', true, 'event-show');
  session.querySelector('.event-show-date-list').appendChild(tempWrapper.firstElementChild);
  updateEventDateNote(month, index);
}

function splitEventSessions(month, index) {
  const drafts = getPlanMonthEventDrafts(month);
  const slot = document.querySelector(`#plan-events-${month} .plan-event-slot[data-event-slot-index="${index}"]`);
  if (!slot) return;
  const current = readEventSlotInputs(month)[index];
  if (!current) return;
  const groups = getConsecutiveDateGroups(current.dates);
  if (groups.length <= 1) {
    alert('連続していない日程が複数ある場合に分離できます。');
    return;
  }
  drafts[index] = { ...current, sessions: groups.map(dates => ({
    name: current.name,
    venue: current.venue,
    dates,
    seatPrices: { ...(current.seatPrices || {}) }
  })) };
  refreshPlanEventsContainer(month);
  updateEventDateNote(month, index);
  renderEmbeddedPlanCalendars();
}

// 日付を表示する。
function removeShowDate(month, index, dateIndex, prefix = 'show', button = null) {
  const rowClass = prefix === 'show' ? 'show-date-row' : 'event-show-date-row';
  let row = button ? button.closest(`.${rowClass}`) : null;
  if (!row) {
    const container = document.getElementById(prefix === 'show' ? `show-dates-${month}-${index}` : `event-sessions-${month}-${index}`);
    row = container ? container.querySelector(`.${rowClass}[data-show-index="${dateIndex}"]`) : null;
  }
  if (!row) return;
  row.remove();
  if (prefix === 'show') updateShowDateNote(month, index);
  else updateEventDateNote(month, index);
  renderEmbeddedPlanCalendars();
}

// ライブ枠を追加する。
function addLiveSlot(month) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return;
  const currentCount = container.querySelectorAll('.live-slot').length;
  const maxVenues = 8;
  if (currentCount >= maxVenues) {
    alert(`1か月あたりのライブ会場は最大${maxVenues}会場までです。`);
    return;
  }
  const newSlot = {
    liveVenue: '',
    liveName: '',
    liveDate: '',
    liveDates: [],
    streamDates: [],
    seatPrices: {},
    seatOptions: {}
  };
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderLiveSlotHtml(month, currentCount, newSlot);
  container.appendChild(tempWrapper.firstElementChild);
  renderEmbeddedPlanCalendars();
}

// ライブ枠を削除する。
function removeLiveSlot(month, index) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return;
  const slotEl = container.querySelector(`.live-slot[data-slot-index="${index}"]`);
  if (slotEl) slotEl.remove();
  renderEmbeddedPlanCalendars();
}

// 会場Standard価格を適用。
function applyVenueStandardPrices(month, index) {
  const selVen = document.getElementById(`sel-ven-${month}-${index}`);
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const venue = venues.find(item => item.name === (selVen ? selVen.value : ''));
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];
  seatTypes.forEach(seat => {
    const priceInput = document.getElementById(`seat-price-${month}-${index}-${seat.id}`);
    if (priceInput) priceInput.value = getStandardSeatPrice(venue, seat.id);
  });
}

// 席計画Optionsを更新する。
function updateSeatPlanOptions(month, index) {
  const selVen = document.getElementById(`sel-ven-${month}-${index}`);
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const venue = venues.find(item => item.name === (selVen ? selVen.value : ''));
  const isDome = Boolean(venue && typeof isStadiumVenue === 'function' && isStadiumVenue(venue));
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];
  seatTypes.forEach(seat => {
    const row = document.getElementById(`seat-row-${month}-${index}-${seat.id}`);
    if (!row) return;
    if (seat.domeOnly) {
      row.style.display = isDome ? 'flex' : 'none';
    }
  });
}

// 計画イベントHTMLを描画する。
function renderPlanEventsHtml(month) {
  const events = getPlanMonthEventDrafts(month);
  if (!events.length) return '';
  return events.map((event, index) => renderEventSlotHtml(month, index, event)).join('');
}

// 計画イベントを追加する。
function addPlanEvent(month) {
  const drafts = getPlanMonthEventDrafts(month);
  const maxEvents = 6;
  if (drafts.length >= maxEvents) {
    alert(`1か月あたりのイベント枠は最大${maxEvents}件までです。`);
    return;
  }
  const cdList = getPlayerCdReleaseList();
  drafts.push({
    name: BENEFIT_EVENT_TYPE_OPTIONS[0].name,
    venue: '',
    date: '',
    dates: [],
    targetCdId: cdList[0] ? cdList[0].id : 'cd_default',
    seatPrices: {},
    completed: false
  });
  refreshPlanEventsContainer(month);
}

// 計画イベントを削除する。
function removePlanEvent(month, index) {
  const drafts = getPlanMonthEventDrafts(month);
  // 入力途中の内容を失わないよう、再描画前に現在の入力値を下書きへ反映する
  readEventSlotInputs(month).forEach(input => {
    const { slotIndex, ...draft } = input;
    if (slotIndex >= 0 && slotIndex < drafts.length) drafts[slotIndex] = draft;
  });
  if (index >= 0 && index < drafts.length) {
    drafts.splice(index, 1);
  }
  refreshPlanEventsContainer(month);
  renderEmbeddedPlanCalendars();
}

// refresh計画イベントContainerを処理する。
function refreshPlanEventsContainer(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (container) {
    container.innerHTML = renderPlanEventsHtml(month);
  }
}

// ChangeCancelを検証する。
function validateChangeOrCancel(targetDateStr) {
  if (!targetDateStr) return true;
  const targetDate = new Date(`${targetDateStr}T12:00:00`);
  const currentGameDate = getGameDateObject();
  const diffDays = Math.round((targetDate - currentGameDate) / 86400000);

  if (diffDays <= 30) {
    alert(`実施予定日（${targetDateStr}）の1か月前を切っているため、変更およびキャンセルを行うことはできません。`);
    return false;
  }
  return true;
}

// スケジュールActionを適用
function applyScheduleAction(month, actionType) {
  const actualYear = getPlanActualYear();
  const monthFirstDate = new Date(actualYear, month - 1, 1, 12);
  const currentGameDate = getGameDateObject();
  const diffDaysToMonth = Math.round((monthFirstDate - currentGameDate) / 86400000);

  const isCurrentlyPlanningTarget = (month >= planStartM && month <= planEndM);

  if (!isCurrentlyPlanningTarget && diffDaysToMonth <= 180) {
    alert(`この月の予定はゲーム内日付から見て半年（180日）以内のため、カレンダーからの直接変更・追加はロックされています。修正は「上記予定の変更／取消を行う」ボタンから行ってください。`);
    return;
  }

  const selections = planCalendarSelections[month] || [];

  if (selections.length === 0) {
    alert('カレンダー上で対象の日付をタップして選択してください。');
    return;
  }

  let targetDates = [...selections];

  for (const d of targetDates) {
    if (actionType === 'delete' || actionType === 'release' || actionType === 'live') {
      if (!validateChangeOrCancel(d)) return;
    }
  }

  if (actionType === 'live' || actionType === 'release-live') {
    let slots = readLiveSlotInputs(month);
    if (slots.length === 0) {
      addLiveSlot(month);
      slots = readLiveSlotInputs(month);
    }
    const container = document.getElementById(`live-slots-${month}`);
    if (container) {
      let slotEl = container.querySelector('.live-slot');
      if (!slotEl) {
        addLiveSlot(month);
        slotEl = container.querySelector('.live-slot');
      }
      if (slotEl) {
        const slotIndex = slotEl.dataset.slotIndex;
        const detailsContainer = document.getElementById(`live-details-container-${month}-${slotIndex}`);
        if (detailsContainer) detailsContainer.style.display = 'block';

        const showDatesContainer = document.getElementById(`show-dates-${month}-${slotIndex}`);
        if (showDatesContainer) {
          const existingDateInputs = Array.from(showDatesContainer.querySelectorAll('.show-date-input')).map(i => i.value).filter(Boolean);
          const combinedDates = Array.from(new Set([...existingDateInputs, ...targetDates])).sort();

          showDatesContainer.innerHTML = combinedDates.map((dKey, dIdx) => 
            renderShowDateRow(month, Number(slotIndex), dIdx, dKey, true, 'show')
          ).join('');
          updateShowDateNote(month, Number(slotIndex));
        }
      }
    }

    if (actionType === 'release-live' && targetDates.length > 0) {
      const relInput = document.getElementById(`rel-date-${month}`);
      const selRel = document.getElementById(`sel-rel-${month}`);
      const releaseFields = document.getElementById(`release-fields-${month}`);
      if (relInput) {
        relInput.value = targetDates[0];
        if (selRel && selRel.value === 'none') selRel.value = 'single';
        if (releaseFields) releaseFields.style.display = 'block';
      }
    }
  } else if (actionType === 'release') {
    const relInput = document.getElementById(`rel-date-${month}`);
    const selRel = document.getElementById(`sel-rel-${month}`);
    const releaseFields = document.getElementById(`release-fields-${month}`);
    if (relInput && targetDates.length > 0) {
      relInput.value = targetDates[0];
      if (selRel && selRel.value === 'none') {
        selRel.value = 'single';
      }
      if (releaseFields) releaseFields.style.display = 'block';
    }
  } else if (actionType === 'event-benefit' || actionType === 'event-other') {
    let eventSlots = readEventSlotInputs(month);
    if (eventSlots.length === 0) {
      addPlanEvent(month);
    }
    const container = document.getElementById(`plan-events-${month}`);
    if (container) {
      let slotEl = container.querySelector('.plan-event-slot');
      if (slotEl) {
        const slotIndex = slotEl.dataset.eventSlotIndex;
        const detailsContainer = document.getElementById(`event-details-container-${month}-${slotIndex}`);
        if (detailsContainer) detailsContainer.style.display = 'block';

        const showDatesContainer = document.querySelector(`#event-sessions-${month}-${slotIndex} .event-show-date-list`);
        if (showDatesContainer) {
          const existingDateInputs = Array.from(showDatesContainer.querySelectorAll('.event-show-date-input')).map(i => i.value).filter(Boolean);
          const combinedDates = Array.from(new Set([...existingDateInputs, ...targetDates])).sort();

          showDatesContainer.innerHTML = combinedDates.map((dKey, dIdx) => 
            renderShowDateRow(month, Number(slotIndex), dIdx, dKey, true, 'event-show')
          ).join('');
          updateEventDateNote(month, Number(slotIndex));
        }
      }
    }
  } else if (actionType === 'delete') {
    targetDates.forEach(d => {
      const container = document.getElementById(`live-slots-${month}`);
      if (container) {
        container.querySelectorAll('.live-slot').forEach(slotEl => {
          const dateInputs = slotEl.querySelectorAll('.show-date-input');
          dateInputs.forEach(inp => {
            if (inp.value === d) {
              inp.value = '';
              const row = inp.closest('.show-date-row');
              if (row) row.remove();
            }
          });
          updateShowDateNote(month, Number(slotEl.dataset.slotIndex));
        });
      }
      const eventContainer = document.getElementById(`plan-events-${month}`);
      if (eventContainer) {
        eventContainer.querySelectorAll('.plan-event-slot').forEach(slotEl => {
          const dateInputs = slotEl.querySelectorAll('.event-show-date-input');
          dateInputs.forEach(inp => {
            if (inp.value === d) {
              inp.value = '';
              const row = inp.closest('.event-show-date-row');
              if (row) row.remove();
            }
          });
          updateEventDateNote(month, Number(slotEl.dataset.eventSlotIndex));
        });
      }
      const relInput = document.getElementById(`rel-date-${month}`);
      if (relInput && relInput.value === d) {
        relInput.value = '';
      }
    });
  }

  planCalendarSelections[month] = [];
  renderEmbeddedPlanCalendars();
}

// ==========================================
// 12.5 確定済み予定の変更・取消モーダル機能
// ==========================================
function openModifyExistingPlansModal() {
  let modal = document.getElementById('modify-plans-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modify-plans-modal';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; align-items:center; justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff; width:90%; max-width:650px; max-height:85vh; border-radius:8px; padding:16px; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:12px;">
          <h3 id="modify-plans-title" style="margin:0; font-size:15px; color:var(--primary);">📅 確定済み予定の変更／取消</h3>
          <button type="button" onclick="closeModifyExistingPlansModal()" style="background:none; border:none; font-size:16px; cursor:pointer; font-weight:bold;">✕</button>
        </div>
        <div id="modify-plans-body" style="overflow-y:auto; flex:1; font-size:12px; display:flex; flex-direction:column; gap:10px;"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const bodyEl = document.getElementById('modify-plans-body');
  const titleEl = document.getElementById('modify-plans-title');
  const currentY = typeof currentYear !== 'undefined' ? currentYear : 1;
  const currentM = typeof currentMonth !== 'undefined' ? currentMonth : 1;
  const gameYearVal = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined') ? calendarYear : currentY;

  if (titleEl) {
    titleEl.textContent = `📅 確定済み予定の変更／取消 (${gameYearVal}年${currentM}月〜 半年以内)`;
  }

  let scheduleItems = [];
  const currentGameDate = getGameDateObject();

  for (let y = currentY; y <= currentY + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === currentY && m < currentM) continue;
      
      const pKey = `${y}-${m}`;
      const p = (typeof productionSchedule !== 'undefined' && productionSchedule[pKey]) ? productionSchedule[pKey] : null;
      if (!p) continue;

      const displayYearVal = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined') ? calendarYear + (y - currentYear) : y;

      if (p.release && p.release !== 'none') {
        const relDateStr = p.releaseDate || `${displayYearVal}-${String(m).padStart(2, '0')}-01`;
        const relDateObj = new Date(`${relDateStr}T12:00:00`);
        const diffDays = Math.round((relDateObj - currentGameDate) / 86400000);

        if (diffDays >= 0 && diffDays <= 180) {
          const relType = p.release === 'album' ? 'アルバム発売' : 'CD発売';
          const songLabel = p.songName ? `(${p.songName})` : '';
          const dateStr = formatEventDateRange([p.releaseDate], displayYearVal);
          scheduleItems.push({
            pKey,
            dateStr: p.releaseDate || relDateStr,
            sortDate: relDateStr,
            kind: 'release',
            standardCost: (typeof getCdPlanStandardCost === 'function') ? getCdPlanStandardCost(p) : 0,
            label: `${dateStr} ${relType}${songLabel}`
          });
        }
      }

      if (p.liveVenue) {
        const liveDatesArr = Array.isArray(p.liveDates) && p.liveDates.length > 0 ? p.liveDates : (p.liveDate ? [p.liveDate] : []);
        const firstLiveDate = liveDatesArr[0] || `${displayYearVal}-${String(m).padStart(2, '0')}-01`;
        const liveDateObj = new Date(`${firstLiveDate}T12:00:00`);
        const diffDays = Math.round((liveDateObj - currentGameDate) / 86400000);

        if (diffDays >= 0 && diffDays <= 180) {
          const dateStr = formatEventDateRange(liveDatesArr, displayYearVal);
          const liveTitle = p.liveName ? p.liveName : 'ライブ';
          scheduleItems.push({
            pKey,
            dateStr: firstLiveDate,
            sortDate: firstLiveDate,
            kind: 'live',
            standardCost: (typeof getLivePlanStandardCost === 'function') ? getLivePlanStandardCost(p) : 0,
            label: `${dateStr} ${liveTitle}`
          });
        }
      }

      if (Array.isArray(p.additionalLives)) {
        p.additionalLives.forEach(al => {
          if (!al || !al.liveVenue) return;
          const alDatesArr = Array.isArray(al.liveDates) && al.liveDates.length > 0 ? al.liveDates : (al.liveDate ? [al.liveDate] : []);
          const firstAlDate = alDatesArr[0] || `${displayYearVal}-${String(m).padStart(2, '0')}-01`;
          const alDateObj = new Date(`${firstAlDate}T12:00:00`);
          const diffDays = Math.round((alDateObj - currentGameDate) / 86400000);

          if (diffDays >= 0 && diffDays <= 180) {
            const dateStr = formatEventDateRange(alDatesArr, displayYearVal);
            const liveTitle = al.liveName ? al.liveName : 'ライブ';
            scheduleItems.push({
              pKey,
              dateStr: firstAlDate,
              sortDate: firstAlDate,
              kind: 'live',
              standardCost: (typeof getLivePlanStandardCost === 'function') ? getLivePlanStandardCost(al) : 0,
              label: `${dateStr} ${liveTitle}`
            });
          }
        });
      }

      if (Array.isArray(p.planEvents)) {
        p.planEvents.forEach(ev => {
          if (!ev) return;
          const evDatesArr = Array.isArray(ev.dates) && ev.dates.length > 0 ? ev.dates : (ev.date ? [ev.date] : []);
          const firstEvDate = evDatesArr[0] || `${displayYearVal}-${String(m).padStart(2, '0')}-01`;
          const evDateObj = new Date(`${firstEvDate}T12:00:00`);
          const diffDays = Math.round((evDateObj - currentGameDate) / 86400000);

          if (diffDays >= 0 && diffDays <= 180) {
            const dateStr = formatEventDateRange(evDatesArr, displayYearVal);
            const evTitle = ev.name ? ev.name : 'その他イベント';
            scheduleItems.push({
              pKey,
              dateStr: firstEvDate,
              sortDate: firstEvDate,
              kind: 'event',
              standardCost: (typeof getEventPlanStandardCost === 'function') ? getEventPlanStandardCost(ev) : 0,
              label: `${dateStr} ${evTitle}`
            });
          }
        });
      }
    }
  }

  scheduleItems.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  let schedulesHtml = '';
  scheduleItems.forEach(item => {
    schedulesHtml += `
      <div style="border:1px solid #eadde1; padding:8px 12px; border-radius:6px; background:#fafafa; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:bold; color:#333; font-size:12px;">
          ${item.label}
        </div>
        <div style="display:flex; gap:6px;">
          <button class="main-btn" type="button" onclick="requestModifyExistingPlan('${item.pKey}', '${item.dateStr}', 1, ${item.standardCost || 0})" style="padding:4px 8px; font-size:10px;">変更</button>
          <button class="danger-btn" type="button" onclick="requestCancelExistingPlan('${item.pKey}', '${item.dateStr}', ${item.standardCost || 0})" style="padding:4px 8px; font-size:10px;">取消</button>
        </div>
      </div>
    `;
  });

  // 3か月先〜6か月先の範囲の月に「予定を追加」できるボタンを用意する
  const addMonthButtons = [];
  for (let fwd = 3; fwd <= 6; fwd++) {
    let m = currentM + fwd;
    let y = currentY;
    while (m > 12) { m -= 12; y += 1; }
    const dispY = gameYearVal + (y - currentY);
    addMonthButtons.push(
      `<button type="button" class="ghost-btn" onclick="openAddPlanForMonth(${y}, ${m})" style="padding:4px 8px; font-size:10px; background:#fff; border:1px solid var(--primary); color:var(--primary); border-radius:4px; cursor:pointer;">＋ ${dispY}年${m}月</button>`
    );
  }
  const addMonthHtml = `
    <div style="font-size:11px; color:#666; line-height:1.4; background:#fdf2f4; padding:8px; border-radius:6px;">
      ➕ 予定の追加：3か月先〜6か月先の月を選んで、その月に予定を追加できます。追加時は通常会費の1.2倍の費用がかかります。
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      ${addMonthButtons.join('')}
    </div>
  `;

  bodyEl.innerHTML = `
    <div style="font-size:11px; color:#666; line-height:1.4; background:#fdf2f4; padding:8px; border-radius:6px;">
      ℹ️ ルール：ゲーム内日付から見て半年（180日）以内に開催予定の予定のみ表示されます。<br>
      ・半年後以降（180日超）：追加費用・取消ペナルティなし（無料）<br>
      ・半年〜3ヶ月前：変更時追加2割 / 取消時3割支払い<br>
      ・3ヶ月〜1ヶ月前：変更不可 / 取消時5割支払い<br>
      ・1ヶ月前以内：変更・取消ともに不可
    </div>
    ${addMonthHtml}
    ${scheduleItems.length > 0 ? schedulesHtml : '<div style="color:#888; text-align:center; padding:20px;">半年以内に該当する変更可能な確定済み予定はありません。</div>'}
  `;

  modal.style.display = 'flex';
}

function closeModifyExistingPlansModal() {
  const modal = document.getElementById('modify-plans-modal');
  if (modal) modal.style.display = 'none';
}

function requestModifyExistingPlan(pKey, targetDateStr, month, standardCost = 0) {
  if (!targetDateStr) {
    alert('対象の日付が不明なため変更できません。');
    return;
  }
  const targetDate = new Date(`${targetDateStr}T12:00:00`);
  const currentGameDate = getGameDateObject();
  const diffDays = Math.round((targetDate - currentGameDate) / 86400000);

  if (diffDays <= 30) {
    alert('実施予定日の1か月前を切っているため、変更を行うことはできません。');
    return;
  }

  if (diffDays <= 90) {
    alert('実施予定日まで3ヶ月以内（3ヶ月〜1ヶ月前）の期間に入っているため、この予定の変更は不可となっています。');
    return;
  }

  let addFeeRate = 0;
  let rangeStr = '半年後以降';
  if (diffDays <= 180) {
    addFeeRate = 0.2;
    rangeStr = '半年〜3ヶ月前';
  }

  const addFee = Math.round((standardCost || 0) * addFeeRate);
  let msg = `【予定の変更 (${rangeStr})】\nこの予定の変更を行います。続行しますか？`;
  if (addFeeRate > 0) {
    msg = `【予定の変更 (${rangeStr})】\n通常会費 ${formatMoney(standardCost || 0)} に対し、手数料として ${addFeeRate * 100}%（${formatMoney(addFee)}）の追加料金が徴収されます。続行しますか？`;
  }

  if (!confirm(msg)) {
    return;
  }

  if (addFee > 0) {
    funds -= addFee;
    if (typeof recordMonthlyExpense === 'function') recordMonthlyExpense('予定変更手数料', addFee);
  }
  closeModifyExistingPlansModal();
  closeDecisionModal();
  openDecisionModal(`予定の変更・再調整`, planYearTarget, month, month);
  setLog(`【予定変更】 ${pKey} の変更手続きを受け付けました。${addFee > 0 ? `（手数料 ${formatMoney(addFee)} 徴収）` : ''}`);
}

function requestCancelExistingPlan(pKey, targetDateStr, standardCost = 0) {
  if (!targetDateStr) {
    alert('対象の日付が不明なため処理できません。');
    return;
  }
  const targetDate = new Date(`${targetDateStr}T12:00:00`);
  const currentGameDate = getGameDateObject();
  const diffDays = Math.round((targetDate - currentGameDate) / 86400000);

  if (diffDays <= 30) {
    alert('実施予定日の1か月前を切っているため、取り消しを行うことはできません。');
    return;
  }

  let penaltyRate = 0;
  let rangeStr = '半年後以降';
  if (diffDays <= 90) {
    penaltyRate = 0.5;
    rangeStr = '3ヶ月〜1ヶ月前';
  } else if (diffDays <= 180) {
    penaltyRate = 0.3;
    rangeStr = '半年〜3ヶ月前';
  }

  const penalty = Math.round((standardCost || 0) * penaltyRate);
  let msg = `【予定の取り消し (${rangeStr})】\nこの予定を取り消します。ペナルティなしで実行しますか？`;
  if (penaltyRate > 0) {
    msg = `【予定の取り消し (${rangeStr})】\n通常会費 ${formatMoney(standardCost || 0)} に対し、キャンセル料として ${penaltyRate * 100}％（${formatMoney(penalty)}）が徴収されます。実行しますか？`;
  }

  if (!confirm(msg)) {
    return;
  }

  if (penalty > 0) {
    funds -= penalty;
    if (typeof recordMonthlyExpense === 'function') recordMonthlyExpense('予定取消料', penalty);
  }
  if (typeof productionSchedule !== 'undefined' && productionSchedule[pKey]) {
    delete productionSchedule[pKey];
  }

  setLog(`【予定取消】 ${pKey} の予定を取り消しました。${penalty > 0 ? `（キャンセル料 ${formatMoney(penalty)} 徴収）` : ''}`);
  alert('予定を取り消しました。');
  closeModifyExistingPlansModal();
  if (typeof updateUI === 'function') updateUI();
}

// 指定月（ゲーム年yearTarget／月month）に予定を追加するため、その月の計画編集を開く。
// 「確定済み予定の変更／取消」モーダルから、3か月先〜6か月先の月に対して呼ばれる。
// 追加モードでは、保存時に通常会費の1.2倍の追加料を徴収する。
function openAddPlanForMonth(yearTarget, month) {
  closeModifyExistingPlansModal();
  closeDecisionModal();
  const dispY = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined')
    ? calendarYear + (yearTarget - currentYear)
    : yearTarget;
  openDecisionModal(`予定の追加（${dispY}年${month}月）`, yearTarget, month, month, true, true);
  setLog(`【予定追加】 ${dispY}年${month}月の予定を追加します。保存時に通常会費の1.2倍の追加料が徴収されます。`);
}

// Decisionモーダルを開く。
// allowPastMonths=true のときは、現在月より前の月も編集対象とする（当月〜3か月前への予定追加用）。
// isAddMode=true のときは「予定の追加」モード。保存時に通常会費の1.2倍の追加料を徴収する。
function openDecisionModal(title, yearTarget, startM, endM, allowPastMonths = false, isAddMode = false) {
  try {
    planYearTarget = yearTarget;
    planStartM = startM;
    planEndM = endM;
    planAllowPastMonths = allowPastMonths;
    planIsAddMode = isAddMode;
    planMonthEventDrafts = {};
    planMultiSelectModes = {};
    planCalendarSelections = {};

    const modal = document.getElementById('decision-modal');
    if (modal) {
      modal.style.display = 'flex';
      const contentEl = modal.querySelector('.modal-content');
      if (contentEl) {
        contentEl.style.position = 'relative';
        contentEl.style.maxHeight = '85vh';
        contentEl.style.overflowY = 'auto';
        contentEl.style.paddingTop = '10px';
      }
    }

    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = title;

    if (modal) {
      const contentEl = modal.querySelector('.modal-content');
      if (contentEl) {
        contentEl.querySelectorAll('.sticky-close-btn').forEach(el => el.remove());

        const stickyClose = document.createElement('button');
        stickyClose.type = 'button';
        stickyClose.className = 'sticky-close-btn';
        stickyClose.textContent = '✕';
        stickyClose.style.cssText = 'position: sticky; top: -10px; float: right; z-index: 999; background: #fff; border: 1px solid #ddd; width: 32px; height: 32px; font-size: 16px; font-weight: bold; cursor: pointer; color: #666; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1); margin-bottom: -20px;';
        stickyClose.onclick = closeDecisionModal;
        contentEl.prepend(stickyClose);
      }
    }

    try {
      if ((!rivalLiveBookings || rivalLiveBookings.length === 0) && typeof generateRivalsAndGeneralSchedule === 'function') {
        generateRivalsAndGeneralSchedule(yearTarget, 1, true);
      }
    } catch (err) {
      console.warn('Rival schedule generation warning:', err);
    }

    const summaryBox = document.getElementById('prev-plan-summary');
    if (summaryBox) {
      let currentY = typeof yearTarget !== 'undefined' ? yearTarget : (typeof currentYear !== 'undefined' ? currentYear : 1);
      let currentM = typeof currentMonth !== 'undefined' ? currentMonth : 1;
      
      let upcomingSchedules = [];
      const currentGameDate = getGameDateObject();
      const gameYearVal = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined') ? calendarYear : currentY;

      for (let y = currentY; y <= currentY + 1; y++) {
        for (let m = 1; m <= 12; m++) {
          if (y === currentY && m < currentM) continue;
          const pKey = `${y}-${m}`;
          if (typeof productionSchedule !== 'undefined' && productionSchedule[pKey]) {
            const p = productionSchedule[pKey];
            const displayY = (typeof calendarYear !== 'undefined' && typeof currentYear !== 'undefined') ? calendarYear + (y - currentYear) : y;

            if (p.release && p.release !== 'none') {
              const relDateStr = p.releaseDate || `${displayY}-${String(m).padStart(2, '0')}-01`;
              const relDateObj = new Date(`${relDateStr}T12:00:00`);
              const diffDays = Math.round((relDateObj - currentGameDate) / 86400000);
              if (diffDays >= 0 && diffDays <= 180) {
                const relType = p.release === 'album' ? 'アルバム発売' : 'CD発売';
                const songLabel = p.songName ? `（${p.songName}）` : '';
                const dateStr = formatEventDateRange([p.releaseDate], displayY);
                upcomingSchedules.push(`・${dateStr} ${relType}${songLabel}`);
              }
            }

            if (p.liveVenue) {
              const liveDatesArr = Array.isArray(p.liveDates) && p.liveDates.length > 0 ? p.liveDates : (p.liveDate ? [p.liveDate] : []);
              const firstLiveDate = liveDatesArr[0] || `${displayY}-${String(m).padStart(2, '0')}-01`;
              const liveDateObj = new Date(`${firstLiveDate}T12:00:00`);
              const diffDays = Math.round((liveDateObj - currentGameDate) / 86400000);
              if (diffDays >= 0 && diffDays <= 180) {
                const dateStr = formatEventDateRange(liveDatesArr, displayY);
                const liveTitle = p.liveName ? p.liveName : 'ライブ';
                const venueLabel = p.liveVenue ? `（${p.liveVenue}）` : '';
                upcomingSchedules.push(`・${dateStr} ${liveTitle}${venueLabel}`);
              }
            }

            if (Array.isArray(p.planEvents)) {
              p.planEvents.forEach(ev => {
                if (!ev) return;
                const evDatesArr = Array.isArray(ev.dates) && ev.dates.length > 0 ? ev.dates : (ev.date ? [ev.date] : []);
                const firstEvDate = evDatesArr[0] || `${displayY}-${String(m).padStart(2, '0')}-01`;
                const evDateObj = new Date(`${firstEvDate}T12:00:00`);
                const diffDays = Math.round((evDateObj - currentGameDate) / 86400000);
                if (diffDays >= 0 && diffDays <= 180) {
                  const dateStr = formatEventDateRange(evDatesArr, displayY);
                  const evTitle = ev.name ? ev.name : 'その他イベント';
                  const evVenueLabel = ev.venue ? `（${ev.venue}）` : '';
                  upcomingSchedules.push(`・${dateStr} ${evTitle}${evVenueLabel}`);
                }
              });
            }
          }
        }
      }

      summaryBox.innerHTML = `
        <strong>【確定済み予定（${gameYearVal}年${currentM}月〜 半年以内）】</strong><br>
        ${upcomingSchedules.length > 0 ? upcomingSchedules.slice(0, 6).join('<br>') : '・現在半年以内に確定している将来の予定はありません。'}
        <div style="margin-top: 8px;">
          <button type="button" class="ghost-btn" onclick="openModifyExistingPlansModal()" style="padding:4px 8px; font-size:11px; background:#fff; border:1px solid var(--primary); color:var(--primary); border-radius:4px; cursor:pointer;">上記予定の変更／取消を行う</button>
        </div>
      `;
    }
    
    const container = document.getElementById('plan-rows');
    if (!container) return;
    container.innerHTML = '';

    const presetRelType = typeof PRESET_RELEASE_TYPE !== 'undefined' ? PRESET_RELEASE_TYPE : 'single';
    const actualYear = getPlanActualYear();

    const wrapperDiv = document.createElement('div');
    wrapperDiv.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

    const effectiveStartM = (!planAllowPastMonths && typeof currentMonth !== 'undefined' && yearTarget === currentYear && currentMonth > startM) ? currentMonth : startM;

    for (let m = effectiveStartM; m <= endM; m++) {
      const targetMonthPrefix = `${actualYear}-${String(m).padStart(2, '0')}`;
      
      const monthRivals = Array.isArray(rivalLiveBookings) ? rivalLiveBookings.filter(b => {
        if (!b || b.hiddenFromPlayer || b.type === 'baseball' || b.type === 'dummy') return false;
        const bDate = b.liveDate || b.date || '';
        const bDates = Array.isArray(b.liveDates) ? b.liveDates : [];
        return bDate.startsWith(targetMonthPrefix) || bDates.some(d => d.startsWith(targetMonthPrefix));
      }) : [];

      monthRivals.sort((a, b) => {
        const dateA = a.liveDate || a.date || (Array.isArray(a.liveDates) ? a.liveDates[0] : '') || '';
        const dateB = b.liveDate || b.date || (Array.isArray(b.liveDates) ? b.liveDates[0] : '') || '';
        return dateA.localeCompare(dateB);
      });

      const monthRivalsHtml = monthRivals.length > 0 
        ? `<div style="background:#f9f9f9; border:1px solid #ddd; padding:8px; border-radius:4px; font-size:11px; margin-bottom:8px; max-height:130px; overflow-y:auto;">
             <strong style="color:#d9534f;">📌 今月のライバル動向 (${monthRivals.length}件・日付順)</strong>
             <ul style="margin:4px 0 0 16px; padding:0; color:#333; line-height:1.4;">
               ${monthRivals.map(r => {
                 const matchDay = (r.liveDate || r.date || '').split('-')[2] || '??';
                 const gName = r.groupName || r.name || r.teamName || '他グループ';
                 const vName = r.liveVenue || r.venue || r.place || '会場未定';
                 const isRel = r.type === 'release' || (r.liveName && r.liveName.includes('リリース'));
                 
                 let dayStr = `${parseInt(matchDay)}日`;
                 if (Array.isArray(r.liveDates) && r.liveDates.length > 1) {
                   const lastDay = r.liveDates[r.liveDates.length - 1].split('-')[2];
                   dayStr = `${parseInt(matchDay)}日〜${parseInt(lastDay)}日`;
                 }

                 const kindStr = isRel ? '💿 CD発売' : `🎤 ライブ [<strong>${vName}</strong>]`;
                 return `<li><strong>${dayStr}</strong>: ${gName} —${kindStr}</li>`;
               }).join('')}
             </ul>
           </div>`
        : `<div style="font-size:11px; color:#888; margin-bottom:8px;">📌 今月のライバル動向: 予定なし</div>`;

      const planKey = `${yearTarget}-${m}`;
      let existingPlan = (typeof productionSchedule !== 'undefined' && productionSchedule[planKey]) ? productionSchedule[planKey] : {};
      
      const isPreset = typeof isPresetReleaseMonth === 'function' ? isPresetReleaseMonth(m) : false;
      if ((!existingPlan.release || existingPlan.release === 'none') && isPreset) {
        existingPlan = {
          release: presetRelType,
          releaseDate: (typeof getPlanReleaseDefaultWednesday === 'function') ? getPlanReleaseDefaultWednesday(m) : ''
        };
      }

      const releaseValue = isPreset ? presetRelType : (existingPlan.release || 'none');
      const liveEntries = (typeof getMonthLiveEntries === 'function') ? getMonthLiveEntries(existingPlan) : [];
      const liveSlots = liveEntries.length ? liveEntries.map(e => ({
        liveVenue: e.liveVenue,
        liveName: e.liveName,
        liveDate: e.liveDate,
        liveDates: e.liveDates || [],
        streamDates: Array.isArray(e.streamDates) ? e.streamDates : [],
        seatPrices: e.seatPrices || {},
        seatOptions: e.seatOptions || {}
      })) : [];

      const defaultRelDate = existingPlan.releaseDate || (releaseValue !== 'none' ? getPlanReleaseDefaultWednesday(m) : '');
      const hasRelease = releaseValue !== 'none';

      const monthWrapper = document.createElement('div');
      monthWrapper.className = 'plan-month-wrapper';
      monthWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;';

      const calendarCard = document.createElement('div');
      calendarCard.style.cssText = 'background: #fff; border: 1px solid #eadde1; padding: 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);';
      calendarCard.innerHTML = `
        <div style="font-size: 13px; font-weight: bold; color: var(--primary); margin-bottom: 8px; border-bottom: 2px solid #fdf2f4; padding-bottom: 4px;">📅 ${actualYear}年 ${m}月 スケジュール確認</div>
        <div id="embedded-calendar-month-${m}"></div>
        
        <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11px; font-weight: bold; color: #555;">スケジュール登録・変更（日付を選んでボタンを押下）</div>
          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px;">
            <button type="button" class="plan-act-btn" onclick="applyScheduleAction(${m}, 'live')" style="padding:6px; font-size:10px; background:#e0f1ea; border:1px solid #1f5c49; color:#1f5c49; border-radius:4px; font-weight:bold; cursor:pointer;">🎤 ライブに設定</button>
            <button type="button" class="plan-act-btn" onclick="applyScheduleAction(${m}, 'release')" style="padding:6px; font-size:10px; background:#e2eefc; border:1px solid #12447e; color:#12447e; border-radius:4px; font-weight:bold; cursor:pointer;">💿 CD発売に設定</button>
            <button type="button" class="plan-act-btn" onclick="applyScheduleAction(${m}, 'event-benefit')" style="padding:6px; font-size:10px; background:#fdf0da; border:1px solid #b8742a; color:#8a5a12; border-radius:4px; font-weight:bold; cursor:pointer;">🎁 特典イベントに設定</button>
            <button type="button" class="plan-act-btn" onclick="applyScheduleAction(${m}, 'event-other')" style="padding:6px; font-size:10px; background:#fafafa; border:1px solid #ccc; color:#555; border-radius:4px; font-weight:bold; cursor:pointer;">📌 その他イベントに設定</button>
            <button type="button" class="plan-act-btn" onclick="applyScheduleAction(${m}, 'release-live')" style="padding:6px; font-size:10px; background:#ede7f6; border:1px solid #4527a0; color:#4527a0; border-radius:4px; font-weight:bold; cursor:pointer;">💿+🎤 CD発売＋ライブ</button>
            <button type="button" class="plan-act-btn" onclick="applyScheduleAction(${m}, 'delete')" style="padding:6px; font-size:10px; background:#ffebee; border:1px solid #c62828; color:#c62828; border-radius:4px; font-weight:bold; cursor:pointer;">🗑 削除する</button>
          </div>
          <button type="button" id="multiselect-btn-${m}" onclick="toggleMultiSelectMode(${m})" style="padding:6px; font-size:10px; background:#fafafa; border:1px dashed var(--primary); color:var(--primary); border-radius:4px; font-weight:bold; cursor:pointer;">📦 複数選択モード: OFF (単独クリック)</button>
        </div>
      `;
      monthWrapper.appendChild(calendarCard);

      const boothCard = document.createElement('div');
      boothCard.className = 'plan-month-block';
      boothCard.id = `plan-month-block-${m}`;
      boothCard.style.cssText = 'background: #fff; border: 1px solid #eadde1; padding: 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);';
      boothCard.innerHTML = `
        <div class="plan-month-title">${m}月の活動方針</div>
        ${monthRivalsHtml}
        <label class="weekly-member-target" for="sel-rel-${m}">CD発売
          <select id="sel-rel-${m}" onchange="onReleaseSelectChange(${m})" style="width:100%; padding:6px; font-size:11px; margin-top:3px;" ${isPreset ? 'disabled' : ''}>
            <option value="none" ${releaseValue === 'none' ? 'selected' : ''}>発売なし</option>
            <option value="single" ${releaseValue === 'single' ? 'selected' : ''}>シングル発売</option>
            <option value="album" ${releaseValue === 'album' ? 'selected' : ''}>アルバム発売</option>
          </select>
        </label>
        
        <div id="release-fields-${m}" style="display: ${hasRelease ? 'block' : 'none'}; margin-top:8px; border-top:1px dashed #eee; paddingTop:6px;">
          <label class="weekly-member-target" for="song-name-${m}">楽曲名
            <input type="text" id="song-name-${m}" maxlength="24" value="${escapeHtml(existingPlan.songName || '')}" placeholder="空欄で自動命名" style="width:100%; padding:6px; font-size:11px; margin-top:3px; box-sizing:border-box;">
          </label>
          <label class="weekly-member-target" for="rel-date-${m}">発売日
            <input type="date" id="rel-date-${m}" value="${defaultRelDate}" onchange="renderEmbeddedPlanCalendars();" style="width:100%; padding:6px; font-size:11px; margin-top:3px; box-sizing:border-box;">
          </label>
        </div>

        <div style="margin-top:10px;">
          <div style="font-size:12px; font-weight:bold; color:#333;">CD関連イベント（特典会・物販）</div>
          <div id="plan-events-${m}" class="plan-event-list">
            ${renderPlanEventsHtml(m)}
          </div>
          <button class="plan-add-show-btn" type="button" style="margin-top:4px;" onclick="addPlanEvent(${m})">＋イベント会場・枠を追加</button>
        </div>

        <div class="live-slot-list" id="live-slots-${m}" style="margin-top:10px;">
          ${liveSlots.map((slot, idx) => renderLiveSlotHtml(m, idx, slot)).join('')}
        </div>
        <button class="plan-add-show-btn" type="button" style="margin-top:6px;" onclick="addLiveSlot(${m})">＋会場を設定・追加</button>
      `;
      monthWrapper.appendChild(boothCard);

      wrapperDiv.appendChild(monthWrapper);
      container.appendChild(wrapperDiv);

      liveSlots.forEach((_, idx) => {
        updateSeatPlanOptions(m, idx);
        updateShowDateNote(m, idx);
      });
    }

    renderEmbeddedPlanCalendars();
  } catch (e) {
    console.error('openDecisionModal error:', e);
    alert('半年計画画面を開く際にエラーが発生しました。');
  }
}

// リリースSelectChangeを処理する。
function onReleaseSelectChange(month) {
  const selRel = document.getElementById(`sel-rel-${month}`);
  const fields = document.getElementById(`release-fields-${month}`);
  const hasRelease = selRel && selRel.value !== 'none';
  if (fields) {
    fields.style.display = hasRelease ? 'block' : 'none';
  }
  if (hasRelease) {
    const relInput = document.getElementById(`rel-date-${month}`);
    if (relInput && !relInput.value) {
      relInput.value = getPlanReleaseDefaultWednesday(month);
    }
  }
  renderEmbeddedPlanCalendars();
}

// Decisionモーダルを閉じる。
function closeDecisionModal() {
  const modal = document.getElementById('decision-modal');
  if (modal) modal.style.display = 'none';
}

// MultiSelectModeを切り替えする。
function toggleMultiSelectMode(month) {
  planMultiSelectModes[month] = !planMultiSelectModes[month];
  if (!planMultiSelectModes[month]) {
    planCalendarSelections[month] = [];
  }
  const btn = document.getElementById(`multiselect-btn-${month}`);
  if (btn) {
    btn.textContent = `📦 複数選択モード: ${planMultiSelectModes[month] ? 'ON (選択中をまとめて登録)' : 'OFF (単独クリック)'}`;
    btn.style.background = planMultiSelectModes[month] ? '#fce4ec' : '#fafafa';
  }
  renderEmbeddedPlanCalendars();
}

// Embedded計画Calendarsを描画する。
function renderEmbeddedPlanCalendars() {
  const actualYear = getPlanActualYear();
  const weekdays = typeof PLAN_CALENDAR_WEEKDAYS !== 'undefined' ? PLAN_CALENDAR_WEEKDAYS : ['日', '月', '火', '水', '木', '金', '土'];
  
  for (let m = planStartM; m <= planEndM; m++) {
    const container = document.getElementById(`embedded-calendar-month-${m}`);
    if (!container) continue;
    container.innerHTML = '';

    if (!Array.isArray(planCalendarSelections[m])) planCalendarSelections[m] = [];

    const firstWeekday = new Date(actualYear, m - 1, 1, 12).getDay();
    const daysInMonth = new Date(actualYear, m, 0, 12).getDate();

    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = 'display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; background: #fff; padding: 4px; border: 1px solid #eadde1; border-radius: 6px;';

    weekdays.forEach(w => {
      const wSpan = document.createElement('span');
      wSpan.style.cssText = 'text-align:center; font-size:10px; color:#777; font-weight:bold; padding:2px 0;';
      wSpan.textContent = w;
      gridDiv.appendChild(wSpan);
    });

    for (let c = 0; c < 42; c++) {
      const day = c - firstWeekday + 1;
      const daySpan = document.createElement('span');

      if (day < 1 || day > daysInMonth) {
        daySpan.style.cssText = 'min-height:24px;';
        gridDiv.appendChild(daySpan);
        continue;
      }

      const dateObj = new Date(actualYear, m - 1, day, 12);
      const dateKey = toDateKey(dateObj);

      const isSelected = planCalendarSelections[m].includes(dateKey);
      const isRelease = getPlanReleaseDate(m) === dateKey;
      const liveEntries = readLiveSlotInputs(m);
      const isLive = liveEntries.some(slot => slot.liveDates && slot.liveDates.includes(dateKey));
      const eventDrafts = getPlanMonthEventDrafts(m);
      const isEvent = eventDrafts.some(event => event.dates && event.dates.includes(dateKey));

      let bgStyle = 'background:#fafafa; color:#444; border:1px solid #eee;';
      
      if (isSelected) {
        bgStyle = 'background:var(--primary); color:#fff; font-weight:bold; border:1px solid var(--primary);';
      } else if (isRelease) {
        bgStyle = 'background:#e2eefc; color:#12447e; font-weight:bold; border:1px solid #bce0fd;';
      } else if (isLive) {
        bgStyle = 'background:#e0f1ea; color:#1f5c49; font-weight:bold; border:1px solid #b8e2d2;';
      } else if (isEvent) {
        bgStyle = 'background:#fdf0da; color:#8a5a12; font-weight:bold; border:1px solid #fce3b2;';
      }

      daySpan.style.cssText = `display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:24px; font-size:10px; border-radius:4px; ${bgStyle} cursor:pointer; user-select:none;`;
      daySpan.textContent = day;

      daySpan.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEmbeddedCalendarClick(m, dateKey);
      });

      gridDiv.appendChild(daySpan);
    }

    container.appendChild(gridDiv);
  }
}

// EmbeddedカレンダーClickを処理する。
function handleEmbeddedCalendarClick(month, dateKey) {
  const isMulti = planMultiSelectModes[month];
  if (!Array.isArray(planCalendarSelections[month])) planCalendarSelections[month] = [];

  const idx = planCalendarSelections[month].indexOf(dateKey);
  if (idx >= 0) {
    planCalendarSelections[month].splice(idx, 1);
  } else {
    if (!isMulti) {
      planCalendarSelections[month] = [dateKey];
    } else {
      planCalendarSelections[month].push(dateKey);
    }
  }
  renderEmbeddedPlanCalendars();
}

// Embeddedカレンダー日付を切り替えする。
function toggleEmbeddedCalendarDate(month, dateKey) {
  handleEmbeddedCalendarClick(month, dateKey);
}

// 計画ライブ枠を検証する。
function validatePlanLiveSlots(month, liveSlots) {
  const usedVenues = new Set();
  const usedDates = new Set();
  const now = getGameDateObject();
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];

  for (const slot of liveSlots) {
    if (!slot.liveVenue) continue;
    if (usedVenues.has(slot.liveVenue)) {
      alert(`${month}月に同じ会場（${slot.liveVenue}）が複数設定されています。`);
      return false;
    }
    usedVenues.add(slot.liveVenue);

    const venue = venues.find(v => v.name === slot.liveVenue);
    const leadDays = typeof getLiveBookingLeadDays === 'function' ? getLiveBookingLeadDays(venue) : 45;

    for (const d of (slot.liveDates || [])) {
      if (usedDates.has(d)) {
        alert(`${month}月の中で公演日（${d}）が重複しています。`);
        return false;
      }
      usedDates.add(d);

      const parts = d.split('-');
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10);
        const dayNum = parseInt(parts[2], 10);
        if ((m === 12 && dayNum >= 26) || (m === 1 && dayNum <= 11)) {
          alert(`${d}は年末年始の活動休止期間（12月26日〜1月11日）のため、ライブを設定できません。別の日程をお選びください。`);
          return false;
        }
      }

      if (typeof isBaseballGameDay === 'function' && isBaseballGameDay(slot.liveVenue, d)) {
        alert(`${d}の「${slot.liveVenue}」はプロ野球公式戦の開催日のため、ライブを設定できません。別の日程または会場をお選びください。`);
        return false;
      }

      const dObj = getGameDateObject(d);
      const diffDays = Math.round((dObj - now) / 86400000);
      if (diffDays < leadDays) {
        alert(`${d}の${slot.liveVenue}は予約期限（${leadDays}日前）を過ぎているため設定できません（現在${diffDays}日前）。`);
        return false;
      }

      const rivalConflict = (typeof findRivalVenueConflict === 'function') ? findRivalVenueConflict(slot.liveVenue, d) : null;
      if (rivalConflict) {
        alert(`${d}の${slot.liveVenue}は他グループ（${rivalConflict.groupName}）が予約済みです。`);
        return false;
      }
    }
  }
  return true;
}

// Decision計画を保存する。
function saveDecisionPlan() {
  const maxVenues = 8;
  let totalAddStandardCost = 0;

  for (let m = planStartM; m <= planEndM; m++) {
    const release = document.getElementById(`sel-rel-${m}`).value;
    const songName = document.getElementById(`song-name-${m}`)?.value.trim() || '';
    const planKey = `${planYearTarget}-${m}`;
    const previousPlan = (typeof productionSchedule !== 'undefined' && productionSchedule[planKey]) ? productionSchedule[planKey] : {};
    const liveSlots = readLiveSlotInputs(m).filter(slot => slot.liveVenue || (slot.liveDates && slot.liveDates.length > 0)).slice(0, maxVenues);
    const eventSlots = readEventSlotInputs(m);

    if (liveSlots.length > maxVenues) {
      alert(`1か月あたりの会場は最大${maxVenues}会場までです。`);
      return;
    }
    if (!validatePlanLiveSlots(m, liveSlots)) return;

    const primary = liveSlots[0] || null;
    const plan = {
      release,
      songName: songName || null,
      releaseDate: release === 'none' ? null : (getPlanReleaseDate(m) || null),
      planEvents: eventSlots.map(({ slotIndex, ...item }) => ({ ...item })),
      liveVenue: primary ? primary.liveVenue : null,
      liveName: primary ? (primary.liveName || primary.liveVenue) : null,
      liveDate: primary ? (primary.liveDate || null) : null,
      liveDates: primary ? primary.liveDates : [],
      streamDates: primary ? (Array.isArray(primary.streamDates) ? primary.streamDates : []) : [],
      seatPrices: primary ? primary.seatPrices : {},
      seatOptions: primary ? primary.seatOptions : {},
      additionalLives: liveSlots.slice(1).map(slot => ({
        liveVenue: slot.liveVenue,
        liveName: slot.liveName || slot.liveVenue,
        liveDate: slot.liveDate || null,
        liveDates: slot.liveDates,
        streamDates: Array.isArray(slot.streamDates) ? slot.streamDates : [],
        seatPrices: slot.seatPrices,
        seatOptions: slot.seatOptions
      }))
    };

    if (primary) plan.liveCompleted = previousPlan.liveCompleted || false;
    if (typeof productionSchedule !== 'undefined') {
      productionSchedule[planKey] = plan;
    }

    // 「予定の追加」モードでは、この月の通常会費（ライブ＋イベント＋CD制作費）を集計する。
    // 追加料として通常会費の1.2倍を保存時に即時徴収する。
    if (planIsAddMode) {
      let monthStandard = 0;
      if (primary && typeof getLivePlanStandardCost === 'function') {
        monthStandard += getLivePlanStandardCost(primary);
      }
      if (Array.isArray(plan.additionalLives) && typeof getLivePlanStandardCost === 'function') {
        plan.additionalLives.forEach(al => { monthStandard += getLivePlanStandardCost(al); });
      }
      if (Array.isArray(plan.planEvents) && typeof getEventPlanStandardCost === 'function') {
        plan.planEvents.forEach(ev => { monthStandard += getEventPlanStandardCost(ev); });
      }
      if (release && release !== 'none' && typeof getCdPlanStandardCost === 'function') {
        monthStandard += getCdPlanStandardCost(plan);
      }
      totalAddStandardCost += monthStandard;
    }
  }

  const modal = document.getElementById('decision-modal');
  if (modal) modal.style.display = 'none';

  // 「予定の追加」モードでは通常会費の1.2倍の追加料を保存時に即時徴収する。
  if (planIsAddMode && totalAddStandardCost > 0) {
    const addFee = Math.round(totalAddStandardCost * 1.2);
    funds -= addFee;
    if (typeof recordMonthlyExpense === 'function') recordMonthlyExpense('予定追加料', addFee);
    setLog(`【計画確定】${planYearTarget}年${planStartM}月〜${planEndM}月の活動方針を決定しました。`);
    setLog(`【予定追加料】通常会費 ${formatMoney(totalAddStandardCost)} に対し、追加料 1.2倍（${formatMoney(addFee)}）を徴収しました。`);
  } else {
    setLog(`【計画確定】${planYearTarget}年${planStartM}月〜${planEndM}月の活動方針を決定しました。`);
  }
  planIsAddMode = false;

  if (typeof updateUI === 'function') {
    updateUI();
  }
}

// Planningマニュアルを開く。
function openPlanningManual() {
  const targetYear = typeof currentYear !== 'undefined' ? currentYear : 1;
  if (currentMonth === 1 || (currentMonth >= 1 && currentMonth <= 6)) {
    try {
      if (typeof generateRivalsAndGeneralSchedule === 'function') {
        generateRivalsAndGeneralSchedule(targetYear, 7, false);
      }
    } catch (e) {
      console.warn('Rival schedule generation warning (July-Dec):', e);
    }
    openDecisionModal(`${targetYear}年下半期（7〜12月）の計画策定`, targetYear, 7, 12);
  } else {
    try {
      if (typeof generateRivalsAndGeneralSchedule === 'function') {
        generateRivalsAndGeneralSchedule(targetYear + 1, 1, false);
      }
    } catch (e) {
      console.warn('Rival schedule generation warning (Next Jan-Jun):', e);
    }
    openDecisionModal(`${targetYear + 1}年上半期（1〜6月）の計画策定`, targetYear + 1, 1, 6);
  }
}

// Planningカレンダーを開く。
function openPlanningCalendar() {
  openPlanningManual();
}

// 枠概要を保存する。
function getSaveSlotSummary(slotKey) {
  try {
    const raw = localStorage.getItem(slotKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      year: data.currentYear || 1,
      month: data.currentMonth || 1,
      week: data.currentWeek || 1,
      date: data.gameDate || '',
      memberCount: Array.isArray(data.idolRoster) ? data.idolRoster.length : 0,
      funds: Number(data.funds) || 0,
      savedAt: data.savedAt ? new Date(data.savedAt).toLocaleString() : '日時不明'
    };
  } catch (e) {
    return { isCorrupt: true };
  }
}

// 枠キーを保存する。
function saveSlotKey(slot, userId = null) {
  if (typeof window !== 'undefined' && window.saveDataManager && typeof window.saveDataManager.makeSaveSlotKey === 'function') {
    return window.saveDataManager.makeSaveSlotKey(slot, userId || window.saveDataManager.getUserId());
  }

  const activeUserId = userId || localStorage.getItem('idol_manager_user_id') || 'guest-user';
  const normalizedUserId = String(activeUserId).trim() || 'guest-user';
  return `idol_manager_save_slot_${normalizedUserId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}_${slot}`;
}

// 枠を保存する。
function renderSaveSlots() {
  const container = document.getElementById('save-slots');
  if (!container) return;
  container.innerHTML = '';
  const slotCount = typeof SAVE_SLOT_COUNT !== 'undefined' ? SAVE_SLOT_COUNT : 3;

  for (let slot = 1; slot <= slotCount; slot++) {
    const slotKey = saveSlotKey(slot);
    const summary = getSaveSlotSummary(slotKey);
    const isCorrupt = summary?.isCorrupt;
    const hasData = Boolean(summary && !isCorrupt);
    const slotFunds = slot === activeSaveSlot && typeof funds !== 'undefined' ? funds : summary?.funds;

    const slotCard = document.createElement('section');
    slotCard.className = 'save-slot';
    slotCard.innerHTML = `
      <div class="save-slot-heading">
        <h2>セーブ枠 ${slot}</h2>
        ${hasData ? '<span>保存済み</span>' : ''}
      </div>
      <div class="save-slot-info">
        ${isCorrupt
          ? '<span style="color:#c0392b;">セーブデータが破損しています。削除してください。</span>'
          : hasData
            ? `${summary.year}年目 ${summary.month}月 第${summary.week}週<br>` +
              `${summary.date ? `${new Date(`${summary.date}T12:00:00`).toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' })}<br>` : ''}` +
              `${slot === 1 ? `<span class="save-slot-current-funds">現在の資金: ${formatMoney(slotFunds)}</span><br>` : ''}` +
              `所属 ${summary.memberCount}名${slot === 1 ? '' : ` / 資金 ${formatMoney(summary.funds)}`}<br>` +
              `<small style="color:#888;">最終保存: ${summary.savedAt}</small>`
            : '<span style="color:#888;">空き枠</span>'}
      </div>
      <div class="save-slot-actions">
        ${hasData
          ? `<button class="main-btn" type="button" onclick="continueSavedGame(${slot})">続きから</button>` +
            `<button class="danger-btn" type="button" onclick="startNewGame(${slot})">新規開始</button>` +
            `<button class="danger-btn slot-delete-btn" type="button" onclick="deleteSaveSlot(${slot})">削除</button>`
          : isCorrupt
            ? `<button class="danger-btn slot-delete-btn" type="button" onclick="deleteSaveSlot(${slot})">削除</button>`
            : `<button class="main-btn" type="button" onclick="startNewGame(${slot})">新規開始</button>`}
      </div>
    `;
    container.appendChild(slotCard);
  }
}

// continueSaved試合を処理する。
function continueSavedGame(slot) {
  initGame(slot, false);
}

// New試合を開始する。
function startNewGame(slot) {
  const slotKey = saveSlotKey(slot);
  if (localStorage.getItem(slotKey)) {
    if (!confirm(`セーブ枠 ${slot} のデータを上書きして新しくゲームを開始しますか？`)) {
      return;
    }
  }
  pendingActiveSlot = slot;
  const setupModal = document.getElementById('setup-game-modal');
  if (setupModal) {
    setupModal.style.display = 'flex';
  } else {
    initGame(slot, true);
  }
}

function closeGameSetupModal() {
  const setupModal = document.getElementById('setup-game-modal');
  if (setupModal) setupModal.style.display = 'none';
  pendingActiveSlot = null;
}

// 試合セットアップ計画を送信する。
function submitGameSetupAndPlan() {
  const gNameInput = document.getElementById('input-setup-groupname');
  const song1Input = document.getElementById('input-setup-1st-song');
  const song2Input = document.getElementById('input-setup-2nd-song');
  const liveInput = document.getElementById('input-setup-live-name');

  customGroupName = gNameInput?.value.trim() || 'スタースコープ';
  customFirstSong = song1Input?.value.trim() || 'はじまりの光';
  customSecondSong = song2Input?.value.trim() || '青春の軌跡';
  customFirstLiveName = liveInput?.value.trim() || '1stデビューライブ';

  const setupModal = document.getElementById('setup-game-modal');
  if (setupModal) setupModal.style.display = 'none';

  if (pendingActiveSlot !== null) {
    initGame(pendingActiveSlot, true);
    pendingActiveSlot = null;
  }
}

// delete保存枠を処理する。
function deleteSaveSlot(slot) {
  if (!confirm(`セーブ枠 ${slot} のデータを完全に削除しますか？\nこの操作は取り消せません。`)) {
    return;
  }
  localStorage.removeItem(saveSlotKey(slot));
  renderSaveSlots();
}

// タイトルScreenを開く。
function openTitleScreen() {
  const gScreen = document.getElementById('game-screen');
  const tScreen = document.getElementById('title-screen');
  if (gScreen) gScreen.hidden = true;
  if (tScreen) tScreen.hidden = false;
  renderSaveSlots();
}

// returnタイトルを処理する。
function returnToTitle() {
  activeSaveSlot = null;
  openTitleScreen();
}

// init試合を処理する。
function initGame(slot, startFresh) {
  const slotCount = typeof SAVE_SLOT_COUNT !== 'undefined' ? SAVE_SLOT_COUNT : 3;
  if (!Number.isInteger(slot) || slot < 1 || slot > slotCount) return;
  activeSaveSlot = slot;

  if (startFresh) {
    if (typeof initializeNewGameState === 'function') {
      initializeNewGameState();
    }
    
    const playerTeam = Array.isArray(leagueTeams)
      ? leagueTeams.find(team => team && team.id === 'player')
      : null;
    if (playerTeam) playerTeam.name = customGroupName;
    if (typeof productionSchedule !== 'undefined') {
      if (productionSchedule['1-2']) {
        productionSchedule['1-2'].songName = customFirstSong;
      }
      if (productionSchedule['1-6']) {
        productionSchedule['1-6'].songName = customSecondSong;
      }
      if (productionSchedule['1-5']) {
        productionSchedule['1-5'].liveName = customFirstLiveName;
      }
    }

    if (typeof generateRivalsAndGeneralSchedule === 'function') {
      generateRivalsAndGeneralSchedule(1, 1, true);
    }
  } else {
    const raw = localStorage.getItem(saveSlotKey(slot));
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') {
          throw new Error('セーブデータの形式が無効です。');
        }

        data.rivalLiveBookings = Array.isArray(data.rivalLiveBookings) ? data.rivalLiveBookings : [];
        data.productionSchedule = (data.productionSchedule && typeof data.productionSchedule === 'object') ? data.productionSchedule : {};
        data.idolRoster = Array.isArray(data.idolRoster) ? data.idolRoster : [];
        data.funds = Number.isFinite(data.funds) ? data.funds : 10000000;

        if (typeof applySavedGame === 'function') {
          applySavedGame(data);
        } else {
          currentYear = data.currentYear || 1;
          currentMonth = data.currentMonth || 1;
          currentWeek = data.currentWeek || 1;
          funds = data.funds;
          rivalLiveBookings = data.rivalLiveBookings;
          productionSchedule = data.productionSchedule;
        }
      } catch (e) {
        console.warn('セーブデータ読込時の警告・自動修復:', e);
        if (typeof initializeNewGameState === 'function') initializeNewGameState();
      }
    } else {
      if (typeof initializeNewGameState === 'function') initializeNewGameState();
    }
  }

  const tScreen = document.getElementById('title-screen');
  const gScreen = document.getElementById('game-screen');
  if (tScreen) tScreen.hidden = true;
  if (gScreen) gScreen.hidden = false;

  const slotLabel = document.getElementById('active-slot-label');
  if (slotLabel) slotLabel.textContent = `セーブ枠 ${slot}`;

  if (typeof renderPageNav === 'function') {
    renderPageNav('office');
  }

  try {
    if (typeof updateUI === 'function') {
      updateUI();
    }
  } catch (e) {
    console.warn('Initial updateUI warning:', e);
  }

  if (startFresh) {
    openPlanningManual();
  } else {
    if (typeof openPendingModal === 'function') {
      openPendingModal();
    }
  }
}

// migrateLegacy保存を処理する。
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

document.addEventListener('DOMContentLoaded', () => {
  migrateLegacySave();
  renderSaveSlots();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  migrateLegacySave();
  renderSaveSlots();
}

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.calendar-day-dot, .rival-dot, .event-dot, .calendar-dot').forEach(el => el.remove());
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
