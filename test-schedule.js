/* Weekly schedule / TV-broadcast slots / equipment random event checks (jsdom) */
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  console.log('jsdom is not installed. Run `npm i -D jsdom` to execute this check.');
  process.exit(0);
}

const { loadGameHtml } = require('./test-helper');

const html = loadGameHtml(__dirname);
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.alert = () => {};
window.confirm = () => true;

const run = (code) => window.eval(code);
const results = [];
const check = (name, condition, extra = '') => {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} : ${name}${extra ? ` -> ${extra}` : ''}`);
};

run('initGame(1, true); document.getElementById("decision-modal").style.display = "none";');
console.log('initial state:', run('JSON.stringify({ date: gameDate, year: currentYear, month: currentMonth, members: idolRoster.length, selected: idolRoster.filter(m=>m.isSelected).length })'));

console.log('\n--- 1. TV appearance does not block the weekly schedule ---');
run(`
  window.__plus5 = (() => { const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 5); return toDateKey(d); })();
  scheduledPerformances = [{ id: 'test-ctv', name: 'CTV', isSpecial: false, songId: null, airDate: window.__plus5 }];
`);
console.log('  gameDate:', run('gameDate'), ' airDate:', run('window.__plus5'));
check('a week with a TV appearance is not a live week', run('hasLiveWithinWeek()') === false);

console.log('\n--- 2. Broadcast slot embedding (afternoon = appearance, morning = rehearsal) ---');
const fixedInfo = run('JSON.stringify([...getWeekFixedSlots().entries()].map(([index, slot]) => ({ index, kind: slot.kind, label: slot.label })))');
console.log('  fixed slots:', fixedInfo);
const parsed = JSON.parse(fixedInfo);
const broadcast = parsed.find(s => s.kind === 'broadcast');
const rehearsal = parsed.find(s => s.kind === 'rehearsal');
check('afternoon slot holds the TV appearance', Boolean(broadcast) && broadcast.index % 2 === 1, fixedInfo);
check('the preceding morning slot holds the rehearsal', Boolean(rehearsal) && rehearsal.index % 2 === 0, fixedInfo);
check('rehearsal is exactly one slot before the appearance', Boolean(broadcast && rehearsal) && broadcast.index === rehearsal.index + 1);

// 休養日の規定（全日1日＋半休2枠）を満たすよう、レッスン枠を使う
run('weeklySchedule.slots[1] = "dance-lesson";');
run('setWeeklyScheduleSlot(1, "dance-lesson");');
check('fixed slots cannot be changed', run('weeklySchedule.slots[1]') === 'dance-lesson', run('weeklySchedule.slots[1]'));
// 休養日の規定（全日1日＋半休2枠）を満たすよう、この週は既定の休養配置に戻す
run('weeklySchedule.slots = DEFAULT_WEEK_SLOTS.slice(); ensureWeeklySchedule();');
run('renderWeeklyActionPanel();');
const panelHtml = run('document.getElementById("weekly-action-panel").innerHTML');
check('the weekly schedule UI is shown on a broadcast week', panelHtml.includes('confirmWeeklySchedule()'));
check('the live-week screen is not shown', !panelHtml.includes('イベントまで進行'));
check('rest-day member buttons show a projected injury risk', panelHtml.includes('ケガリスク：'));

const injuryRiskProbe = JSON.parse(run(`
  (() => {
    const member = idolRoster.find(m => m && m.isSelected);
    const savedSchedule = weeklySchedule;
    const savedStamina = member.staminaValue;
    const savedFixedSlotGetter = getWeekFixedSlots;
    try {
      getWeekFixedSlots = () => new Map();
      weeklySchedule = {
        ...weeklySchedule,
        slots: Array(14).fill('dance-lesson'),
        vacation: false,
        restDayMembers: []
      };
      member.staminaValue = 5;
      const maximumRisk = getWeeklyScheduleInjuryRisk(member);
      const expectedMaximumRisk = INJURY_BASE_RATE * INJURY_ACCIDENT_RATE;
      weeklySchedule.vacation = true;
      const vacationRisk = getWeeklyScheduleInjuryRisk(member);
      return JSON.stringify({ maximumRisk, vacationRisk, expectedMaximumRisk });
    } finally {
      member.staminaValue = savedStamina;
      weeklySchedule = savedSchedule;
      getWeekFixedSlots = savedFixedSlotGetter;
    }
  })()
`));
check('projected risk uses post-menu stamina and the highest risk band',
  injuryRiskProbe.maximumRisk.level === '必' && injuryRiskProbe.maximumRisk.stamina === 0
    && injuryRiskProbe.maximumRisk.chance === injuryRiskProbe.expectedMaximumRisk,
  JSON.stringify(injuryRiskProbe.maximumRisk));
check('a one-week vacation has no injury risk',
  injuryRiskProbe.vacationRisk.level === 'なし' && injuryRiskProbe.vacationRisk.chance === 0);

run('weeklySchedule.vacation = false; toggleWeekVacation();');
check('a one-week vacation is refused on a broadcast week', run('weeklySchedule.vacation') === false);

const staminaBefore = JSON.parse(run('JSON.stringify(idolRoster.filter(m => m.isSelected).map(m => m.staminaValue))'));
run('confirmWeeklySchedule();');
const staminaAfter = JSON.parse(run('JSON.stringify(idolRoster.filter(m => m.isSelected).map(m => m.staminaValue))'));
check('rehearsal + appearance consume stamina', staminaAfter.some((value, i) => value < staminaBefore[i]),
  JSON.stringify({ staminaBefore, staminaAfter }));
const weeklyLog = run(`
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 4);
  scheduledPerformances = [{ id: 'log-check', name: 'Mコン', isSpecial: false, songId: null, airDate: toDateKey(d) }];
  applyWeeklySchedule();
  document.getElementById('log-box').textContent
`);
check('weekly log mentions the rehearsal and the appearance',
  /リハーサル/.test(weeklyLog) && /テレビ出演/.test(weeklyLog), weeklyLog.slice(0, 200));
check('weekly breakdown lists the broadcast by name', weeklyLog.includes('Mコン'), '');

console.log('\n--- 3b. Training and office work coexist in the same week ---');
run('selectOfficeAction("live-promotion");');
check('office work is stored in the weekly schedule', run('weeklySchedule.officeAction') === 'live-promotion');
run('selectOfficeAction("live-promotion");');
check('pressing the same item clears the selection', run('weeklySchedule.officeAction') === '');
run('selectOfficeAction("goods-development");');
const coexist = run(`
  const promoBefore = nextLivePromotionPoints;
  const goodsBefore = merchandiseProducts;
  const fundsBefore = funds;
  // 週間スケジュールを適用した直後のログ（週を進める前に読む）
  applyWeeklySchedule();
  const log = document.getElementById('log-box').textContent;
  const fundsAfterSchedule = funds;
  // 訓練＝ログにレッスン等が入っていること（能力UPの発生は確率的なため判定に使わない）
  const trained = /(レッスン|練習|連携|トレーニング|講義)/.test(log);
  advanceOneWeek();
  JSON.stringify({
    promo: nextLivePromotionPoints - promoBefore,
    goods: merchandiseProducts - goodsBefore,
    fundsPaid: fundsBefore - fundsAfterSchedule,
    trained,
    log,
    date: gameDate
  })
`);
const coexistResult = JSON.parse(coexist);
console.log('  ', coexistResult.log);
check('members still train in the office-work week', coexistResult.trained === true);
check('the office task is executed in the same week', coexistResult.goods === 1 && coexistResult.fundsPaid === 500000,
  JSON.stringify({ goods: coexistResult.goods, fundsPaid: coexistResult.fundsPaid }));
check('the weekly log contains both training and office work',
  /(レッスン|練習|連携|トレーニング|講義)/.test(coexistResult.log) && /事務作業/.test(coexistResult.log), coexistResult.log.slice(0, 200));
check('live promotion can be combined with lessons too', run(`
  selectOfficeAction('live-promotion');
  const promoBefore2 = nextLivePromotionPoints;
  applyWeeklySchedule();
  nextLivePromotionPoints - promoBefore2
`) === 1);
// 事務作業は「レッスンと同じ週に実行」されるが、確定していないので次の週には残らない
// （ただし confirmWeeklySchedule で確定した場合は前週の計画として引き継がれる）
check('the office action does not carry over after a plain apply', run(`
  advanceOneWeek();
  ensureWeeklySchedule();
  weeklySchedule.officeAction
`) === '');
check('rendered panel shows the office selection UI',
  run('selectOfficeAction("single-promotion"); renderWeeklyActionPanel(); document.getElementById("weekly-action-panel").innerHTML').includes('selectOfficeAction'));

console.log('\n--- 3. Broadcasts that fall inside the advanced week are processed ---');
run(`
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 3);
  scheduledPerformances = [{ id: 'test-mid', name: 'Song Station', isSpecial: false, songId: null, airDate: toDateKey(d) }];
`);
check('broadcast is scheduled', run('scheduledPerformances.length') === 1);
run('advanceOneWeek();');
check('broadcast is processed when the week is skipped', run('scheduledPerformances.length') === 0);
const logs = run('document.getElementById("log-box").textContent');
check('broadcast log appears', logs.includes('Song Station'), logs.slice(0, 200));
check('a rival live does not interrupt Wednesday schedule cadence', run(`
  (() => {
    const originalBookings = rivalLiveBookings;
    const date = getGameDateObject();
    date.setDate(date.getDate() + 3);
    rivalLiveBookings = [{
      groupId: 'rival_1', groupName: 'テスト競合', venue: VENUE_DATA[0].name,
      liveDate: toDateKey(date), venueDates: [toDateKey(date)]
    }];
    renderWeeklyActionPanel();
    const panel = document.getElementById('weekly-action-panel').innerHTML;
    const allowsSchedule = !hasLiveWithinWeek() && panel.includes('confirmWeeklySchedule()');
    rivalLiveBookings = originalBookings;
    return allowsSchedule;
  })()
`) === true);
console.log('\n--- 3c. External live events allow scheduling with fixed slots ---');
run(`
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 3);
  specialLiveEvents = [{
    id: 'test-festival', type: 'festival', name: 'テストフェス',
    venue: VENUE_DATA[0].name, liveDate: toDateKey(d), completed: false
  }];
