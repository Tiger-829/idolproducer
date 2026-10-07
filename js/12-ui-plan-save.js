// ==========================================
// 12-ui-plan-save.js : イベント会場押え・詳細管理完全統合版
// ==========================================

let planYearTarget = 1;
let planStartM = 1;
let planEndM = 6;
let planMonthEventDrafts = {};
let planMultiSelectModes = {}; 
let planCalendarSelections = {}; 

let pendingActiveSlot = null;
let customGroupName = "スタースコープ";
let customFirstSong = "はじまりの光";
let customSecondSong = "青春の軌跡";
let customFirstLiveName = "1stデビューライブ";

function isPresetReleaseMonth(month) {
  return planYearTarget === 1 && typeof PRESET_RELEASE_MONTHS !== 'undefined' && PRESET_RELEASE_MONTHS.includes(month);
}

function getPlanCalendarDate(month, day) {
  const actualYear = calendarYear && calendarYear > 2000 ? calendarYear : (2026 + (planYearTarget - currentYear));
  return new Date(actualYear, month - 1, day, 12);
}

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

function getPlanReleaseDate(month) {
  return (document.getElementById(`rel-date-${month}`) || {}).value || '';
}

function getStandardSeatPrice(venue, seatId) {
  if (!venue || typeof SEAT_PRICE_GROUP === 'undefined' || typeof STANDARD_SEAT_PRICE === 'undefined') return 0;
  const group = SEAT_PRICE_GROUP[seatId];
  const base = STANDARD_SEAT_PRICE[group] || 0;
  const rate = (typeof VENUE_TIER_PRICE_RATE !== 'undefined' && VENUE_TIER_PRICE_RATE[venue.cap]) 
    ? VENUE_TIER_PRICE_RATE[venue.cap] 
    : (typeof VENUE_TIER_DEFAULT_PRICE_RATE !== 'undefined' ? VENUE_TIER_DEFAULT_PRICE_RATE : 1.0);
  return Math.round(base * rate);
}

function getPlanReleaseDefaultWednesday(month) {
  const actualYear = calendarYear && calendarYear > 2000 ? calendarYear : (2026 + (planYearTarget - currentYear));
  if (typeof getLastWednesday === 'function') {
    return toDateKey(getLastWednesday(actualYear, month - 1));
  }
  const d = new Date(actualYear, month, 0, 12);
  while (d.getDay() !== 3) {
    d.setDate(d.getDate() - 1);
  }
  return toDateKey(d);
}

function getPlayerCdReleaseList() {
  const cdList = [];
  let count = 0;
  
  for (let y = 1; y <= planYearTarget; y++) {
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
          label: `${ordinal} ${typeStr}${sName} (${y}年${m}月)`
        });
      }
    }
  }

  for (let m = planStartM; m <= planEndM; m++) {
    const selRel = document.getElementById(`sel-rel-${m}`);
    if (selRel && selRel.value !== 'none') {
      const existingId = `cd_${planYearTarget}_${m}`;
      if (!cdList.some(cd => cd.id === existingId)) {
        count++;
        const ordinal = count === 1 ? '1st' : count === 2 ? '2nd' : count === 3 ? '3rd' : `${count}th`;
        const typeStr = selRel.value === 'album' ? 'アルバム' : 'シングル';
        const songInput = document.getElementById(`song-name-${m}`);
        const sName = songInput && songInput.value.trim() ? `「${songInput.value.trim()}」` : '';
        
        cdList.push({
          id: existingId,
          label: `${ordinal} ${typeStr}${sName} (${planYearTarget}年${m}月 [編集中])`
        });
      }
    }
  }

  if (cdList.length === 0) {
    cdList.push({ id: 'cd_default', label: '1st シングル (標準)' });
  }
  return cdList;
}

function renderShowDateRow(month, index, dateIndex, dateKey, isStream = true, prefix = 'show') {
  return `
    <div class="${prefix}-date-row" data-show-index="${dateIndex}" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
      <input type="date" class="${prefix}-date-input" id="${prefix}-date-${month}-${index}-${dateIndex}"
        value="${dateKey || ''}" onchange="updateShowDateNote(${month}, ${index}); renderEmbeddedPlanCalendars();">
      <label style="font-size:11px; display:flex; align-items:center; gap:2px; white-space:nowrap; cursor:pointer;">
        <input type="checkbox" class="${prefix}-stream-input" id="${prefix}-stream-${month}-${index}-${dateIndex}"
          ${isStream ? 'checked' : ''} onchange="updateShowDateNote(${month}, ${index})">
        配信あり
      </label>
      <button class="danger-btn" type="button" onclick="removeShowDate(${month}, ${index}, ${dateIndex}, '${prefix}')">削除</button>
    </div>`;
}

