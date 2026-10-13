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

run(`
  yearEndAwardProcessed = false;
  yearEndKohakuProcessed = false;
  window.__yearEndRuns = 0;
  executeYearEndAwards = () => { window.__yearEndRuns++; };
  executeKohaku = () => { window.__yearEndRuns++; };
  gameDate = '2028-12-30';
  processYearEndEvents('2028-12-31');
  gameDate = '2028-12-31';
  processYearEndEvents('2029-01-01');
  checkYearlyTransition(new Date('2029-01-01T12:00:00'));
`);
check('year-end events fire once per year and are not re-fired by the rollover day', run('window.__yearEndRuns === 2 && !yearEndKohakuProcessed'));

run(`
  window.__legacy = {
    currentYear: 1, calendarYear: 2027, gameDate: '2028-03-08',
    yearlyStats: { sales: 999, audience: 999 },
    yearEndAwardProcessed: true, yearEndKohakuProcessed: true,
    idolRoster: [], productionSchedule: { '2-1': { release: 'none' } }
  };
  applySavedGame(window.__legacy);
  updateUI();
`);
check('a legacy save that already crossed a year is migrated on load', run('currentYear === 2 && calendarYear === 2028'));
check('migrated save resets annual stats and year-end flags', run('yearlyStats.sales === 0 && !yearEndAwardProcessed && !yearEndKohakuProcessed'));
check('migrated save keeps plan keys pointing at the same actual year', run('calendarYear + (2 - currentYear) === 2028'));
check('migrated save shows the new year in the header', run("document.getElementById('txt-year').textContent === '2'"));
run(`applySavedGame({ currentYear: 2, calendarYear: 2028, gameDate: '2028-12-31', yearEndKohakuProcessed: true, yearlyStats: { sales: 5, audience: 5 }, idolRoster: [] });`);
check('an up-to-date save is left untouched on load', run('currentYear === 2 && yearEndKohakuProcessed && yearlyStats.sales === 5'));

check('academic growth follows school years and the university admission threshold', run(`
  (() => {
    const originalRoster = idolRoster;
    const makeMember = (birthYear, academics) => ({
      birthYear,
      birthdayMonth: 1,
      birthdayDay: 1,
      age: calculateAgeFromBirth(birthYear, new Date('2026-03-31T12:00:00'), 1, 1),
      height: 160,
      stats: { academics },
      statExp: {}
    });
    try {
      const highSchoolSenior = makeMember(2009, 59);
      const ineligible = makeMember(2008, 59);
      const eligible = makeMember(2008, 60);
      const graduate = makeMember(2004, 75);
      idolRoster = [highSchoolSenior, ineligible, eligible, graduate];

      processAcademicYearGrowth(new Date('2026-03-31T12:00:00'));
      const beforeAdmission = highSchoolSenior.stats.academics === 60;
      const admissionResults = ineligible.academicGrowthStatus === 'stopped'
        && ineligible.stats.academics === 59
        && eligible.academicGrowthStatus === 'university'
        && eligible.stats.academics === 61;
      const graduation = graduate.academicGrowthStatus === 'graduated'
        && graduate.stats.academics === 75;
      processAcademicYearGrowth(new Date('2026-03-31T12:00:00'));
      const oncePerYear = highSchoolSenior.stats.academics === 60
        && eligible.stats.academics === 61;

      syncMemberAges(new Date('2027-03-31T12:00:00'));
      processAcademicYearGrowth(new Date('2027-03-31T12:00:00'));
      const nextYear = highSchoolSenior.academicGrowthStatus === 'university'
        && highSchoolSenior.stats.academics === 61
        && ineligible.stats.academics === 59
        && eligible.stats.academics === 62;

      const beforeTalk = eligible.stats.talk || 0;
      const beforeVariety = eligible.stats.variety || 0;
      const beforeAcademics = eligible.stats.academics;
      addMemberStatExp(eligible, 'talk', 10000);
      addMemberStatExp(eligible, 'variety', 10000);
      addMemberStatExp(eligible, 'academics', 10000);
      return beforeAdmission && admissionResults && graduation && oncePerYear && nextYear
        && (eligible.stats.talk || 0) === beforeTalk
        && (eligible.stats.variety || 0) === beforeVariety
        && eligible.stats.academics === beforeAcademics
        && getStatExpProgress(eligible, 'academics') === 0;
    } finally {
      idolRoster = originalRoster;
    }
  })()
`) === true);

dom.window.close();