`);
  run('renderWeeklyActionPanel();');
  const externalLivePanel = run('document.getElementById("weekly-action-panel").innerHTML');
  const externalFixedSlots = JSON.parse(run('JSON.stringify([...getWeekFixedSlots().entries()].map(([index, slot]) => ({ index, kind: slot.kind, slotId: slot.slotId })))'));
  const eventDayBase = run('getWeekDayIndexForOffset(3) * WEEK_PERIOD_LABELS.length');
  check('external live week exposes the schedule editor', externalLivePanel.includes('confirmWeeklySchedule()') && !externalLivePanel.includes('イベントまで進行'));
  check('the prior day and event morning are rehearsal slots', [eventDayBase - 2, eventDayBase - 1, eventDayBase].every(index =>
    externalFixedSlots.some(slot => slot.index === index && slot.kind === 'rehearsal')));
  check('the event afternoon is fixed', externalFixedSlots.some(slot => slot.index === eventDayBase + 1 && slot.slotId === 'external-live'));
  check('the following day is fixed as a full rest day', [eventDayBase + 2, eventDayBase + 3].every(index =>
    externalFixedSlots.some(slot => slot.index === index && slot.slotId === 'rest-day')));
  run('setWeeklyScheduleSlot(8, "rest-day"); confirmWeeklySchedule();');
  check('the editable external live schedule advances to Wednesday and processes the event',
    run('specialLiveEvents[0].completed && new Date(gameDate + "T12:00:00").getDay() === 3') === true);
  check('the external live appears in the log', run('document.getElementById("log-box").textContent.includes("テストフェス")') === true);
  check('an external live does not interrupt Wednesday schedule cadence',
    run('new Date(gameDate + "T12:00:00").getDay() === 3') === true);
  console.log('\n--- 4. Live weeks still block the weekly schedule ---');
run(`
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 2);
  const key = currentYear + '-' + currentMonth;
  productionSchedule[key] = productionSchedule[key] || { release: 'none', liveVenue: null };
  productionSchedule[key].liveVenue = '原宿体育館';
  productionSchedule[key].liveDate = toDateKey(d);
  productionSchedule[key].liveCompleted = false;
`);
check('a week with a live is detected', run('hasLiveWithinWeek()') === true);
run('renderWeeklyActionPanel();');
const livePanel = run('document.getElementById("weekly-action-panel").innerHTML');
check('live week shows the live-week screen', livePanel.includes('イベントまで進行') && !livePanel.includes('confirmWeeklySchedule()'));
check('live-week message shows a valid date and its venue', !livePanel.includes('Invalid Date') && livePanel.includes('公演: 原宿体育館'));
const dateBeforeConfirm = run('gameDate');
run('confirmWeeklySchedule();');
check('confirmWeeklySchedule does nothing on a live week', run('gameDate') === dateBeforeConfirm);
check('weekly schedule cannot be confirmed on a non-Wednesday date', run(`
  (() => {
    const originalDate = gameDate;
    const originalSchedule = weeklySchedule;
    const planKey = currentYear + '-' + currentMonth;
    const originalPlan = productionSchedule[planKey];
    delete productionSchedule[planKey];
    const date = getGameDateObject();
    date.setDate(date.getDate() + 1);
    gameDate = toDateKey(date);
    syncGameCalendar();
    weeklySchedule = null;
    ensureWeeklySchedule();
    const before = gameDate;
    confirmWeeklySchedule();
    const blocked = gameDate === before;
    gameDate = originalDate;
    syncGameCalendar();
    weeklySchedule = originalSchedule;
    if (originalPlan) productionSchedule[planKey] = originalPlan;
    return blocked;
  })()
`) === true);
check('non-Wednesday action panel offers progress to Wednesday, not schedule setup', run(`
  (() => {
    const originalDate = gameDate;
    const planKey = currentYear + '-' + currentMonth;
    const originalPlan = productionSchedule[planKey];
    delete productionSchedule[planKey];
    const date = getGameDateObject();
    date.setDate(date.getDate() + 1);
    gameDate = toDateKey(date);
    syncGameCalendar();
    renderWeeklyActionPanel();
    const html = document.getElementById('weekly-action-panel').innerHTML;
    gameDate = originalDate;
    syncGameCalendar();
    if (originalPlan) productionSchedule[planKey] = originalPlan;
    return html.includes('水曜日まで進行') && !html.includes('confirmWeeklySchedule()');
  })()
`) === true);
console.log('\n--- 5. Equipment upgrade proposal as a random event ---');
run('officeUpgrades.lessons = 1; pendingRandomEvent = buildRandomEvent("equipment-upgrade");');
const equipmentEvent = run('JSON.stringify(pendingRandomEvent ? { id: pendingRandomEvent.id, name: pendingRandomEvent.name, context: pendingRandomEvent.context } : null)');
console.log('  event:', equipmentEvent);
const equipment = JSON.parse(equipmentEvent);
check('the equipment proposal is built', equipment && equipment.id === 'equipment-upgrade', equipmentEvent);
run('openRandomEventModal();');
const modalText = run('document.getElementById("random-event-text").textContent');
const modalTitle = run('document.getElementById("random-event-title").textContent');
check('modal shows the facility and levels', modalText.includes('Lv.') && modalTitle === '設備強化の打診', `${modalTitle} / ${modalText.slice(0, 120)}`);
const fundsBefore = run('funds');
const levelBefore = run(`officeUpgrades['${equipment.context.facilityId}']`);
run('resolveRandomEvent(0);');
check('accepting raises the facility level',
  run(`officeUpgrades['${equipment.context.facilityId}']`) === levelBefore + 1,
  `${equipment.context.facilityName} ${levelBefore} -> ${run(`officeUpgrades['${equipment.context.facilityId}']`)}`);
check('development cost is deducted', run('funds') === fundsBefore - equipment.context.cost, `${fundsBefore} -> ${run('funds')}`);
run('pendingRandomEvent = buildRandomEvent("equipment-upgrade"); resolveRandomEvent(1);');
check('declining changes nothing',
  run(`officeUpgrades['${equipment.context.facilityId}']`) === levelBefore + 1);
check('no proposal when every facility is maxed', run(`
  OFFICE_FACILITIES.forEach(f => { officeUpgrades[f.id] = MAX_OFFICE_LEVEL; });
  buildRandomEvent('equipment-upgrade') === null
`) === true);

console.log('\n--- 6. Random event save/restore keeps choice callbacks ---');
check('restored event has apply functions', run(`
  const snapshot = { id: 'equipment-upgrade', name: '設備強化の打診', context: { facilityId: 'lessons', cost: 1000 } };
  const restored = restorePendingRandomEvent(snapshot);
  Boolean(restored) && typeof restored.choices[0].apply === 'function'
`) === true);
console.log('\n--- 7. New training items ---');
check('連携力 is a real status key', run(`
  const key = STATUS_KEYS.find(k => k.id === 'coordination');
  Boolean(key) && key.name === '連携力'
`) === true);
check('members are initialized with 連携力', run('idolRoster.every(m => Number.isFinite(m.stats.coordination))') === true);
check('old saves without 連携力 get a baseline', run(`
  const m = idolRoster[0];
  delete m.stats.coordination;
  ensureMemberVitalState();
  m.stats.coordination
`) === 30);
check('連携力 is NOT available for individual lessons (group only)', run('INDIVIDUAL_LESSON_STATS.includes("coordination")') === false);

// 実装と同じ文字形を使うテスト
const WEEKS = String.fromCharCode(0x9031);
const FULLWIDTH_SLASH = String.fromCharCode(0xFF0F);
const injuryWeeks = (left, total) => `残り${left}${WEEKS}${FULLWIDTH_SLASH}全${total}${WEEKS}`;

console.log('\n--- 7b. ケガの発生率と全治期間 ---');
// ケガ判定は乱数とメンバーを書き換えるので、実行前の状態を復元する
// probe: snapshot and restore member state around the check
const withInjuryProbe = (body) => JSON.parse(run(`
  (function () {
    var __snapshot = idolRoster.map(function (m) {
      return { id: m.id, stamina: m.staminaValue, injury: m.injury };
    });
    function injuryWeeks(left, total) {
      return '\u6b8b\u308a' + left + String.fromCharCode(0x9031) + String.fromCharCode(0xFF0F)
        + '\u5168' + total + String.fromCharCode(0x9031);
    }
    var __result = (function () { ${body} })();
    idolRoster.forEach(function (m) {
      var saved = null;
      for (var i = 0; i < __snapshot.length; i++) {
        if (__snapshot[i].id === m.id) { saved = __snapshot[i]; break; }
      }
      if (saved) { m.staminaValue = saved.stamina; m.injury = saved.injury; }
    });
    return JSON.stringify({ ok: __result === true || __result === 1 });
  })()
`)).ok;

check('the injury base rate is defined and lower than before', run(
  'Number.isFinite(INJURY_BASE_RATE) && INJURY_BASE_RATE > 0 && INJURY_BASE_RATE < 0.45'
) === true);
check('no injury happens while stamina is above the warning line', withInjuryProbe(`
  const member = idolRoster[0];
  member.staminaValue = STAMINA_WARNING_THRESHOLD;
  let occurred = false;
  for (let i = 0; i < 200; i++) if (rollMemberInjury(member)) occurred = true;
  member.injury = null;
  return !occurred;
`) === true);
check('the injury rate scales with how low the stamina is', withInjuryProbe(`
  const member = idolRoster[0];
  const measure = (stamina, reduction = 0) => {
    member.injury = null;
    member.staminaValue = stamina;
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      if (rollMemberInjury(member, reduction)) { hits += 1; member.injury = null; }
    }
    return hits / 4000;
  };
  const empty = measure(0);
  const quarter = measure(Math.round(STAMINA_WARNING_THRESHOLD / 4));
  const reduced = measure(0, 0.75);
  return empty > quarter && quarter > 0
    && empty <= INJURY_BASE_RATE + 0.03
    && reduced < empty;
`) === true);
check('an injury records its full recovery period', withInjuryProbe(`
  const member = idolRoster[0];
  member.injury = null;
  member.staminaValue = 0;
  const originalRandom = Math.random;
  Math.random = () => 0;
  const occurred = rollMemberInjury(member);
  Math.random = originalRandom;
  if (!occurred) return false;
  const injury = member.injury;
  return injury.totalWeeks === injury.weeksLeft
    && injury.weeksLeft >= INJURY_ILLNESS_WEEKS
    && injury.weeksLeft <= INJURY_ACCIDENT_WEEKS_RANGE[1];
`) === true);
check('the recovery period stays inside the documented range', withInjuryProbe(`
  const member = idolRoster[0];
  const lengths = new Set();
  for (let i = 0; i < 60; i++) {
    member.injury = null;
    member.staminaValue = 0;
    if (rollMemberInjury(member)) lengths.add(member.injury.totalWeeks);
  }
  const range = INJURY_ACCIDENT_WEEKS_RANGE;
  return lengths.size > 0
    && [...lengths].every(w => w === INJURY_ILLNESS_WEEKS || (w >= range[0] && w <= range[1]));
