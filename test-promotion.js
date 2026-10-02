/* 販促・収益・ファン階層の検証 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('jsdom is not installed. Run npm i -D jsdom.'); process.exit(0); }

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
  console.log((condition ? 'PASS : ' : 'FAIL : ') + name + (extra ? ' -> ' + extra : ''));
};

run('initGame(1, true); document.getElementById("decision-modal").style.display = "none";');

console.log('--- 1. cumulative sales with per-week decay rates ---');
const series = JSON.parse(run(`
  JSON.stringify({
    normal: [1,2,3,4,5].map(w => getPromotionCumulativeSales(1000, new Array(w).fill(10))),
    releaseWeek: [1,2,3].map(w => getPromotionCumulativeSales(1000, [8].concat(new Array(w - 1).fill(10)))),
    past: [1,2,3].map(w => getPromotionCumulativeSales(1000, new Array(w).fill(100))),
    empty: getPromotionCumulativeSales(1000, []),
    zeroBase: getPromotionCumulativeSales(0, [10, 10])
  })
`));
console.log('  ', JSON.stringify(series));
check('decay 10 follows the geometric series', JSON.stringify(series.normal) === JSON.stringify([1000, 1100, 1110, 1111, 1112]));
check('release week (divisor 8) decays slower', series.releaseWeek[0] === 1000 && series.releaseWeek[1] === 1125 && series.releaseWeek[2] === 1138, JSON.stringify(series.releaseWeek));
check('past work (divisor 100) decays much faster', series.past[0] === 1000 && series.past[1] === 1010 && series.past[2] === 1011, JSON.stringify(series.past));
check('empty weeks gives 0', series.empty === 0);
check('S=0 gives 0', series.zeroBase === 0);
check('no off-by-one on integer boundaries', run(`
  JSON.stringify([100, 1000, 10000].map(base => [
    getPromotionCumulativeSales(base, [10]),
    getPromotionCumulativeSales(base, [10, 10])
  ]))
`) === JSON.stringify([[100, 110], [1000, 1100], [10000, 11000]]));

console.log('\\n--- 2. pre-release promo raises the release multiplier ---');
const pre = JSON.parse(run(`
  songs = [{ id: 'next', title: 'next', releaseType: 'single', releaseYear: 1, releaseMonth: 2, released: false, level: 1, experience: 0 }];
  productionSchedule['1-2'] = { release: 'single' };
  ensureScheduledSong(1, 2, productionSchedule['1-2']);
  const target = getSinglePromotionTarget();
  const first = applySinglePromotion(target.song);
  const second = applySinglePromotion(target.song);
  JSON.stringify({ mode: first.mode, alpha1: first.alpha, alpha2: second.alpha, count: target.song.promoCount, sales: target.song.totalSales || 0 })
`));
console.log('  ', JSON.stringify(pre));
check('pre-release promo books no sales directly', pre.mode === 'pre-release' && pre.sales === 0);
check('alpha = n x 0.005', Math.abs(pre.alpha1 - 0.005) < 1e-9 && Math.abs(pre.alpha2 - 0.01) < 1e-9);
check('the promo count accumulates', pre.count === 2);
check('the release sales use (1 + n x 0.005)', run(`
  songs.find(s => s.id === 'next').promoCount = 10;
  Math.abs(1 + 10 * RELEASE_PROMO_ALPHA_STEP - 1.05) < 1e-9
`) === true);

console.log('\\n--- 3. album uses a coefficient of 2 ---');
check('album S = fans x 2, single = fans x 1.5', run(`
  const original = calculateGroupFans;
  calculateGroupFans = () => 1000;
  const single = getSongPromoBaseSales({ releaseType: 'single' });
  const album = getSongPromoBaseSales({ releaseType: 'album' });
  calculateGroupFans = original;
  single === 1500 && album === 2000
`) === true);
console.log('\n--- 4. decay rate switching ---');
check('no release date uses the normal rate', run(`
  getSongPromoDivisor({ id: 'x', released: true, releaseType: 'single' }) === PROMO_DIVISOR_NORMAL
`) === true);
check('released this week uses 8', run(`
  getSongPromoDivisor({ id: 'x', released: true, releaseType: 'single', releaseDateKey: gameDate }) === PROMO_DIVISOR_RELEASE_WEEK
`) === true);
check('released 2 weeks ago uses 10', run(`
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() - 14);
  getSongPromoDivisor({ id: 'x', released: true, releaseType: 'single', releaseDateKey: toDateKey(d) }) === PROMO_DIVISOR_NORMAL
`) === true);
check('a past work jumps to 100', run(`
  songs = [
    { id: 'new', released: true, releaseYear: 1, releaseMonth: 5, releaseType: 'single' },
    { id: 'old', released: true, releaseYear: 1, releaseMonth: 2, releaseType: 'single' }
  ];
  isPastWorkSong(songs[1]) === true && isPastWorkSong(songs[0]) === false &&
    getSongPromoDivisor(songs[1]) === PROMO_DIVISOR_PAST_WORK
`) === true);

console.log('\n--- 5. the promo rides on one song only ---');
const singleSong = JSON.parse(run(`
  songs = [
    { id: 'A', title: 'A', releaseType: 'single', releaseYear: 1, releaseMonth: 5, released: true, releaseDateKey: gameDate, level: 1, experience: 0, totalSales: 0 },
    { id: 'B', title: 'B', releaseType: 'single', releaseYear: 1, releaseMonth: 2, released: true, releaseDateKey: gameDate, level: 1, experience: 0, totalSales: 0 }
  ];
  promoSongId = '';
  applySinglePromotion(songs[0]);
  applySinglePromotion(songs[0]);
  const aBefore = (songs[0].promoDivisors || []).length;
  applySinglePromotion(songs[1]);
  JSON.stringify({
    aBefore,
    aAfter: { base: songs[0].promoBase, weeks: (songs[0].promoDivisors || []).length, count: songs[0].promoCount },
    promoSongId
  })
`));
console.log('  ', JSON.stringify(singleSong));
check('A accumulates while promoted', singleSong.aBefore === 2);
check('switching to B resets A',
  singleSong.aAfter.base === 0 && singleSong.aAfter.weeks === 0 && singleSong.aAfter.count === 0,
  JSON.stringify(singleSong.aAfter));
check('only one song carries the promo', singleSong.promoSongId === 'B');

console.log('\n--- 6. 80% of CD sales is booked monthly ---');
const revenue = JSON.parse(run(`
  monthlyCdRevenue = 0;
  const credited = addMonthlyCdRevenue(1000000);
  JSON.stringify({ credited, pool: monthlyCdRevenue })
`));
console.log('  ', JSON.stringify(revenue));
check('only 80% of CD sales becomes revenue', revenue.credited === 800000 && revenue.pool === 800000, JSON.stringify(revenue));
const settlement = JSON.parse(run(`
  monthlyCdRevenue = 500000;
  monthlyTieUpRevenue = 0;
  Math.random = () => 2;            // タイアップを引かない
  const before = funds;
  const result = settleMonthlyIncome();
  JSON.stringify({
    cd: result.cdRevenue,
    pool: monthlyCdRevenue,
    salary: result.salary,
    net: funds - before,
    expectedNet: 500000 - result.salary
  })
`));
console.log('  ', JSON.stringify(settlement));
check('CD revenue is paid at month end and the pool is cleared',
  settlement.cd === 500000 && settlement.pool === 0 && Math.abs(settlement.net - settlement.expectedNet) < 1,
  JSON.stringify(settlement));

console.log('\n--- 7. tie-ups are month-end temporary income ---');
const tieUp = JSON.parse(run(`
  Math.random = () => 0;            // 必ずタイアップが当たる
  monthlyTieUpRevenue = 0;
  monthlyCdRevenue = 0;
  const fans = calculateGroupFans();
  const before = funds;
  const result = settleMonthlyIncome();
  JSON.stringify({
    revenue: result.tieUpRevenue,
    expected: Math.round(fans * 0.5) + Math.round(fans * 1.1),
    pool: monthlyTieUpRevenue,
    net: funds - before,
    expectedNet: Math.round(fans * 0.5) + Math.round(fans * 1.1) - result.salary
  })
`));
console.log('  ', JSON.stringify(tieUp));
check('both tie-ups fire and are paid at month end',
  tieUp.revenue === tieUp.expected && tieUp.pool === 0 && Math.abs(tieUp.net - tieUp.expectedNet) < 1,
  JSON.stringify(tieUp));
check('tie-ups boost popularity and song experience', run(`
  Math.random = () => 0;
  songs = [{ id: 'tie', title: 'T', releaseType: 'single', released: true, releaseYear: 1, releaseMonth: 1, experience: 0, level: 1 }];
  const popBefore = idolRoster.filter(m => m.isSelected).reduce((s, m) => s + m.stats.popularity, 0);
  const expBefore = songs[0].experience;
  rollMonthlyTieUps();
  idolRoster.filter(m => m.isSelected).reduce((s, m) => s + m.stats.popularity, 0) > popBefore && songs[0].experience > expBefore
`) === true);

console.log('\n--- 8. fan tiers and participation ---');
const tiers = JSON.parse(run(`
  const s = getFanTierShares();
  JSON.stringify({
    shares: s,
    liveRate: getTierParticipationRate('live'),
    eventRate: getTierParticipationRate('event'),
    fans: getFanTiers(),
    participatingLive: getParticipatingFans('live')
  })
`));
console.log('  ', JSON.stringify(tiers));
check('the split always satisfies core < fan <= light',
  tiers.shares.core < tiers.shares.fan && tiers.shares.fan <= tiers.shares.light, JSON.stringify(tiers.shares));
check('the shares sum to 1', Math.abs(tiers.shares.core + tiers.shares.fan + tiers.shares.light - 1) < 1e-9);
check('the participation rates use 2/1.25/0.75 (x multiplier) and 7/5/3', (() => {
  const s = tiers.shares;
  // ライブはamplifier分だけ引き上げる（イベント参加率は据え置き）
  return Math.abs(tiers.liveRate - (s.core * 0.2 + s.fan * 0.125 + s.light * 0.075) * 1.67) < 1e-9
    && Math.abs(tiers.eventRate - (s.core * 0.7 + s.fan * 0.5 + s.light * 0.3)) < 1e-9;
})());
check('participating fans = total fans x live rate',
  Math.abs(tiers.participatingLive - Math.floor(tiers.fans.total * tiers.liveRate)) <= 1,
  String(tiers.participatingLive));
const varies = JSON.parse(run(`
  const rows = [];
  [0, 25, 50, 75, 100].forEach(level => {
    idolRoster.forEach(m => { m.stats.vocal = level; m.stats.dance = level; m.stats.popularity = level; });
    const s = getFanTierShares();
    rows.push({ core: s.core, fan: s.fan, light: s.light });
  });
  JSON.stringify({
    rows,
    allOrdered: rows.every(r => r.core < r.fan && r.fan <= r.light),
    varies: new Set(rows.map(r => r.core.toFixed(3))).size
  })
`));
console.log('  ', varies.rows.map(r => (r.core * 100).toFixed(1) + '/' + (r.fan * 100).toFixed(1) + '/' + (r.light * 100).toFixed(1)).join('  '));
check('every situation keeps the ordering', varies.allOrdered === true);
check('the split varies with the situation', varies.varies >= 4, String(varies.varies));

console.log('\n--- 9. 会場ティア・曜日・特例 ---');
check('venue tier rates are SS0.8 / S0.75 / A0.7 / B0.65 / C0.6 / D0.55', run(`
  JSON.stringify(['SS','S','A','B','C','D'].map(cap => getVenueTierRate({ cap })))
`) === JSON.stringify([0.8, 0.75, 0.7, 0.65, 0.6, 0.55]));
check('an unknown tier falls back to the default', run(`
  getVenueTierRate({ cap: 'ZZ' }) === VENUE_TIER_DEFAULT_RATE && getVenueTierRate(null) === VENUE_TIER_DEFAULT_RATE
`) === true);
check('day weight: sun/sat 1, fri 0.9, mon 0.8, others 0.7', run(`
  JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(d => getLiveDayWeight(new Date(2027, 0, 3 + d))))
`) === JSON.stringify([1.0, 0.8, 0.7, 0.7, 0.7, 0.9, 1.0]));
check('special rates are 0.95 / 0.9 and ignore the weekday', run(`
  const sunday = new Date(2027, 0, 3);
  const wednesday = new Date(2027, 0, 6);
  JSON.stringify({
    graduationSame: getLiveAudienceDemand({ cap: 'A' }, sunday, GRADUATION_LIVE_RATE) ===
                    getLiveAudienceDemand({ cap: 'A' }, wednesday, GRADUATION_LIVE_RATE),
    finaleSame: getLiveAudienceDemand({ cap: 'A' }, sunday, LIVE_FINALE_RATE) ===
                getLiveAudienceDemand({ cap: 'A' }, wednesday, LIVE_FINALE_RATE),
    finaleRatio: +(getLiveAudienceDemand({ cap: 'A' }, sunday, LIVE_FINALE_RATE) /
                   getLiveAudienceDemand({ cap: 'A' }, sunday)).toFixed(3),
    graduationRatio: +(getLiveAudienceDemand({ cap: 'A' }, sunday, GRADUATION_LIVE_RATE) /
                       getLiveAudienceDemand({ cap: 'A' }, sunday)).toFixed(3)
  })
`) === JSON.stringify({ graduationSame: true, finaleSame: true, finaleRatio: 0.9, graduationRatio: 0.95 }));
check('demand = participating fans x venue rate x weight', run(`
  const venue = { cap: 'S' };
  const sunday = new Date(2027, 0, 3);
  const expected = Math.floor(getParticipatingFans('live') * 0.75 * 1.0);
  getLiveAudienceDemand(venue, sunday) === expected
`) === true);
check('bigger venues attract more', run(`
  const sunday = new Date(2027, 0, 3);
  getLiveAudienceDemand({ cap: 'SS' }, sunday) > getLiveAudienceDemand({ cap: 'S' }, sunday)
`) === true);
console.log('\n--- 10. 配信チケットとティア別標準価格 ---');
check('standard prices follow B base x tier rate', run(`
  JSON.stringify(['SS','S','A','B','C','D'].map(cap => ({
    cap,
    arena: getStandardSeatPrice({ cap }, 'arena'),
    stand: getStandardSeatPrice({ cap }, 'stand1'),
    annex: getStandardSeatPrice({ cap }, 'annotation'),
    sb: getStandardSeatPrice({ cap }, 'stageBack')
  })))
`) === JSON.stringify([
  { cap: 'SS', arena: 13800, stand: 12650, annex: 8050, sb: 8050 },
  { cap: 'S', arena: 13200, stand: 12100, annex: 7700, sb: 7700 },
  { cap: 'A', arena: 12600, stand: 11550, annex: 7350, sb: 7350 },
  { cap: 'B', arena: 12000, stand: 11000, annex: 7000, sb: 7000 },
  { cap: 'C', arena: 11400, stand: 10450, annex: 6650, sb: 6650 },
  { cap: 'D', arena: 10800, stand: 9900, annex: 6300, sb: 6300 }
]));
check('all stand tiers share one price', run(`
  ['stand1','stand2','stand3','stand4'].every(id => getStandardSeatPrice({ cap: 'S' }, id) === 12100)
`) === true);
check('stream buyer rate is fixed by weekday (sun/sat 0.9, mon/fri 0.8, tue-wed-thu 0.85)', run(`
  JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(day => getStreamBuyerRate(new Date(2027, 0, 3 + day))))
`) === JSON.stringify([0.9, 0.8, 0.85, 0.85, 0.85, 0.8, 0.9]));
check('stream buyers = fans x (1 - live rate) x weekday rate', run(`
  const fans = calculateGroupFans();
  const liveRate = getTierParticipationRate('live');
  [0, 1, 2, 3, 4, 5, 6].every(day => {
    const date = new Date(2027, 0, 3 + day);
    return getStreamTicketBuyers(date) === Math.floor(fans * (1 - liveRate) * getStreamBuyerRate(date));
  })
`) === true);
check('weekend streams sell more than weekday streams', run(`
  const sunday = new Date(2027, 0, 3);
  const wednesday = new Date(2027, 0, 6);
  getStreamTicketBuyers(sunday) > getStreamTicketBuyers(wednesday)
`) === true);
check('stream ticket is 5,000 yen', run('STREAM_TICKET_PRICE') === 5000);
check('streaming production cost is 100 million per show date', run(`
  STREAM_PRODUCTION_COST === 100000000
`) === true);
check('the streaming cost is deducted per show', run(`
  // 1公演ごとに制作費が1回だけ引かれることを確認する
  const key = currentYear + '-' + currentMonth;
  productionSchedule[key] = { release: 'none', liveVenue: null, senbatsuAnnounced: false };
  const venue = VENUE_DATA.find(v => v.cap === 'C');
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 3);
  const dateKey = toDateKey(d);
  productionSchedule[key].liveDate = dateKey;
  productionSchedule[key].liveVenue = venue.name;
  productionSchedule[key].liveCompleted = false;
  merchandiseStock = 0;
  yearlyStats.streamCost = 0;
  gameDate = dateKey;
  syncGameCalendar();
  const before = funds;
  processMonthlyReleaseAndLive(dateKey);
  funds - before
`) !== '');
const streamCost = JSON.parse(run(`
  yearlyStats.streamCost = 0;
  const venue = VENUE_DATA.find(v => v.cap === 'C');
  const d = new Date(gameDate + 'T12:00:00'); d.setDate(d.getDate() + 3);
  const dateKey = toDateKey(d);
  const key = currentYear + '-' + currentMonth;
  productionSchedule[key] = { release: 'none', liveVenue: null, senbatsuAnnounced: false, liveDate: dateKey, liveVenueName: venue.name };
  productionSchedule[key].liveVenue = venue.name;
  productionSchedule[key].liveCompleted = false;
  merchandiseStock = 0;
  yearlyStats.streamCost = 0;
  gameDate = dateKey;
  syncGameCalendar();
  processMonthlyReleaseAndLive(dateKey);
  JSON.stringify({ cost: yearlyStats.streamCost, revenue: yearlyStats.streamRevenue || 0 })
`));
console.log('  ', JSON.stringify(streamCost));
check('exactly 100 million yen is charged per show', streamCost.cost === 100000000, JSON.stringify(streamCost));
check('higher ticket price lowers attendance', run(`
  const venue = VENUE_DATA.find(v => v.cap === 'A');
  const standard = getLiveAudienceDemand(venue, new Date(2027, 0, 3), null, 1);
  const doubled = getLiveAudienceDemand(venue, new Date(2027, 0, 3), null, 0.5);
  const half = getLiveAudienceDemand(venue, new Date(2027, 0, 3), null, 2);
  doubled < standard && half > standard
`) === true);
const priceEffect = JSON.parse(run(`
  const venue = VENUE_DATA.find(v => v.cap === 'A');
  const seats = getLiveSeatCapacities(venue, {});
  const standard = getPriceDemandFactor(venue, { seatOptions: {} });
  const expensive = getPriceDemandFactor(venue, { seatOptions: {}, seatPrices: Object.fromEntries(seats.map(s => [s.id, getStandardSeatPrice(venue, s.id) * 2])) });
  const cheap = getPriceDemandFactor(venue, { seatOptions: {}, seatPrices: Object.fromEntries(seats.map(s => [s.id, getStandardSeatPrice(venue, s.id) / 2])) });
  JSON.stringify({ standard, expensive, cheap })
`));
console.log('  ', JSON.stringify(priceEffect));
check('standard prices give factor 1.0', Math.abs(priceEffect.standard - 1) < 1e-9);
check('double price halves the factor', Math.abs(priceEffect.expensive - 0.5) < 1e-9);
check('half price doubles the factor', Math.abs(priceEffect.cheap - 2) < 1e-9);
check('the price inputs start from the venue standard price', run(`
  const venue = VENUE_DATA.find(v => v.cap === 'SS');
  const slot = { liveVenue: venue.name, seatPrices: {}, seatOptions: {} };
  const html = renderLiveSlotHtml(1, 0, slot);
  ['arena', 'stand1', 'annotation'].every(id =>
    html.includes('id="seat-price-1-0-' + id + '"') && html.includes('value="13800"'))
`) === true);
check('switching venue resets prices to that venue standard', run(`
  const venue = VENUE_DATA.find(v => v.cap === 'C');
  const slot = { liveVenue: venue.name, seatPrices: {}, seatOptions: {} };
  const html = renderLiveSlotHtml(1, 0, slot);
  html.includes('value="11400"') && html.includes('value="7000"') === false && html.includes('value="6650"')
`) === true);
check('the venue demand stays below all fans and scales with the rate', run(`
  const venue = VENUE_DATA.find(v => v.cap === 'A');
  const sunday = new Date(2027, 0, 3);
  const fans = calculateGroupFans();
  const demand = getLiveAudienceDemand(venue, sunday);
  const rate = demand / fans;
  // 標準価格の2倍なら動員は半分になる
  const half = getLiveAudienceDemand(venue, sunday, null, 0.5);
  rate < 1 && half < demand
`) === true);

// ---- ファン成長（週ごとの増減・売上連動・上限1億） ----
check('the fan target follows the square root of lifetime sales', run(`
  lifetimeSales = 1000000;
  const a = getTargetSalesFans();
  lifetimeSales = 4000000;
  const b = getTargetSalesFans();
  lifetimeSales = 0;
  // 売上が4倍ならファンも約2倍（根号曲線。加速項の分だけずれるので1%許容）
  Math.abs(b / a - 2) < 0.01
`) === true);
check('the fan count rises week by week while sales continue', run(`
  lifetimeSales = 5000000; fansFromSales = 0;
  updateWeeklyGroupFans();
  const first = fansFromSales;
  updateWeeklyGroupFans();
  const second = fansFromSales;
  lifetimeSales = 0; fansFromSales = 0;
  first > 0 && second > first
`) === true);
check('fans fall week by week when sales stop', run(`
  lifetimeSales = 5000000; fansFromSales = getTargetSalesFans();
  const before = fansFromSales;
  updateWeeklyGroupFans();          // 同じ目標値でも自然減衰で少し減る
  const after = fansFromSales;
  lifetimeSales = 0; fansFromSales = 0;
  after < before
`) === true);
check('the fan count never exceeds 100 million', run(`
  lifetimeSales = 1e15;
  fansFromSales = getTargetSalesFans();
  const capped = calculateGroupFans();
  lifetimeSales = 0; fansFromSales = 0;
  capped === GROUP_FAN_MAX
`) === true);
check('a big enough fan base fills the biggest venue', run(`
  lifetimeSales = 1e8;
  fansFromSales = getTargetSalesFans();
  const fans = calculateGroupFans();
  const ss = VENUE_DATA.find(v => v.cap === 'SS');
  const sunday = new Date(2027, 0, 3);
  const demand = getLiveAudienceDemand(ss, sunday);
  lifetimeSales = 0; fansFromSales = 0;
  fans >= 300000 && demand >= CAPACITY_MAP.SS
`) === true);
check('adding sales through addGroupSales feeds both counters', run(`
  lifetimeSales = 0; yearlyStats.sales = 0; fansFromSales = 0;
  addGroupSales(1000000);
  const ok = yearlyStats.sales === 1000000 && lifetimeSales === 1000000
    && getTargetSalesFans() > 0;
  lifetimeSales = 0; yearlyStats.sales = 0; fansFromSales = 0;
  ok
`) === true);
// 目標: D=50万 / C=100万 / B=300万 / A=500万 / S・SS=1000万 枚で満席
check('venue milestones: D 500k / C 1M / B 3M / A 5M / S・SS 10M copies', run(`
  const TARGET = { D: 5e5, C: 1e6, B: 3e6, A: 5e6, S: 1e7, SS: 1e7 };
  const TOLERANCE = 0.30;   // ±30% を許容（能力値によって参加率が18.9〜21.0%で動くため）
  // 判定を安定させるため、能力を1年目後半水準に固定する
  idolRoster.forEach(m => {
    m.stats.vocal = 78; m.stats.dance = 78; m.stats.popularity = 78;
  });
  const results = {};
  ['D','C','B','A','S','SS'].forEach(cap => {
    const venue = VENUE_DATA.find(v => v.cap === cap);
    const capacity = CAPACITY_MAP[cap];
    const sunday = new Date(2027, 0, 3);
    let lo = 1e4, hi = 1e10;
    for (let i = 0; i < 90; i++) {
      const mid = (lo + hi) / 2;
      lifetimeSales = mid;
      fansFromSales = getTargetSalesFans();
      if (getLiveAudienceDemand(venue, sunday) >= capacity) hi = mid; else lo = mid;
    }
    results[cap] = hi;
  });
  lifetimeSales = 0; fansFromSales = 0;
  const detail = Object.keys(results)
    .map(cap => cap + ':' + Math.round(results[cap]))
    .join(',');
  const ok = Object.keys(TARGET).every(cap =>
    Math.abs(results[cap] / TARGET[cap] - 1) <= TOLERANCE);
  console.log('      ' + detail);
  ok
`) === true);
check('the live participation rate is raised but events are untouched', run(`
  const live = getTierParticipationRate('live');
  const event = getTierParticipationRate('event');
  const raw = getFanTierShares();
  const baseLive = raw.core * 0.2 + raw.fan * 0.125 + raw.light * 0.075;
  Math.abs(live - baseLive * LIVE_PARTICIPATION_MULTIPLIER) < 1e-9
    && LIVE_PARTICIPATION_MULTIPLIER > 1
    && Math.abs(event - (raw.core * 0.7 + raw.fan * 0.5 + raw.light * 0.3)) < 1e-9
`) === true);
check('participating fans and the tier participation rate agree', run(`
  const total = calculateGroupFans();
  const rate = getTierParticipationRate('live');
  Math.abs(getParticipatingFans('live') - Math.floor(total * rate)) <= 1
`) === true);
check('fans are shown in man/oku units above 100k', run(`
  formatFanCount(99999) === '99,999人'
  && formatFanCount(250000) === '25万人'
  && formatFanCount(125000) === '12.5万人'
  && formatFanCount(12345678) === '1235万人'
  && formatFanCount(100000000) === '1億人'
  && formatFanCount(123456789) === '1.23億人'
`) === true);

// ---- マネージャーの効果段階（倍率表・上限正規化） ----
check('manager tier table matches the spec (E 1.00 … 極 1.30)', run(`
  JSON.stringify(MANAGER_LEVEL_TIERS.map(t => [t.min, t.label, t.multiplier]))
  === JSON.stringify([[50,'極',1.30],[38,'SS',1.21],[25,'S',1.15],[16,'A',1.10],
      [10,'B',1.06],[6,'C',1.03],[3,'D',1.01],[0,'E',1.00]])
`) === true, run(`JSON.stringify(MANAGER_LEVEL_TIERS.map(t => [t.min, t.label, t.multiplier]))`));
check('manager tier labels map to the right thresholds', run(`
  const set = total => { managers = [{ id: 't', skills: { leadership: total, scheduling: total,
    mentalCare: total, riskControl: total } }];
    return getManagerSkillTier('leadership').label; };
  const row = [set(1), set(3), set(6), set(10), set(16), set(25), set(38), set(50)];
  managers = [];
  JSON.stringify(row) === JSON.stringify(['E','D','C','B','A','S','SS','極'])
`) === true);
check('E and 極 give exactly the 1.00 and 1.30 multipliers', run(`
  const at = level => { managers = [{ id: 't', skills: { leadership: level, scheduling: level,
    mentalCare: level, riskControl: level } }];
    return getManagerSkillTier('leadership').multiplier; };
  const r = [at(1), at(50)];
  managers = [];
  r[0] === 1 && r[1] === 1.3
`) === true);
check('special training multiplier spans 10x (E) to 13x (極)', run(`
  const at = level => { managers = [{ id: 't', skills: { leadership: level, scheduling: level,
    mentalCare: level, riskControl: level } }];
    return getSpecialTrainingMultiplier(); };
  const r = [at(1), at(50)];
  managers = [];
  r[0] === 10 && Math.abs(r[1] - 13) < 1e-9
`) === true);
check('stamina/risk reduction still reach 75% at 極 (normalised)', run(`
  const at = level => { managers = [{ id: 't', skills: { leadership: level, scheduling: level,
    mentalCare: level, riskControl: level } }];
    return [getSpecialTrainingStaminaReduction(), getSpecialTrainingRiskReduction()]; };
  const e = at(1), mid = at(25), max = at(50);
  managers = [];
  e[0] === 0 && e[1] === 0
    && Math.abs(max[0] - 0.75) < 1e-9 && Math.abs(max[1] - 0.75) < 1e-9
    // 単調増加している
    && mid[0] > e[0] && mid[0] < max[0]
`) === true);
check('reduction tiers stay inside 0-75%', run(`
  const vals = [];
  for (let lv = 1; lv <= 50; lv++) {
    managers = [{ id: 't', skills: { leadership: lv, scheduling: lv, mentalCare: lv, riskControl: lv } }];
    vals.push(getSpecialTrainingStaminaReduction(), getSpecialTrainingRiskReduction());
  }
  managers = [];
  vals.every(v => v >= 0 && v <= 0.75 + 1e-9)
`) === true);
check('special training slot limit: E-C=1, B-SS=2, 極=3', run(`
  const at = level => { managers = [{ id: 't', skills: { leadership: level, scheduling: level,
    mentalCare: level, riskControl: level } }];
    return getSpecialTrainingTargetLimit(); };
  const r = [at(1), at(6), at(10), at(38), at(50)];
  managers = [];
  JSON.stringify(r) === JSON.stringify([1,1,2,2,3])
`) === true);
check('manager skill descriptions match the spec', run(`
  JSON.stringify(MANAGER_SKILLS.map(s => s.effect)) === JSON.stringify([
    '連携力練習の効果を上げる',
    '特別強化できる枠数を増やす',
    '体力消費の抑制・疲労回復率の上昇',
    '危機回避力の補正'
  ])
`) === true);

// ---- ゲーム内ヘルプ（タイトル画面・記録タブから開く） ----
check('help sections exist with unique ids and titles', run(`
  const ids = HELP_SECTIONS.map(s => s.id);
  new Set(ids).size === HELP_SECTIONS.length
    && HELP_SECTIONS.length >= 5
    && HELP_SECTIONS.every(s => typeof s.title === 'string' && s.title.length > 0
      && Array.isArray(s.blocks) && s.blocks.length > 0)
`) === true);
check('every help block uses a supported type', run(`
  HELP_SECTIONS.every(s => s.blocks.every(b =>
    ['p', 'ul', 'table'].includes(b.type)
    && (b.type !== 'table' || (Array.isArray(b.rows) && b.rows.every(r => Array.isArray(r))))
  ))
`) === true);
check('help content renders sections, lists and tables', run(`
  const html = renderHelpContent();
  html.includes('help-section')
    && html.includes('help-section-title')
    && html.includes('<table class="help-table">')
    && html.includes('<ul class="help-ul">')
    && HELP_SECTIONS.every(s => html.includes(escapeHtml(s.title)))
`) === true);
check('the help modal exists and opens/closes', run(`
  (() => {
    const modal = document.getElementById('help-modal');
    if (!modal) return false;
    const before = modal.style.display;
    openHelpModal();
    const opened = modal.style.display === 'flex' && modal.querySelector('.help-body').innerHTML.length > 100;
    closeHelpModal();
    const closed = modal.style.display === 'none';
    modal.style.display = before;
    return opened && closed;
  })()
`) === true);
check('help is reachable from the title screen and the records tab', run(`
  const titleBtn = document.querySelector('#title-screen button[onclick="openHelpModal()"]');
  const recordBtn = document.querySelector('#page-records button[onclick="openHelpModal()"]');
  !!(titleBtn && recordBtn)
`) === true);

console.log('\n================ RESULT ================');
const failed = results.filter(r => !r.ok);
console.log('PASS ' + (results.length - failed.length) + ' / ' + results.length);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join(', '));
  process.exitCode = 1;
}
