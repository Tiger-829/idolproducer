/* Calendar-year rollover regression checks (jsdom) */
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  console.log('jsdom is not installed. Run `npm i -D jsdom` to execute this check.');
  process.exit(0);
}
const { loadGameHtml } = require('./test-helper');

const dom = new JSDOM(loadGameHtml(__dirname), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const { window } = dom;
window.alert = () => {};
window.confirm = () => true;

const run = code => window.eval(code);
run(`
  currentYear = 1;
  calendarYear = 2026;
  gameDate = '2026-12-31';
  yearlyStats = {
    sales: 120,
    audience: 340,
    streamRevenue: 560,
    streamCost: 78,
    fanClubIncome: 90,
    cdRevenue: 12,
    tieUpRevenue: 34,
    salary: 56
  };
  leagueTeams = [{ sales: 1, audience: 2, showCount: 3 }];
  groupFansAtYearStart = 100;
  yearEndAwardProcessed = true;
  yearEndKohakuProcessed = true;

  const savedDailyHandlers = {
    processBirthdays,
    processPlanEvents,
    processReleaseEvents,
    processLiveEvents,
    checkSenbatsuTrigger,
    processScheduledPerformances,
    processYearEndEvents,
    processMonthlyClosing
  };
  processBirthdays = () => {};
  processPlanEvents = () => {};
  processReleaseEvents = () => {};
  processLiveEvents = () => {};
  checkSenbatsuTrigger = () => {};
  processScheduledPerformances = () => {};
  processYearEndEvents = () => {};
  processMonthlyClosing = () => {};
  idolRoster = [];
  processDailyFlow(new Date('2026-12-31T12:00:00'), new Date('2027-01-01T12:00:00'));
  Object.assign(window, savedDailyHandlers);
  gameDate = '2027-01-01';
  syncGameCalendar();
  updateUI();
  openDecisionModal('2年目カレンダー', 2, 1, 1);
`);

const check = (name, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} : ${name}`);
  if (!condition) process.exitCode = 1;
};

check('year rollover advances the game year and calendar year', run('currentYear === 2 && calendarYear === 2027'));
check('year rollover clears all annual statistics and team totals', run(`
  Object.values(yearlyStats).every(value => value === 0)
    && leagueTeams[0].sales === 0
    && leagueTeams[0].audience === 0
    && leagueTeams[0].showCount === 0
`));
check('year rollover resets annual event flags', run('!yearEndAwardProcessed && !yearEndKohakuProcessed'));
check('common header and annual panel show the new year', run(`
  document.getElementById('txt-year').textContent === '2'
    && document.getElementById('txt-calendar-date').textContent.includes('2027')
    && document.getElementById('txt-year-sales').textContent === '0 枚'
`));
check('planning modal renders its calendar for the new actual year', run(`
  document.getElementById('modal-title').textContent === '2年目カレンダー'
    && document.querySelector('#decision-modal .modal-content').textContent.includes('2027年 1月')
`));
run('checkYearlyTransition(new Date("2027-01-01T12:00:00"));');
check('rechecking the same date does not advance the game year again', run('currentYear === 2 && calendarYear === 2027'));
run('checkYearlyTransition(new Date("2028-01-01T12:00:00"));');
check('later years continue advancing normally', run('currentYear === 3 && calendarYear === 2028'));

dom.window.close();
