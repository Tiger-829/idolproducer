/* Soak test: play many weeks and make sure broadcasts / year-end events resolve */
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
window.Math.random = (() => {
  // mulberry32（32bit 整数演算で決定論的な乱数を作る）
  let seed = 20240101;
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const run = (code) => window.eval(code);
run('initGame(1, true); document.getElementById("decision-modal").style.display = "none";');
// 出演打診はすべて受ける（歌番組の枠埋めを実際に通すため）
run(`
  function acceptAllMusicOffers() {
    if (!pendingPerformanceOffers.length) return;
    openMusicOfferModal();
    resolveMusicOffers();
  }
`);

const stats = { weeks: 0, liveWeeks: 0, scheduleWeeks: 0, broadcastsProcessed: 0, error: '' };
// 年末イベントが実際に発火したかを数える
run(`
  window.__kohaku = 0; window.__award = 0; window.__equipmentEvents = 0;
  const originalKohaku = executeKohaku;
  executeKohaku = function () { window.__kohaku++; return originalKohaku(); };
  const originalAward = executeYearEndAwards;
  executeYearEndAwards = function () { window.__award++; return originalAward(); };
  const originalEquipment = applyEquipmentUpgrade;
  applyEquipmentUpgrade = function (ctx) { window.__equipmentEvents++; return originalEquipment(ctx); };
`);

try {
  for (let i = 0; i < 160; i++) {
    const panel = run('acceptAllMusicOffers(); renderWeeklyActionPanel(); document.getElementById("weekly-action-panel").innerHTML');
    const before = run('scheduledPerformances.length');
    if (panel.includes('イベントまで進行')) {
      stats.liveWeeks++;
      run('advanceOneWeek();');
    } else {
      stats.scheduleWeeks++;
      run('confirmWeeklySchedule();');
    }
    const after = run('scheduledPerformances.length');
    stats.broadcastsProcessed += Math.max(0, before - after);
    stats.weeks++;
  }
} catch (error) {
  stats.error = error.stack || String(error);
}

const finalState = run(`JSON.stringify({
  date: gameDate,
  pendingPerformances: scheduledPerformances.length,
  pendingRandom: pendingRandomEvent ? pendingRandomEvent.id : null,
  pendingEquipment: pendingEquipmentEvent ? pendingEquipmentEvent.name : null,
  kohaku: yearEndKohakuProcessed,
  award: yearEndAwardProcessed,
  funds: funds,
  injured: idolRoster.filter(m => m.injury).length,
  staminaOutOfRange: idolRoster.filter(m => m.staminaValue < 0 || m.staminaValue > MAX_STAMINA_VALUE).length
})`);

console.log('weeks advanced     :', stats.weeks, `(live weeks: ${stats.liveWeeks} / schedule weeks: ${stats.scheduleWeeks})`);
console.log('broadcasts handled :', stats.broadcastsProcessed);
console.log('kohaku / award     :', run('window.__kohaku'), '/', run('window.__award'));
console.log('equipment upgrades :', run('window.__equipmentEvents'));
console.log('final state        :', finalState);
if (stats.error) {
  console.log('ERROR:\n' + stats.error);
  process.exitCode = 1;
} else if (run('window.__kohaku') < 1 || run('window.__award') < 1) {
  console.log('ERROR: year-end events never fired');
  process.exitCode = 1;
} else {
  console.log('\nSOAK OK');
}