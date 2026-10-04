// ==========================================
// UI描画（順位・事務所・マネージャー・給与）
// ==========================================
// ==========================================
// 6. UI描画 ＆ モーダル操作
// ==========================================

const PAGE_TABS = [
  { id: 'group', label: 'グループ', icon: 'group' },
  { id: 'formation', label: '編成', icon: 'formation' },
  { id: 'office', label: '事務所', icon: 'office' },
  { id: 'funds', label: '資金', icon: 'funds' },
  { id: 'ranking', label: '順位', icon: 'ranking' },
  { id: 'records', label: '記録', icon: 'records' }
];

// ゲーム開始時に表示するタブ（毎週の行動を決める「事務所」を既定にする）
const DEFAULT_PAGE = 'office';

// タブのボタンを描画し、指定したタブのパネルだけを表示する
function renderPageNav(activePage = DEFAULT_PAGE) {
  const target = PAGE_TABS.some(tab => tab.id === activePage) ? activePage : DEFAULT_PAGE;
  const nav = document.getElementById('page-nav');
  if (nav) {
    nav.innerHTML = PAGE_TABS.map(tab => {
      const active = tab.id === target;
      return `
      <button class="page-tab${active ? ' active' : ''}" id="page-tab-${tab.id}" type="button" role="tab"
        aria-selected="${active}" aria-controls="page-${tab.id}" title="${tab.label}"
        onclick="switchPage('${tab.id}')">
        <span class="tab-icon">${getIconSvg(tab.icon)}</span>${tab.label}
      </button>`;
    }).join('');
  }
  // パネルの表示も同時に切り替える（ゲーム開始時は既定タブが表示される）
  PAGE_TABS.forEach(tab => {
    const panel = document.getElementById(`page-${tab.id}`);
    if (panel) panel.hidden = tab.id !== target;
  });
}

function switchPage(page) {
  renderPageNav(page);
  // 記録タブを開いたときにグラフと一覧を描画する
  if (page === 'records') renderRecordsPanel();
}

// 競合チームの現在の影響力（売上に応じて増減する）
function getRivalTeamPower(team) {
  const base = team.basePower || 0;
  const growth = (team.sales || 0) / 200000;
  return Math.max(10, Math.round(base + growth));
}

// 自チームの成績を leagueTeams に反映する
function syncPlayerTeamStats() {
  const pTeam = leagueTeams.find(team => team.id === 'player');
  if (!pTeam) return;
  pTeam.sales = yearlyStats.sales;
  pTeam.audience = yearlyStats.audience;
  pTeam.showCount = countPlayerLiveShows();
  pTeam.basePower = getPlayerTeamOverall();
}

// 今年以来に自チームが開催した公演数
function countPlayerLiveShows() {
  let count = 0;
  getScheduledLiveEntries().forEach(entry => {
    if (entry.year !== currentYear) return;
    count += getLiveEntryShowDates(entry).length;
  });
  return count;
}