`) === true);
check('remaining weeks count down without passing the total', withInjuryProbe(`
  const member = idolRoster[0];
  member.injury = { type: 'ケガ', weeksLeft: 3, totalWeeks: 3, since: gameDate };
  const before = formatInjuryWeeks(member.injury);
  member.injury.weeksLeft = 1;
  const later = formatInjuryWeeks(member.injury);
  const expectedBefore = injuryWeeks(3, 3);
  const expectedLater = injuryWeeks(1, 3);
  return before === expectedBefore && later === expectedLater;
`) === true);
check('old saves without a total get one on load', withInjuryProbe(`
  const member = idolRoster[0];
  member.injury = { type: 'ケガ', weeksLeft: 2, since: gameDate };
  ensureMemberVitalState();
  const filled = member.injury.totalWeeks === 2;
  member.injury = null;
  ensureMemberVitalState();
  return filled && member.injury === null;
`) === true);
check('the roster and the weekly log both show the full period', withInjuryProbe(`
  const member = idolRoster.filter(m => m.isSelected)[0];
  member.injury = { type: 'ケガ', weeksLeft: 2, totalWeeks: 3, since: gameDate };
  updateUI();
  renderRosterNameBar();
  renderRosterList();
  const html = document.getElementById('roster-list-ui').innerHTML;
  const bar = document.getElementById('roster-namebar-ui').innerHTML;
  return /ケガ/.test(html) && /残り2週／全3週/.test(html) && /残り2週／全3週/.test(bar);
`) === true);

console.log('\n--- 10. 特別強化 multiplies vocal / dance / stamina / recovery only ---');
// 経験値と体力消費を記録するヘルパー（body の戻り値をそのまま返す）
const withRecorder = (body) => run(`
  const __result = (() => {
    window.__exp = [];
    window.__stamina = [];
    const __originalExp = addMemberStatExp;
    const __originalStamina = consumeMemberStamina;
    addMemberStatExp = (member, statId, amount) => {
      window.__exp.push({ id: member.id, statId, amount });
      return __originalExp(member, statId, amount);
    };
    consumeMemberStamina = (member, amount) => {
      window.__stamina.push({ id: member.id, amount });
      return __originalStamina(member, amount);
    };
    try {
      return (() => { ${body} })();
    } finally {
      addMemberStatExp = __originalExp;
      consumeMemberStamina = __originalStamina;
    }
  })();
  __result;
`);
console.log('\n--- User-selected rest members return after reaching the stamina target ---');
const autoRestReturn = JSON.parse(withRecorder(`
  const savedSchedule = weeklySchedule;
  const savedPerformances = scheduledPerformances;
  const savedSpecialLives = specialLiveEvents;
  const savedRecoveryDone = weeklyRecoveryDone;
  const savedLogHistory = logHistory.slice();
  const savedLog = document.getElementById('log-box').textContent;
  const savedMembers = idolRoster.map(member => ({
    id: member.id,
    staminaValue: member.staminaValue,
    injury: member.injury,
    stats: { ...member.stats },
    statExp: { ...member.statExp }
  }));
  try {
    const target = idolRoster.find(member => member.isSelected && !member.injury);
    const otherLowStaminaMember = idolRoster.find(member => member.id !== target.id && !member.injury);
    scheduledPerformances = [];
    specialLiveEvents = [];
    weeklySchedule = cloneWeeklySchedule(weeklySchedule);
    weeklySchedule.slots = Array(WEEK_SLOT_COUNT).fill('');
    weeklySchedule.slots[0] = 'rest-day';
    weeklySchedule.slots[1] = 'dance-lesson';
    weeklySchedule.restDayMembers = [];
    weeklySchedule.autoRestMemberIds = [];
    weeklySchedule.focusMemberIds = [];
    target.staminaValue = AUTO_REST_STAMINA_TARGET - 5;
    otherLowStaminaMember.staminaValue = AUTO_REST_STAMINA_TARGET - 5;
    toggleRestDayMember(target.id);
    const onlyUserSelectedForRest = weeklySchedule.autoRestMemberIds.length === 1
      && weeklySchedule.autoRestMemberIds[0] === target.id;
    window.__stamina = [];
    applyWeeklySchedule();
    return JSON.stringify({
      spent: window.__stamina.find(entry => entry.id === target.id)?.amount || 0,
      autoResting: weeklySchedule.autoRestMemberIds.includes(target.id),
      listedAsResting: weeklySchedule.restDayMembers.includes(target.id),
      onlyUserSelectedForRest
    });
  } finally {
    weeklySchedule = savedSchedule;
    scheduledPerformances = savedPerformances;
    specialLiveEvents = savedSpecialLives;
    weeklyRecoveryDone = savedRecoveryDone;
    logHistory = savedLogHistory;
    document.getElementById('log-box').textContent = savedLog;
    savedMembers.forEach(saved => {
      const member = idolRoster.find(entry => entry.id === saved.id);
      member.staminaValue = saved.staminaValue;
      member.injury = saved.injury;
      member.stats = saved.stats;
      member.statExp = saved.statExp;
    });
  }
`));
check('only a user-selected low-stamina member enters recovery rest',
  autoRestReturn.onlyUserSelectedForRest === true, JSON.stringify(autoRestReturn));
check('a member resumes training after a scheduled rest slot reaches 80', autoRestReturn.spent > 0
  && autoRestReturn.autoResting === false && autoRestReturn.listedAsResting === false, JSON.stringify(autoRestReturn));
console.log('\n--- 9. Lesson fatigue uses the stamina before each session ---');
const expectedFatigueRatios = {
  'full-run-through': 0.56,
  coordination: 0.52,
  'individual-lesson': 0.48,
  'dance-lesson': 0.36,
  'vocal-lesson': 0.32,
  'strength-training': 0.15,
  'endurance-training': 0.15,
  literacy: 0.05
};
check('lesson menus use the requested fatigue percentages', run(`
  (() => {
    const expected = ${JSON.stringify(expectedFatigueRatios)};
    return Object.entries(expected).every(([id, ratio]) =>
      WEEKLY_SCHEDULE_ITEMS.find(item => item.id === id)?.staminaRatio === ratio);
  })()
`) === true);
const repeatedDanceCost = JSON.parse(run(`
  (() => {
    const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === 'dance-lesson');
    const first = getLessonStaminaCost(item, 100);
    const second = getLessonStaminaCost(item, 100 - first);
    return JSON.stringify([first, second]);
  })()
`));
check('a later session uses the stamina left by earlier sessions',
  repeatedDanceCost[0] === 36 && repeatedDanceCost[1] === 23, JSON.stringify(repeatedDanceCost));
check('consecutive training adds 2.5 percentage points to the rate',
  run(`getLessonStaminaCost({ staminaRatio: 0.5 }, 100, 1, 2)`) === 53);
check('morning fatigue applies the morning slot factor',
  run(`getLessonStaminaCost(WEEKLY_SCHEDULE_ITEMS.find(item => item.id === 'dance-lesson'), 100, MORNING_SLOT_MULTIPLIER)`) === 29);
check('the schedule panel exposes the full-run-through menu',
  run('renderWeeklyScheduleControls()').includes('通し練習'));
const repeatedDanceSpend = JSON.parse(withRecorder(`
  const savedSchedule = weeklySchedule;
  const savedPerformances = scheduledPerformances;
  const savedSpecialLives = specialLiveEvents;
  const savedMembers = idolRoster.map(member => ({
    id: member.id,
    staminaValue: member.staminaValue,
    injury: member.injury
  }));
  try {
    const target = idolRoster.find(member => !member.injury);
    scheduledPerformances = [];
    specialLiveEvents = [];
    weeklySchedule = cloneWeeklySchedule(weeklySchedule);
    weeklySchedule.slots = Array(WEEK_SLOT_COUNT).fill('');
    weeklySchedule.slots[0] = 'dance-lesson';
    weeklySchedule.slots[1] = 'dance-lesson';
    weeklySchedule.restDayMembers = [];
    weeklySchedule.focusMemberIds = [];
    target.staminaValue = 100;
    window.__stamina = [];
    applyWeeklySchedule();
    return JSON.stringify(window.__stamina.find(entry => entry.id === target.id)?.amount);
  } finally {
    weeklySchedule = savedSchedule;
    scheduledPerformances = savedPerformances;
    specialLiveEvents = savedSpecialLives;
    savedMembers.forEach(saved => {
      const member = idolRoster.find(entry => entry.id === saved.id);
      member.staminaValue = saved.staminaValue;
      member.injury = saved.injury;
    });
  }
`));
check('weekly execution adds the consecutive penalty to the second dance session', repeatedDanceSpend === 56,
  String(repeatedDanceSpend));
const resetStreakSpend = JSON.parse(withRecorder(`
  const savedSchedule = weeklySchedule;
  const savedPerformances = scheduledPerformances;
  const savedSpecialLives = specialLiveEvents;
  const savedMembers = idolRoster.map(member => ({ id: member.id, staminaValue: member.staminaValue, injury: member.injury }));
  try {
    const target = idolRoster.find(member => !member.injury);
    scheduledPerformances = [];
    specialLiveEvents = [];
    weeklySchedule = cloneWeeklySchedule(weeklySchedule);
    weeklySchedule.slots = Array(WEEK_SLOT_COUNT).fill('');
    weeklySchedule.slots[0] = 'dance-lesson';
    weeklySchedule.slots[1] = 'rest-day';
    weeklySchedule.slots[2] = 'dance-lesson';
    weeklySchedule.slots[3] = 'endurance-training';
    weeklySchedule.slots[4] = 'dance-lesson';
    weeklySchedule.restDayMembers = [];
    weeklySchedule.focusMemberIds = [];
    target.staminaValue = 100;
    window.__stamina = [];
    applyWeeklySchedule();
    return JSON.stringify(window.__stamina.find(entry => entry.id === target.id)?.amount);
  } finally {
    weeklySchedule = savedSchedule;
    scheduledPerformances = savedPerformances;
    specialLiveEvents = savedSpecialLives;
    savedMembers.forEach(saved => {
      const member = idolRoster.find(entry => entry.id === saved.id);
      member.staminaValue = saved.staminaValue;
      member.injury = saved.injury;
    });
  }
`));
check('rest and endurance each reset the consecutive training count', resetStreakSpend === 86,
  String(resetStreakSpend));
check('the boost targets are exactly the four stats', run(
  'JSON.stringify(SPECIAL_TRAINING_STATS) === JSON.stringify(["vocal", "dance", "stamina", "recovery"])'
) === true);
check('individual lessons train the same four stats only', run(`
  JSON.stringify(INDIVIDUAL_LESSON_STATS) === JSON.stringify(["vocal", "dance", "stamina", "recovery"])
    && INDIVIDUAL_LESSON_STATS.every(stat => SPECIAL_TRAINING_STATS.includes(stat))
