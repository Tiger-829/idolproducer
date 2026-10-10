// 事務所タブ
function renderWeeklyActionPanel() {
  const panel = document.getElementById('weekly-action-panel');
  if (!panel) return;

  try {
    if (typeof ensureWeeklySchedule === 'function') {
      ensureWeeklySchedule();
    }

    const currentDate = (typeof getGameDateObject === 'function') ? getGameDateObject() : new Date();

    const nextLiveDate = (typeof findWeekLiveStop === 'function') ? findWeekLiveStop(currentDate) : null;
    const editableSpecialLiveEvents = (typeof getEditableSpecialLiveEventsForWeek === 'function') ? getEditableSpecialLiveEventsForWeek(currentDate) : [];

    if (nextLiveDate && !editableSpecialLiveEvents.length) {
      const liveDateKey = (typeof toDateKey === 'function') ? toDateKey(nextLiveDate) : '';
      const liveDate = (typeof getGameDateObject === 'function') ? getGameDateObject(liveDateKey) : new Date();
      const liveLabel = liveDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
      const liveEntries = (typeof getScheduledLiveEntries === 'function') ? getScheduledLiveEntries().filter(entry =>
        entry && !entry.completed && typeof getLiveEntryDate === 'function' && toDateKey(getLiveEntryDate(entry, entry.calendarYear, entry.month)) === liveDateKey
      ) : [];
      const liveDetail = liveEntries.length
        ? liveEntries.map(entry => {
          const days = (typeof getLiveEntryShowDates === 'function') ? getLiveEntryShowDates(entry) : [];
          const suffix = days.length > 1 ? `（${days.length}公演：${days.map(key => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`).join('・')}）` : '';
          return `${entry.liveVenue}${suffix}`;
        }).join(' / ')
        : '';

      panel.innerHTML = `
        <h2 class="page-title">今週の行動</h2>
        <div class="weekly-event-note"><strong>ライブ週</strong><ul>
          <li>${escapeHtml(`${liveLabel}にライブが行われたため、ライブ前はリハーサルを行い、ライブ後には休養を取りました。`)}</li>
          ${liveDetail ? `<li>${escapeHtml(`公演: ${liveDetail}`)}</li>` : ''}
        </ul></div>
        <button class="main-btn" style="width:100%; margin-top:8px;" onclick="advanceOneWeek()">イベントまで進行</button>
      `;
      return;
    }

    if (currentDate.getDay() !== 3) {
      const nextWed = (typeof getNextWednesday === 'function') 
        ? getNextWednesday(currentDate) 
        : new Date(currentDate.getTime() + ((3 - currentDate.getDay() + 7) % 7 || 7) * 86400000);
      const dateLabel = nextWed.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

      panel.innerHTML = `
        <h2 class="page-title">今週の行動</h2>
        <div class="weekly-event-note"><strong>水曜日まで進行</strong><ul>
          <li>現在は${currentDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}です。</li>
          <li>次のスケジュール設定日（${dateLabel}）まで進めます。</li>
        </ul></div>
        <button class="main-btn" style="width:100%; margin-top:8px;" onclick="advanceOneWeek()">水曜日まで進行</button>
      `;
      return;
    }

    const notes = [];
    const externalLiveNotes = editableSpecialLiveEvents.map(event =>
      `${event.name}（${event.liveDate} / ${event.venue}）: 前日〜当日午前はリハーサル、翌日は全日休養で固定`
    );
    notes.push(...externalLiveNotes);

    panel.innerHTML = `
      <h2 class="page-title">今週のスケジュール</h2>
      ${notes.length ? `<div class="weekly-event-note"><ul>${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : ''}
      ${renderWeeklyScheduleControls()}
    `;
  } catch (err) {
    console.error('renderWeeklyActionPanel Error:', err);
    panel.innerHTML = `
      <div style="padding:12px; background:#fde8e8; border:1px solid #c0392b; border-radius:6px; color:#c0392b;">
        <strong>【表示エラー】スケジュールUIの描画中にエラーが発生しました</strong><br>
        <small style="font-family:monospace;">${escapeHtml(err.stack || err.message)}</small>
      </div>
    `;
  }
}

// 週次スケジュールControlsを描画する。
function renderWeeklyScheduleControls() {
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) {
    weeklySchedule = {
      slots: new Array(14).fill(''),
      vacation: false,
      individualMemberId: '',
      individualStat: 'vocal',
      restDayMembers: [],
      officeAction: ''
    };
  }

  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const members = roster.filter(member => member && member.isSelected);
  const restDayIds = new Set(weeklySchedule.restDayMembers || []);

  const individualOptions = getIndividualLessonMemberOptions();
  const memberOptions = individualOptions.map(member => {
    const name = typeof formatMemberDisplayName === 'function' ? formatMemberDisplayName(member) : member.name;
    const age = member.age || 18;
    const stamina = member.staminaValue ?? 100;
    return `<option value="${member.id}" ${member.id === weeklySchedule.individualMemberId ? 'selected' : ''}>` +
      escapeHtml(`${name}（${age}歳 / 体力${stamina}）`) +
      `</option>`;
  }).join('');
  const validStats = typeof INDIVIDUAL_LESSON_STATS !== 'undefined' ? INDIVIDUAL_LESSON_STATS : ['vocal', 'dance', 'stamina', 'recovery'];
  const statusKeys = typeof STATUS_KEYS !== 'undefined' ? STATUS_KEYS : [
    { id: 'vocal', name: '歌唱力' }, { id: 'dance', name: 'ダンス' }, { id: 'stamina', name: '体力' }, { id: 'recovery', name: '回復力' }
  ];

  const lessonStatOptions = validStats.map(statId => {
    const stat = statusKeys.find(key => key.id === statId);
    return `<option value="${statId}" ${statId === weeklySchedule.individualStat ? 'selected' : ''}>${stat ? escapeHtml(stat.name) : statId}</option>`;
  }).join('');

  const selectedStatName = statusKeys.find(key => key.id === weeklySchedule.individualStat)?.name || '歌唱力';
  const selectedMember = roster.find(m => m && m.id === weeklySchedule.individualMemberId);
  const selectedMemberName = selectedMember ? (typeof formatMemberDisplayName === 'function' ? formatMemberDisplayName(selectedMember) : selectedMember.name) : '未選択';

  const fixedSlots = typeof getWeekFixedSlots === 'function' ? getWeekFixedSlots() : new Map();
  const itemsList = typeof WEEKLY_SCHEDULE_ITEMS !== 'undefined' ? WEEKLY_SCHEDULE_ITEMS : [
    { id: 'vocal', name: 'ボーカルレッスン' },
    { id: 'dance', name: 'ダンスレッスン' },
    { id: 'individual-lesson', name: '個別レッスン' },
    { id: 'rest-day', name: '休養' },
    { id: 'meal-party', name: '食事会' },
    { id: 'goods-production', name: 'グッズ制作' }
  ];

  const itemOptions = slotId => ['<option value="">— 空き —</option>'].concat(
    itemsList.filter(item => !item.fixed && item.id !== 'goods-production').map(item => {
      const limit = item.weeklyLimit && typeof countWeekSlots === 'function' && countWeekSlots(item.id, -1) >= item.weeklyLimit && slotId !== item.id;
      if (limit) return `<option value="${item.id}" disabled>${escapeHtml(`${item.name}（1週${item.weeklyLimit}枠まで）`)}</option>`;
      return `<option value="${item.id}" ${slotId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`;
    })
  ).join('');

  const dayLabels = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS : ['木', '金', '土', '日', '月', '火', '水'];
  const periodLabels = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS : ['午前', '午後'];
  const curGameDate = typeof getGameDateObject === 'function' ? getGameDateObject() : new Date();

  const weekRows = dayLabels.map((dayLabel, dayIndex) => {
    const morningIndex = dayIndex * periodLabels.length;
    const dayDate = new Date(curGameDate);
    dayDate.setDate(dayDate.getDate() + dayIndex + 1);
    const dayText = `${dayDate.getMonth() + 1}/${dayDate.getDate()}`;

    const cells = periodLabels.map((periodLabel, periodIndex) => {
      const index = morningIndex + periodIndex;
      const fixed = fixedSlots.get(index);
      const slotId = weeklySchedule.slots[index] || '';

      if (fixed) {
        return `
        <div class="week-cell is-fixed">
          <span class="week-cell-label">${escapeHtml(periodLabel)}</span>
          <select aria-label="${escapeHtml(dayLabel)}曜${escapeHtml(periodLabel)}の予定" disabled
            title="${escapeHtml(fixed.description || 'テレビ出演等で固定された枠です')}">
            <option value="" selected>${escapeHtml(fixed.label || '固定予定')}</option>
          </select>
        </div>`;
      }
      return `
        <div class="week-cell">
          <span class="week-cell-label">${escapeHtml(periodLabel)}</span>
          <select aria-label="${escapeHtml(dayLabel)}曜${escapeHtml(periodLabel)}の予定"
            onchange="setWeeklyScheduleSlot(${index}, this.value)"
            ${weeklySchedule.vacation ? 'disabled' : ''}>
            ${itemOptions(slotId)}
          </select>
        </div>`;
    }).join('');

    const isRestDay = typeof isWeekRestDay === 'function' ? isWeekRestDay(dayIndex) : false;

    return `
      <div class="week-row${isRestDay ? ' is-rest-day' : ''}">
        <span class="week-day-label">${escapeHtml(dayLabel)}${isRestDay ? '<small>休</small>' : ''}<em class="week-day-date">${escapeHtml(dayText)}</em></span>
        ${cells}
      </div>`;
  }).join('');

  const restDayToggles = members.map(member => {
    const isResting = restDayIds.has(member.id);
    const injured = Boolean(member.injury);
    const injuryRisk = typeof getWeeklyScheduleInjuryRisk === 'function'
      ? getWeeklyScheduleInjuryRisk(member)
      : { level: '—', chance: 0, stamina: member.staminaValue ?? 100 };
    const highRisk = injuryRisk.level === '高' || injuryRisk.level === '必';
    const injuryRiskTitle = `週間メニュー後の予測体力${injuryRisk.stamina} / ケガ発生率 ${(injuryRisk.chance * 100).toFixed(1)}%`;
    const label = member.injury
      ? `${typeof formatMemberDisplayName === 'function' ? formatMemberDisplayName(member) : member.name}（${member.injury.type}）`
      : `${typeof formatMemberDisplayName === 'function' ? formatMemberDisplayName(member) : member.name}（ケガリスク：${injuryRisk.level}）`;
    return `
      <button type="button" class="rest-toggle${isResting ? ' active' : ''}${highRisk ? ' warn' : ''}"
        title="${escapeHtml(injuryRiskTitle)}" onclick="toggleRestDayMember(${member.id})" ${injured ? 'disabled' : ''}>
        ${escapeHtml(label)}
      </button>
    `;
  }).join('');

  const lessonExp = typeof getWeeklyLessonExperience === 'function' ? getWeeklyLessonExperience() : 30;
  const restBreakdown = typeof getWeekRestBreakdown === 'function' ? getWeekRestBreakdown() : { fullRestDays: 0, extraSlots: 0 };
  const mealCount = typeof getWeekMealPartyCount === 'function' ? getWeekMealPartyCount() : 0;
  const mealCostSingle = typeof MEAL_PARTY_COST !== 'undefined' ? MEAL_PARTY_COST : 1000000;
  const mealCost = mealCount * mealCostSingle;
  const fullVacationRec = typeof FULL_VACATION_RECOVERY !== 'undefined' ? FULL_VACATION_RECOVERY : 50;
  const lessonCount = typeof getWeekLessonCount === 'function' ? getWeekLessonCount() : 0;

  const vacationNote = weeklySchedule.vacation
    ? '1週間の休暇中は全14枠が休養になります。レッスン・食事会・ケガは発生しません。'
    : `休養 ${restBreakdown.fullRestDays}日フル＋${restBreakdown.extraSlots}枠 / レッスン ${lessonCount}枠 / 食事会 ${mealCount}回（${formatMoney(mealCost)}）`;

  const officeActions = typeof OFFICE_ACTIONS !== 'undefined' ? OFFICE_ACTIONS : [
    { id: 'single-promotion', name: 'シングル販促' },
    { id: 'live-promotion', name: 'ライブ広報' },
    { id: 'goods-development', name: 'グッズ開発' },
    { id: 'goods-production', name: 'グッズ制作' }
  ];
  
  const selectedOfficeAction = officeActions.find(action => action.id === weeklySchedule.officeAction) || null;
  const maxProd = typeof MAX_MERCHANDISE_PRODUCTS !== 'undefined' ? MAX_MERCHANDISE_PRODUCTS : 20;
  const officeToggles = officeActions.map(action => {
    const isSelected = Boolean(selectedOfficeAction) && selectedOfficeAction.id === action.id;
    const atLimit = action.id === 'goods-development' && typeof merchandiseProducts !== 'undefined' && merchandiseProducts >= maxProd;
    return `
      <button type="button" class="rest-toggle office${isSelected ? ' active' : ''}"
        onclick="selectOfficeAction('${action.id}')" ${atLimit ? 'disabled' : ''}>${escapeHtml(action.name)}${atLimit ? ' <small>上限</small>' : ''}</button>`;
  }).join('');

  const broadcastSummaries = typeof getWeekBroadcastSummaries === 'function' ? getWeekBroadcastSummaries() : [];
  const broadcastNote = broadcastSummaries.length
    ? `<div class="schedule-note">今週のテレビ出演: ${broadcastSummaries.map(item =>
        escapeHtml(`${getGameDateObject(item.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}「${item.names.join('・')}」`)
      ).join('、')}</div>`
    : '';

  return `
    <div class="schedule-block">
      <div class="schedule-block-title">1週間のスケジュール <small>7日×午前/午後で14枠</small></div>
      <button type="button" class="week-vacation-btn${weeklySchedule.vacation ? ' active' : ''}" onclick="toggleWeekVacation()" ${fixedSlots.size ? 'disabled' : ''}>
        ${weeklySchedule.vacation ? '■ 1週間の休暇を解除する' : `□ 1週間の休暇をとる（体力値+${fullVacationRec}）`}
      </button>
      ${broadcastNote}
      <div class="week-grid">${weekRows}</div>
      <div class="schedule-note">${escapeHtml(vacationNote)}</div>
      <div class="schedule-note">レッスン1回の基礎経験値: 約${lessonExp}</div>
    </div>

    <!-- 個別レッスン（特別強化統合） -->
    <div class="schedule-block">
      <div class="schedule-block-title">個別レッスン（特別強化） <small>スケジュールで個別レッスンを設定した枠で実行</small></div>
      <div class="schedule-note" style="color: #2e7d32;">
        ※対象外のメンバーは練習を行わず、<strong>休養</strong>します。
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <select style="flex:1;" aria-label="個別レッスンの対象メンバー" onchange="setWeeklyScheduleField('individualMemberId', Number(this.value))">
          ${memberOptions || '<option value="">メンバーなし</option>'}
        </select>
        <select style="flex:1;" aria-label="個別レッスンで鍛える能力" onchange="setWeeklyScheduleField('individualStat', this.value)">
          ${lessonStatOptions}
        </select>
      </div>
      <div class="schedule-note" style="margin-top:6px;">
        設定中: <strong>${escapeHtml(selectedMemberName)}</strong> の <strong>${escapeHtml(selectedStatName)}</strong> を特別強化
      </div>
    </div>

    <div class="schedule-block">
      <div class="schedule-block-title">休養日の設定 <small>休養対象はユーザーが選択。所定の体力まで回復すると自動で練習に復帰します。</small></div>
      <div class="rest-toggle-grid">${restDayToggles || '<div class="schedule-note">選抜メンバーがいません。</div>'}</div>
    </div>

    <div class="schedule-block">
      <div class="schedule-block-title">今週の事務作業 <small>レッスンの裏側で進行</small></div>
      <div class="rest-toggle-grid">
        <button type="button" class="rest-toggle office${selectedOfficeAction ? '' : ' active'}"
          onclick="selectOfficeAction('')">何もしない</button>
        ${officeToggles}
      </div>
      ${selectedOfficeAction && selectedOfficeAction.id === 'single-promotion' && typeof describeSinglePromotionStatus === 'function'
        ? `<div class="schedule-note">${escapeHtml(describeSinglePromotionStatus())}</div>`
        : ''}
    </div>

    <button class="main-btn" style="width:100%; margin-top:12px;" onclick="confirmWeeklySchedule()">このスケジュールで1週間進める</button>
  `;
}

function getIndividualLessonMemberOptions() {
  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const available = roster.filter(member => member && !member.injury);
  if (!available.length) return [];
  const centerId = (typeof pendingSelectionEvent !== 'undefined' && pendingSelectionEvent?.centerId)
    || (typeof lastAnnouncedCenterId !== 'undefined' ? lastAnnouncedCenterId : null)
    || roster.find(member => member && member.isCenter)?.id
    || null;
  const center = available.find(member => member.id === centerId);
  const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
  const rest = available
    .filter(member => member.id !== centerId)
    .sort((a, b) => {
      const diff = (a.staminaValue ?? maxStamina) - (b.staminaValue ?? maxStamina);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ja');
    });
  return center ? [center, ...rest] : rest;
}

let officeCalendarViewYear = null;
let officeCalendarViewMonth = null;

function getOfficeCalendarViewDate() {
  const currentDate = typeof getGameDateObject === 'function' ? getGameDateObject() : new Date();
  if (officeCalendarViewYear === null || officeCalendarViewMonth === null) {
    officeCalendarViewYear = currentDate.getFullYear();
    officeCalendarViewMonth = currentDate.getMonth() + 1;
  }
  return { year: officeCalendarViewYear, month: officeCalendarViewMonth };
}

function getMaxScheduledYearMonth() {
  const currentDate = typeof getGameDateObject === 'function' ? getGameDateObject() : new Date();
  let maxVal = currentDate.getFullYear() * 12 + (currentDate.getMonth() + 1);

  if (typeof productionSchedule !== 'undefined' && productionSchedule) {
    Object.entries(productionSchedule).forEach(([key, plan]) => {
      if (!plan) return;
      const [y, m] = key.split('-').map(Number);
      const actualY = calendarYear && calendarYear > 2000 ? calendarYear + (y - currentYear) : y;
      const val = actualY * 12 + m;
      if (val > maxVal) maxVal = val;

      if (plan.releaseDate) {
        const d = new Date(plan.releaseDate);
        if (!isNaN(d)) {
          const v = d.getFullYear() * 12 + (d.getMonth() + 1);
          if (v > maxVal) maxVal = v;
        }
      }
    });
  }

  if (typeof getScheduledLiveEntries === 'function') {
    getScheduledLiveEntries().forEach(entry => {
      if (entry && entry.date) {
        const d = new Date(entry.date);
        if (!isNaN(d)) {
          const v = d.getFullYear() * 12 + (d.getMonth() + 1);
          if (v > maxVal) maxVal = v;
        }
      }
    });
  }

  if (typeof rivalLiveBookings !== 'undefined' && Array.isArray(rivalLiveBookings)) {
    rivalLiveBookings.forEach(booking => {
      const bDate = booking?.liveDate || booking?.date || '';
      if (bDate) {
        const d = new Date(bDate);
        if (!isNaN(d)) {
          const v = d.getFullYear() * 12 + (d.getMonth() + 1);
          if (v > maxVal) maxVal = v;
        }
      }
    });
  }

  const year = Math.floor((maxVal - 1) / 12);
  const month = ((maxVal - 1) % 12) + 1;
  return { year, month };
}

function shiftOfficeCalendarMonth(delta) {
  const v = getOfficeCalendarViewDate();
  const currentDate = typeof getGameDateObject === 'function' ? getGameDateObject() : new Date();
  const minVal = currentDate.getFullYear() * 12 + (currentDate.getMonth() + 1);
  const maxYM = getMaxScheduledYearMonth();
  const maxVal = maxYM.year * 12 + maxYM.month;

  let currentVal = v.year * 12 + v.month + delta;
  currentVal = Math.max(minVal, Math.min(maxVal, currentVal));

  officeCalendarViewYear = Math.floor((currentVal - 1) / 12);
  officeCalendarViewMonth = ((currentVal - 1) % 12) + 1;

  renderGameCalendar();
}

function getEventsForDate(dateKey) {
  const events = [];

  if (typeof getScheduledLiveEntries === 'function') {
    getScheduledLiveEntries().forEach(entry => {
      if (!entry.completed && typeof getLiveEntryShowDates === 'function') {
        const showDates = getLiveEntryShowDates(entry);
        if (showDates.includes(dateKey)) {
          events.push(`🎤 [自グループライブ] ${entry.liveName || entry.liveVenue} (${entry.liveVenue})`);
        }
      }
    });
  }

  if (Array.isArray(specialLiveEvents)) {
    specialLiveEvents.forEach(event => {
      if (event && !event.completed && event.liveDate === dateKey) {
        events.push(`🎤 [外部ライブ] ${event.name} (${event.venue})`);
      }
    });
  }

  if (typeof productionSchedule !== 'undefined' && productionSchedule) {
    Object.entries(productionSchedule).forEach(([key, plan]) => {
      if (!plan) return;
      if (plan.releaseDate === dateKey && plan.release && plan.release !== 'none') {
        const typeName = plan.release === 'album' ? 'アルバム' : 'シングル';
        events.push(`💿 [CD発売] ${typeName}「${plan.songName || '新曲'}」`);
      }
      if (Array.isArray(plan.planEvents)) {
        plan.planEvents.forEach(ev => {
          if (ev && ev.date === dateKey && !ev.completed) {
            const bInfo = typeof PLAN_EVENT_TYPES !== 'undefined' ? PLAN_EVENT_TYPES.find(t => t.id === ev.benefitId) : null;
            events.push(`🎁 [特典イベント] ${bInfo ? bInfo.name : 'イベント'}`);
          }
        });
      }
    });
  }

  if (Array.isArray(scheduledPerformances)) {
    scheduledPerformances.forEach(perf => {
      if (perf && perf.airDate === dateKey) {
        events.push(`📺 [${perf.isSpecial ? '大型特番' : 'テレビ出演'}] ${perf.name}`);
      }
    });
  }

  if (Array.isArray(rivalLiveBookings)) {
    rivalLiveBookings.forEach(booking => {
      if (!booking) return;
      const bDates = booking.venueDates || [booking.liveDate];
      if (bDates.includes(dateKey)) {
        const isRel = booking.type === 'release' || (booking.liveName && booking.liveName.includes('リリース'));
        if (isRel) {
          events.push(`💿 [他グループ] ${booking.groupName} 新曲リリース`);
        } else {
          events.push(`🎤 [他グループライブ] ${booking.groupName} (${booking.venue})`);
        }
      }
    });
  }

  return events;
}

function handleCalendarDayClick(dateKey) {
  if (!dateKey) return;
  const events = getEventsForDate(dateKey);
  const formattedDate = new Date(`${dateKey}T12:00:00`).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });

  if (events.length === 0) {
    alert(`【${formattedDate}】\n予定されているスケジュールはありません。`);
  } else {
    alert(`【${formattedDate}の予定】\n\n${events.join('\n')}`);
  }
}