function renderLiveSlotHtml(month, index, slot) {
  const isPrimary = index === 0;
  const seatPrices = slot.seatPrices || {};
  const seatOptions = slot.seatOptions || {};
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const slotVenue = venues.find(v => v.name === slot.liveVenue) || null;
  const streamDates = new Set(Array.isArray(slot.streamDates) ? slot.streamDates : (slot.liveDates || []));
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

// 🌟 特典・その他イベントもライブと同形式（会場・名前・日程・配信・価格設定）で管理するスロットHTML
function renderEventSlotHtml(month, index, event) {
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const cdList = getPlayerCdReleaseList();
  const currentCdId = event.targetCdId || (cdList[0] ? cdList[0].id : '');
  const eventVenue = venues.find(v => v.name === event.venue) || null;
  const seatPrices = event.seatPrices || {};
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];
  const hasDates = Array.isArray(event.dates) && event.dates.length > 0;
  const hasVenue = Boolean(event.venue);
  const showDetails = hasVenue || hasDates;

  return `
    <div class="plan-event-slot" data-event-slot-index="${index}" style="border:1px solid #eadde1; padding:8px; border-radius:6px; margin-bottom:6px; background:#fdf8f9;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:12px; font-weight:bold; color:#b8742a;">🎁 イベント枠 ${index + 1}</span>
        <button class="danger-btn" type="button" onclick="removePlanEvent(${month}, ${index})">削除</button>
      </div>

      <label class="weekly-member-target" style="display:block; margin-bottom:6px; font-size:11px;">イベント名
        <input type="text" class="event-name-input" id="event-name-${month}-${index}" value="${escapeHtml(event.name || '個別握手会')}" placeholder="例: 全国握手会" style="width:100%; padding:6px; font-size:11px; margin-top:3px; box-sizing:border-box;">
      </label>

      <label class="weekly-member-target" style="display:block; margin-bottom:6px; font-size:11px;">会場
        <select id="event-ven-${month}-${index}" onchange="onEventVenueSelectChange(${month}, ${index})" style="width:100%; padding:6px; font-size:11px; margin-top:3px;">
          <option value="">会場を選択</option>
          ${venues.map(v => `<option value="${v.name}" ${event.venue === v.name ? 'selected' : ''}>${v.name}(${v.cap}/${v.ease})</option>`).join('')}
        </select>
      </label>

      <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#555; margin-bottom:6px;">
        <span>紐づくCD:</span>
        <select id="event-cd-${month}-${index}" style="font-size:11px; padding:4px; flex:1;">
          ${cdList.map(cd => `<option value="${cd.id}" ${cd.id === currentCdId ? 'selected' : ''}>${cd.label}</option>`).join('')}
        </select>
      </div>

      <div id="event-details-container-${month}-${index}" style="display: ${showDetails ? 'block' : 'none'}; margin-top:8px; border-top:1px dashed #eee; paddingTop:6px;">
        <div style="font-size:11px;">
          <div style="color:#555; margin-bottom:3px;">開催日・配信設定</div>
          <div id="event-show-dates-${month}-${index}" class="show-date-list">
             ${(event.dates || []).map((dateKey, dateIndex) => 
              renderShowDateRow(month, index, dateIndex, dateKey, true, 'event-show')
            ).join('')}
          </div>
          <div style="margin-top:4px;">
            <button class="plan-add-show-btn" type="button" onclick="addEventShowDate(${month}, ${index})">＋開催日を追加</button>
          </div>
          <div id="event-date-note-${month}-${index}" style="margin-top:4px; font-size:10px; color:#666;"></div>
        </div>

        <details class="seat-settings" style="margin-top:6px;">
          <summary style="font-size:11px; cursor:pointer; font-weight:bold;">席種・チケット価格</summary>
          <div class="seat-settings-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-top:6px;">
            ${seatTypes.map(seat => {
              const price = seatPrices[seat.id] ?? getStandardSeatPrice(eventVenue, seat.id);
              return `<div style="font-size:10px;"><label style="display:block;">${seat.name}（円）</label><input type="number" id="event-seat-price-${month}-${index}-${seat.id}" min="0" step="500" value="${price}" style="width:100%; padding:4px; font-size:10px; box-sizing:border-box;"></div>`;
            }).join('')}
          </div>
        </details>
      </div>
    </div>
  `;
}

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

