const assert = require('assert');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  console.log('jsdom is not installed. Skipping fan club settings checks.');
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

const year = new Date().getFullYear() + 1;
window.eval(`applySavedGameBase(${JSON.stringify({
  currentYear: 2,
  currentMonth: 4,
  currentWeek: 1,
  gameDate: `${year}-04-01`,
  calendarYear: year,
  fanClub: { tierId: 'standard', fee: 1500, members: 100 },
  fanClubFoundedYear: 1
})});`);
assert.strictEqual(window.eval('pendingFanClubEvent.type'), 'migration');
window.eval('openFanClubModal()');
assert.strictEqual(window.document.getElementById('fanclub-modal').style.display, 'flex');

window.document.getElementById('fanclub-name').value = '星空ファンクラブ';
window.document.getElementById('fanclub-fee').value = '2500';
window.document.querySelector('input[name="fanclub-benefit"][value="both"]').checked = true;
window.eval('resolveFanClub()');
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(window.eval('[fanClub.name, fanClub.fee, fanClub.benefitId, fanClub.settingsVersion]'))),
  ['星空ファンクラブ', 2500, 'both', 2]
);
assert.strictEqual(window.eval('fanClubFoundedYear'), 1);

window.eval(`
  fanClub.members = 2;
  funds = 10000;
  yearlyStats = {};
  monthlyLedger = createMonthlyLedger();
  applyFanClubMonthlyIncome();
`);
assert.strictEqual(window.eval('funds'), 15000);
assert.strictEqual(window.eval('monthlyLedger.expense[0].amount'), 3000);

window.eval(`
  currentYear = 3;
  fanClubFoundedYear = 2;
  checkFanClubYearlyEvent();
  const firstAnnualEvent = pendingFanClubEvent;
  checkFanClubYearlyEvent();
  window.__fanClubAnnualEvent = firstAnnualEvent;
`);
assert.strictEqual(window.eval('window.__fanClubAnnualEvent.type'), 'renewal');

window.eval(`
  fanClub = null;
  fanClubFoundedYear = 0;
  currentYear = 4;
  pendingFanClubEvent = { type: 'founding' };
  resolveFanClub(-1);
  checkFanClubYearlyEvent();
`);
assert.strictEqual(window.eval('fanClubFoundedYear'), 4);
assert.strictEqual(window.eval('pendingFanClubEvent'), null);
window.eval('currentYear = 5; checkFanClubYearlyEvent();');
assert.strictEqual(window.eval('pendingFanClubEvent.type'), 'founding');

console.log('PASS : old saves receive one migration modal');
console.log('PASS : name, slider fee, and combined benefits are saved');
console.log('PASS : migration preserves the annual review year');
console.log('PASS : combined benefits create the expected monthly expense');
console.log('PASS : the annual review is scheduled once per year');
console.log('PASS : declining setup is not repeated until the next year');