function renderGameCalendar() {
  const currentDate = typeof getGameDateObject === 'function' ? getGameDateObject() : new Date();
  const v = getOfficeCalendarViewDate();
  const year = v.year;
  const month = v.month - 1;
  const actualMonthNum = v.month;

  const today = (year === currentDate.getFullYear() && month === currentDate.getMonth()) ? currentDate.getDate() : -1;
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();

  const liveDates = new Set();
  if (typeof getScheduledLiveEntries === 'function') {
    getScheduledLiveEntries().forEach(entry => {
      if (entry && !entry.completed && typeof getLiveEntryDateRange === 'function') {
        getLiveEntryDateRange(entry).forEach(d => liveDates.add(toDateKey(d)));
      }
    });
  }
  if (Array.isArray(specialLiveEvents)) {
    specialLiveEvents.forEach(event => {
      if (event && !event.completed && event.liveDate) liveDates.add(event.liveDate);
    });
  }
  const rivalLiveDates = new Set();
  if (Array.isArray(rivalLiveBookings)) {
    rivalLiveBookings.forEach(booking => {
      if (booking) (booking.venueDates || [booking.liveDate]).forEach(dateKey => { if (dateKey) rivalLiveDates.add(dateKey); });
    });
  }
  const broadcastDates = new Map();
  if (Array.isArray(scheduledPerformances)) {
    scheduledPerformances.forEach(performance => {
      if (performance && performance.airDate) broadcastDates.set(performance.airDate, performance.name);
    });
  }
  const releaseDates = new Set();
  const planEventDates = new Set();
  if (typeof productionSchedule !== 'undefined' && productionSchedule) {
    Object.entries(productionSchedule).forEach(([key, plan]) => {
      if (!plan) return;
      if (plan.releaseDate && plan.release && plan.release !== 'none' && !plan.releaseCompleted) {
        releaseDates.add(plan.releaseDate);
      }
      (Array.isArray(plan.planEvents) ? plan.planEvents : []).forEach(event => {
        if (event && event.date && !event.completed) planEventDates.add(event.date);
      });
    });
  }

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  let cells = weekdays.map(day => `<span class="calendar-weekday">${day}</span>`).join('');
  for (let cell = 0; cell < 42; cell++) {
    const day = cell - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) {
      cells += '<span class="calendar-day" aria-hidden="true"></span>';
      continue;
    }
    const cellDate = new Date(year, month, day, 12);
    const dateKey = typeof toDateKey === 'function' ? toDateKey(cellDate) : '';
    const broadcastName = broadcastDates.get(dateKey);
    const classes = [
      'calendar-day',
      cellDate.getDay() === 3 ? 'wednesday' : '',
      cellDate.getDay() === 0 ? 'sunday' : '',
      day === today ? 'today' : '',
      liveDates.has(dateKey) ? 'live-day' : '',
      releaseDates.has(dateKey) ? 'release-day' : '',
      planEventDates.has(dateKey) ? 'plan-event-day' : '',
      broadcastName ? 'broadcast-day' : ''
    ].filter(Boolean).join(' ');
    const title = [
      liveDates.has(dateKey) ? 'ライブ予定' : '',
      releaseDates.has(dateKey) ? 'CD発売' : '',
      planEventDates.has(dateKey) ? 'CD関連イベント' : '',
      broadcastName ? `テレビ出演: ${broadcastName}` : ''
    ].filter(Boolean).join(' / ');
    
    cells += `<span class="${classes}" style="cursor:pointer;" onclick="handleCalendarDayClick('${dateKey}')"${title ? ` title="${escapeHtml(title)}"` : ''}>${day}</span>`;
  }

  const minVal = currentDate.getFullYear() * 12 + (currentDate.getMonth() + 1);
  const maxYM = getMaxScheduledYearMonth();
  const maxVal = maxYM.year * 12 + maxYM.month;
  const currentValNum = year * 12 + actualMonthNum;

  const canPrev = currentValNum > minVal;
  const canNext = currentValNum < maxVal;

  const container = document.getElementById('calendar-visual');
  if (container) {
    container.innerHTML = `
      <div class="calendar-sheet">
        <div class="calendar-month-heading" style="display:flex; align-items:center; justify-content:space-between;">
          <button type="button" class="ghost-btn small" onclick="shiftOfficeCalendarMonth(-1)" ${canPrev ? '' : 'disabled'} style="padding:2px 8px; font-size:12px; cursor:${canPrev ? 'pointer' : 'default'};">＜</button>
          <strong>${year}年${actualMonthNum}月</strong>
          <button type="button" class="ghost-btn small" onclick="shiftOfficeCalendarMonth(1)" ${canNext ? '' : 'disabled'} style="padding:2px 8px; font-size:12px; cursor:${canNext ? 'pointer' : 'default'};">＞</button>
        </div>
        <div class="calendar-grid">${cells}</div>
      </div>
    `;
  }
}