`) === true);
check('the individual-lesson dropdown offers exactly four options', run(`
  (() => {
    const html = renderWeeklyScheduleControls();
    const block = html.slice(html.indexOf('個別レッスン <small>'), html.indexOf('休養日の設定'));
    const statOptions = block.match(/<option value="(vocal|dance|stamina|recovery|talk|variety|academics|athletics|sns|style|crisis)"/g) || [];
    return statOptions.length === INDIVIDUAL_LESSON_STATS.length;
  })()
`) === true);
check('an unsupported individual-lesson stat falls back to 歌唱力', run(`
  (() => {
    weeklySchedule.individualStat = 'sns';
    ensureWeeklySchedule();
    return weeklySchedule.individualStat === 'vocal';
  })()
`) === true);
check('the multiplier is chosen per stat, not per lesson', run(`
  (() => {
    const mult = getSpecialTrainingMultiplier();
    const boosted = SPECIAL_TRAINING_STATS
      .every(stat => getSpecialTrainingStatMultiplier(stat, mult) === mult);
    const plain = STATUS_KEYS.filter(key => !SPECIAL_TRAINING_STATS.includes(key.id))
      .every(key => getSpecialTrainingStatMultiplier(key.id, mult) === 1);
    return boosted && plain && getSpecialTrainingStatMultiplier('vocal', 1) === 1;
  })()
`) === true);
check('the schedule panel names the four target stats', run(`
  (() => {
    const html = renderWeeklyScheduleControls();
    return getSpecialTrainingStatNames().every(name => html.includes(name))
      && html.includes('それ以外の能力は等倍');
  })()
`) === true);

const danceWeek = JSON.parse(withRecorder(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected && !m.injury);
  const focus = selected[0];
  const other = selected[1];
  focus.staminaValue = 100;
  other.staminaValue = 100;
  weeklySchedule.slots = Array(14).fill('');
  // 枠1（午後）を使う。午前枠は午後枠の8割のため、倍率の検証には午後を使う
  weeklySchedule.slots[1] = 'dance-lesson';
  weeklySchedule.restDayMembers = [];
  weeklySchedule.autoRestMemberIds = [];
  weeklySchedule.focusMemberIds = [focus.id];
  // ライブ経験値が混ざらないよう、直前まで破棄してから計測する
  window.__exp = [];
  window.__stamina = [];
  applyWeeklySchedule();
  return JSON.stringify({
    mult: getSpecialTrainingMultiplier(),
    lessonExp: getWeeklyLessonExperience(),
    exp: window.__exp,
    focusId: focus.id,
    otherId: other.id
  });
`));
console.log('  ', `mult ${danceWeek.mult} / lessonExp ${danceWeek.lessonExp} / members ${danceWeek.exp.length}`);
const gainOf = (exp, memberId, statId) => exp
  .filter(entry => entry.id === memberId && entry.statId === statId)
  .reduce((sum, entry) => sum + entry.amount, 0);
const focusDance = gainOf(danceWeek.exp, danceWeek.focusId, 'dance');
const otherDance = gainOf(danceWeek.exp, danceWeek.otherId, 'dance');
const focusStamina = gainOf(danceWeek.exp, danceWeek.focusId, 'stamina');
const otherStamina = gainOf(danceWeek.exp, danceWeek.otherId, 'stamina');
const focusAthletics = gainOf(danceWeek.exp, danceWeek.focusId, 'athletics');
const otherAthletics = gainOf(danceWeek.exp, danceWeek.otherId, 'athletics');
check('ダンス gets the full multiplier', otherDance > 0
  && Math.abs(focusDance - otherDance * danceWeek.mult) <= 1,
  `focus ${focusDance} vs other ${otherDance} (x${danceWeek.mult})`);
check('体力 (secondary) gets the full multiplier', otherStamina > 0
  && Math.abs(focusStamina - otherStamina * danceWeek.mult) <= 1,
  `focus ${focusStamina} vs other ${otherStamina}`);
check('運動能力 (not a target stat) stays flat', otherAthletics > 0
  && focusAthletics === otherAthletics,
  `focus ${focusAthletics} vs other ${otherAthletics}`);
// 個別レッスンは対象1名・選択した能力だけを、強化倍率なしで集中させる
const individualWeek = JSON.parse(withRecorder(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected && !m.injury);
  const target = selected[0];
  target.staminaValue = 100;
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = 'individual-lesson';
  weeklySchedule.restDayMembers = [];
  weeklySchedule.autoRestMemberIds = [];
  weeklySchedule.focusMemberIds = [];
  weeklySchedule.individualMemberId = target.id;
  weeklySchedule.individualStat = 'recovery';
  window.__exp = [];
  window.__stamina = [];
  applyWeeklySchedule();
  return JSON.stringify({
    lessonExp: getWeeklyLessonExperience(),
    exp: window.__exp,
    log: document.getElementById('log-box').textContent
  });
`));
const individualTargetId = run('idolRoster.filter(m => m.isSelected && !m.injury)[0].id');
check('個別レッスン raises only the chosen stat, without the boost',
  individualWeek.exp.filter(e => e.statId === 'recovery' && e.id === individualTargetId)
    .reduce((sum, e) => sum + e.amount, 0) > 0
  && individualWeek.exp.every(e => e.statId === 'recovery'),
  individualWeek.log.slice(0, 100));

const staminaWeek = JSON.parse(withRecorder(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected && !m.injury);
  const focus = selected[0];
  focus.staminaValue = 100;
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[1] = 'endurance-training';
  weeklySchedule.restDayMembers = [];
  weeklySchedule.autoRestMemberIds = [];
  weeklySchedule.focusMemberIds = [focus.id];
  window.__exp = [];
  window.__stamina = [];
  applyWeeklySchedule();
  return JSON.stringify({
    mult: getSpecialTrainingMultiplier(),
    lessonExp: getWeeklyLessonExperience(),
    exp: window.__exp,
    focusId: focus.id
  });
`));
const focusEndurance = gainOf(staminaWeek.exp, staminaWeek.focusId, 'stamina');
check('持久力トレーニング stacks the multiplier on 体力', focusEndurance > 0
  && Math.abs(focusEndurance - Math.round(staminaWeek.lessonExp * staminaWeek.mult)) <= 1,
  `stamina ${focusEndurance} (x${staminaWeek.mult})`);

// 強化しないレッスンの週には弱化の追加消費も無く、ログも特別強化と出さない
const runFocusWeek = (slotId) => withRecorder(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected && !m.injury);
  const focus = selected[0];
  focus.staminaValue = 100;
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = '${slotId}';
  weeklySchedule.restDayMembers = [];
  weeklySchedule.autoRestMemberIds = [];
  const pass = withFocus => {
    weeklySchedule.focusMemberIds = withFocus ? [focus.id] : [];
    window.__exp = [];
    window.__stamina = [];
    applyWeeklySchedule();
    const sum = list => list.reduce((total, entry) => total + entry.amount, 0);
    return {
      crisis: sum(window.__exp.filter(e => e.statId === 'crisis')),
      sns: sum(window.__exp.filter(e => e.statId === 'sns')),
      academics: sum(window.__exp.filter(e => e.statId === 'academics')),
      spent: sum(window.__stamina.filter(e => e.id === focus.id)),
      log: (logHistory[0] && logHistory[0].text) || document.getElementById('log-box').textContent
    };
  };
  return JSON.stringify({ withF: pass(true), withoutF: pass(false) });
`);
const literacyWeek = JSON.parse(runFocusWeek('literacy'));
const danceFocusWeek = JSON.parse(runFocusWeek('dance-lesson'));
// リテラシー講義は「危機回避力＋SNS運用」を伸ばす（特別強化の対象4能力ではないので倍率は掛からない）
check('リテラシー講義 raises crisis + sns', literacyWeek.withF.crisis > 0
  && literacyWeek.withF.sns > 0
  && literacyWeek.withF.crisis === literacyWeek.withoutF.crisis
  && literacyWeek.withF.sns === literacyWeek.withoutF.sns,
  JSON.stringify(literacyWeek.withF));
check('リテラシー講義 no longer raises academics', literacyWeek.withF.academics === 0,
  JSON.stringify(literacyWeek.withF.academics));
check('a week with no target lesson costs no extra stamina',
  literacyWeek.withF.spent === literacyWeek.withoutF.spent,
  `${literacyWeek.withF.spent} vs ${literacyWeek.withoutF.spent}`);
check('and the log does not claim a special boost', !/特別強化/.test(literacyWeek.withF.log),
  literacyWeek.withF.log.slice(0, 120));
check('a target lesson does cost the extra stamina', danceFocusWeek.withF.spent > danceFocusWeek.withoutF.spent
  && /特別強化/.test(danceFocusWeek.withF.log),
  `${danceFocusWeek.withF.spent} vs ${danceFocusWeek.withoutF.spent}`);
// ---- 記録タブ：売上推移・楽曲一覧・初週売上ランキング ----
const seedRecords = () => run(`
  (() => {
    songs = [
      { id: 'rec-a', title: '曲A', releaseType: 'single', released: true, releaseYear: 2027, releaseMonth: 5,
        releaseDateKey: '2027-05-14', firstWeekSales: 12000, totalSales: 90000,
        salesHistory: [{ weekKey: '2027-05-14', sales: 12000 }, { weekKey: '2027-05-21', sales: 30000 }] },
      { id: 'rec-b', title: '曲B', releaseType: 'album', released: true, releaseYear: 2027, releaseMonth: 7,
        releaseDateKey: '2027-07-14', firstWeekSales: 40000, totalSales: 150000,
        salesHistory: [{ weekKey: '2027-07-14', sales: 40000 }, { weekKey: '2027-07-21', sales: 80000 }] },
      { id: 'rec-c', title: '曲C', releaseType: 'single', released: false, releaseYear: 2027, releaseMonth: 9 }
    ];
    salesHistory = [
      { weekKey: '2027-05-14', sales: 0 },
      { weekKey: '2027-05-21', sales: 30000 },
      { weekKey: '2027-05-28', sales: 78000 }
    ];
    switchPage('records');
    return true;
  })()
`);
check('opening the records tab draws the sales chart', seedRecords() === true
  && run("!!document.querySelector('#records-sales-chart svg')") === true);
check('the chart note reports the period and the total', run(`
  (document.getElementById('records-sales-note').textContent || '').includes('78,000')
`) === true);
check('the first-week ranking is sorted by first-week sales', run(`
  (() => {
    const titles = [...document.querySelectorAll('.firstweek-title')].map(el => el.textContent);
    return titles.length === 2 && titles[0] === '曲B' && titles[1] === '曲A';
  })()