function onEventVenueSelectChange(month, index) {
  const selVen = document.getElementById(`event-ven-${month}-${index}`);
  const detailsContainer = document.getElementById(`event-details-container-${month}-${index}`);
  const hasVenue = Boolean(selVen && selVen.value);

  if (detailsContainer) {
    detailsContainer.style.display = hasVenue ? 'block' : 'none';
  }
  renderEmbeddedPlanCalendars();
}

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

function readEventSlotInputs(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (!container) return [];
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];

  return Array.from(container.querySelectorAll('.plan-event-slot')).map(slotEl => {
    const index = Number(slotEl.dataset.eventSlotIndex);
    const eventName = (document.getElementById(`event-name-${month}-${index}`) || {}).value?.trim() || '個別握手会';
    const venueVal = (document.getElementById(`event-ven-${month}-${index}`) || {}).value || '';
    const targetCdId = (document.getElementById(`event-cd-${month}-${index}`) || {}).value || 'cd_default';

    const dateInputs = slotEl.querySelectorAll('.event-show-date-input');
    const streamInputs = slotEl.querySelectorAll('.event-show-stream-input');
    const dates = [];
    const streamDates = [];

    dateInputs.forEach((dInput, dIdx) => {
      const val = dInput.value;
      if (val) {
        dates.push(val);
        if (streamInputs[dIdx] && streamInputs[dIdx].checked) {
          streamDates.push(val);
        }
      }
    });

    if (!venueVal && dates.length === 0) return null;

    const seatPrices = {};
    const slotVenue = venues.find(v => v.name === venueVal) || null;
    seatTypes.forEach(seat => {
      const priceInput = document.getElementById(`event-seat-price-${month}-${index}-${seat.id}`);
      const price = Number.parseInt(priceInput ? priceInput.value : '', 10);
      seatPrices[seat.id] = Number.isFinite(price) && price >= 0 ? price : getStandardSeatPrice(slotVenue, seat.id);
    });

    return {
      name: eventName,
      venue: venueVal,
      date: dates[0] || '',
      dates: dates,
      streamDates: streamDates,
      targetCdId: targetCdId,
      seatPrices: seatPrices,
      completed: false
    };
  }).filter(Boolean);
}

function updateShowDateNote(month, index) {
  const note = document.getElementById(`show-date-note-${month}-${index}`);
  if (!note) return;
  const slotEl = document.querySelector(`.live-slot[data-slot-index="${index}"]`);
  const venueSelect = document.getElementById(`sel-ven-${month}-${index}`);
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const venue = venues.find(item => item.name === (venueSelect ? venueSelect.value : ''));
  if (!venue) {
    note.textContent = '会場を選択してください';
    return;
  }

  const dateInputs = slotEl ? slotEl.querySelectorAll('.show-date-input') : [];
  const streamInputs = slotEl ? slotEl.querySelectorAll('.show-stream-input') : [];
  const dates = [];
  let streamCount = 0;

  dateInputs.forEach((dInput, dIdx) => {
    if (dInput.value) {
      dates.push(dInput.value);
      if (streamInputs[dIdx] && streamInputs[dIdx].checked) streamCount++;
    }
  });

  const exp = typeof calculateLiveExpenses === 'function'
    ? calculateLiveExpenses(venue.cap, dates.length, streamCount)
    : { baseCost: 0, streamCost: 0, totalCost: 0 };

  note.innerHTML = `公演数: ${dates.length}公演（配信${streamCount}公演）<br>諸経費(基本): ${formatMoney(exp.baseCost)} / 配信費用: ${formatMoney(exp.streamCost)}（合計 ${formatMoney(exp.totalCost)}）`;
  renderEmbeddedPlanCalendars();
}