if (typeof OFFICE_COST_GROWTH === 'undefined') window.OFFICE_COST_GROWTH = 1.9;
if (typeof OFFICE_MAINTENANCE_GROWTH === 'undefined') window.OFFICE_MAINTENANCE_GROWTH = 1.6;

function getOfficeUpgradeCost(facility, level = (officeUpgrades?.[facility?.id] ?? 0)) {
  if (!facility || !facility.baseCost) return 0;
  return Math.round(facility.baseCost * (OFFICE_COST_GROWTH ** level));
}

function getOfficeMaintenanceCost(facility, level = (officeUpgrades?.[facility?.id] || 1)) {
  if (!facility || level <= 1 || !facility.baseMaintenance) return 0;
  return Math.round(facility.baseMaintenance * (OFFICE_MAINTENANCE_GROWTH ** (level - 2)));
}

function upgradeOfficeFacility(facilityId) {
  if (typeof OFFICE_FACILITIES === 'undefined') return;
  const facility = OFFICE_FACILITIES.find(item => item.id === facilityId);
  if (!facility) return;
  const level = officeUpgrades?.[facilityId] ?? 0;
  const maxLvl = typeof MAX_OFFICE_LEVEL !== 'undefined' ? MAX_OFFICE_LEVEL : 10;
  if (level >= maxLvl) return;
  const cost = getOfficeUpgradeCost(facility);
  if (funds < cost) {
    alert(`資金が足りません。必要資金: ${formatMoney(cost)}`);
    return;
  }
  funds -= cost;
  if (typeof officeUpgrades !== 'undefined') officeUpgrades[facilityId] = level + 1;
  setLog(`【設備投資】${facility.name}をLv.${level + 1}に強化しました。`);
  updateUI();
}

