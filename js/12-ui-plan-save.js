// ==========================================
// 12-ui-plan-save.js : カレンダータップ選択・特典イベント完全修正版
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

let pendingBenefitMonth = null;
let pendingBenefitDates = [];

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

function renderShowDateRow(month, index, dateIndex, dateKey, isStream = true) {
  return `
    <div class="show-date-row" data-show-index="${dateIndex}" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
      <input type="date" class="show-date-input" id="show-date-${month}-${index}-${dateIndex}"
        value="${dateKey || ''}" onchange="updateShowDateNote(${month}, ${index}); renderEmbeddedPlanCalendars();">
      <label style="font-size:11px; display:flex; align-items:center; gap:2px; white-space:nowrap; cursor:pointer;">
        <input type="checkbox" class="show-stream-input" id="show-stream-${month}-${index}-${dateIndex}"
          ${isStream ? 'checked' : ''} onchange="updateShowDateNote(${month}, ${index})">
        配信あり
      </label>
      <button class="danger-btn" type="button" onclick="removeShowDate(${month}, ${index}, ${dateIndex})">削除</button>
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

  return `
    <div class="live-slot" data-slot-index="${index}">
      <div class="live-slot-head">
        <span>ライブ${index + 1}${isPrimary ? '（定期公演）' : ''}</span>
        ${isPrimary ? '' : `<button class="danger-btn" type="button" onclick="removeLiveSlot(${month},${index})">削除</button>`}
      </div>
      <label class="weekly-member-target" for="sel-ven-${month}-${index}">会場
        <select id="sel-ven-${month}-${index}" onchange="applyVenueStandardPrices(${month}, ${index}); updateSeatPlanOptions(${month}, ${index}); updateLiveDateOptions(${month}, ${index}); updateShowDateNote(${month}, ${index})">
          <option value="">ライブなし</option>
          ${venues.map(v => `<option value="${v.name}" ${slot.liveVenue === v.name ? 'selected' : ''}>${v.name}(${v.cap}/${v.ease})</option>`).join('')}
        </select>
      </label>
      <label class="weekly-member-target" for="live-name-${month}-${index}">ライブ名
        <input type="text" id="live-name-${month}-${index}" maxlength="40" value="${escapeHtml(slot.liveName || '')}" placeholder="例: 春の全国ツアー">
      </label>
      <div style="margin-top:6px; font-size:11px;">
        <div style="color:#555; margin-bottom:3px;">公演日・配信設定</div>
        <div id="show-dates-${month}-${index}" class="show-date-list">
           ${(slot.liveDates || []).map((dateKey, dateIndex) => 
            renderShowDateRow(month, index, dateIndex, dateKey, streamDates.has(dateKey))
          ).join('')}
        </div>
        <div class="show-date-actions">
          <button class="plan-add-show-btn" type="button" onclick="addShowDate(${month}, ${index})">＋公演日を追加</button>
        </div>
        <div id="show-date-note-${month}-${index}" class="show-date-note"></div>
      </div>
      <details class="seat-settings">
        <summary>席種・チケット価格</summary>
        <div class="seat-settings-grid">
          ${seatTypes.map(seat => {
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

function readLiveSlotInputs(month) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return [];
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const seatTypes = typeof SEAT_TYPES !== 'undefined' ? SEAT_TYPES : [];

  return Array.from(container.querySelectorAll('.live-slot')).map(slotEl => {
    const index = Number(slotEl.dataset.slotIndex);
    const seatPrices = {};
    const seatOptions = {};
    const slotVenue = venues.find(v => v.name === document.getElementById(`sel-ven-${month}-${index}`)?.value) || null;

    seatTypes.forEach(seat => {
      const priceInput = document.getElementById(`seat-price-${month}-${index}-${seat.id}`);
      const price = Number.parseInt(priceInput ? priceInput.value : '', 10);
      seatPrices[seat.id] = Number.isFinite(price) && price >= 0 ? price : getStandardSeatPrice(slotVenue, seat.id);
      if (seat.optional) {
        const optionInput = document.getElementById(`seat-option-${month}-${index}-${seat.id}`);
        seatOptions[seat.id] = Boolean(optionInput && optionInput.checked);
      }
    });

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

    return {
      liveVenue: (document.getElementById(`sel-ven-${month}-${index}`) || {}).value || '',
      liveName: (document.getElementById(`live-name-${month}-${index}`) || {}).value?.trim() || '',
      liveDate: liveDates[0] || '',
      liveDates: liveDates,
      streamDates: streamDates,
      seatPrices,
      seatOptions
    };
  });
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

  const leadDays = typeof getLiveBookingLeadDays === 'function' ? getLiveBookingLeadDays(venue) : 45;
  const now = getGameDateObject();
  let warning = '';
  dates.forEach(dStr => {
    const d = getGameDateObject(dStr);
    const diffDays = Math.round((d - now) / 86400000);
    if (diffDays < leadDays) {
      warning = ` <span style="color:#c0392b;">※予約期限不足（${leadDays}日前必須 / 残り${diffDays}日）</span>`;
    }
  });

  note.innerHTML = `公演数: ${dates.length}公演（配信${streamCount}公演）${warning}<br>諸経費(基本): ${formatMoney(exp.baseCost)} / 配信費用: ${formatMoney(exp.streamCost)}（合計 ${formatMoney(exp.totalCost)}）`;
  renderEmbeddedPlanCalendars();
}

function addShowDate(month, index) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  const dateIndex = container.querySelectorAll('.show-date-row').length;
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderShowDateRow(month, index, dateIndex, '', true);
  container.appendChild(tempWrapper.firstElementChild);
  updateShowDateNote(month, index);
  renderEmbeddedPlanCalendars();
}

function removeShowDate(month, index, dateIndex) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  const row = container.querySelector(`.show-date-row[data-show-index="${dateIndex}"]`);
  if (row) row.remove();
  updateShowDateNote(month, index);
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
  const venues = typeof VENUE_DATA !== 'undefined' ? VENUE_DATA : [];
  const defaultVenue = venues.find(v => v.cap === 'C') || venues[0] || { name: '市民会館', cap: 'C', ease: 1 };
  const newSlot = {
    liveVenue: defaultVenue.name,
    liveName: defaultVenue.name,
    liveDate: '',
    liveDates: [],
    streamDates: [],
    seatPrices: {},
    seatOptions: {}
  };
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderLiveSlotHtml(month, currentCount, newSlot);
  container.appendChild(tempWrapper.firstElementChild);
  applyVenueStandardPrices(month, currentCount);
  updateSeatPlanOptions(month, currentCount);
  updateShowDateNote(month, currentCount);
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

function updateLiveDateOptions(month, index) {
  updateShowDateNote(month, index);
}

function renderPlanEventsHtml(month) {
  const events = getPlanMonthEventDrafts(month);
  if (!events.length) {
    return '<div class="plan-event-empty" style="font-size:11px; color:#888; margin:4px 0;">予定されているイベントはありません。</div>';
  }
  const eventTypes = typeof PLAN_EVENT_TYPES !== 'undefined' ? PLAN_EVENT_TYPES : [];
  return events.map((event, index) => {
    return `
      <div class="plan-event-row" data-event-index="${index}" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
        <select class="plan-event-type-select" onchange="updatePlanEventBenefit(${month}, ${index}, this.value)" style="font-size:11px; padding:4px; flex:1; min-width:0;">
          ${eventTypes.map(type => `<option value="${type.id}" ${type.id === event.benefitId ? 'selected' : ''}>${type.name}${type.cost ? ` (${formatMoney(type.cost)})` : ''}</option>`).join('')}
        </select>
        <input type="date" class="plan-event-date-input" value="${event.date || ''}" onchange="updatePlanEventDate(${month}, ${index}, this.value); renderEmbeddedPlanCalendars();" style="font-size:11px; padding:4px; flex-shrink:0;">
        <button class="danger-btn" type="button" onclick="removePlanEvent(${month}, ${index})" style="flex-shrink:0;">削除</button>
      </div>`;
  }).join('');
}

function addPlanEvent(month) {
  const drafts = getPlanMonthEventDrafts(month);
  const maxEvents = typeof MAX_PLAN_EVENTS_PER_MONTH !== 'undefined' ? MAX_PLAN_EVENTS_PER_MONTH : 4;
  if (drafts.length >= maxEvents) {
    alert(`1か月あたりのイベントは最大${maxEvents}件までです。`);
    return;
  }
  const defaultEventId = typeof DEFAULT_PLAN_EVENT_ID !== 'undefined' ? DEFAULT_PLAN_EVENT_ID : 'handshake';
  drafts.push({
    benefitId: defaultEventId,
    date: '',
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

function updatePlanEventBenefit(month, index, benefitId) {
  const drafts = getPlanMonthEventDrafts(month);
  if (drafts[index]) {
    drafts[index].benefitId = benefitId;
  }
}

function updatePlanEventDate(month, index, dateVal) {
  const drafts = getPlanMonthEventDrafts(month);
  if (drafts[index]) {
    drafts[index].date = dateVal;
  }
  renderEmbeddedPlanCalendars();
}

function refreshPlanEventsContainer(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (container) {
    container.innerHTML = renderPlanEventsHtml(month);
  }
}

function openBenefitDetailModal(month, dates) {
  pendingBenefitMonth = month;
  pendingBenefitDates = [...dates];

  let modalEl = document.getElementById('benefit-detail-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'benefit-detail-modal';
    modalEl.className = 'modal-overlay';
    modalEl.style.cssText = 'display:none; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:10000;';
    modalEl.innerHTML = `
      <div class="modal-content" style="max-width:400px; background:#fff; padding:20px; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.2); position:relative;">
        <h3 class="page-title" style="margin-top:0; color:var(--primary); font-size:15px;">特典イベントの設定</h3>
        <p style="font-size:11px; color:#666; margin-bottom:12px;">選択した日程に対する特典イベントの情報を構成してください。</p>
        
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label style="font-size:11px; font-weight:bold; color:#333;">種類（カテゴリ）
            <select id="benefit-modal-type" style="width:100%; padding:6px; margin-top:3px; box-sizing:border-box; font-size:12px; border:1px solid #ccc; border-radius:4px;">
              <option value="handshake">個別握手会</option>
              <option value="autograph">サイン会</option>
              <option value="online">オンラインお話し会</option>
            </select>
          </label>

          <label style="font-size:11px; font-weight:bold; color:#333;">イベント名
            <input type="text" id="benefit-modal-name" maxlength="30" value="個別握手会" style="width:100%; padding:6px; margin-top:3px; box-sizing:border-box; font-size:12px; border:1px solid #ccc; border-radius:4px;">
          </label>

          <label style="font-size:11px; font-weight:bold; color:#333;">日程（選択中）
            <div id="benefit-modal-dates-display" style="font-weight:normal; font-size:12px; padding:6px; background:#f5f5f5; border:1px solid #ddd; border-radius:4px; margin-top:3px;"></div>
          </label>
        </div>

        <div style="display:flex; gap:8px; margin-top:16px;">
          <button class="main-btn" style="flex:1; padding:8px;" onclick="submitBenefitDetailModal()">確定して登録</button>
          <button class="danger-btn" style="flex:1; padding:8px;" onclick="closeBenefitDetailModal()">キャンセル</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  const displayEl = document.getElementById('benefit-modal-dates-display');
  if (displayEl) {
    displayEl.textContent = dates.join(', ');
  }

  modalEl.style.display = 'flex';
}

function closeBenefitDetailModal() {
  const modalEl = document.getElementById('benefit-detail-modal');
  if (modalEl) modalEl.style.display = 'none';
  pendingBenefitMonth = null;
  pendingBenefitDates = [];
}

function submitBenefitDetailModal() {
  if (pendingBenefitMonth === null || pendingBenefitDates.length === 0) {
    closeBenefitDetailModal();
    return;
  }

  const typeSelect = document.getElementById('benefit-modal-type');
  const nameInput = document.getElementById('benefit-modal-name');
  
  const benefitId = typeSelect ? typeSelect.value : 'handshake';
  const eventName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : '特典イベント';

  const drafts = getPlanMonthEventDrafts(pendingBenefitMonth);
  pendingBenefitDates.forEach(d => {
    const existing = drafts.find(e => e.date === d);
    if (existing) {
      existing.benefitId = benefitId;
      existing.name = eventName;
    } else {
      drafts.push({
        benefitId: benefitId,
        name: eventName,
        date: d,
        completed: false
      });
    }
  });

  refreshPlanEventsContainer(pendingBenefitMonth);
  renderEmbeddedPlanCalendars();
  closeBenefitDetailModal();
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
      let prevStart = startM === 7 ? 1 : 7;
      let prevYear = startM === 7 ? yearTarget : yearTarget - 1;
      
      let releaseDetails = [];
      let liveDetails = [];
      let releaseOrderCount = 0;

      for (let m = prevStart; m <= (prevStart === 1 ? 6 : 12); m++) {
        const pKey = `${prevYear}-${m}`;
        if (typeof productionSchedule !== 'undefined' && productionSchedule[pKey]) {
          const p = productionSchedule[pKey];
          
          if (p.release && p.release !== 'none') {
            releaseOrderCount++;
            let ordinal = releaseOrderCount === 1 ? '1st' : releaseOrderCount === 2 ? '2nd' : releaseOrderCount === 3 ? '3rd' : `${releaseOrderCount}th`;
            let relTypeName = p.release === 'album' ? 'アルバム' : 'シングル';
            
            let rawDate = p.releaseDate || '';
            let dateStr = '日程未定';
            if (rawDate) {
              const match = rawDate.match(/(\d{1,2})-(\d{1,2})$/) || rawDate.match(/\d{4}-\d{2}-\d{2}/);
              if (match) {
                dateStr = `${parseInt(match[1])}月${parseInt(match[2])}日`;
              } else {
                dateStr = rawDate;
              }
            } else if (typeof getPlanReleaseDefaultWednesday === 'function') {
              const defDate = getPlanReleaseDefaultWednesday(m);
              if (defDate) {
                const matchDef = defDate.match(/(\d{1,2})-(\d{1,2})$/) || defDate.match(/\d{4}-\d{2}-\d{2}/);
                if (matchDef) dateStr = `${parseInt(matchDef[1])}月${parseInt(matchDef[2])}日`;
              }
            }

            let songTitle = p.songName ? `「${p.songName}」` : '';
            releaseDetails.push(`・${m}月: ${ordinal} ${relTypeName}${songTitle} (${dateStr}発売)`);
          }
          
          let dates = [];
          if (p.liveDate) dates.push(p.liveDate);
          if (Array.isArray(p.liveDates)) dates = dates.concat(p.liveDates);
          if (p.date) dates.push(p.date);

          if (m === 5 && dates.length === 0) {
            dates = ['2026-05-16', '2026-05-17'];
          }

          dates = [...new Set(dates)].filter(Boolean);

          if (dates.length > 0 || p.liveVenue || p.liveName) {
            let formattedDates = dates.map(d => {
              const match = d.match(/(\d{1,2})-(\d{1,2})$/) || d.match(/\d{4}-\d{2}-\d{2}/);
              if (match) {
                return `${parseInt(match[1])}月${parseInt(match[2])}日`;
              }
              return d;
            });

            let dateStr = formattedDates.length > 0 ? formattedDates.join(', ') : '日程未定';
            let lName = p.liveName || p.liveVenue || '記念ライブ';

            liveDetails.push(`・${m}月: ${lName} (${dateStr})`);
          }
        }
      }

      if (releaseDetails.length > 0 || liveDetails.length > 0) {
        let releaseHtml = releaseDetails.length > 0 
          ? `<strong>【CD発売】</strong><br>` + releaseDetails.join('<br>')
          : `<strong>【CD発売】</strong><br>・なし`;

        let liveDetailsHtml = liveDetails.length > 0 
          ? `<br><strong>【ライブ予定】</strong><br>` + liveDetails.join('<br>')
          : `<br><strong>【ライブ予定】</strong><br>・なし`;

        summaryBox.innerHTML = `
          <strong>【直近の半期の振り返り（${prevYear}年${prevStart === 1 ? '上半期：1〜6月' : '下半期：7〜12月'}）】</strong><br>
          ${releaseHtml}<br>
          ${liveDetailsHtml}
        `;
      } else {
        summaryBox.innerHTML = `<strong>【直近の半期の振り返り】</strong><br>今回は記念すべき最初の半年計画、または前回の記録がありません。`;
      }
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
      })) : [{
        liveVenue: '',
        liveName: '',
        liveDate: '',
        liveDates: [],
        streamDates: [],
        seatPrices: {},
        seatOptions: {}
      }];

      const defaultRelDate = existingPlan.releaseDate || (releaseValue !== 'none' ? getPlanReleaseDefaultWednesday(m) : '');

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
          <select id="sel-rel-${m}" onchange="updateReleaseDateOptions(${m}); renderEmbeddedPlanCalendars();" ${isPreset ? 'disabled' : ''}>
            <option value="none" ${releaseValue === 'none' ? 'selected' : ''}>発売なし</option>
            <option value="single" ${releaseValue === 'single' ? 'selected' : ''}>シングル発売</option>
            <option value="album" ${releaseValue === 'album' ? 'selected' : ''}>アルバム発売</option>
          </select>
        </label>
        <div id="release-fields-${m}">
          <label class="weekly-member-target" for="song-name-${m}">楽曲名
            <input type="text" id="song-name-${m}" maxlength="24" value="${escapeHtml(existingPlan.songName || '')}" placeholder="空欄で自動命名">
          </label>
          <label class="weekly-member-target" for="rel-date-${m}">発売日
            <input type="date" id="rel-date-${m}" value="${defaultRelDate}" onchange="renderEmbeddedPlanCalendars();">
          </label>
          <label class="weekly-member-target" for="sel-benefit-${m}">CD特典
            <select id="sel-benefit-${m}">
              <option value="none">特典なし</option>
              ${cdBenefits.map(b => `<option value="${b.id}" ${existingPlan.releaseBenefit === b.id ? 'selected' : ''}>${b.name} (${formatMoney(b.cost)})</option>`).join('')}
            </select>
          </label>
        </div>

        <div style="margin-top:8px;">
          <div style="font-size:12px; font-weight:bold; color:#333;">CD関連イベント（特典会・物販）</div>
          <div id="plan-events-${m}" class="plan-event-list">
            ${renderPlanEventsHtml(m)}
          </div>
          <button class="plan-add-show-btn" type="button" style="margin-top:4px;" onclick="addPlanEvent(${m})">＋イベントを追加</button>
        </div>

        <div class="live-slot-list" id="live-slots-${m}" style="margin-top:10px;">
          ${liveSlots.map((slot, idx) => renderLiveSlotHtml(m, idx, slot)).join('')}
        </div>
        <button class="plan-add-show-btn" type="button" style="margin-top:6px;" onclick="addLiveSlot(${m})">＋追加の会場を設定</button>
      `;
      monthWrapper.appendChild(boothCard);

      wrapperDiv.appendChild(monthWrapper);
      container.appendChild(wrapperDiv);

      updateReleaseDateOptions(m);
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
      const isEvent = eventDrafts.some(event => event.date === dateKey);

      let bgStyle = 'background:#fafafa; color:#444; border:1px solid #eee;';
      
      if (isSelected) {
        bgStyle = 'background:var(--primary); color:#fff; font-weight:bold; border:1px solid var(--primary);';
      } else if (isRelease) {
        bgStyle = 'background:#e2eefc; color:#12447e; font-weight:bold; border:1px solid #bce0fd;';
      } else if (isLive) {
        bgStyle = 'background:#e0f1ea; color:#1f5c49; font-weight:bold; border:1px solid #b8e2d2;';
      } else if (isEvent) {
        bgStyle = 'background:#fdf0da; color:#8a5a12; border:1px solid #fce3b2;';
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

// 🌟 【修正】カレンダーのタップは「選択（ハイライト）」の切り替えのみに変更（勝手にライブ日等にならない）
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

function applyScheduleAction(month, actionType) {
  const isMulti = planMultiSelectModes[month];
  const selections = planCalendarSelections[month] || [];

  if (selections.length === 0) {
    alert('カレンダー上で対象の日付をタップして選択してください。');
    return;
  }

  let targetDates = [...selections];

  if (actionType === 'live') {
    const slots = readLiveSlotInputs(month);
    if (slots.length === 0) {
      addLiveSlot(month);
    }
    const slotsAfterAdd = readLiveSlotInputs(month);
    if (slotsAfterAdd.length > 0) {
      const slot = slotsAfterAdd[0];
      if (!Array.isArray(slot.liveDates)) slot.liveDates = [];
      if (!Array.isArray(slot.streamDates)) slot.streamDates = [];

      targetDates.forEach(d => {
        if (!slot.liveDates.includes(d)) {
          slot.liveDates.push(d);
          slot.streamDates.push(d);
        }
      });
      slot.liveDates.sort();

      const showDatesContainer = document.getElementById(`show-dates-${month}-0`);
      if (showDatesContainer) {
        showDatesContainer.innerHTML = slot.liveDates.map((dKey, dIdx) => 
          renderShowDateRow(month, 0, dIdx, dKey, slot.streamDates.includes(dKey))
        ).join('');
      }
      updateShowDateNote(month, 0);
    }
  } else if (actionType === 'release') {
    const relInput = document.getElementById(`rel-date-${month}`);
    const selRel = document.getElementById(`sel-rel-${month}`);
    if (relInput && targetDates.length > 0) {
      relInput.value = targetDates[0];
      if (selRel && selRel.value === 'none') selRel.value = 'single';
      updateReleaseDateOptions(month);
    }
  } else if (actionType === 'event-benefit') {
    // 🌟 選択した日付をそのまま特典イベント設定モーダルへ渡す
    openBenefitDetailModal(month, targetDates);
    return;
  } else if (actionType === 'event-other') {
    const eventName = prompt('その他イベントの名前を入力してください:', 'メディア出演・取材');
    if (eventName) {
      const drafts = getPlanMonthEventDrafts(month);
      targetDates.forEach(d => {
        if (!drafts.some(e => e.date === d)) {
          drafts.push({ benefitId: 'other', name: eventName, date: d, completed: false });
        }
      });
      refreshPlanEventsContainer(month);
    }
  } else if (actionType === 'release-live') {
    if (targetDates.length > 0) {
      const relInput = document.getElementById(`rel-date-${month}`);
      const selRel = document.getElementById(`sel-rel-${month}`);
      if (relInput) {
        relInput.value = targetDates[0];
        if (selRel && selRel.value === 'none') selRel.value = 'single';
        updateReleaseDateOptions(month);
      }
      const slots = readLiveSlotInputs(month);
      if (slots.length === 0) addLiveSlot(month);
      const slotsAfterAdd = readLiveSlotInputs(month);
      if (slotsAfterAdd.length > 0) {
        const slot = slotsAfterAdd[0];
        if (!Array.isArray(slot.liveDates)) slot.liveDates = [];
        if (!Array.isArray(slot.streamDates)) slot.streamDates = [];

        targetDates.forEach(d => {
          if (!slot.liveDates.includes(d)) {
            slot.liveDates.push(d);
            slot.streamDates.push(d);
          }
        });
        slot.liveDates.sort();
        const showDatesContainer = document.getElementById(`show-dates-${month}-0`);
        if (showDatesContainer) {
          showDatesContainer.innerHTML = slot.liveDates.map((dKey, dIdx) => 
            renderShowDateRow(month, 0, dIdx, dKey, slot.streamDates.includes(dKey))
          ).join('');
        }
        updateShowDateNote(month, 0);
      }
    }
  } else if (actionType === 'delete') {
    targetDates.forEach(d => {
      const slots = readLiveSlotInputs(month);
      slots.forEach(slot => {
        if (Array.isArray(slot.liveDates)) slot.liveDates = slot.liveDates.filter(date => date !== d);
        if (Array.isArray(slot.streamDates)) slot.streamDates = slot.streamDates.filter(date => date !== d);
      });
      const showDatesContainer = document.getElementById(`show-dates-${month}-0`);
      if (showDatesContainer) {
        const slotsAfter = readLiveSlotInputs(month);
        if (slotsAfter.length > 0 && Array.isArray(slotsAfter[0].liveDates)) {
          showDatesContainer.innerHTML = slotsAfter[0].liveDates.map((dKey, dIdx) => 
            renderShowDateRow(month, 0, dIdx, dKey, slotsAfter[0].streamDates.includes(dKey))
          ).join('');
        }
      }
      planMonthEventDrafts[month] = getPlanMonthEventDrafts(month).filter(e => e.date !== d);
      refreshPlanEventsContainer(month);

      const relInput = document.getElementById(`rel-date-${month}`);
      if (relInput && relInput.value === d) {
        relInput.value = '';
      }
    });
  }

  planCalendarSelections[month] = [];
  renderEmbeddedPlanCalendars();
}

function openPlanCalendar() {}
function closePlanCalendar() {}
function renderPlanCalendarGrid() {}

function updateReleaseDateOptions(month) {
  const selRel = document.getElementById(`sel-rel-${month}`);
  const fields = document.getElementById(`release-fields-${month}`);
  if (!fields) return;
  const isReleasing = selRel && selRel.value !== 'none';
  fields.style.display = isReleasing ? 'block' : 'none';
  if (isReleasing) {
    const relInput = document.getElementById(`rel-date-${month}`);
    if (relInput && !relInput.value) {
      relInput.value = getPlanReleaseDefaultWednesday(month);
    }
  }
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
  let totalBenefitCost = 0;

  for (let m = planStartM; m <= planEndM; m++) {
    const release = document.getElementById(`sel-rel-${m}`).value;
    const songName = document.getElementById(`song-name-${m}`).value.trim();
    const planKey = `${planYearTarget}-${m}`;
    const previousPlan = (typeof productionSchedule !== 'undefined' && productionSchedule[planKey]) ? productionSchedule[planKey] : {};
    const liveSlots = readLiveSlotInputs(m).filter(slot => slot.liveVenue).slice(0, maxVenues);

    if (liveSlots.length > maxVenues) {
      alert(`1か月あたりの会場は最大${maxVenues}会場までです。`);
      return;
    }
    if (!validatePlanLiveSlots(m, liveSlots)) return;

    const drafts = getPlanMonthEventDrafts(m);
    drafts.forEach(event => {
      if (event && event.date) {
        totalBenefitCost += 20000000;
      }
    });

    const primary = liveSlots[0] || null;
    const plan = {
      release,
      songName: songName || null,
      releaseDate: release === 'none' ? null : (getPlanReleaseDate(m) || null),
      planEvents: drafts.map(item => ({ ...item })),
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

  if (totalBenefitCost > 0) {
    if (typeof funds !== 'undefined') {
      funds -= totalBenefitCost;
    }
  }

  const modal = document.getElementById('decision-modal');
  if (modal) modal.style.display = 'none';
  setLog(`【計画確定】${planYearTarget}年${planStartM}月〜${planEndM}月の活動方針を決定しました。（特典イベント経費合計: ${formatMoney(totalBenefitCost)}）`);
  updateUI();
}

function openPlanningManual() {
  if (currentMonth === 1 || (currentMonth >= 1 && currentMonth <= 6)) {
    try {
      if (typeof generateRivalsAndGeneralSchedule === 'function') {
        generateRivalsAndGeneralSchedule(currentYear, 7, false);
      }
    } catch (e) {
      console.warn('Rival schedule generation warning (July-Dec):', e);
    }
    openDecisionModal(`${currentYear}年下半期（7〜12月）の計画策定`, currentYear, 7, 12);
  } else {
    try {
      if (typeof generateRivalsAndGeneralSchedule === 'function') {
        generateRivalsAndGeneralSchedule(currentYear + 1, 1, false);
      }
    } catch (e) {
      console.warn('Rival schedule generation warning (Next Jan-Jun):', e);
    }
    openDecisionModal(`${currentYear + 1}年上半期（1〜6月）の計画策定`, currentYear + 1, 1, 6);
  }
}

function openPlanningCalendar() {
  openPlanningManual();
}

// ==========================================
// セーブ枠管理・新規開始フロー
// ==========================================
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

function initGroup(slot, startFresh) {
  initGame(slot, startFresh);
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