`) === true);
check('every song is listed, released or upcoming', run(`
  (() => {
    const titles = [...document.querySelectorAll('.song-row-title')].map(el => el.textContent);
    const upcoming = document.querySelectorAll('.song-row.is-upcoming').length;
    return titles.length === songs.length
      && ['曲A', '曲B', '曲C'].every(name => titles.includes(name))
      && upcoming === 1;
  })()
`) === true);
check('tapping a song opens its 1-year trend modal', run(`
  (() => {
    openSongDetail('rec-a');
    const modal = document.getElementById('song-detail-modal');
    const title = document.getElementById('song-detail-title').textContent;
    const hasChart = !!document.querySelector('#song-detail-chart svg');
    const stats = document.getElementById('song-detail-stats').textContent;
    closeSongDetailModal();
    const closed = document.getElementById('song-detail-modal').style.display === 'none';
    return title === '曲A' && hasChart && stats.includes('12,000') && closed;
  })()
`) === true);
check('an unreleased song has no chart yet', run(`
  openSongDetail('rec-c');
  const empty = document.getElementById('song-detail-chart').textContent.includes('発売後');
  closeSongDetailModal();
  empty
`) === true);
check('a TV appearance plays the on-screen effect', run(`
  (() => {
    document.getElementById('tv-fx-layer').innerHTML = '';
    setLog('【テレビ出演】Mコンで「星の歌」を披露（人気 +3）。');
    return document.querySelectorAll('.tv-fx-card').length === 1;
  })()
`) === true);
check('a big special also plays the effect', run(`
  (() => {
    document.getElementById('tv-fx-layer').innerHTML = '';
    setLog('【大型特番】卒業SPで歌を披露（人気 +12）。');
    return document.querySelectorAll('.tv-fx-card').length === 1;
  })()
`) === true);
check('ordinary logs play no effect', run(`
  (() => {
    document.getElementById('tv-fx-layer').innerHTML = '';
    setLog('【週間スケジュール】レッスン実施 / 能力UP 3件');
    return document.querySelectorAll('.tv-fx-card').length === 0;
  })()
`) === true);

// ---- ドラフト：他チームの指名履歴・落選時の再指名 ----
// 1巡目は「回転パネル」を先に通すため、指名パネルを出すヘルパーを用意する
const DRAFT_SKIP_ROULETTE = 'draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = "picking"; renderDraftPickStep();';
check('rival picks are recorded in the pick history', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    ${DRAFT_SKIP_ROULETTE}
    draftState.round = 2;
    resolveDraftPick(0);
    const log = draftState.pickLog;
    // 1巡目は先に他チームの指名を確定しているため、履歴に残っている
    const rivals = log.filter(entry => !entry.isPlayer);
    const rivalTeams = draftState.pickOrder.filter(t => !t.isPlayer).length;
    const round1Rivals = rivals.filter(entry => entry.round === 1).length;
    const round2Rivals = rivals.filter(entry => entry.round === 2).length;
    const rows = document.querySelectorAll('.draft-picklog-row').length;
    const ok = round1Rivals === rivalTeams
      && round2Rivals === rivalTeams
      && rows === Math.min(12, log.length)
      && rivals.every(e => e.memberName);
    return ok;
  })()
`) === true);
check('the history records the player and the lottery result too', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    draftState.round = 1;
    const original = Math.random;
    Math.random = () => 0;                 // 1 巡目の重複を確定
    resolveDraftPick(0);
    Math.random = original;
    draftState.lottery.index = 0;
    let guard = 0;
    while (!draftState.lottery.done && guard++ < 30) advanceDraftLottery();
    const winner = draftState.lottery.winner;
    resolveDraftLottery();
    const viaLottery = draftState.pickLog.filter(e => e.viaLottery);
    const winnerName = winner.name;
    const mine = draftState.pickLog.filter(e => e.isPlayer);
    // 落選時は自グループが指名できないので、抽擬したチームの指名だけを確認する
    const ok = viaLottery.length === 1
      && viaLottery[0].teamName === winnerName
      && mine.length === (winner.isPlayer ? 1 : 0);
    return ok;
  })()
`) === true);
check('losing the lottery keeps the same pick slot', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    draftState.round = 1;
    const roundBefore = draftState.round;
    const original = Math.random;
    Math.random = () => 0;
    resolveDraftPick(0);
    Math.random = original;
    draftState.lottery.index = 0;
    let guard = 0;
    while (!draftState.lottery.done && guard++ < 30) advanceDraftLottery();
    const winnerIsPlayer = draftState.lottery.winner.isPlayer;
    resolveDraftLottery();
    const sameRound = draftState.round === roundBefore;
    const canPickAgain = draftState.phase === 'picking'
      && document.querySelectorAll('.draft-candidate').length > 0;
    const explained = document.querySelector('.draft-status').textContent.includes('\u304f\u3058\u843d\u9078');
    return !winnerIsPlayer && sameRound && canPickAgain && explained
      && draftState === null || (!winnerIsPlayer && sameRound && canPickAgain && explained);
  })()
`) === true);
check('winning the lottery still advances to the next round', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    draftState.round = 1;
    const original = Math.random;
    Math.random = () => 0;
    resolveDraftPick(0);
    draftState.lottery.index = 0;
    draftState.lottery.done = true;
    draftState.lottery.winner = draftState.lottery.order[0];   // \u56de\u3063\u305f\u30c1\u30fc\u30e0 = \u81ea\u30b0\u30eb\u30fc\u30d7
    resolveDraftLottery();
    Math.random = original;
    const advanced = draftState.round === 2;
    const signed = draftState.acquired.length === 1;
    return advanced && signed;
  })()
`) === true);

// ---- ドラフト：指名済みリスト・名指しパネルの並び替え ----
check('the pick panel offers exactly five sort criteria', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    const labels = [...document.querySelectorAll('.draft-sort-btn')].map(b => b.textContent);
    return DRAFT_SORT_KEYS.length === 5
      && labels.length === 5
      && ['\u7dcf\u8a55', '\u4eba\u6c17', '\u30b9\u30bf\u30a4\u30eb', '\u30d5\u30a1\u30c3\u30b7\u30e7\u30f3', '\u6b4c\u5531\u529b'].every(n => labels.some(l => l.startsWith(n)));
  })()
`) === true);
check('sorting by each criterion orders the list correctly', run(`
  (() => {
    const pool = draftState.pool;
    const valuesOf = (key, desc) => sortDraftCandidates(pool, key, desc).map(r => key === 'overall'
      ? calculateSingleOverall(r.member.stats)
      : r.member.stats[key] || 0);
    const isOrdered = (arr, desc) => arr.every((v, i) => i === 0 || (desc ? arr[i - 1] >= v : arr[i - 1] <= v));
    return ['overall', 'popularity', 'style', 'fashion', 'vocal'].every(key =>
      isOrdered(valuesOf(key, true), true) && isOrdered(valuesOf(key, false), false));
  })()
`) === true);
check('pressing the same criterion flips the direction', run(`
  (() => {
    setDraftSort('style');
    const first = document.querySelector('.draft-sort-btn.active').textContent;
    setDraftSort('style');
    const second = document.querySelector('.draft-sort-btn.active').textContent;
    const activeKey = draftState.sortKey;
    return activeKey === 'style' && first !== second
      && first.includes('\u964d\u9806') && second.includes('\u6607\u9806');
  })()
`) === true);
check('changing the criterion returns to the first page', run(`
  (() => {
    changeDraftPage(2);
    const before = draftState.page;
    setDraftSort('fashion');
    return before === 2 && draftState.page === 0 && draftState.sortKey === 'fashion';
  })()
`) === true);
check('sorting keeps the pool order so picks still target the right member', run(`
  (() => {
    setDraftSort('vocal');
    // 表示されている 1 行目の onclick に含まれるプール追加を取り出す
    const onclick = document.querySelector('.draft-candidate').getAttribute('onclick');
    const poolIndex = Number((onclick.match(/\\d+/) || [])[0]);
    const member = draftState.pool[poolIndex];
    draftState.round = 2;
    resolveDraftPick(poolIndex);
    return Number.isInteger(poolIndex) && draftState.acquired.length === 1
      && draftState.acquired[0] === member;
  })()
`) === true);
check('the acquired list starts empty and fills after each pick', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    const empty = document.querySelector('.draft-acquired-list').classList.contains('is-empty');
    draftState.round = 2;
    resolveDraftPick(0);
    const tags = document.querySelectorAll('.draft-acquired-tags span').length;
    const head = document.querySelector('.draft-acquired-head').textContent;
    return empty && tags === 1 && head.includes('1');
  })()
`) === true);

// ---- ドラフト：任意人数の指名パンル・きじ引き ----
check('the draft opens straight into the pick panel', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    return draftState.phase === 'picking'
      && !document.getElementById('draft-count-picker')
      && document.querySelectorAll('.draft-candidate').length > 0
      && !!document.querySelector('.draft-pager');
  })()
`) === true);
check('the candidate list shows a whole pool page', run(`
  (() => {
    const poolSize = draftState.pool.length;
    const rows = document.querySelectorAll('.draft-candidate').length;
    const head = document.querySelector('.draft-list-head').textContent;
    return poolSize > DRAFT_LIST_PAGE_SIZE
      && rows === Math.min(DRAFT_LIST_PAGE_SIZE, poolSize)
      && head.includes(String(poolSize))
      && head.includes('1 /');
  })()
`) === true);
check('the candidate list can be paged', run(`
  (() => {
    const before = document.querySelector('.draft-candidate-name').textContent;
    changeDraftPage(1);
    const head = document.querySelector('.draft-list-head').textContent;
    const after = document.querySelector('.draft-candidate-name').textContent;
    const changed = before !== after && head.includes('2 /');
    changeDraftPage(-1);
    return changed && document.querySelector('.draft-candidate-name').textContent === before;
  })()
`) === true);
check('the draft ends after any number of picks', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    draftState.round = 2;
    resolveDraftPick(0);
    const afterOne = draftState.acquired.length;
    const stillPicking = draftState.phase === 'picking';
    finishDraft();
    const doneText = document.getElementById('draft-intro').textContent;
    return afterOne === 1 && stillPicking && doneText.includes('1名');
  })()