function getOfficeDowngradeRefund(facility, level = (officeUpgrades?.[facility?.id] ?? 0)) {
  if (level <= 1) return 0;
  return Math.round(getOfficeUpgradeCost(facility, level - 1) * 0.5);
}

function downgradeOfficeFacility(facilityId) {
  if (typeof OFFICE_FACILITIES === 'undefined') return;
  const facility = OFFICE_FACILITIES.find(item => item.id === facilityId);
  if (!facility) return;
  const level = officeUpgrades?.[facilityId] ?? 0;
  if (level <= 1) {
    alert(`${facility.name}はLv.1未満にはできません。`);
    return;
  }
  const refund = getOfficeDowngradeRefund(facility, level);
  if (!confirm(`${facility.name}をLv.${level - 1}にダウングレードしますか？\n払い戻し額: ${formatMoney(refund)}\n（能力は低下し、週間維持費も下がります）`)) return;
  if (typeof officeUpgrades !== 'undefined') officeUpgrades[facilityId] = level - 1;
  funds += refund;
  setLog(`【設備整理】${facility.name}をLv.${level - 1}にダウングレードしました（払い戻し額 ${formatMoney(refund)}）。`);
  updateUI();
}

function maintainOfficeFacilities() {
  if (typeof OFFICE_FACILITIES === 'undefined' || !Array.isArray(OFFICE_FACILITIES)) return;
  const cost = OFFICE_FACILITIES.reduce((total, facility) =>
    total + getOfficeMaintenanceCost(facility), 0
  );
  if (!cost) return;
  funds -= cost;
  if (funds < 0) setLog(`【維持費】事務所設備の週維持費 ${formatMoney(cost)}を支払いました。資金が不足しています。`);
}

