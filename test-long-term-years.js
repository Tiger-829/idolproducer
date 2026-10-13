/* Long-term check: banner year / calendar year / planning modal stay consistent over many years (jsdom) */
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  console.log('jsdom is not installed. Run `npm i -D jsdom` to execute this check.');
  process.exit(0);
}
const { loadGameHtml } = require('./test-helper');

const YEARS = Number(process.env.LONG_TERM_YEARS || 12);
const dom = new JSDOM(loadGameHtml(__dirname), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.alert = () => {};
window.confirm = () => true;
window.prompt = () => '';
const run = code => window.eval(code);

run('initGame(1, true); document.getElementById("decision-modal").style.display = "none";');
const startYear = run('calendarYear');

const clearPending = `
  pendingReports = []; pendingMonthlyReport = null; pendingSelectionEvent = null;
  pendingCrisisResponse = null; pendingFanClubEvent = null; pendingRandomEvent = null;
  pendingEquipmentEvent = null; pendingPerformanceOffers = []; draftState = null;
`;

const errors = [];
const fail = message => { if (errors.length < 30) errors.push(message); };
const modalsSeen = new Set();
const yearsSeen = new Set();
let steps = 0;

while (steps++ < YEARS * 70) {
  run(clearPending + 'advanceUntilNextSchedulePoint();');
  run(clearPending + 'openPendingModal();');

  const actual = run('getGameDateObject().getFullYear()');
  const expectedGameYear = actual - startYear + 1;
  const date = run('gameDate');
  yearsSeen.add(actual);

  const state = run('({ currentYear, calendarYear, banner: document.getElementById("txt-year").textContent, dateLabel: document.getElementById("txt-calendar-date").textContent })');
  if (state.calendarYear !== actual) fail(`${date}: calendarYear=${state.calendarYear} (expected ${actual})`);
  if (state.currentYear !== expectedGameYear) fail(`${date}: currentYear=${state.currentYear} (expected ${expectedGameYear})`);
  if (state.banner !== String(expectedGameYear)) fail(`${date}: banner=${state.banner} (expected ${expectedGameYear})`);
  if (!state.dateLabel.includes(String(actual))) fail(`${date}: calendar label "${state.dateLabel}" lacks ${actual}`);

  if (run('document.getElementById("decision-modal").style.display') === 'flex') {
    const modal = run(`({
      title: document.getElementById("modal-title").textContent,
      text: document.querySelector("#decision-modal .modal-content").textContent,
      target: planYearTarget, start: planStartM, end: planEndM
    })`);
    const month = run('currentMonth');
    const expectTarget = month <= 8 ? expectedGameYear : expectedGameYear + 1;
    const expectActual = month <= 8 ? actual : actual + 1;
    const [expectStart, expectEnd] = month <= 8 ? [7, 12] : [1, 6];
    if (modal.target !== expectTarget) fail(`${date}: modal target year=${modal.target} (expected ${expectTarget})`);
    if (modal.start !== expectStart || modal.end !== expectEnd) fail(`${date}: modal months ${modal.start}-${modal.end}`);
    if (!modal.title.includes(`${expectTarget}年`)) fail(`${date}: modal title "${modal.title}"`);
    const calYears = [...modal.text.matchAll(/(\d{4})年 ?(\d{1,2})月 スケジュール確認/g)];
    if (!calYears.length) fail(`${date}: modal has no calendar`);
    calYears.forEach(m => {
      if (Number(m[1]) !== expectActual) fail(`${date}: modal calendar shows ${m[1]}年${m[2]}月 (expected ${expectActual})`);
    });
    modalsSeen.add(`${expectTarget}-${expectStart}`);
    run('closeDecisionModal()');
  }
  if (actual >= startYear + YEARS) break;
}

// 年末イベントが毎年発火しているか（フラグが最後の12月に処理済みになっている）
const yearsCovered = yearsSeen.size;
console.log(`years simulated: ${yearsCovered} (${startYear}-${Math.max(...yearsSeen)}), planning modals checked: ${modalsSeen.size}`);
if (yearsCovered < YEARS) fail(`only ${yearsCovered} calendar years were simulated`);
if (modalsSeen.size < YEARS) fail(`only ${modalsSeen.size} planning modals were checked`);

if (errors.length) {
  console.log('FAIL:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS : banner, calendar year and planning modals stay consistent over the long term');
}
dom.window.close();
