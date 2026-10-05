// ==========================================
// 12-ui-plan-save.js : 半年計画・カレンダー・セーブ（完全同期・ライバル連動版）
// ==========================================

let planYearTarget = 1;
let planStartM = 1;
let planEndM = 6;
let planCalendarMonth = 1;
let planCalendarYear = 1;
let planCalendarSelection = [];
let planCalendarRangeMode = false;
let planMonthEventDrafts = {};

function isPresetReleaseMonth(month) {
  return planYearTarget === 1 && typeof PRESET_RELEASE_MONTHS !== 'undefined' && PRESET_RELEASE_MONTHS.includes(month);
}

function getPlanCalendarDate(month, day) {
  const actualYear = calendarYear + (planYearTarget - currentYear);
  return new Date(actualYear, month - 1, day, 12);
}

function formatPlanDayLabel(dateKey) {
  if (!dateKey) return '';
  const date = getGameDateObject(dateKey);
  const weekdays = typeof PLAN_CALENDAR_WEEKDAYS !== 'undefined' ? PLAN_CALENDAR_WEEKDAYS : ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
}

function getPlanEventType(benefitId) {
  if (typeof PLAN_EVENT_TYPES === 'undefined') return null;
  return PLAN_EVENT_TYPES.find(item => item.id === benefitId) || null;
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

function normalizeLiveDays(days) {
  const value = Number.parseInt(days, 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(3, value);
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
  const actualYear = calendarYear + (planYearTarget - currentYear);
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
        value="${dateKey || ''}" onchange="updateShowDateNote(${month}, ${index})">
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
        <div style="color:#555; margin-bottom:3px;">公演日・配信設定（日程ごとに配信の有無を選択可）</div>
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
}

function addShowDate(month, index) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  const dateIndex = container.querySelectorAll('.show-date-row').length;
  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = renderShowDateRow(month, index, dateIndex, '', true);
  container.appendChild(tempWrapper.firstElementChild);
  updateShowDateNote(month, index);
}

function removeShowDate(month, index, dateIndex) {
  const container = document.getElementById(`show-dates-${month}-${index}`);
  if (!container) return;
  const row = container.querySelector(`.show-date-row[data-show-index="${dateIndex}"]`);
  if (row) row.remove();
  updateShowDateNote(month, index);
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
}

function removeLiveSlot(month, index) {
  const container = document.getElementById(`live-slots-${month}`);
  if (!container) return;
  const slotEl = container.querySelector(`.live-slot[data-slot-index="${index}"]`);
  if (slotEl) slotEl.remove();
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
        <select class="plan-event-type-select" onchange="updatePlanEventBenefit(${month}, ${index}, this.value)" style="font-size:11px;">
          ${eventTypes.map(type => `<option value="${type.id}" ${type.id === event.benefitId ? 'selected' : ''}>${type.name}${type.cost ? ` (${formatMoney(type.cost)})` : ''}</option>`).join('')}
        </select>
        <input type="date" class="plan-event-date-input" value="${event.date || ''}" onchange="updatePlanEventDate(${month}, ${index}, this.value)" style="font-size:11px;">
        <button class="danger-btn" type="button" onclick="removePlanEvent(${month}, ${index})">削除</button>
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
}

function refreshPlanEventsContainer(month) {
  const container = document.getElementById(`plan-events-${month}`);
  if (container) {
    container.innerHTML = renderPlanEventsHtml(month);
  }
}

// 半年計画策定モーダル
function openDecisionModal(title, yearTarget, startM, endM) {
  try {
    planYearTarget = yearTarget;
    planStartM = startM;
    planEndM = endM;
    planMonthEventDrafts = {};
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = title;

    // ==========================================
    // ★重要：ユーザーがスケジュールを組む前に、ライバルたちが先に予定を決定する！
    // ==========================================
    try {
      const isFirstEver = (yearTarget === 1 && startM === 1 && (!rivalLiveBookings || rivalLiveBookings.length === 0));
      if (typeof generateRivalsAndGeneralSchedule === 'function') {
        generateRivalsAndGeneralSchedule(yearTarget, startM, isFirstEver);
      }
    } catch (err) {
      console.warn('Rival schedule generation warning:', err);
    }

    // ==========================================
    // 1. 直前の半期の振り返り（助数詞付きCD発売＆正確な日付入りライブ）
    // ==========================================
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
              const match = rawDate.match(/(\d{1,2})-(\d{1,2})$/) || rawDate.match(/\d{4}-(\d{2})-(\d{2})/);
              if (match) {
                dateStr = `${parseInt(match[1])}月${parseInt(match[2])}日`;
              } else {
                dateStr = rawDate;
              }
            } else if (typeof getPlanReleaseDefaultWednesday === 'function') {
              const defDate = getPlanReleaseDefaultWednesday(m);
              if (defDate) {
                const matchDef = defDate.match(/(\d{1,2})-(\d{1,2})$/) || defDate.match(/\d{4}-(\d{2})-(\d{2})/);
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
              const match = d.match(/(\d{1,2})-(\d{1,2})$/) || d.match(/\d{4}-(\d{2})-(\d{2})/);
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

        let liveHtml = liveDetails.length > 0 
          ? `<br><strong>【ライブ予定】</strong><br>` + liveDetails.join('<br>')
          : `<br><strong>【ライブ予定】</strong><br>・なし`;

        summaryBox.innerHTML = `
          <strong>【直近の半期の振り返り（${prevYear}年${prevStart === 1 ? '上半期：1〜6月' : '下半期：7〜12月'}）】</strong><br>
          ${releaseHtml}<br>
          ${liveHtml}
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

    // ★ここで rivals 変数を安全に定義する
    const rivals = Array.isArray(rivalLiveBookings) ? rivalLiveBookings : [];

    for (let m = startM; m <= endM; m++) {
      const monthRivals = rivals.filter(b => {
        const bDate = b.liveDate || b.date || '';
        return bDate.startsWith(`${yearTarget}-${String(m).padStart(2, '0')}`);
      });

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

      const monthBlock = document.createElement('div');
      monthBlock.className = 'plan-month-block';
      monthBlock.id = `plan-month-block-${m}`;
      monthBlock.innerHTML = `
        <div class="plan-month-title">${m}月の活動方針</div>
        <label class="weekly-member-target" for="sel-rel-${m}">CD発売
          <select id="sel-rel-${m}" onchange="updateReleaseDateOptions(${m})" ${isPreset ? 'disabled' : ''}>
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
            <input type="date" id="rel-date-${m}" value="${defaultRelDate}">
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
      container.appendChild(monthBlock);
      updateReleaseDateOptions(m);
      liveSlots.forEach((_, idx) => {
        updateSeatPlanOptions(m, idx);
        updateShowDateNote(m, idx);
      });
    }

    const modal = document.getElementById('decision-modal');
    if (modal) modal.style.display = 'flex';
  } catch (e) {
    console.error('openDecisionModal error:', e);
    alert('半年計画画面を開く際にエラーが発生しました。');
  }
}

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

    for (const d of slot.liveDates) {
      if (usedDates.has(d)) {
        alert(`${month}月の中で公演日（${d}）が重複しています。`);
        return false;
      }
      usedDates.add(d);

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

// ==========================================
// 計画保存時に関与してライバル予定も自動再生成する
// ==========================================
function saveDecisionPlan() {
  const maxVenues = typeof MAX_LIVE_VENUES_PER_MONTH !== 'undefined' ? MAX_LIVE_VENUES_PER_MONTH : 2;
  const presetRelType = typeof PRESET_RELEASE_TYPE !== 'undefined' ? PRESET_RELEASE_TYPE : 'single';

  for (let m = planStartM; m <= planEndM; m++) {
    const release = isPresetReleaseMonth(m) ? presetRelType : document.getElementById(`sel-rel-${m}`).value;
    const songName = document.getElementById(`song-name-${m}`).value.trim();
    const planKey = `${planYearTarget}-${m}`;
    const previousPlan = (typeof productionSchedule !== 'undefined' && productionSchedule[planKey]) ? productionSchedule[planKey] : {};
    const liveSlots = readLiveSlotInputs(m).filter(slot => slot.liveVenue).slice(0, maxVenues);

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
      planEvents: getPlanMonthEventDrafts(m).map(item => ({ ...item })),
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

  // 半年計画の決定と同時にライバルたちの新しいスケジュールを動的生成！
  generateRivalsAndGeneralSchedule(planYearTarget, planStartM);

  closePlanCalendar();
  const modal = document.getElementById('decision-modal');
  if (modal) modal.style.display = 'none';
  setLog(`【計画確定】${planYearTarget}年${planStartM}月〜${planEndM}月の活動方針を決定し、ライバルグループの新しいスケジュールが発表されました。`);
  updateUI();
}

function openPlanningManual() {
  if (currentMonth >= 7) {
    openDecisionModal('翌年1月〜6月の計画策定', currentYear + 1, 1, 6);
  } else {
    openDecisionModal('当年7月〜12月の計画策定', currentYear, 7, 12);
  }
}

function openPlanningCalendar() {
  const targetYear = currentMonth >= 7 ? currentYear + 1 : currentYear;
  const startM = currentMonth >= 7 ? 1 : 7;
  const endM = currentMonth >= 7 ? 6 : 12;
  openDecisionModal(`${targetYear}年${startM}月〜${endM}月の計画策定`, targetYear, startM, endM);
  openPlanCalendar();
}

function openPlanCalendar() {
  planCalendarMonth = planStartM;
  planCalendarYear = planYearTarget;
  planCalendarSelection = [];
  const modal = document.getElementById('plan-calendar-modal');
  if (modal) modal.style.display = 'flex';
  renderPlanCalendarGrid();
}

function closePlanCalendar() {
  const modal = document.getElementById('plan-calendar-modal');
  if (modal) modal.style.display = 'none';
}

function renderPlanCalendarGrid() {
  const container = document.getElementById('plan-calendar-grid');
  if (!container) return;
  container.innerHTML = '';
  
  const actualYear = calendarYear + (planYearTarget - currentYear);
  const weekdays = typeof PLAN_CALENDAR_WEEKDAYS !== 'undefined' ? PLAN_CALENDAR_WEEKDAYS : ['日', '月', '火', '水', '木', '金', '土'];
  
  // ライバルたちの予定配列を確実に取得
  const rivals = Array.isArray(rivalLiveBookings) ? rivalLiveBookings : [];

  for (let m = planStartM; m <= planEndM; m++) {
    const firstWeekday = new Date(actualYear, m - 1, 1, 12).getDay();
    const daysInMonth = new Date(actualYear, m, 0, 12).getDate();
    let cells = weekdays.map(w => `<span class="calendar-weekday">${w}</span>`).join('');

    for (let c = 0; c < 42; c++) {
      const day = c - firstWeekday + 1;
      if (day < 1 || day > daysInMonth) {
        cells += '<span class="calendar-day" aria-hidden="true"></span>';
        continue;
      }
      
      const dateObj = new Date(actualYear, m - 1, day, 12);
      const dateKey = toDateKey(dateObj); // "YYYY-MM-DD" 形式
      
      const isSelected = planCalendarSelection.includes(dateKey);
      const isRelease = getPlanReleaseDate(m) === dateKey;
      const liveEntries = readLiveSlotInputs(m);
      const isLive = liveEntries.some(slot => slot.liveDates.includes(dateKey));
      const eventDrafts = getPlanMonthEventDrafts(m);
      const isEvent = eventDrafts.some(event => event.date === dateKey);

      // ★強力な照合：日付文字列が完全に一致するもの、または前方一致するものも含めて確実にヒットさせる
      const rivalConflicts = rivals.filter(booking => {
        const bDate = booking.liveDate || booking.date || '';
        if (!bDate) return false;
        // 完全一致、または日付部分のプレ一致を許容
        return bDate === dateKey || bDate.startsWith(dateKey) || dateKey.startsWith(bDate);
      });

      const hasRival = rivalConflicts.length > 0;

      const classes = [
        'calendar-day',
        isSelected ? 'plan-selected' : '',
        isRelease ? 'release-day' : '',
        isLive ? 'live-day' : '',
        isEvent ? 'plan-event-day' : '',
        hasRival ? 'rival-live-day' : '' // カレンダー上で他グループの予定日としてハイライト
      ].filter(Boolean).join(' ');

      // ツールチップ用の文字列生成
      const rivalTitles = rivalConflicts.map(rc => `${rc.groupName || '他グループ'}: ${rc.liveName || rc.liveVenue || 'イベント'}`).join(' / ');

      const title = [
        isRelease ? 'CD発売' : '',
        isLive ? '自グループライブ' : '',
        isEvent ? 'CD関連イベント' : '',
        rivalTitles ? `他グループ予定: ${rivalTitles}` : ''
      ].filter(Boolean).join(' / ');

      cells += `<span class="${classes}" ${title ? `title="${escapeHtml(title)}"` : ''} onclick="togglePlanCalendarDate('${dateKey}')">${day}</span>`;
    }

    const monthSheet = document.createElement('div');
    monthSheet.className = 'plan-calendar-month';
    monthSheet.innerHTML = `<strong>${actualYear}年${m}月</strong><div class="calendar-grid">${cells}</div>`;
    container.appendChild(monthSheet);
  }
}

function togglePlanCalendarDate(dateKey) {
  const index = planCalendarSelection.indexOf(dateKey);
  if (index >= 0) {
    planCalendarSelection.splice(index, 1);
  } else {
    if (planCalendarRangeMode && planCalendarSelection.length > 0) {
      const last = planCalendarSelection[planCalendarSelection.length - 1];
      const start = new Date(`${last}T12:00:00`);
      const end = new Date(`${dateKey}T12:00:00`);
      if (start > end) {
        const tmp = new Date(start);
        start.setTime(end.getTime());
        end.setTime(tmp.getTime());
      }
      const curr = new Date(start);
      while (curr <= end) {
        const k = toDateKey(curr);
        if (!planCalendarSelection.includes(k)) planCalendarSelection.push(k);
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      planCalendarSelection.push(dateKey);
    }
  }
  renderPlanCalendarGrid();
}

function clearPlanCalendarSelection() {
  planCalendarSelection = [];
  renderPlanCalendarGrid();
}

function togglePlanCalendarRangeMode() {
  planCalendarRangeMode = !planCalendarRangeMode;
  const btn = document.getElementById('plan-calendar-range-toggle');
  if (btn) btn.textContent = `範囲選択: ${planCalendarRangeMode ? 'ON' : 'OFF'}`;
}

function applyPlanCalendarMark(kind) {
  if (!planCalendarSelection.length) {
    alert('カレンダー上で日付を選択してください。');
    return;
  }
  planCalendarSelection.forEach(dateKey => {
    const m = Number(dateKey.slice(5, 7));
    if (m < planStartM || m > planEndM) return;

    if (kind === 'release') {
      const relInput = document.getElementById(`rel-date-${m}`);
      if (relInput) relInput.value = dateKey;
      const selRel = document.getElementById(`sel-rel-${m}`);
      if (selRel && selRel.value === 'none') selRel.value = 'single';
      updateReleaseDateOptions(m);
    } else if (kind === 'live') {
      const slots = readLiveSlotInputs(m);
      if (slots.length > 0) {
        if (!slots[0].liveDates.includes(dateKey)) {
          slots[0].liveDates.push(dateKey);
          slots[0].streamDates.push(dateKey);
        }
        const container = document.getElementById(`live-slots-${m}`);
        if (container) {
          container.innerHTML = slots.map((s, idx) => renderLiveSlotHtml(m, idx, s)).join('');
          slots.forEach((_, idx) => {
            updateSeatPlanOptions(m, idx);
            updateShowDateNote(m, idx);
          });
        }
      }
    } else if (kind === 'event') {
      const drafts = getPlanMonthEventDrafts(m);
      const maxEvents = typeof MAX_PLAN_EVENTS_PER_MONTH !== 'undefined' ? MAX_PLAN_EVENTS_PER_MONTH : 4;
      const defaultEventId = typeof DEFAULT_PLAN_EVENT_ID !== 'undefined' ? DEFAULT_PLAN_EVENT_ID : 'handshake';
      if (drafts.length < maxEvents && !drafts.some(e => e.date === dateKey)) {
        drafts.push({ benefitId: defaultEventId, date: dateKey, completed: false });
        refreshPlanEventsContainer(m);
      }
    } else if (kind === 'clear') {
      const slots = readLiveSlotInputs(m);
      slots.forEach(slot => {
        slot.liveDates = slot.liveDates.filter(d => d !== dateKey);
        slot.streamDates = slot.streamDates.filter(d => d !== dateKey);
      });
      const container = document.getElementById(`live-slots-${m}`);
      if (container) {
        container.innerHTML = slots.map((s, idx) => renderLiveSlotHtml(m, idx, s)).join('');
        slots.forEach((_, idx) => {
          updateSeatPlanOptions(m, idx);
          updateShowDateNote(m, idx);
        });
      }
      const drafts = getPlanMonthEventDrafts(m);
      planMonthEventDrafts[m] = drafts.filter(e => e.date !== dateKey);
      refreshPlanEventsContainer(m);
    }
  });

  clearPlanCalendarSelection();
  renderPlanCalendarGrid();
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
  initGame(slot, true);
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
    if (typeof initializeNewGameState === 'function') initializeNewGameState();
  } else {
    const raw = localStorage.getItem(saveSlotKey(slot));
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (typeof applySavedGame === 'function') applySavedGame(data);
      } catch (e) {
        alert('セーブデータの読み込みに失敗しました。新規開始してください。');
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
    if (typeof openDecisionModal === 'function') {
      openDecisionModal('当年7月〜12月の計画策定', 1, 7, 12);
    }
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