// 業界順位の表を作る
function getLeagueRanking() {
  syncPlayerTeamStats();
  return leagueTeams
    .map(team => {
      const power = team.id === 'player' ? getPlayerTeamOverall() : getRivalTeamPower(team);
      return {
        id: team.id,
        name: team.name,
        isPlayer: team.id === 'player',
        power,
        sales: team.sales || 0,
        audience: team.audience || 0,
        showCount: team.showCount || 0
      };
    })
    .sort((a, b) => b.power - a.power)
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

// 自分の順位
function getPlayerRank() {
  const ranking = getLeagueRanking();
  const me = ranking.find(team => team.isPlayer);
  return me ? { rank: me.rank, total: ranking.length, power: me.power, top: ranking[0] } : null;
}

// 業界順位の描画
function renderRankingPanel() {
  const list = document.getElementById('ranking-list');
  const note = document.getElementById('ranking-note');
  if (!list || !note) return;
  const ranking = getLeagueRanking();
  const playerInfo = getPlayerRank();
  if (!playerInfo) {
    list.innerHTML = '';
    note.textContent = '';
    return;
  }
  note.innerHTML = `自グループは <strong>${playerInfo.rank}位 / ${playerInfo.total}グループ</strong>（総合力 ${playerInfo.power}）`
    + `<br>総合力は選抜チームの平均評価です。他グループは売上に応じて影響力が増減します。`;

  list.innerHTML = ranking.map(team => {
    const rankClass = team.rank <= 3 ? ' top' : '';
    return `
      <div class="ranking-row${team.isPlayer ? ' player' : ''}">
        <span class="ranking-rank${rankClass}">${team.rank}</span>
        <span class="ranking-name">
          <span class="ranking-name-main">${escapeHtml(team.name)}${team.isPlayer ? '（自グループ）' : ''}</span>
          <span class="ranking-name-sub">売上 ${team.sales.toLocaleString()}枚 / 動員 ${team.audience.toLocaleString()}人 / 公演 ${team.showCount}回</span>
        </span>
        <span class="ranking-power">${team.power}</span>
      </div>`;
  }).join('');
}

function renderWeeklyActionPanel() {
  const panel = document.getElementById('weekly-action-panel');
  if (!panel) return;
  ensureWeeklySchedule();
  const events = getCurrentWeekEvents();
  const currentDate = getGameDateObject();

  // 自グループ設定ライブのある週はスケジュールを組めない
  const nextLiveDate = findWeekLiveStop(currentDate);
  const editableSpecialLiveEvents = getEditableSpecialLiveEventsForWeek(currentDate);
  if (nextLiveDate && !editableSpecialLiveEvents.length) {
    const liveDateKey = toDateKey(nextLiveDate);
    const liveDate = getGameDateObject(liveDateKey);
    const liveLabel = liveDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
    // ライブの内容を具体的に伝える（会場・公演日）
    const liveEntries = getScheduledLiveEntries().filter(entry =>
      !entry.completed && toDateKey(getLiveEntryDate(entry, entry.calendarYear, entry.month)) === liveDateKey
    );
    const liveDetail = liveEntries.length
      ? liveEntries.map(entry => {
        const days = getLiveEntryShowDates(entry);
        const suffix = days.length > 1 ? `（${days.length}公演：${days.map(key => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`).join('・')}）` : '';
        return `${entry.liveVenue}${suffix}`;
      }).join(' / ')
      : '';
    panel.innerHTML = `
      <h2 class="page-title">今週の行動</h2>
      <div class="weekly-event-note"><strong>ライブ週</strong><ul>
        <li>${escapeHtml(`${liveLabel}にライブがあるため、週間スケジュールは組めません。`)}</li>
        ${liveDetail ? `<li>${escapeHtml(`公演: ${liveDetail}`)}</li>` : ''}
        ${renderWeeklyEventItems(events)}
      </ul></div>
      <button class="main-btn" style="width:100%;" onclick="advanceOneWeek()">イベントまで進行</button>
    `;
    return;
  }

  if (currentDate.getDay() !== 3) {
    const nextWednesday = getNextWednesday(currentDate);
    const dateLabel = nextWednesday.toLocaleDateString('ja-JP', {
      month: 'long', day: 'numeric', weekday: 'short'
    });
    panel.innerHTML = `
      <h2 class="page-title">今週の行動</h2>
      <div class="weekly-event-note"><strong>水曜日まで進行</strong><ul>
        <li>${escapeHtml(`${dateLabel}に週間スケジュールを設定できます。`)}</li>
        ${renderWeeklyEventItems(events)}
      </ul></div>
      <button class="main-btn" style="width:100%;" onclick="advanceOneWeek()">水曜日まで進行</button>
    `;
    return;
  }

  // ライブ以外は週間スケジュールを組める（今週のイベントは注記として表示する）
  const notes = getWeeklyEventNoteEvents(events);
  const externalLiveNotes = editableSpecialLiveEvents.map(event =>
    `${event.name}（${event.liveDate} / ${event.venue}）: 前日〜当日午前はリハーサル、翌日は全日休養で固定`
  );
  notes.push(...externalLiveNotes);
  panel.innerHTML = `
    <h2 class="page-title">今週のスケジュール</h2>
    ${notes.length
      ? `<div class="weekly-event-note"><strong>今週起きること</strong><ul>${renderWeeklyEventItems(notes)}</ul></div>`
      : ''}
    ${renderWeeklyScheduleControls()}
  `;
}

// ライブ週の表示から重複する競合公演の行を除く
function getWeeklyEventNoteEvents(events) {
  return events.filter(event => !event.startsWith('他グループのライブ'));
}

function renderWeeklyEventItems(events) {
  return getWeeklyEventNoteEvents(events).map(event => `<li>${escapeHtml(event)}</li>`).join('');
}

// 週間スケジュールのUI（レッスン枠・特別強化・休養日）
// ==========================================
// 10-ui-panels.js : スケジュール設定UIコントロール
// ==========================================
function renderWeeklyScheduleControls() {
  ensureWeeklySchedule();
  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const members = roster.filter(member => member && member.isSelected);
  const restDayIds = new Set(weeklySchedule.restDayMembers || []);

  // 個別レッスン対象メンバーの選択肢
  const individualOptions = getIndividualLessonMemberOptions();
  const memberOptions = individualOptions.map(member =>
    `<option value="${member.id}" ${member.id === weeklySchedule.individualMemberId ? 'selected' : ''}>` +
    `${escapeHtml(`${formatMemberDisplayName(member)}（${member.age}歳 / 体力${member.staminaValue}）`)}</option>`
  ).join('');

  // 鍛える能力の選択肢（STATUS_KEYSから該当ステータスを抽出）
  const validStats = typeof INDIVIDUAL_LESSON_STATS !== 'undefined' ? INDIVIDUAL_LESSON_STATS : ['vocal', 'dance', 'stamina', 'recovery'];
  const statusKeys = typeof STATUS_KEYS !== 'undefined' ? STATUS_KEYS : [];
  const lessonStatOptions = validStats.map(statId => {
    const stat = statusKeys.find(key => key.id === statId);
    return `<option value="${statId}" ${statId === weeklySchedule.individualStat ? 'selected' : ''}>${stat ? escapeHtml(stat.name) : statId}</option>`;
  }).join('');

  const selectedStatName = statusKeys.find(key => key.id === weeklySchedule.individualStat)?.name || '歌唱力';
  const selectedMember = roster.find(m => m && m.id === weeklySchedule.individualMemberId);
  const selectedMemberName = selectedMember ? formatMemberDisplayName(selectedMember) : '未選択';

  // 体力低下警告
  const warnThreshold = typeof STAMINA_WARNING_THRESHOLD !== 'undefined' ? STAMINA_WARNING_THRESHOLD : 30;
  const fatiguedMembers = members.filter(m => !m.injury && m.staminaValue < warnThreshold);
  const restSuggestion = fatiguedMembers.length
    ? `<div class="schedule-note warn">体力が低いメンバー（休養に設定する場合は下のボタンを選択）: ${fatiguedMembers.map(m => escapeHtml(`${formatMemberDisplayName(m)}（体力${m.staminaValue}）`)).join('、')}</div>`
    : '';

  // 14枠グリッド生成
  const fixedSlots = getWeekFixedSlots();
  const itemsList = typeof WEEKLY_SCHEDULE_ITEMS !== 'undefined' ? WEEKLY_SCHEDULE_ITEMS : [];
  const itemOptions = slotId => ['<option value="">— 空き —</option>'].concat(
    itemsList.filter(item => !item.fixed).map(item => {
      const limit = item.weeklyLimit && countWeekSlots(item.id, -1) >= item.weeklyLimit && slotId !== item.id;
      if (limit) return `<option value="${item.id}" disabled>${escapeHtml(`${item.name}（1週${item.weeklyLimit}枠まで）`)}</option>`;
      return `<option value="${item.id}" ${slotId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`;
    })
  ).join('');

  const dayLabels = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS : ['木', '金', '土', '日', '月', '火', '水'];
  const periodLabels = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS : ['午前', '午後'];

  const weekRows = dayLabels.map((dayLabel, dayIndex) => {
    const morningIndex = dayIndex * periodLabels.length;
    const dayDate = getGameDateObject();
    dayDate.setDate(dayDate.getDate() + dayIndex + 1);
    const dayText = `${dayDate.getMonth() + 1}/${dayDate.getDate()}`;
    const cells = periodLabels.map((periodLabel, periodIndex) => {
      const index = morningIndex + periodIndex;
      const fixed = fixedSlots.get(index);
      const slotId = weeklySchedule.slots[index];
      if (fixed) {
        return `
        <div class="week-cell is-fixed">
          <span class="week-cell-label">${escapeHtml(periodLabel)}</span>
          <select aria-label="${escapeHtml(dayLabel)}曜${escapeHtml(periodLabel)}の予定" disabled
            title="${escapeHtml(fixed.description || 'テレビ出演で固定された枠です')}"><option value="" selected>${escapeHtml(fixed.label)}</option></select>
        </div>`;
      }
      return `
        <div class="week-cell">
          <span class="week-cell-label">${escapeHtml(periodLabel)}</span>
          <select aria-label="${escapeHtml(dayLabel)}曜${escapeHtml(periodLabel)}の予定"
            onchange="setWeeklyScheduleSlot(${index}, this.value)"
            ${weeklySchedule.vacation ? 'disabled' : ''}>${itemOptions(slotId)}</select>
        </div>`;
    }).join('');
    const isRestDay = isWeekRestDay(dayIndex);
    return `
      <div class="week-row${isRestDay ? ' is-rest-day' : ''}">
        <span class="week-day-label">${escapeHtml(dayLabel)}${isRestDay ? '<small>休</small>' : ''}<em class="week-day-date">${escapeHtml(dayText)}</em></span>
        ${cells}
      </div>`;
  }).join('');

  // 休養トグルボタン
  const restDayToggles = members.map(member => {
    const isResting = restDayIds.has(member.id);
    const lowStamina = member.staminaValue < warnThreshold;
    const injured = Boolean(member.injury);
    const label = member.injury
      ? `${formatMemberDisplayName(member)}（${member.injury.type} 回復まで${member.injury.weeksLeft}日）`
      : `${formatMemberDisplayName(member)}（体力${member.staminaValue}）`;
    return `
      <button type="button" class="rest-toggle${isResting ? ' active' : ''}${lowStamina ? ' warn' : ''}"
        onclick="toggleRestDayMember(${member.id})" ${injured ? 'disabled' : ''}>
        ${escapeHtml(label)}
      </button>`;
  }).join('');

  // 事務作業ボタン
  const officeActions = typeof OFFICE_ACTIONS !== 'undefined' ? OFFICE_ACTIONS : [];
  const selectedOfficeAction = officeActions.find(action => action.id === weeklySchedule.officeAction) || null;
  const maxProd = typeof MAX_MERCHANDISE_PRODUCTS !== 'undefined' ? MAX_MERCHANDISE_PRODUCTS : 5;
  const officeToggles = officeActions.map(action => {
    const isSelected = Boolean(selectedOfficeAction) && selectedOfficeAction.id === action.id;
    const atLimit = action.id === 'goods-development' && typeof merchandiseProducts !== 'undefined' && merchandiseProducts >= maxProd;
    return `
      <button type="button" class="rest-toggle office${isSelected ? ' active' : ''}"
        onclick="selectOfficeAction('${action.id}')" ${atLimit ? 'disabled' : ''}>${escapeHtml(action.name)}${atLimit ? ' <small>上限</small>' : ''}</button>`;
  }).join('');

  const autoRestTarget = typeof AUTO_REST_STAMINA_TARGET !== 'undefined' ? AUTO_REST_STAMINA_TARGET : 80;
  const fullVacationRec = typeof FULL_VACATION_RECOVERY !== 'undefined' ? FULL_VACATION_RECOVERY : 45;

  return `
    <div class="schedule-block">
      <div class="schedule-block-title">1週間のスケジュール <small>7日×午前/午後で14枠</small></div>
      <button type="button" class="week-vacation-btn${weeklySchedule.vacation ? ' active' : ''}" onclick="toggleWeekVacation()" ${fixedSlots.size ? 'disabled' : ''}>
        ${weeklySchedule.vacation ? '■ 1週間の休暇を解除する' : `□ 1週間の休暇をとる（体力値+${fullVacationRec}）`}
      </button>
      <div class="week-grid">${weekRows}</div>
    </div>

    <!-- 【統合版】個別レッスン -->
    <div class="schedule-block">
      <div class="schedule-block-title">個別レッスン（特別強化） <small>スケジュールで「個別レッスン」を設定した枠で実行</small></div>
      <div class="schedule-note">
        選択したメンバー1名の指定能力に <strong>${SPECIAL_INDIVIDUAL_MULTIPLIER}倍</strong> の経験値が入ります。
      </div>
      <div class="schedule-note" style="color: #2e7d32;">
        ※対象外のメンバーは練習を行わず、<strong>午前・午後の枠に合わせて休養（体力回復）</strong>します。
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
        設定中: <strong>${escapeHtml(selectedMemberName)}</strong> の <strong>${escapeHtml(selectedStatName)}</strong> を10.1倍で強化
      </div>
    </div>

    <!-- 休養日設定 -->
    <div class="schedule-block">
      <div class="schedule-block-title">休養日の設定 <small>休養対象はユーザーが選択。体力${autoRestTarget}で練習に復帰</small></div>
      ${restSuggestion}
      <div class="rest-toggle-grid">${restDayToggles || '<div class="schedule-note">選抜メンバーがいません。</div>'}</div>
    </div>

    <!-- 事務作業 -->
    <div class="schedule-block">
      <div class="schedule-block-title">今週の事務作業 <small>レッスンと同じ週に実行（未選択なら行わない）</small></div>
      <div class="rest-toggle-grid">
        <button type="button" class="rest-toggle office${selectedOfficeAction ? '' : ' active'}"
          onclick="selectOfficeAction('')">何もしない</button>
        ${officeToggles}
      </div>
      ${selectedOfficeAction && selectedOfficeAction.id === 'single-promotion'
        ? `<div class="schedule-note">${escapeHtml(describeSinglePromotionStatus())}</div>`
        : ''}
    </div>

    <button class="main-btn" style="width:100%;" onclick="confirmWeeklySchedule()">このスケジュールで1週間進める</button>
  `;
}
// 個別レッスンの対象順：選抜発表済みの最新センターを先頭、そのあとは残体力の低い順
function getIndividualLessonMemberOptions() {
  const available = idolRoster.filter(member => !member.injury);
  if (!available.length) return [];
  // 直近の選抜発表で選ばれたセンターを先頭にする
  const centerId = (pendingSelectionEvent && pendingSelectionEvent.centerId)
    || lastAnnouncedCenterId
    || idolRoster.find(member => member.isCenter)?.id
    || null;
  const center = available.find(member => member.id === centerId);
  // 先頭はセンター、以降は残体力の低い順（体力の同じ人は名前順で安定させる）
  const rest = available
    .filter(member => member.id !== centerId)
    .sort((a, b) => {
      const diff = (a.staminaValue ?? MAX_STAMINA_VALUE) - (b.staminaValue ?? MAX_STAMINA_VALUE);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ja');
    });
  return center ? [center, ...rest] : rest;
}

function renderGameCalendar() {
  const date = getGameDateObject();
  const shouldFlip = Boolean(lastRenderedCalendarDate && lastRenderedCalendarDate !== gameDate);
  lastRenderedCalendarDate = gameDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const liveDates = new Set();
  getScheduledLiveEntries().forEach(entry => {
    if (entry.completed) return;
    getLiveEntryDateRange(entry).forEach(date => liveDates.add(toDateKey(date)));
  });
  specialLiveEvents.forEach(event => {
    if (!event.completed) liveDates.add(event.liveDate);
  });
  // 競合公演は連日を含むすべての公演日をマークする
  const rivalLiveDates = new Set();
  rivalLiveBookings.forEach(booking => {
    (booking.venueDates || [booking.liveDate]).forEach(dateKey => rivalLiveDates.add(dateKey));
  });
  // テレビ出演（定例番組／大型特番）の放送日をマークする
  const broadcastDates = new Map();
  scheduledPerformances.forEach(performance => {
    if (performance.airDate) broadcastDates.set(performance.airDate, performance.name);
  });
  // 計画した発売日とCD関連イベントの日をマークする
  const releaseDates = new Set();
  const planEventDates = new Set();
  Object.entries(productionSchedule).forEach(([key, plan]) => {
    if (plan.releaseDate && plan.release && plan.release !== 'none' && !plan.releaseCompleted) {
      releaseDates.add(plan.releaseDate);
    }
    (Array.isArray(plan.planEvents) ? plan.planEvents : []).forEach(event => {
      if (event && event.date && !event.completed) planEventDates.add(event.date);
    });
  });

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  let cells = weekdays.map(day => `<span class="calendar-weekday">${day}</span>`).join('');
  for (let cell = 0; cell < 42; cell++) {
    const day = cell - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) {
      cells += '<span class="calendar-day" aria-hidden="true"></span>';
      continue;
    }
    const cellDate = new Date(year, month, day, 12);
    const dateKey = toDateKey(cellDate);
    const broadcastName = broadcastDates.get(dateKey);
    const classes = [
      'calendar-day',
      cellDate.getDay() === 3 ? 'wednesday' : '',
      cellDate.getDay() === 0 ? 'sunday' : '',
      day === today ? 'today' : '',
      liveDates.has(dateKey) ? 'live-day' : '',
      rivalLiveDates.has(dateKey) ? 'rival-live-day' : '',
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
    cells += `<span class="${classes}"${title ? ` title="${escapeHtml(title)}"` : ''}>${day}</span>`;
  }

  document.getElementById('calendar-visual').innerHTML = `
    <div class="calendar-sheet${shouldFlip ? ' calendar-turn' : ''}">
      <div class="calendar-month-heading"><strong>${year}年${month + 1}月</strong><span>水曜進行</span></div>
      <div class="calendar-grid">${cells}</div>
    </div>
  `;
}

// 設備はLv.1が初期状態で維持費なし。Lv.2以降はレベルが上がるほど維持費が増える。
// MaxはLv.10まで。Lv.2以上ならダウングレード（売却）も可能。
const OFFICE_COST_GROWTH = 1.9;
const OFFICE_MAINTENANCE_GROWTH = 1.6;

function getOfficeUpgradeCost(facility, level = officeUpgrades[facility.id] ?? 0) {
  return Math.round(facility.baseCost * (OFFICE_COST_GROWTH ** level));
}

function getOfficeMaintenanceCost(facility, level = officeUpgrades[facility.id] || 1) {
  if (level <= 1) return 0;
  return Math.round(facility.baseMaintenance * (OFFICE_MAINTENANCE_GROWTH ** (level - 2)));
}

function upgradeOfficeFacility(facilityId) {
  const facility = OFFICE_FACILITIES.find(item => item.id === facilityId);
  if (!facility) return;
  const level = officeUpgrades[facilityId] ?? 0;
  if (level >= MAX_OFFICE_LEVEL) return;
  const cost = getOfficeUpgradeCost(facility);
  if (funds < cost) {
    alert(`資金が足りません。必要資金: ${formatMoney(cost)}`);
    return;
  }
  funds -= cost;
  officeUpgrades[facilityId] = level + 1;
  setLog(`【設備投資】${facility.name}をLv.${level + 1}に強化しました。`);
  updateUI();
}

// ダウングレード：Lv.1未満にはできない。設備売却で開発費の50%が戻る。
function getOfficeDowngradeRefund(facility, level = officeUpgrades[facility.id] ?? 0) {
  if (level <= 1) return 0;
  return Math.round(getOfficeUpgradeCost(facility, level - 1) * 0.5);
}

function downgradeOfficeFacility(facilityId) {
  const facility = OFFICE_FACILITIES.find(item => item.id === facilityId);
  if (!facility) return;
  const level = officeUpgrades[facilityId] ?? 0;
  if (level <= 1) {
    alert(`${facility.name}はLv.1未満にはできません。`);
    return;
  }
  const refund = getOfficeDowngradeRefund(facility, level);
  if (!confirm(`${facility.name}をLv.${level - 1}にダウングレードしますか？\n売却額: ${formatMoney(refund)}\n（能力は低下し、週間維持費も下がります）`)) return;
  officeUpgrades[facilityId] = level - 1;
  funds += refund;
  setLog(`【設備整理】${facility.name}をLv.${level - 1}にダウングレードしました（売却額 ${formatMoney(refund)}）。`);
  updateUI();
}

function maintainOfficeFacilities() {
  const cost = OFFICE_FACILITIES.reduce((total, facility) =>
    total + getOfficeMaintenanceCost(facility), 0
  );
  if (!cost) return;
  funds -= cost;
  if (funds < 0) setLog(`【維持費】事務所設備の週維持費 ${formatMoney(cost)}を支払いました。資金が不足しています。`);
}

function renderOfficeUpgrades() {
  const list = document.getElementById('office-upgrades-ui');
  list.innerHTML = OFFICE_FACILITIES.map(facility => {
    const level = officeUpgrades[facility.id] ?? 0;
    const upgradeCost = getOfficeUpgradeCost(facility);
    const nextMaintenance = getOfficeMaintenanceCost(facility, level + 1);
    const currentMaintenance = getOfficeMaintenanceCost(facility, level);
    const isMax = level >= MAX_OFFICE_LEVEL;
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
            ${level > 1 ? `<br>売却<br>+${formatMoney(refund)}` : ''}
          </div>
          <button class="icon-round-btn up" type="button"
            onclick="upgradeOfficeFacility('${facility.id}')"
            ${disabled ? 'disabled' : ''}
            title="${isMax ? `${facility.name}は最大レベルです` : `${facility.name}をLv.${level + 1}に強化（${formatMoney(upgradeCost)}）`}"
            aria-label="${facility.name}をLv.${level + 1}に強化">${getIconSvg('upgrade')}</button>
          ${level > 1
            ? `<button class="icon-round-btn down" type="button"
                onclick="downgradeOfficeFacility('${facility.id}')"
                title="${facility.name}をLv.${level - 1}にダウングレード（売却額 ${formatMoney(refund)}）"
                aria-label="${facility.name}をLv.${level - 1}にダウングレード">${getIconSvg('downgrade')}</button>`
            : ''}
        </div>
      </div>
    `;
  }).join('');
}

// マネージャーパネル（レベルアップ・解雇）
function renderManagerPanel() {
  const list = document.getElementById('manager-list-ui');
  if (!list) return;

  const countLabel = document.getElementById('manager-count-label');
  if (countLabel) {
    countLabel.textContent = `${managers.length}名 / 上限${MANAGER_HIRE_LIMIT}名`;
  }

  // 項目別の合計レベルと効果段階
  const tierRows = MANAGER_SKILLS.map(skill => {
    const tier = getManagerSkillTier(skill.id);
    return `
      <div class="manager-tier-row">
        <span class="manager-tier-name">${skill.name}</span>
        <span class="manager-tier-total">合計 ${tier.total}</span>
        <span class="manager-tier-badge${tier.tier > 0 ? ' on' : ''}${tier.label === '極' ? ' max' : ''}${tier.label === 'S' || tier.label === 'SS' ? ' high' : ''}">${escapeHtml(tier.label)}</span>
        <span class="manager-tier-mult">×${tier.multiplier.toFixed(2)}</span>
        <span class="manager-tier-bar"><i style="width:${tier.progress}%"></i></span>
        <span class="manager-tier-next">${tier.nextLabel ? `次は合計${tier.nextMin}（あと${tier.remain}）` : 'MAX'}</span>
      </div>
    `;
  }).join('');

  const tierPanel = managers.length ? `
    <div class="manager-card tier">
      <div class="manager-head"><strong>項目別の合計レベル</strong><span>在籍${managers.length}名の能力合計で効果が決まります</span></div>
      ${tierRows}
    </div>
  ` : '';

  if (!managers.length) {
    list.innerHTML = '<div class="office-maintenance-note">マネージャーが在籍していません。マネージャー市場で採用してください。</div>';
    return;
  }

  list.innerHTML = tierPanel + managers.map(manager => {
    const skillRows = MANAGER_SKILLS.map(skill => {
      const level = manager.skills?.[skill.id] || 1;
      const cost = getManagerSkillUpCost(manager, skill.id);
      const isMax = cost === null;
      const label = isMax
        ? '<span class="manager-skill-level max">MAX</span>'
        : `<button class="manager-skill-button" type="button"
            onclick="levelUpManagerSkill('${manager.id}', '${skill.id}')"
            ${funds < cost ? 'disabled' : ''}
            title="${skill.name}をLv.${level + 1}に（${formatMoney(cost)}）">Lv.${level + 1}<br>${formatMoney(cost)}</button>`;
      return `
        <div class="manager-skill-row">
          <span class="manager-skill-name">${skill.name}<br><small style="color:#999;">${skill.effect}</small></span>
          <span class="manager-skill-level${isMax ? ' max' : ''}">Lv.${level}</span>
          ${label}
        </div>
      `;
    }).join('');
    const age = getManagerAge(manager);
    // 退職タイミングは本人次第なので、正確な時期は公開しない
    const tenureNote = age < 32 ? '在籍：長期継続の見込み'
      : age < 36 ? '在籍：安定'
      : age < 40 ? '在籍：継続中'
      : '在籍：退職に変わる可能性あり';
    const fireCost = getManagerFireCost(manager);
    return `
      <div class="manager-card">
        <div class="manager-head">
          <strong>${escapeHtml(manager.name)} <small style="font-size:10px; color:#777;">${age}歳</small></strong>
          <span>月給 ${formatMoney(getManagerMonthlySalary(manager))}</span>
        </div>
        ${skillRows}
        <div class="manager-total">
          能力合計 ${getManagerSkillTotal(manager)} / 40 ・ 年収 ${formatMoney(getManagerAnnualSalary(manager))}
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

// マネージャー市場のパネル（求人は常に表示）
function renderManagerMarketPanel() {
  const list = document.getElementById('manager-market-ui');
  if (!list) return;
  refreshManagerMarket();

  const countElement = document.getElementById('manager-market-count');
  if (countElement) countElement.textContent = String(managerMarketCandidates.length);

  const atLimit = managers.length >= MANAGER_HIRE_LIMIT;
  if (!managerMarketCandidates.length) {
    list.innerHTML = '<div class="office-maintenance-note">現在の求人はありません。</div>';
    return;
  }

  list.innerHTML = managerMarketCandidates.map(candidate => {
    const monthly = getManagerMonthlySalary(candidate);
    const skillLine = MANAGER_SKILLS
      .map(skill => `${skill.name} Lv.${candidate.skills?.[skill.id] || 1}`)
      .join(' / ');
    const age = candidate.age ?? (getGameDateObject().getFullYear() - candidate.birthYear);
    return `
      <div class="manager-card candidate">
        <div class="manager-head">
          <strong>${escapeHtml(candidate.name)} <small style="font-size:10px; color:#777;">${age}歳</small></strong>
          <span>月給 ${formatMoney(monthly)}</span>
        </div>
        <div class="manager-total">${escapeHtml(skillLine)}</div>
        <div class="manager-total">能力合計 ${getManagerSkillTotal(candidate)} / 40</div>
        <div class="manager-fire-row">
          <button class="manager-hire-button" type="button" onclick="hireManagerFromMarket('${candidate.id}')"
            ${atLimit || funds < MANAGER_HIRE_COST ? 'disabled' : ''}
            title="採用費 ${formatMoney(MANAGER_HIRE_COST)}">採用する（${formatMoney(MANAGER_HIRE_COST)}）</button>
        </div>
      </div>
    `;
  }).join('');
}

// 給与明細パネル（資金画面）
function renderSalaryPanel() {
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const memberSalary = getTotalMemberMonthlySalary();
  const managerSalary = getTotalManagerMonthlySalary();
  const total = memberSalary + managerSalary;

  setText('txt-member-count', String(idolRoster.length));
  setText('txt-manager-count', String(managers.length));
  setText('txt-member-salary', formatMoney(memberSalary));
  setText('txt-manager-salary', formatMoney(managerSalary));
  setText('txt-total-salary', formatMoney(total));
  setText('txt-annual-salary', formatMoney(total * 12));
  setText('txt-year-salary', formatMoney(yearlyStats.salary || 0));

  const fanGrowth = Math.max(0, (groupFansAtYearStart || 0) - (previousYearGroupFansAtYearStart || 0));
  setText('salary-note',
    `メンバー年収 = ファン数×8×365 ＋ (当年1月頭 ${Number(groupFansAtYearStart || 0).toLocaleString()}人 − 前年1月頭 ${Number(previousYearGroupFansAtYearStart || 0).toLocaleString()}人)×6。` +
    ` 年間給与のうちグループファン増加分は ${formatMoney(fanGrowth * MEMBER_SALARY_GROUP_GROWTH_FACTOR * idolRoster.length)} です。` +
    ` 給与は毎月末に一括で引き落とされます。`);
}