function addShowDate(month, index, prefix = 'show') {
  const container = document.getElementById(prefix === 'show' ? `show-dates-${month}-${index}` : `event-show-dates-${month}-${index}`);
  if (!container) return;
  const dateIndex = container.querySelectorAll(`.${prefix}-date-row`).length;
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderShowDateRow(month, index, dateIndex, '', true, prefix);
  container.appendChild(tempWrapper.firstElementChild);
  if (prefix === 'show') updateShowDateNote(month, index);
  renderEmbeddedPlanCalendars();
}

function addEventShowDate(month, index) {
  addShowDate(month, index, 'event-show');
}

function removeShowDate(month, index, dateIndex, prefix = 'show') {
  const container = document.getElementById(prefix === 'show' ? `show-dates-${month}-${index}` : `event-show-dates-${month}-${index}`);
  if (!container) return;
  const row = container.querySelector(`.${prefix}-date-row[data-show-index="${dateIndex}"]`);
  if (row) row.remove();
  if (prefix === 'show') updateShowDateNote(month, index);
  renderEmbeddedPlanCalendars();
}

function addLiveSlot(month) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return;
  const currentCount = container.querySelectorAll('.live-slot').length;
  const maxVenues = typeof MAX_LIVE_VENUES_PER_MONTH !== 'undefined' ? MAX_LIVE_VENUES_PER_MONTH : 2;
  if (currentCount >= maxVenues) {
    alert(`1か月あたりの会場は最大${maxVenues}会場までです。`);
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

function removeLiveSlot(month, index) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return;
  const slotEl = container.querySelector(`.live-slot[data-slot-index="${index}"]`);
  if (slotEl) slotEl.remove();
  renderEmbeddedPlanCalendars();
}

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

function renderPlanEventsHtml(month) {
  const events = getPlanMonthEventDrafts(month);
  if (!events.length) return '';
  return events.map((event, index) => renderEventSlotHtml(month, index, event)).join('');
}

function addPlanEvent(month) {
  const drafts = getPlanMonthEventDrafts(month);
  const maxEvents = typeof MAX_PLAN_EVENTS_PER_MONTH !== 'undefined' ? MAX_PLAN_EVENTS_PER_MONTH : 4;
  if (drafts.length >= maxEvents) {
    alert(`1か月あたりのイベントは最大${maxEvents}件までです。`);
    return;
  }
  const cdList = getPlayerCdReleaseList();
  drafts.push({
    name: '個別握手会',
    venue: '',
    date: '',
    dates: [],
    streamDates: [],
    targetCdId: cdList[0] ? cdList[0].id : 'cd_default',
    seatPrices: {},
    completed: false
  });
  refreshPlanEventsContainer(month);
}

function removePlanEvent(month, index) {
  const drafts = getPlanMonthEventDrafts(month);
  if (index >= 0 && index < drafts.length) {
    drafts.splice(index, 1);
  }
  refreshPlanEventsContainer(month);
  renderEmbeddedPlanCalendars();
}

function refreshPlanEventsContainer(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (container) {
    container.innerHTML = renderPlanEventsHtml(month);
  }
}

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

function processDeferredPlanExpenses() {
  if (typeof deferredBenefitCost === 'undefined') {
    window.deferredBenefitCost = 0;
  }
  if (deferredBenefitCost > 0) {
    funds -= deferredBenefitCost;
    setLog(`【費用精算】前回の予定期間にかかった特典イベント等の費用 ${formatMoney(deferredBenefitCost)} を引き落としました。`);
    deferredBenefitCost = 0;
  }
}