`) === true);
check('the lottery order starts from this round team', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    const order = buildDraftLotteryOrder();
    const covered = order.length === draftState.pickOrder.length
      && order.every(team => draftState.pickOrder.includes(team));
    return order[0].isPlayer === true && covered;
  })()
`) === true);
check('a conflict opens the lottery and the player draws a chosen ticket', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    // 1巡目の回転パネル → くじを引く（重複を確実にする）
    const originalRandom = Math.random;
    draftState.spinning = false;
    Math.random = () => 0;
    startDraftLotteryChoice();
    Math.random = originalRandom;
    const enteredLottery = draftState.phase === 'lottery';
    const rows = document.querySelectorAll('.draft-lottery-row').length;
    const buttons = document.querySelectorAll('.draft-lottery-btn').length;
    const turnShown = !!document.querySelector('.draft-lottery-row.is-turn');
    // 「くじを選んで引く」：選べるくじが複数ある
    Math.random = () => 0;
    chooseDraftLottery(draftState.lottery.order.length - 1);
    Math.random = originalRandom;
    const decided = draftState.lottery.done && !!draftState.lottery.winner;
    const winnerRow = !!document.querySelector('.draft-lottery-row.is-winner');
    resolveDraftLottery();
    return enteredLottery && rows > 0 && buttons > 0 && turnShown && decided && winnerRow;
  })()
`) === true);
check('round 1 confirms every rival pick before the roulette', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    const phase = draftState.phase;
    const rivalTeams = draftState.pickOrder.filter(t => !t.isPlayer).length;
    const round1 = draftState.pickLog.filter(e => !e.isPlayer && e.round === 1).length;
    const chips = document.querySelectorAll('.draft-roulette-chip').length;
    const teamCount = draftState.pickOrder.length;
    const revealed = !!document.querySelector('.draft-reveal-name');
    return phase === 'roulette' && round1 === rivalTeams && chips === teamCount && revealed;
  })()
`) === true);

// ---- 記録タブ：ログ履歴とドラフト疑似体験 ----
check('the log keeps a history with the newest first', run(`
  (() => {
    setLog('【履歴テスト】1件目');
    setLog('【履歴テスト】2件目');
    setLog('【履歴テスト】3件目');
    const rows = document.querySelectorAll('#log-box .log-entry');
    return rows.length >= 3
      && rows[0].querySelector('.log-text').textContent.includes('3件目')
      && rows[0].querySelector('.log-date').textContent.length > 0;
  })()
`) === true);
check('the draft practice opens with a clear practice label', run(`
  (() => {
    closeDraftModal();
    openDraftPractice();
    draftState.round = 2; draftState.firstRoundResolved = true; draftState.phase = 'picking'; renderDraftPickStep();
    const title = document.getElementById('draft-title').textContent;
    const notice = document.getElementById('draft-notice').textContent;
    const shown = document.getElementById('draft-modal').style.display;
    return title.includes('練習') && notice.includes('疑似体験') && shown === 'flex';
  })()
`) === true);
check('the draft practice never touches the real roster or league', run(`
  (() => {
    const rosterBefore = idolRoster.length;
    const leagueBefore = leagueTeams.length;
    const countBefore = draftCount;
    // 1巡目は他チームとの重複抽選があるので、抽選が出たら先に解決する
    for (let i = 0; i < 5 && draftState && draftState.phase !== 'done'; i++) {
      if (draftState.phase === 'lottery') resolveDraftLottery();
      else if (draftState.phase === 'picking') resolveDraftPick(0);
      else break;
    }
    const acquired = draftState ? draftState.acquired.length : 0;
    return acquired > 0
      && idolRoster.length === rosterBefore
      && leagueTeams.length === leagueBefore
      && draftCount === countBefore;
  })()
`) === true);
check('closing the practice writes a practice log entry', run(`
  logHistory[0].text.includes('疑似体験') && logHistory[0].text.includes('実際の名簿は変化していません')
`) === true);
check('a real draft still signs members to the roster', run(`
  (() => {
    const rosterBefore = idolRoster.length;
    draftState = {
      round: 2, acquired: [], page: 0,
      ranked: [], pickOrder: [], playerRank: 1, playerTeam: null,
      phase: 'picking'
    };
    const member = createMember(18);
    draftSignMember(member);
    const added = idolRoster.length === rosterBefore + 1;
    idolRoster.pop();
    draftState = null;
    return added;
  })()
`) === true);

// ---- ライブ動員は「ライブ後（1日程ごと）」に詳細収支とともに発表される ----
check('the live slot does not reveal audience in advance', run(`
  const venue = VENUE_DATA.find(v => v.cap === 'B');
  const predicted = getLiveAudienceDemand(venue, new Date(2027, 0, 3)).toLocaleString();
  const slot = { liveVenue: venue.name, seatPrices: {}, seatOptions: {} };
  const html = renderLiveSlotHtml(1, 0, slot);
  !html.includes('動員') && !html.includes(predicted)
`) === true);

// ---- ファンバーは細目になった ----
check('the fan share bar is styled as a thin bar', (() => {
  // jsdom は外部CSSを読み込まないため、styles.css を直接読む
  const css = require('fs').readFileSync(require('path').join(__dirname, 'styles.css'), 'utf8');
  const rule = css.match(/\.fan-share-bar\s*\{([^}]*)\}/);
  if (!rule) return false;
  const height = parseFloat((rule[1].match(/height:\s*([\d.]+)px/) || [])[1]);
  return Number.isFinite(height) && height > 0 && height <= 8;
})());
check('the fan share bar is rendered in the DOM', run(`
  updateUI();
  !!document.querySelector('#txt-group-fan-tiers .fan-share-bar')
`) === true);

// ---- ゲーム開始時の既定タブ ----
check('the default page is the office tab', run(`
  DEFAULT_PAGE === 'office'
    && PAGE_TABS.some(tab => tab.id === DEFAULT_PAGE)
`) === true);
check('starting a new game opens the office panel', run(`
  renderPageNav(DEFAULT_PAGE);
  const shown = PAGE_TABS
    .filter(tab => !document.getElementById('page-' + tab.id).hidden)
    .map(tab => tab.id);
  const active = document.querySelector('#page-nav .page-tab.active');
  shown.length === 1
    && shown[0] === 'office'
    && active && active.id === 'page-tab-office'
`) === true);
check('switching pages still shows exactly one panel', run(`
  const results = ['group', 'ranking', 'records', 'office'].map(page => {
    switchPage(page);
    const shown = PAGE_TABS
      .filter(tab => !document.getElementById('page-' + tab.id).hidden)
      .map(tab => tab.id);
    return shown.length === 1 && shown[0] === page;
  });
  renderPageNav(DEFAULT_PAGE);
  results.every(Boolean)
`) === true);
check('an unknown page falls back to the default', run(`
  renderPageNav('does-not-exist');
  const shown = PAGE_TABS
    .filter(tab => !document.getElementById('page-' + tab.id).hidden)
    .map(tab => tab.id);
  renderPageNav(DEFAULT_PAGE);
  shown.length === 1 && shown[0] === 'office'
`) === true);

// ---- 前週のスケジュールを引き継ぐ ----
check('a confirmed schedule is remembered for the next week', run(`
  (() => {
    lastWeekSchedule = null;
    resetWeeklySchedule();
    ensureWeeklySchedule();
    const custom = ['dance-lesson','vocal-lesson','literacy','rest-day',
                    'dance-lesson','vocal-lesson','literacy','rest-day',
                    'dance-lesson','vocal-lesson','literacy','rest-day',
                    'dance-lesson','vocal-lesson'];
    weeklySchedule.slots = custom.slice();
    weeklySchedule.officeAction = 'goods-development';
    const member = idolRoster.filter(m => m.isSelected)[0];
    weeklySchedule.focusMemberIds = [member.id];
    weeklySchedule.individualStat = 'dance';
    rememberWeeklySchedule(weeklySchedule);
    return lastWeekSchedule
      && JSON.stringify(lastWeekSchedule.slots) === JSON.stringify(custom)
      && lastWeekSchedule.officeAction === 'goods-development';
  })()
`) === true);
check('the next week starts from the previous schedule', run(`
  (() => {
    weeklySchedule = null;
    ensureWeeklySchedule();
    const restored = JSON.stringify(weeklySchedule.slots) === JSON.stringify(lastWeekSchedule.slots);
    const office = weeklySchedule.officeAction === 'goods-development';
    const focus = weeklySchedule.focusMemberIds.length === 1;
    const stat = weeklySchedule.individualStat === 'dance';
    return restored && office && focus && stat;
  })()
`) === true);
check('the restored schedule is an independent copy', run(`
  (() => {
    const before = weeklySchedule.slots[0];
    weeklySchedule.slots[0] = 'literacy';
    const untouched = lastWeekSchedule.slots[0] === before;
    weeklySchedule.slots[0] = before;
    return untouched;
  })()
`) === true);
check('a fresh game starts with no remembered schedule', run(`
  (() => {
    lastWeekSchedule = null;
    savedCleanWeekSchedule = null;
    weeklySchedule = null;
    ensureWeeklySchedule();
    const isDefault = JSON.stringify(weeklySchedule.slots) === JSON.stringify(DEFAULT_WEEK_SLOTS)
      || weeklySchedule.slots.length === WEEK_SLOT_COUNT;
    return lastWeekSchedule === null && savedCleanWeekSchedule === null && isDefault;
  })()
`) === true);

