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
check('the boost targets are exactly the four stats', run(
  'JSON.stringify(SPECIAL_TRAINING_STATS) === JSON.stringify(["vocal", "dance", "stamina", "recovery"])'
) === true);
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
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = 'dance-lesson';
  weeklySchedule.restDayMembers = [];
  weeklySchedule.focusMemberIds = [focus.id];
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

const staminaWeek = JSON.parse(withRecorder(`
  advanceOneWeek();
  const selected = idolRoster.filter(m => m.isSelected && !m.injury);
  const focus = selected[0];
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = 'endurance-training';
  weeklySchedule.restDayMembers = [];
  weeklySchedule.focusMemberIds = [focus.id];
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
  weeklySchedule.slots = Array(14).fill('');
  weeklySchedule.slots[0] = '${slotId}';
  weeklySchedule.restDayMembers = [];
  const pass = withFocus => {
    weeklySchedule.focusMemberIds = withFocus ? [focus.id] : [];
    window.__exp = [];
    window.__stamina = [];
    applyWeeklySchedule();
    const sum = list => list.reduce((total, entry) => total + entry.amount, 0);
    return {
      academics: sum(window.__exp.filter(e => e.statId === 'academics')),
      talk: sum(window.__exp.filter(e => e.statId === 'talk')),
      spent: sum(window.__stamina.filter(e => e.id === focus.id)),
      log: document.getElementById('log-box').textContent
    };
  };
  return JSON.stringify({ withF: pass(true), withoutF: pass(false) });
`);
const literacyWeek = JSON.parse(runFocusWeek('literacy'));
const danceFocusWeek = JSON.parse(runFocusWeek('dance-lesson'));
check('学力 / トーク are not multiplied', literacyWeek.withF.academics > 0
  && literacyWeek.withF.academics === literacyWeek.withoutF.academics
  && literacyWeek.withF.talk === literacyWeek.withoutF.talk,
  JSON.stringify(literacyWeek.withF));
check('a week with no target lesson costs no extra stamina',
  literacyWeek.withF.spent === literacyWeek.withoutF.spent,
  `${literacyWeek.withF.spent} vs ${literacyWeek.withoutF.spent}`);
check('and the log does not claim a special boost', !/特別強化/.test(literacyWeek.withF.log),
  literacyWeek.withF.log.slice(0, 120));
check('a target lesson does cost the extra stamina', danceFocusWeek.withF.spent > danceFocusWeek.withoutF.spent
  && /特別強化/.test(danceFocusWeek.withF.log),
  `${danceFocusWeek.withF.spent} vs ${danceFocusWeek.withoutF.spent}`);

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
    weeklySchedule = null;
    ensureWeeklySchedule();
    const isDefault = JSON.stringify(weeklySchedule.slots) === JSON.stringify(DEFAULT_WEEK_SLOTS)
      || weeklySchedule.slots.length === WEEK_SLOT_COUNT;
    return lastWeekSchedule === null && isDefault;
  })()
`) === true);

// ---- 週間スケジュールの曜日並び（水曜起点） ----
check('the week runs from Thursday to the following Wednesday', run(`
  JSON.stringify(WEEK_DAY_LABELS) === JSON.stringify(['木','金','土','日','月','火','水'])
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

console.log('\n================ RESULT ================');
const failed = results.filter(r => !r.ok);
console.log(`PASS ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join(', '));
  process.exitCode = 1;
}