function applyScheduleAction(month, actionType) {
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
    // 🌟 特典・その他イベント：イベントスロットに直接日付を追加
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

        const showDatesContainer = document.getElementById(`event-show-dates-${month}-${slotIndex}`);
        if (showDatesContainer) {
          const existingDateInputs = Array.from(showDatesContainer.querySelectorAll('.event-show-date-input')).map(i => i.value).filter(Boolean);
          const combinedDates = Array.from(new Set([...existingDateInputs, ...targetDates])).sort();

          showDatesContainer.innerHTML = combinedDates.map((dKey, dIdx) => 
            renderShowDateRow(month, Number(slotIndex), dIdx, dKey, true, 'event-show')
          ).join('');
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

function openDecisionModal(title, yearTarget, startM, endM) {
  try {
    planYearTarget = yearTarget;
    planStartM = startM;
    planEndM = endM;
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
      for (let y = currentY; y <= currentY + 1; y++) {
        for (let m = 1; m <= 12; m++) {
          if (y === currentY && m < currentM) continue;
          const pKey = `${y}-${m}`;
          if (typeof productionSchedule !== 'undefined' && productionSchedule[pKey]) {
            const p = productionSchedule[pKey];
            
            let details = [];
            if (p.release && p.release !== 'none') {
              let relType = p.release === 'album' ? 'アルバム' : 'シングル';
              let sName = p.songName ? `「${p.songName}」` : '';
              let rDate = p.releaseDate ? `(${p.releaseDate}発売)` : '';
              details.push(`💿 ${relType}${sName}${rDate}`);
            }

            let lNames = [];
            if (p.liveName) lNames.push(p.liveName);
            else if (p.liveVenue) lNames.push(p.liveVenue);
            if (Array.isArray(p.additionalLives)) {
              p.additionalLives.forEach(al => {
                if (al.liveName) lNames.push(al.liveName);
                else if (al.liveVenue) lNames.push(al.liveVenue);
              });
            }
            if (lNames.length > 0) {
              details.push(`🎤 ライブ[${lNames.join(', ')}]`);
            }

            if (Array.isArray(p.planEvents) && p.planEvents.length > 0) {
              details.push(`🎁 イベント(${p.planEvents.length}件)`);
            }

            if (details.length > 0) {
              upcomingSchedules.push(`・${y}年${m}月: ${details.join(' / ')}`);
            }
          }
        }
      }

      summaryBox.innerHTML = `
        <strong>【現在の進行状況と確定済み予定の参照（${currentY}年${currentM}月〜）】</strong><br>
        ${upcomingSchedules.length > 0 ? upcomingSchedules.slice(0, 6).join('<br>') : '・現在確定している将来の予定はありません。'}
      `;
    }
    
    const container = document.getElementById('plan-rows');
    if (!container) return;
    container.innerHTML = '';

    const presetRelType = typeof PRESET_RELEASE_TYPE !== 'undefined' ? PRESET_RELEASE_TYPE : 'single';
    const cdBenefits = typeof CD_BENEFITS !== 'undefined' ? CD_BENEFITS : [];

    const actualYear = calendarYear && calendarYear > 2000 ? calendarYear : (2026 + (planYearTarget - currentYear));

    const wrapperDiv = document.createElement('div');
    wrapperDiv.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

    const effectiveStartM = (typeof currentMonth !== 'undefined' && yearTarget === currentYear && currentMonth > startM) ? currentMonth : startM;

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
        streamDates: e.streamDates || e.liveDates || [],
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
          <label class="weekly-member-target" for="sel-benefit-${m}">CD特典
            <select id="sel-benefit-${m}" style="width:100%; padding:6px; font-size:11px; margin-top:3px;">
              <option value="none">特典なし</option>
              ${cdBenefits.map(b => `<option value="${b.id}" ${existingPlan.releaseBenefit === b.id ? 'selected' : ''}>${b.name} (${formatMoney(b.cost)})</option>`).join('')}
            </select>
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

function closeDecisionModal() {
  const modal = document.getElementById('decision-modal');
  if (modal) modal.style.display = 'none';
}

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

function renderEmbeddedPlanCalendars() {
  const actualYear = calendarYear && calendarYear > 2000 ? calendarYear : (2026 + (planYearTarget - currentYear));
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

function toggleEmbeddedCalendarDate(month, dateKey) {
  handleEmbeddedCalendarClick(month, dateKey);
}

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

function saveDecisionPlan() {
  const maxVenues = typeof MAX_LIVE_VENUES_PER_MONTH !== 'undefined' ? MAX_LIVE_VENUES_PER_MONTH : 2;
  let newBenefitCost = 0;

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

    eventSlots.forEach(event => {
      if (event && event.dates && event.dates.length > 0) {
        newBenefitCost += 20000000;
      }
    });

    const primary = liveSlots[0] || null;
    const plan = {
      release,
      songName: songName || null,
      releaseDate: release === 'none' ? null : (getPlanReleaseDate(m) || null),
      planEvents: eventSlots.map(item => ({ ...item })),
      liveVenue: primary ? primary.liveVenue : null,
      liveName: primary ? (primary.liveName || primary.liveVenue) : null,
      liveDate: primary ? (primary.liveDate || null) : null,
      liveDates: primary ? primary.liveDates : [],
      streamDates: primary ? primary.streamDates : [],
      releaseBenefit: release === 'none' ? 'none' : document.getElementById(`sel-benefit-${m}`).value,
      seatPrices: primary ? primary.seatPrices : {},
      seatOptions: primary ? primary.seatOptions : {},
      additionalLives: liveSlots.slice(1).map(slot => ({
        liveVenue: slot.liveVenue,
        liveName: slot.liveName || slot.liveVenue,
        liveDate: slot.liveDate || null,
        liveDates: slot.liveDates,
        streamDates: slot.streamDates,
        seatPrices: slot.seatPrices,
        seatOptions: slot.seatOptions
      }))
    };

    if (primary) plan.liveCompleted = previousPlan.liveCompleted || false;
    if (typeof productionSchedule !== 'undefined') {
      productionSchedule[planKey] = plan;
    }
  }

  processDeferredPlanExpenses();
  if (typeof deferredBenefitCost === 'undefined') window.deferredBenefitCost = 0;
  window.deferredBenefitCost += newBenefitCost;

  const modal = document.getElementById('decision-modal');
  if (modal) modal.style.display = 'none';
  setLog(`【計画確定】${planYearTarget}年${planStartM}月〜${planEndM}月の活動方針を決定しました。（今回設定された特典イベント経費: ${formatMoney(newBenefitCost)} ※次回精算）`);
  updateUI();
}

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

function openPlanningCalendar() {
  openPlanningManual();
}

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

function saveSlotKey(slot) {
  return `idol_manager_save_slot_${slot}`;
}

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
              `所属 ${summary.memberCount}名 / 資金 ${formatMoney(summary.funds)}<br>` +
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

function continueSavedGame(slot) {
  initGame(slot, false);
}

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

function submitGameSetupAndPlan() {
  const gNameInput = document.getElementById('input-setup-groupname');
  const song1Input = document.getElementById('input-setup-1st-song');
  const song2Input = document.getElementById('input-setup-2nd-song');
  const liveInput = document.getElementById('input-setup-live-name');

  if (gNameInput && gNameInput.value.trim()) customGroupName = gNameInput.value.trim();
  if (song1Input && song1Input.value.trim()) customFirstSong = song1Input.value.trim();
  if (song2Input && song2Input.value.trim()) customSecondSong = song2Input.value.trim();
  if (liveInput && liveInput.value.trim()) customFirstLiveName = liveInput.value.trim();

  const setupModal = document.getElementById('setup-game-modal');
  if (setupModal) setupModal.style.display = 'none';

  if (pendingActiveSlot !== null) {
    initGame(pendingActiveSlot, true);
    pendingActiveSlot = null;
  }
}

function deleteSaveSlot(slot) {
  if (!confirm(`セーブ枠 ${slot} のデータを完全に削除しますか？\nこの操作は取り消せません。`)) {
    return;
  }
  localStorage.removeItem(saveSlotKey(slot));
  renderSaveSlots();
}

function openTitleScreen() {
  const gScreen = document.getElementById('game-screen');
  const tScreen = document.getElementById('title-screen');
  if (gScreen) gScreen.hidden = true;
  if (tScreen) tScreen.hidden = false;
  renderSaveSlots();
}

function returnToTitle() {
  activeSaveSlot = null;
  openTitleScreen();
}

function initGame(slot, startFresh) {
  const slotCount = typeof SAVE_SLOT_COUNT !== 'undefined' ? SAVE_SLOT_COUNT : 3;
  if (!Number.isInteger(slot) || slot < 1 || slot > slotCount) return;
  activeSaveSlot = slot;

  if (startFresh) {
    if (typeof initializeNewGameState === 'function') {
      initializeNewGameState();
    }
    
    if (typeof groupName !== 'undefined') {
      groupName = customGroupName;
    }
    if (typeof productionSchedule !== 'undefined') {
      if (productionSchedule['1-1']) {
        productionSchedule['1-1'].songName = customFirstSong;
        if (productionSchedule['1-1'].liveName) {
          productionSchedule['1-1'].liveName = customFirstLiveName;
        }
      }
      if (productionSchedule['1-2']) {
        productionSchedule['1-2'].songName = customSecondSong;
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
    updateUI();
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