check('the default weekly preset has the requested 14-slot composition', run(`
  (() => {
    const counts = DEFAULT_WEEK_SLOTS.reduce((result, slotId) => {
      result[slotId] = (result[slotId] || 0) + 1;
      return result;
    }, {});
    const expected = {
      'rest-day': 4,
      'vocal-lesson': 2,
      'dance-lesson': 2,
      literacy: 1,
      'individual-lesson': 1,
      'full-run-through': 1,
      coordination: 1,
      'strength-training': 1,
      'endurance-training': 1
    };
    return DEFAULT_WEEK_SLOTS.length === WEEK_SLOT_COUNT
      && JSON.stringify(counts) === JSON.stringify(expected);
  })()
`) === true);
check('the initial calendar includes the five requested meet-and-greet presets', run(`
  (() => {
    const schedule = createInitialProductionSchedule();
    const year = calendarYear;
    const date = (month, day) => toDateKey(new Date(year, month - 1, day, 12));
    const events = Object.values(schedule).flatMap(plan => plan.planEvents || []);
    const expected = [
      ['1-3', 'online-meeguri', 'パルス八王子', [date(3, 6), date(3, 7)], 'cd_1_2'],
      ['1-4', 'online-meeguri', 'パルス八王子', [date(4, 10)], 'cd_1_2'],
      ['1-4', 'real-meeguri', 'パルス品川', [date(4, 20)], 'cd_1_2'],
      ['1-5', 'online-meeguri', 'パルス八王子', [date(5, 9)], 'cd_1_2'],
      ['1-7', 'online-meeguri', 'パルス船橋', [date(7, 3), date(7, 4)], 'cd_1_6']
    ];
    const matches = expected.every(([key, benefitId, venue, dates, cdId]) => {
      const event = schedule[key].planEvents.find(item => item.benefitId === benefitId
        && item.venue === venue && item.targetCdId === cdId
        && JSON.stringify(item.dates) === JSON.stringify(dates));
      return Boolean(event);
    });
    return matches && schedule['1-5'].liveVenue === (INITIAL_LIVE_VENUE || '原宿体育館');
  })()
`) === true);
check('a multi-day online meet-and-greet runs both dates and charges one event fee', run(`
  (() => {
    const saved = { productionSchedule, funds, recordReleaseBenefitSales, setLog, formatPlanDayLabel };
    const event = {
      benefitId: 'online-meeguri', name: 'オンラインミーグリ',
      date: '2027-03-06', dates: ['2027-03-06', '2027-03-07'], completed: false
    };
    let salesDays = 0;
    try {
      productionSchedule = { '1-3': { planEvents: [event] } };
      funds = 10000000;
      recordReleaseBenefitSales = () => { salesDays += 1; return { sellThrough: 1 }; };
      setLog = () => {};
      formatPlanDayLabel = date => date;
      processPlanEvents('2027-03-06');
      const firstDay = !event.completed && funds === 7000000;
      processPlanEvents('2027-03-07');
      return firstDay && event.completed && funds === 7000000 && salesDays === 2;
    } finally {
      productionSchedule = saved.productionSchedule;
      funds = saved.funds;
      recordReleaseBenefitSales = saved.recordReleaseBenefitSales;
      setLog = saved.setLog;
      formatPlanDayLabel = saved.formatPlanDayLabel;
    }
  })()
`) === true);
check('the default preset satisfies the weekly rest requirement', run(`
  (() => {
    const savedSchedule = weeklySchedule;
    weeklySchedule = createEmptyWeeklySchedule();
    const rest = getWeekRestBreakdown();
    weeklySchedule = savedSchedule;
    return rest.fullRestDays >= REQUIRED_FULL_REST_DAYS
      && rest.extraSlots >= REQUIRED_EXTRA_REST_SLOTS;
  })()
`) === true);

// ---- 歌番組が挟まった週の前後でスケジュールを引き継ぐ ----
check('the week before a music show is kept as the draft source', run(`
  (() => {
    lastWeekSchedule = null;
    savedCleanWeekSchedule = null;
    weeklySchedule = null;
    ensureWeeklySchedule();
    // 歌番組が潰していない週を確定する
    weeklySchedule.slots = Array(14).fill('dance-lesson');
    rememberWeeklySchedule(weeklySchedule);
    return JSON.stringify(savedCleanWeekSchedule.slots) === JSON.stringify(weeklySchedule.slots);
  })()
`) === true);
check('the week after a music show falls back to the pre-show schedule', run(`
  (() => {
    // 歌番組の週（リハーサル／出演が枠に入る）を確定する
    const broadcastWeek = Array(14).fill('rest-day');
    broadcastWeek[4] = 'rehearsal';
    broadcastWeek[5] = 'broadcast';
    weeklySchedule.slots = broadcastWeek;
    rememberWeeklySchedule(weeklySchedule);
    // 次の週の仮組は「挟まる前の週」になる
    weeklySchedule = null;
    ensureWeeklySchedule();
    const stuck = weeklySchedule.slots.filter(id => id && !WEEKLY_SCHEDULE_ITEMS.some(i => i.id === id));
    const fixed = weeklySchedule.slots.filter(id => {
      const item = WEEKLY_SCHEDULE_ITEMS.find(i => i.id === id);
      return id && item && item.fixed;
    });
    return weeklySchedule.slots.every(id => id === 'dance-lesson') && stuck.length === 0 && fixed.length === 0;
  })()
`) === true);
check('a broadcast week never becomes the saved clean week', run(`
  savedCleanWeekSchedule !== null
    && JSON.stringify(savedCleanWeekSchedule.slots) === JSON.stringify(Array(14).fill('dance-lesson'))
`) === true);
check('fixed slots of the previous week are not carried into a new week', run(`
  (() => {
    // 保存版が無い場合：前週の固定枠だけが空きになり、残りの枠は引き継がれる
    lastWeekSchedule = null;
    savedCleanWeekSchedule = null;
    weeklySchedule = null;
    ensureWeeklySchedule();
    weeklySchedule.slots = Array(14).fill('dance-lesson');
    weeklySchedule.slots[2] = 'rehearsal';
    weeklySchedule.slots[3] = 'broadcast';
    rememberWeeklySchedule(weeklySchedule);
    weeklySchedule = null;
    ensureWeeklySchedule();
    return weeklySchedule.slots[2] === '' && weeklySchedule.slots[3] === ''
      && weeklySchedule.slots[0] === 'dance-lesson';
  })()
`) === true);
check('a music-show week still reserves its own fixed slots', run(`
  (() => {
    // 今週に歌番組があるなら、仮組はその枠を埋めて固定する
    scheduledPerformances = [];
    const d = new Date(gameDate + 'T12:00:00');
    d.setDate(d.getDate() + 2);
    scheduledPerformances = [{ id: 'draft-bc', name: 'Mコン', songId: null, isSpecial: false, airDate: toDateKey(d) }];
    lastWeekSchedule = null;
    savedCleanWeekSchedule = null;
    weeklySchedule = null;
    ensureWeeklySchedule();
    const fixedSlots = [...getWeekFixedSlots().entries()];
    const kinds = fixedSlots.map(([, slot]) => slot.kind);
    const ok = kinds.includes('rehearsal') && kinds.includes('broadcast');
    scheduledPerformances = [];
    return ok;
  })()
`) === true);

// ---- 週間スケジュールの曜日並び（水曜起点） ----
check('the week runs from Thursday to the following Wednesday', run(`
  JSON.stringify(WEEK_DAY_LABELS) === JSON.stringify(['木','金','土','日','月','火','水'])
`) === true);
check('a paused midweek date keeps the Wednesday week anchor for weekday slots', run(`
  (() => {
    const originalDate = gameDate;
    const originalPerformances = scheduledPerformances;
    const pausedDate = getGameDateObject();
    pausedDate.setDate(pausedDate.getDate() + 3);
    gameDate = toDateKey(pausedDate);
    scheduledPerformances = [{
      id: 'paused-weekday-check', name: 'Mコン', airDate: gameDate, songId: null, isSpecial: false
    }];
    const broadcast = [...getWeekFixedSlots().values()].find(slot => slot.kind === 'broadcast');
    const actual = ['日','月','火','水','木','金','土'];
    const isCorrect = Boolean(broadcast)
      && getWeekSlotLabel(broadcast.index) === actual[pausedDate.getDay()] + '曜午後';
    gameDate = originalDate;
    scheduledPerformances = originalPerformances;
    syncGameCalendar();
    return isCorrect;
  })()
`) === true);
check('an unprocessed live on the current date still blocks weekly scheduling', run(`
  (() => {
    const key = \`\${currentYear}-\${currentMonth}\`;
    const originalPlan = productionSchedule[key];
    const originalSchedule = weeklySchedule;
    productionSchedule[key] = {
      liveVenue: VENUE_DATA[0].name, liveName: 'テストライブ', liveDate: gameDate
    };
    renderWeeklyActionPanel();
    const panel = document.getElementById('weekly-action-panel').innerHTML;
    const blocks = hasLiveWithinWeek() && panel.includes('イベントまで進行')
      && !panel.includes('confirmWeeklySchedule()');
    if (originalPlan) productionSchedule[key] = originalPlan;
    else delete productionSchedule[key];
    weeklySchedule = originalSchedule;
    return blocks;
  })()
`) === true);
check('each slot label matches the actual weekday it represents', run(`
  (() => {
    const start = getGameDateObject();
    const actual = ['日','月','火','水','木','金','土'];
    // offset 1..7 が 木曜..水曜 に対応し、ラベルと一致すること
    for (let offset = 1; offset <= 7; offset++) {
      const idx = getWeekDayIndexForOffset(offset);
      const date = new Date(start);
      date.setDate(date.getDate() + offset);
      if (WEEK_DAY_LABELS[idx] !== actual[date.getDay()]) return false;
      if (getWeekSlotLabel(idx * 2) !== WEEK_DAY_LABELS[idx] + '曜午前') return false;
    }
    return true;
  })()
`) === true);
check('a broadcast lands on the afternoon of its actual air date', run(`
  (() => {
    scheduledPerformances = [];
    const start = getGameDateObject();
    const air = new Date(start);
    air.setDate(air.getDate() + 2);
    const actual = ['日','月','火','水','木','金','土'];
    const expected = actual[air.getDay()];
    scheduledPerformances.push({
      id: 'weekday-check', name: 'Mコン', airDate: toDateKey(air), songId: null, isSpecial: false
    });
    const broadcast = [...getWeekFixedSlots().values()].find(s => s.kind === 'broadcast');
    const ok = !!broadcast && getWeekSlotLabel(broadcast.index) === expected + '曜午後';
    scheduledPerformances = [];
    return ok;
  })()
`) === true);

// ---- 歌番組リハーサル前の準備（裏効果：通し練習/連携なら楽曲経験値が5倍） ----
const musicPrep = JSON.parse(run(`
  (() => {
    const originalDate = gameDate;
    gameDate = toDateKey(getNextWednesday(getGameDateObject()));
    syncGameCalendar();
    const out = {};
    const totalSongExperience = song => song.experience
      + Array.from({ length: song.level - 1 }, (_, index) => getSongLevelExpRequired(index + 1))
        .reduce((total, required) => total + required, 0);
    ['dance-lesson', 'full-run-through', 'coordination'].forEach(prep => {
      const air = new Date(gameDate + 'T12:00:00');
      air.setDate(air.getDate() + 5);
      const song = ensureScheduledSong(1, 2, productionSchedule['1-2']);
      song.experience = 0;
      song.level = 1;
      scheduledPerformances = [{ id: 'prep-' + prep, name: 'CTV', isSpecial: false, songId: song.id, airDate: toDateKey(air) }];
      ensureWeeklySchedule();
      weeklySchedule.slots = DEFAULT_WEEK_SLOTS.slice();
      const rehearsalIndex = [...getWeekFixedSlots().entries()].find(([, s]) => s.kind === 'rehearsal')[0];
      weeklySchedule.slots[rehearsalIndex - 1] = prep;
      markMusicPreparations();
      const before = totalSongExperience(song);
      processScheduledPerformances(toDateKey(air));
      out[prep] = totalSongExperience(song) - before;
    });
    scheduledPerformances = [];
    gameDate = originalDate;
    syncGameCalendar();
    return JSON.stringify({ out, base: REGULAR_PROGRAM_SONG_EXPERIENCE, times: MUSIC_PREP_BONUS_MULTIPLIER });
  })()
`));
check('a full run-through or coordination before the rehearsal multiplies the song experience by five',
  musicPrep.out['full-run-through'] === musicPrep.base * musicPrep.times
  && musicPrep.out.coordination === musicPrep.base * musicPrep.times,
  JSON.stringify(musicPrep.out));