function renderOfficeUpgrades() {
  const list = document.getElementById('office-upgrades-ui');
  if (!list || typeof OFFICE_FACILITIES === 'undefined') return;
  const maxLvl = typeof MAX_OFFICE_LEVEL !== 'undefined' ? MAX_OFFICE_LEVEL : 10;
  list.innerHTML = OFFICE_FACILITIES.map(facility => {
    const level = officeUpgrades?.[facility.id] ?? 0;
    const upgradeCost = getOfficeUpgradeCost(facility);
    const nextMaintenance = getOfficeMaintenanceCost(facility, level + 1);
    const currentMaintenance = getOfficeMaintenanceCost(facility, level);
    const isMax = level >= maxLvl;
    const disabled = isMax || funds < upgradeCost;
    const refund = getOfficeDowngradeRefund(facility, level);
    return `
      <div class="office-facility-row">
        <div>
          <div class="office-facility-name">${facility.name} Lv.${level}${isMax ? '（MAX）' : ''}</div>
          <div class="office-facility-meta">${facility.effect}<br>現在の週維持費 ${formatMoney(currentMaintenance)}${isMax ? '' : ` / 強化後 ${formatMoney(nextMaintenance)}`}</div>
        </div>
        <div class="facility-actions">
          <div class="facility-action-label">
            ${isMax ? '最大レベル' : `強化<br>${formatMoney(upgradeCost)}`}
            ${level > 1 ? `<br>払い戻し<br>+${formatMoney(refund)}` : ''}
          </div>
          <button class="icon-round-btn up" type="button"
            onclick="upgradeOfficeFacility('${facility.id}')"
            ${disabled ? 'disabled' : ''}
            title="${isMax ? `${facility.name}は最大レベルです` : `${facility.name}をLv.${level + 1}に強化（${formatMoney(upgradeCost)}）`}"
            aria-label="${facility.name}をLv.${level + 1}に強化">${safeGetIconSvg('upgrade')}</button>
          ${level > 1
            ? `<button class="icon-round-btn down" type="button"
                onclick="downgradeOfficeFacility('${facility.id}')"
                title="${facility.name}をLv.${level - 1}にダウングレード（払い戻し額 ${formatMoney(refund)}）"
                aria-label="${facility.name}をLv.${level - 1}にダウングレード">${safeGetIconSvg('downgrade')}</button>`
            : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderManagerPanel() {
  const list = document.getElementById('manager-list-ui');
  if (!list) return;

  const mList = Array.isArray(managers) ? managers.filter(Boolean) : [];
  const hireLimit = typeof MANAGER_HIRE_LIMIT !== 'undefined' ? MANAGER_HIRE_LIMIT : 3;

  const countLabel = document.getElementById('manager-count-label');
  if (countLabel) {
    countLabel.textContent = `${mList.length}名 / 上限${hireLimit}名`;
  }

  const skillDefs = typeof MANAGER_SKILLS !== 'undefined' ? MANAGER_SKILLS : [];
  const tierRows = skillDefs.map(skill => {
    const tier = (typeof getManagerSkillTier === 'function') 
      ? getManagerSkillTier(skill.id) 
      : { total: 0, tier: 0, label: 'E', multiplier: 1.0, progress: 0, nextLabel: '' };
    return `
      <div class="manager-tier-row">
        <span class="manager-tier-name">${escapeHtml(skill.name || '')}</span>
        <span class="manager-tier-total">合計 ${tier.total || 0}</span>
        <span class="manager-tier-badge${tier.tier > 0 ? ' on' : ''}${tier.label === '極' ? ' max' : ''}${tier.label === 'S' || tier.label === 'SS' ? ' high' : ''}">${escapeHtml(tier.label || '')}</span>
        <span class="manager-tier-mult">×${(tier.multiplier || 1).toFixed(2)}</span>
        <span class="manager-tier-bar"><i style="width:${tier.progress || 0}%"></i></span>
        <span class="manager-tier-next">${tier.nextLabel ? `次は合計${tier.nextMin}（あと${tier.remain}）` : 'MAX'}</span>
      </div>
    `;
  }).join('');

  const tierPanel = mList.length ? `
    <div class="manager-card tier">
      <div class="manager-head"><strong>項目別の合計レベル</strong><span>在籍${mList.length}名の能力合計で効果が決まります</span></div>
      ${tierRows}
    </div>
  ` : '';

  if (!mList.length) {
    list.innerHTML = tierPanel + '<div class="office-maintenance-note">マネージャーが在籍していません。マネージャー市場で採用してください。</div>';
    return;
  }

  list.innerHTML = tierPanel + mList.map(manager => {
    if (!manager) return '';
    const skills = manager.skills || {};
    const skillRows = skillDefs.map(skill => {
      const level = skills[skill.id] || 1;
      const cost = (typeof getManagerSkillUpCost === 'function') ? getManagerSkillUpCost(manager, skill.id) : null;
      const isMax = cost === null;
      const label = isMax
        ? '<span class="manager-skill-level max">MAX</span>'
        : `<button class="manager-skill-button" type="button"
            onclick="levelUpManagerSkill('${manager.id}', '${skill.id}')"
            ${funds < cost ? 'disabled' : ''}
            title="${skill.name}をLv.${level + 1}に（${formatMoney(cost)}）">Lv.${level + 1}<br>${formatMoney(cost)}</button>`;
      return `
        <div class="manager-skill-row">
          <span class="manager-skill-name">${escapeHtml(skill.name)}<br><small style="color:#999;">${escapeHtml(skill.effect || '')}</small></span>
          <span class="manager-skill-level${isMax ? ' max' : ''}">Lv.${level}</span>
          ${label}
        </div>
      `;
    }).join('');

    const age = (typeof getManagerAge === 'function') ? getManagerAge(manager) : 30;
    const tenureNote = age < 32 ? '在籍：長期継続の見込み'
      : age < 36 ? '在籍：安定'
      : age < 40 ? '在籍：継続中'
      : '在籍：退職に変わる可能性あり';
    const monthlySalary = (typeof getManagerMonthlySalary === 'function') ? getManagerMonthlySalary(manager) : 0;
    const annualSalary = (typeof getManagerAnnualSalary === 'function') ? getManagerAnnualSalary(manager) : 0;
    const skillTotal = (typeof getManagerSkillTotal === 'function') ? getManagerSkillTotal(manager) : 0;
    const fireCost = (typeof getManagerFireCost === 'function') ? getManagerFireCost(manager) : 0;

    return `
      <div class="manager-card">
        <div class="manager-head">
          <strong>${escapeHtml(manager.name || '')} <small style="font-size:10px; color:#777;">${age}歳</small></strong>
          <span>月給 ${formatMoney(monthlySalary)}</span>
        </div>
        ${skillRows}
        <div class="manager-total">
          能力合計 ${skillTotal} / 40 ・ 年収 ${formatMoney(annualSalary)}
          ・ ${escapeHtml(tenureNote)}
        </div>
        <div class="manager-fire-row">
          <button class="manager-fire-button" type="button" onclick="fireManager('${manager.id}')"
            ${funds < fireCost ? 'disabled' : ''}
            title="解雇料は4か月分の給料（${formatMoney(fireCost)}）">解雇する（${formatMoney(fireCost)}）</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderManagerMarketPanel() {
  const list = document.getElementById('manager-market-ui');
  if (!list) return;
  if (typeof refreshManagerMarket === 'function') {
    try { refreshManagerMarket(); } catch (e) {}
  }

  const candidates = Array.isArray(managerMarketCandidates) ? managerMarketCandidates.filter(Boolean) : [];
  const countElement = document.getElementById('manager-market-count');
  if (countElement) countElement.textContent = String(candidates.length);

  const mList = Array.isArray(managers) ? managers.filter(Boolean) : [];
  const hireLimit = typeof MANAGER_HIRE_LIMIT !== 'undefined' ? MANAGER_HIRE_LIMIT : 3;
  const atLimit = mList.length >= hireLimit;
  const hireCost = typeof MANAGER_HIRE_COST !== 'undefined' ? MANAGER_HIRE_COST : 500000;

  if (!candidates.length) {
    list.innerHTML = '<div class="office-maintenance-note">現在の求人はありません。</div>';
    return;
  }

  const skillDefs = typeof MANAGER_SKILLS !== 'undefined' ? MANAGER_SKILLS : [];

  list.innerHTML = candidates.map(candidate => {
    if (!candidate) return '';
    const monthly = (typeof getManagerMonthlySalary === 'function') ? getManagerMonthlySalary(candidate) : 0;
    const skillLine = skillDefs
      .map(skill => `${skill.name} Lv.${candidate.skills?.[skill.id] || 1}`)
      .join(' / ');
    const age = candidate.age ?? (getGameDateObject().getFullYear() - (candidate.birthYear || 2000));
    const skillTotal = (typeof getManagerSkillTotal === 'function') ? getManagerSkillTotal(candidate) : 0;
    return `
      <div class="manager-card candidate">
        <div class="manager-head">
          <strong>${escapeHtml(candidate.name || '')} <small style="font-size:10px; color:#777;">${age}歳</small></strong>
          <span>月給 ${formatMoney(monthly)}</span>
        </div>
        <div class="manager-total">${escapeHtml(skillLine)}</div>
        <div class="manager-total">能力合計 ${skillTotal} / 40</div>
        <div class="manager-fire-row">
          <button class="manager-hire-button" type="button" onclick="hireManagerFromMarket('${candidate.id}')"
            ${atLimit || funds < hireCost ? 'disabled' : ''}
            title="採用費 ${formatMoney(hireCost)}">採用する（${formatMoney(hireCost)}）</button>
        </div>
      </div>
    `;
  }).join('');
}


function renderOfficeTab() {
  renderOfficeUpgrades();
  renderManagerPanel();
  renderManagerMarketPanel();
  renderGameCalendar();
  renderWeeklyActionPanel();
}
