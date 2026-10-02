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

run('weeklySchedule.slots[1] = "dance-lesson";');
run('setWeeklyScheduleSlot(1, "dance-lesson");');
check('fixed slots cannot be changed', run('weeklySchedule.slots[1]') === 'dance-lesson', run('weeklySchedule.slots[1]'));
run('renderWeeklyActionPanel();');
const panelHtml = run('document.getElementById("weekly-action-panel").innerHTML');
check('the weekly schedule UI is shown on a broadcast week', panelHtml.includes('confirmWeeklySchedule()'));
check('the live-week screen is not shown', !panelHtml.includes('イベントまで進行'));

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
  const staminaBefore2 = idolRoster.filter(m => m.isSelected).map(m => m.staminaValue);
  // 週間スケジュールを適用した直後のログ（週を進める前に読む）
  applyWeeklySchedule();
  const log = document.getElementById('log-box').textContent;
  const fundsAfterSchedule = funds;
  advanceOneWeek();
  JSON.stringify({
    promo: nextLivePromotionPoints - promoBefore,
    goods: merchandiseProducts - goodsBefore,
    fundsPaid: fundsBefore - fundsAfterSchedule,
    trained: idolRoster.filter(m => m.isSelected).some((m, i) => m.staminaValue < staminaBefore2[i]),
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
  /能力UP/.test(coexistResult.log) && /事務作業/.test(coexistResult.log), coexistResult.log.slice(0, 200));
check('live promotion can be combined with lessons too', run(`
  selectOfficeAction('live-promotion');
  const promoBefore2 = nextLivePromotionPoints;
  applyWeeklySchedule();
  nextLivePromotionPoints - promoBefore2
`) === 1);
check('the schedule resets for the next week', run(`
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
const dateBeforeConfirm = run('gameDate');
run('confirmWeeklySchedule();');
check('confirmWeeklySchedule does nothing on a live week', run('gameDate') === dateBeforeConfirm);
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

const trainingChecks = [
  { id: 'strength-training', stat: 'athletics' },
  { id: 'endurance-training', stat: 'stamina' },
  { id: 'coordination', stat: 'coordination' }
];
trainingChecks.forEach(({ id, stat }) => {
  const result = run(`
    advanceOneWeek();
    const target = idolRoster.filter(m => m.isSelected && !m.injury)[0];
    const before = target.stats.${stat};
    const expBefore = (target.statExp && target.statExp.${stat}) || 0;
    weeklySchedule.slots = Array(14).fill('');
    weeklySchedule.slots[0] = '${id}';
    applyWeeklySchedule();
    (target.stats.${stat} > before || (target.statExp.${stat} || 0) > expBefore)
  `);
  check(`${id} raises ${stat}`, result === true, String(result));
});

const runThrough = run(`
  advanceOneWeek();
  const target = idolRoster.filter(m => m.isSelected && !m.injury)[0];
  const danceBefore = { level: target.stats.dance, exp: (target.statExp && target.statExp.dance) || 0 };
  const vocalBefore = { level: target.stats.vocal, exp: (target.statExp && target.statExp.vocal) || 0 };
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = 'full-run-through';
  weeklySchedule.slots[1] = 'full-run-through';
  applyWeeklySchedule();
  JSON.stringify({
    dance: target.stats.dance > danceBefore.level || (target.statExp.dance || 0) > danceBefore.exp,
    vocal: target.stats.vocal > vocalBefore.level || (target.statExp.vocal || 0) > vocalBefore.exp
  })
`);
const runThroughResult = JSON.parse(runThrough);
check('通し練習 raises both ダンス and 歌唱', runThroughResult.dance && runThroughResult.vocal, runThrough);

console.log('\n--- 8. 通し練習 is limited to 2 slots per week ---');
check('the limit is 2', run('FULL_RUN_THROUGH_WEEKLY_LIMIT') === 2);
const limitResult = run(`
  advanceOneWeek();
  weeklySchedule.slots = Array(14).fill('');
  setWeeklyScheduleSlot(0, 'full-run-through');
  setWeeklyScheduleSlot(1, 'full-run-through');
  const afterTwo = countWeekSlots('full-run-through');
  setWeeklyScheduleSlot(2, 'full-run-through');
  JSON.stringify({
    afterTwo,
    afterThree: countWeekSlots('full-run-through'),
    log: document.getElementById('log-box').textContent
  })
`);
const limit = JSON.parse(limitResult);
console.log('  ', limitResult);
check('two slots can be assigned', limit.afterTwo === 2);
check('a third slot is rejected', limit.afterThree === 2);
check('the rejection is explained to the player', /通し練習.*2枠まで/.test(limit.log), limit.log);
check('validation blocks an over-limit schedule', run(`
  weeklySchedule.slots[0] = 'full-run-through';
  weeklySchedule.slots[1] = 'full-run-through';
  weeklySchedule.slots[2] = 'full-run-through';
  validateWeeklySchedule()
`) === false);
check('the dropdown shows the limit state', run(`
  weeklySchedule.slots = ['full-run-through', 'full-run-through', '', '', '', '', '', '', '', '', '', '', '', ''];
  renderWeeklyActionPanel();
  const html = document.getElementById('weekly-action-panel').innerHTML;
  /通し練習（1週2枠まで）/.test(html) && html.includes('現在2枠')
`) === true);

console.log('\n--- 9. 連携 requires 2 or more participants ---');
const soloCoordination = run(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected);
  const target = selected[0];
  const before = { level: target.stats.coordination, exp: (target.statExp && target.statExp.coordination) || 0 };
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = 'coordination';
  weeklySchedule.slots[1] = 'coordination';
  // 参加できるのはtarget だけにする
  weeklySchedule.restDayMembers = selected.filter(m => m.id !== target.id).map(m => m.id);
  applyWeeklySchedule();
  JSON.stringify({
    up: target.stats.coordination > before.level || (target.statExp.coordination || 0) > before.exp,
    log: document.getElementById('log-box').textContent
  })
`);
const solo = JSON.parse(soloCoordination);
console.log('  ', solo.log.slice(0, 150));
check('連携 gives nothing when only 1 member can attend', solo.up === false);
check('and it is reported in the log', /連携/.test(solo.log) && /未実施/.test(solo.log), solo.log.slice(0, 150));
const duoCoordination = run(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected);
  const target = selected[0];
  const before = { level: target.stats.coordination, exp: (target.statExp && target.statExp.coordination) || 0 };
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = 'coordination';
  weeklySchedule.slots[1] = 'coordination';
  weeklySchedule.restDayMembers = selected.filter(m => m.id !== target.id && m.id !== selected[1].id).map(m => m.id);
  applyWeeklySchedule();
  (target.stats.coordination > before.level || (target.statExp.coordination || 0) > before.exp)
`);
check('連携 works when 2 members attend', duoCoordination === true, String(duoCoordination));

console.log('\n================ RESULT ================');
const failed = results.filter(r => !r.ok);
console.log(`PASS ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join(', '));
  process.exitCode = 1;
}