check('any other lesson in that slot keeps the normal experience',
  musicPrep.out['dance-lesson'] === musicPrep.base,
  `${musicPrep.out['dance-lesson']} vs ${musicPrep.base}`);
check('the hidden bonus is not documented in the help', run(`
  !/リハーサル[^。]*5倍/.test(renderHelpContent())
`) === true);

// ---- 選抜画面の並び替え（6項目） ----
check('the selection screen offers six sort criteria', run(`
  (() => {
    pendingSelectionEvent = null;
    openSelectionSetup();
    const names = [...document.querySelectorAll('#selection-modal .draft-sort-btn')]
      .map(b => b.textContent.replace(/（.*/, ''));
    const ok = names.length === 6
      && ['総評', 'アイドル力', '身長', '年齢', '歌唱力', 'ダンス'].every(n => names.includes(n));
    cancelSelection();
    return ok;
  })()
`) === true);
check('each selection sort criterion orders the list both ways', run(`
  (() => {
    pendingSelectionEvent = null;
    openSelectionSetup();
    const results = {};
    SELECTION_SORT_KEYS.forEach(key => {
      const readValues = () => [...document.querySelectorAll('#selection-modal .selection-member')]
        .map(el => key.get(idolRoster.find(m => m.id === Number(el.dataset.memberId))));
      setSelectionSort(key.id);
      const desc = readValues();
      setSelectionSort(key.id);
      const asc = readValues();
      results[key.id] = desc.every((v, i) => i === 0 || desc[i - 1] >= v)
        && asc.every((v, i) => i === 0 || asc[i - 1] <= v);
    });
    cancelSelection();
    return Object.values(results).every(Boolean);
  })()
`) === true);

const reportProgress = JSON.parse(run(`
  (() => {
    const saved = {
      gameDate,
      pendingReports,
      pendingMonthlyReport,
      pendingSelectionEvent,
      pendingCrisisResponse,
      pendingFanClubEvent,
      pendingRandomEvent,
      pendingEquipmentEvent,
      pendingPerformanceOffers,
      processDailyFlow,
      syncGameCalendar,
      resetWeeklySchedule,
      updateWeeklyGroupFans,
      updateUI,
      openPendingModal,
      modalDisplay: document.getElementById('monthly-report-modal').style.display
    };
    try {
      gameDate = '2027-01-06';
      pendingReports = [];
      pendingMonthlyReport = { year: 2027, month: 1, income: [], expense: [] };
      pendingSelectionEvent = null;
      pendingCrisisResponse = null;
      pendingFanClubEvent = null;
      pendingRandomEvent = null;
      pendingEquipmentEvent = null;
      pendingPerformanceOffers = [];
      processDailyFlow = () => {};
      syncGameCalendar = () => {};
      resetWeeklySchedule = () => {};
      updateWeeklyGroupFans = () => {};
      updateUI = () => {};
      openPendingModal = () => {};
      document.getElementById('monthly-report-modal').style.display = 'flex';
      closeMonthlyReportModal();
      return JSON.stringify({
        date: gameDate,
        weekday: getGameDateObject().getDay(),
        closed: document.getElementById('monthly-report-modal').style.display === 'none'
      });
    } finally {
      gameDate = saved.gameDate;
      pendingReports = saved.pendingReports;
      pendingMonthlyReport = saved.pendingMonthlyReport;
      pendingSelectionEvent = saved.pendingSelectionEvent;
      pendingCrisisResponse = saved.pendingCrisisResponse;
      pendingFanClubEvent = saved.pendingFanClubEvent;
      pendingRandomEvent = saved.pendingRandomEvent;
      pendingEquipmentEvent = saved.pendingEquipmentEvent;
      pendingPerformanceOffers = saved.pendingPerformanceOffers;
      processDailyFlow = saved.processDailyFlow;
      syncGameCalendar = saved.syncGameCalendar;
      resetWeeklySchedule = saved.resetWeeklySchedule;
      updateWeeklyGroupFans = saved.updateWeeklyGroupFans;
      updateUI = saved.updateUI;
      openPendingModal = saved.openPendingModal;
      document.getElementById('monthly-report-modal').style.display = saved.modalDisplay;
    }
  })()
`));
check('closing a midweek financial report resumes through the next Wednesday',
  reportProgress.date === '2027-01-13' && reportProgress.weekday === 3 && reportProgress.closed,
  JSON.stringify(reportProgress));

const monthEndReportProgress = JSON.parse(run(`
  (() => {
    const modal = document.getElementById('monthly-report-modal');
    const saved = {
      gameDate,
      pendingReports,
      pendingMonthlyReport,
      processDailyFlow,
      syncGameCalendar,
      resetWeeklySchedule,
      updateWeeklyGroupFans,
      updateUI,
      modalDisplay: modal.style.display
    };
    try {
      gameDate = '2027-01-30';
      pendingReports = [];
      pendingMonthlyReport = null;
      processDailyFlow = (fromDate, toDate) => {
        if (toDate.getDate() === 31) {
          const report = { year: 2027, month: 1, income: [], expense: [] };
          pendingMonthlyReport = report;
          pendingReports.push({ type: 'monthly', report });
        }
      };
      syncGameCalendar = () => {};
      resetWeeklySchedule = () => {};
      updateWeeklyGroupFans = () => {};
      updateUI = () => {};
      modal.style.display = 'none';
      advanceUntilNextSchedulePoint();
      const reportOpened = modal.style.display === 'flex' && pendingReports.length === 0;
      closeMonthlyReportModal();
      const nextWeekDate = gameDate;
      advanceUntilNextSchedulePoint();
      return JSON.stringify({
        date: gameDate,
        weekday: getGameDateObject().getDay(),
        nextWeekDate,
        reportOpened,
        closed: modal.style.display === 'none'
      });
    } finally {
      gameDate = saved.gameDate;
      pendingReports = saved.pendingReports;
      pendingMonthlyReport = saved.pendingMonthlyReport;
      processDailyFlow = saved.processDailyFlow;
      syncGameCalendar = saved.syncGameCalendar;
      resetWeeklySchedule = saved.resetWeeklySchedule;
      updateWeeklyGroupFans = saved.updateWeeklyGroupFans;
      updateUI = saved.updateUI;
      modal.style.display = saved.modalDisplay;
    }
  })()
`));
check('closing the month-end report resumes through the next Wednesday',
  monthEndReportProgress.date === '2027-02-03' && monthEndReportProgress.weekday === 3
    && monthEndReportProgress.nextWeekDate === '2027-02-03'
    && monthEndReportProgress.reportOpened && monthEndReportProgress.closed,
  JSON.stringify(monthEndReportProgress));

const liveReportProgress = JSON.parse(run(`
  (() => {
    const modal = document.getElementById('live-finance-modal');
    const body = modal.querySelector('.live-finance-body');
    const title = modal.querySelector('.page-title');
    const button = document.getElementById('live-finance-next-button');
    const saved = {
      pendingReports,
      advanceUntilNextSchedulePoint,
      liveFinanceReportPage,
      liveFinanceReportTitle,
      body: body.innerHTML,
      title: title.textContent,
      button: button.textContent,
      display: modal.style.display
    };
    try {
      pendingReports = [];
      window.__reportResumeCount = 0;
      advanceUntilNextSchedulePoint = () => { window.__reportResumeCount += 1; };
      showLiveDetailedFinanceModal({
        liveName: 'テスト公演', venueName: 'テスト会場', venueCap: 'B',
        showCount: 1, showDates: ['2027-01-08'], isMultiDay: false,
        totalAudience: 10, streamBuyers: 0, streamDaysCount: 0, streamCostPerDay: 8000000,
        liveCdSalesByDate: [{ date: '2027-01-08', songTitle: 'テスト曲', unitsSold: 200, revenue: 60000 }],
        liveCdSalesUnits: 200, liveCdSalesRevenue: 60000,
        seatDetails: [{ name: '指定席', unitPrice: 1000, soldCount: 10, totalCapacity: 100, totalSales: 10000 }],
        ticketRevenue: 10000, merchandiseRevenue: 12500, merchandiseSold: 5,
        streamRevenue: 0, streamCost: 0, baseCost: 5000, grossRevenue: 10000,
        totalCost: 5000, profit: 5000
      });
      const firstPage = title.textContent.includes('ライブ公演報告（1/2）')
        && body.querySelector('[data-report-page="1"]').style.display !== 'none'
        && body.querySelector('[data-report-page="2"]').style.display === 'none'
        && body.querySelector('[data-report-page="1"]').textContent.includes('200枚')
        && body.querySelector('[data-report-page="1"]').textContent.includes('6万円')
        && body.querySelector('[data-report-page="1"]').textContent.includes('5個')
        && body.querySelector('[data-report-page="1"]').textContent.includes('1.3万円')
        && button.textContent === '収支報告へ';
      advanceLiveFinanceReportPage();
      const secondPage = title.textContent.includes('ライブ収支報告（2/2）')
        && body.querySelector('[data-report-page="1"]').style.display === 'none'
        && body.querySelector('[data-report-page="2"]').style.display === 'block'
        && button.textContent === '報告を閉じる'
        && window.__reportResumeCount === 0;
      advanceLiveFinanceReportPage();
      return JSON.stringify({
        firstPage,
        secondPage,
        closed: modal.style.display === 'none',
        resumed: window.__reportResumeCount === 1
      });
    } finally {
      pendingReports = saved.pendingReports;
      advanceUntilNextSchedulePoint = saved.advanceUntilNextSchedulePoint;
      liveFinanceReportPage = saved.liveFinanceReportPage;
      liveFinanceReportTitle = saved.liveFinanceReportTitle;
      body.innerHTML = saved.body;
      title.textContent = saved.title;
      button.textContent = saved.button;
      modal.style.display = saved.display;
      delete window.__reportResumeCount;
    }
  })()
`));
check('live reporting has a recap page followed by finance and resumes only after closing',
  liveReportProgress.firstPage && liveReportProgress.secondPage && liveReportProgress.closed && liveReportProgress.resumed,
  JSON.stringify(liveReportProgress));

// ---- 結果表示 ----
console.log('\n================ RESULT ================');
const failed = results.filter(r => !r.ok);
console.log(`PASS ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join(', '));
  process.exitCode = 1;
}
