/* Test for random song name generation and senbatsu selection bug fix */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { loadGameHtml } = require('./test-helper');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  console.log('jsdom is not installed.');
  process.exit(1);
}

const html = loadGameHtml(__dirname);
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.alert = (msg) => { console.log('alert:', msg); };
window.confirm = () => true;

const run = (code) => window.eval(code);

console.log('=== 1. Checking randamname.txt ===');
const txtPath = path.join(__dirname, 'randamname.txt');
assert(fs.existsSync(txtPath), 'randamname.txt must exist');
const lines = fs.readFileSync(txtPath, 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l.length > 0 && !l.startsWith('#'));
assert(lines.length >= 100, `randamname.txt should have at least 100 entries, found ${lines.length}`);
console.log(`PASS: randamname.txt contains ${lines.length} songs.`);

console.log('\n=== 2. Checking getRandomSongName / getRandomSongNameSync in game environment ===');
window.__RANDOM_SONG_NAMES__ = lines;
run('loadRandomSongNames();');
const songNameSync = run('getRandomSongNameSync()');
assert(typeof songNameSync === 'string' && songNameSync.length > 0, 'getRandomSongNameSync must return non-empty string');
assert(lines.includes(songNameSync), 'returned song must be from randamname.txt');
console.log(`PASS: getRandomSongNameSync returned "${songNameSync}"`);

// Verify multiple calls return variety
const sampleSet = new Set();
for (let i = 0; i < 50; i++) {
  sampleSet.add(run('getRandomSongNameSync()'));
}
assert(sampleSet.size > 10, 'getRandomSongNameSync should return various songs');
console.log(`PASS: Sampled 50 calls yielded ${sampleSet.size} distinct titles.`);

console.log('\n=== 3. Testing Member ID uniqueness and deduplication ===');
run(`
  startNewGame(1);
  document.getElementById('input-setup-groupname').value = 'テストグループ';
  document.getElementById('input-setup-1st-song').value = 'テスト1stシングル';
  document.getElementById('input-setup-2nd-song').value = 'テスト2ndシングル';
  document.getElementById('input-setup-live-name').value = 'テスト初ライブ';
  submitGameSetupAndPlan();
  const decisionModal = document.getElementById('decision-modal');
  if (decisionModal) decisionModal.style.display = 'none';
`);
// Check all initial members have unique numeric IDs
const initialIds = run('idolRoster.map(m => m.id)');
const idSet = new Set(initialIds);
assert(initialIds.length > 0, 'idolRoster should have initial members');
assert.strictEqual(initialIds.length, idSet.size, 'All initial members must have unique IDs');
initialIds.forEach(id => {
  assert(typeof id === 'number', `ID ${id} must be a number`);
  assert(Number.isSafeInteger(id), `ID ${id} must be a safe integer`);
});
console.log(`PASS: All ${initialIds.length} initial idols have unique safe integer IDs.`);

console.log('\n=== 4. Testing ensureUniqueMemberIds self-healing with duplicate IDs ===');
run(`
  // Force simulate duplicate IDs in idolRoster as might happen from old buggy saves
  idolRoster[0].id = 123456789;
  idolRoster[1].id = 123456789;
  idolRoster[2].id = 123456789;
  pendingSelectionEvent = createSelectionEvent({ trigger: 'release', year: 1, month: 2, releaseType: 'single' });
  ensureUniqueMemberIds();
`);
const fixedIds = run('idolRoster.map(m => m.id)');
const fixedSet = new Set(fixedIds);
assert.strictEqual(fixedIds.length, fixedSet.size, 'Duplicate IDs must be resolved to unique IDs');
console.log(`PASS: After ensureUniqueMemberIds, all ${fixedIds.length} members have distinct IDs.`);

console.log('\n=== 5. Testing Senbatsu Selection Modal Behavior ===');
run(`
  pendingSelectionEvent = createSelectionEvent({ trigger: 'release', year: 1, month: 2, releaseType: 'single' });
  // Select first 16
  pendingSelectionEvent.selectedIds = idolRoster.slice(0, 16).map(m => m.id);
  pendingSelectionEvent.centerId = pendingSelectionEvent.selectedIds[0];
  renderSelectionModal();
`);

// Verify selection count
const countBefore = run('getSelectionSelectedIds().size');
console.log('Selected count before toggle:', countBefore);
assert.strictEqual(countBefore, 16);

// Toggle out member 0 (selected) -> count becomes 15
const member0Id = run('idolRoster[0].id');
const member1Id = run('idolRoster[1].id');
const member20Id = run('idolRoster[20].id'); // non-selected

run(`toggleSelectionMember(${member20Id});`);
const countAfterAdd = run('getSelectionSelectedIds().size');
console.log('Selected count after adding member 20:', countAfterAdd);
assert.strictEqual(countAfterAdd, 17, 'Count should be 17 after adding 1 member');

// Check that only member 20 was added
assert(run(`getSelectionSelectedIds().has(${member20Id})`), 'Member 20 should be selected');

// Now simulate the user's specific bug report:
// "選抜メンバーを選択する画面で特定のメンバーを登録しようとすると、2人同時に選択されたことになるが、人数カウントは1のままで、だれか一人は登録できなくなる"
// Even if an external call somehow injects duplicate IDs:
run(`
  // Intentionally assign duplicate ID to two members
  idolRoster[5].id = 99999999;
  idolRoster[6].id = 99999999;
  // Opening or toggling selection invokes ensureUniqueMemberIds
  renderSelectionModal();
`);
const checkUniqueAfterRender = run('new Set(idolRoster.map(m => m.id)).size === idolRoster.length');
assert(checkUniqueAfterRender, 'ensureUniqueMemberIds inside renderSelectionModal must ensure unique IDs');

const member5Id = run('idolRoster[5].id');
const member6Id = run('idolRoster[6].id');
assert.notStrictEqual(member5Id, member6Id, 'Member 5 and Member 6 must have different IDs');

// Toggle member 5
const sizeBefore = run('getSelectionSelectedIds().size');
const m5SelectedBefore = run(`getSelectionSelectedIds().has(${member5Id})`);
run(`toggleSelectionMember(${member5Id});`);
const sizeAfterM5 = run('getSelectionSelectedIds().size');
const m5SelectedAfter = run(`getSelectionSelectedIds().has(${member5Id})`);
const m6SelectedAfter = run(`getSelectionSelectedIds().has(${member6Id})`);

assert.strictEqual(m5SelectedAfter, !m5SelectedBefore, 'Member 5 selected state should flip');
assert.strictEqual(sizeAfterM5, m5SelectedBefore ? sizeBefore - 1 : sizeBefore + 1, 'Size should increase or decrease by exactly 1');
console.log('PASS: Toggling member 5 only affects member 5; count changes by exactly 1.');

console.log('\n=== 6. Testing CD Produce modal and Track Random Buttons ===');
(async () => {
  run('openCdProductionModal();');
  await run('setRandomTrackName(0);');
  await run('setRandomTrackName(1);');

  const track0Val = run(`document.getElementById('cd-track-name-0').value`);
  assert(typeof track0Val === 'string' && track0Val.length > 0, 'Track 0 should have a random title');
  console.log(`PASS: setRandomTrackName(0) set track 0 to "${track0Val}"`);

  const track1Val = run(`document.getElementById('cd-track-name-1').value`);
  assert(typeof track1Val === 'string' && track1Val.length > 0, 'Track 1 should have a random title');
  console.log(`PASS: setRandomTrackName(1) set track 1 to "${track1Val}"`);

  console.log('\n=== 7. Testing 6-month plan modal and setup modal random buttons ===');
  await run(`setRandomSetupSongName('input-setup-1st-song');`);
  const setupSong = run(`document.getElementById('input-setup-1st-song').value`);
  assert(setupSong.length > 0, 'Setup 1st song should be set');
  console.log(`PASS: setRandomSetupSongName set input-setup-1st-song to "${setupSong}"`);

  // Open 6-month decision modal for months 7-12 and test song-name random button
  run(`
    openDecisionModal('当年7月〜12月の計画策定', 1, 7, 12);
    // Enable single release on month 7
    const selRel7 = document.getElementById('sel-rel-7');
    if (selRel7) {
      selRel7.value = 'single';
      onReleaseSelectChange(7);
    }
  `);
  await run(`setRandomPlanSongName(7);`);
  const planSong7 = run(`document.getElementById('song-name-7')?.value`);
  assert(typeof planSong7 === 'string' && planSong7.length > 0, 'song-name-7 should be filled by setRandomPlanSongName');
  assert(lines.includes(planSong7), 'song-name-7 should be from randamname.txt');
  console.log(`PASS: setRandomPlanSongName(7) set song-name-7 to "${planSong7}"`);

  console.log('\n=== 8. Testing Past Live Names Preservation and Pattern Suggestions ===');
  // 8-1: suggestNextLiveNames with Year increment
  const tourNext = run(`suggestNextLiveNames('ツアー2025', 2, 2026)`);
  assert(Array.isArray(tourNext), 'suggestNextLiveNames should return array');
  assert(tourNext.includes('ツアー2026'), `suggestNextLiveNames("ツアー2025", 2, 2026) should suggest "ツアー2026", got: ${JSON.stringify(tourNext)}`);
  console.log('PASS: "ツアー2025" suggested ->', tourNext);

  // 8-2: suggestNextLiveNames with Ordinal (1st -> 2nd, 2nd -> 3rd)
  const underLiveNext = run(`suggestNextLiveNames('1stシングルアンダーライブ', 1, 2026)`);
  assert(underLiveNext.includes('2ndシングルアンダーライブ'), `Should suggest "2ndシングルアンダーライブ", got: ${JSON.stringify(underLiveNext)}`);
  console.log('PASS: "1stシングルアンダーライブ" suggested ->', underLiveNext);

  // 8-3: Japanese round (第1回 -> 第2回)
  const roundNext = run(`suggestNextLiveNames('第1回選抜総選挙ライブ', 1, 2026)`);
  assert(roundNext.includes('第2回選抜総選挙ライブ'), `Should suggest "第2回選抜総選挙ライブ", got: ${JSON.stringify(roundNext)}`);
  console.log('PASS: "第1回選抜総選挙ライブ" suggested ->', roundNext);

  // 8-4: Vol.1 -> Vol. 2
  const volNext = run(`suggestNextLiveNames('定期公演 Vol.1', 1, 2026)`);
  assert(volNext.some(s => /定期公演 Vol\.\s*2/.test(s)), `Should suggest Vol. 2, got: ${JSON.stringify(volNext)}`);
  console.log('PASS: "定期公演 Vol.1" suggested ->', volNext);

  // 8-5: getLiveNameSuggestionsForPlan series max increment (1st & 2nd exist -> suggest 3rd)
  run(`
    pastLiveNames = ['1stシングルアンダーライブ', '2ndシングルアンダーライブ', 'ツアー2025'];
  `);
  const planSuggestions = run(`getLiveNameSuggestionsForPlan(7, 0)`);
  assert(planSuggestions.includes('3rdシングルアンダーライブ'), `Should suggest "3rdシングルアンダーライブ", got: ${JSON.stringify(planSuggestions)}`);
  assert(planSuggestions.includes('ツアー2026') || planSuggestions.includes('ツアー2027'), `Should suggest Tour with target year, got: ${JSON.stringify(planSuggestions)}`);
  console.log('PASS: getLiveNameSuggestionsForPlan correctly detected series max and suggested "3rdシングルアンダーライブ":', planSuggestions);

  // 8-6: Testing UI rendering (datalist & chips) and applyLiveNameSuggestion
  const renderedSlotHtml = run(`renderLiveSlotHtml(7, 0, { liveVenue: 'Zepp Nagoya', liveName: '', liveDates: ['2026-07-15'] })`);
  assert(renderedSlotHtml.includes('list="live-name-suggestions-7-0"'), 'HTML should contain datalist reference');
  assert(renderedSlotHtml.includes('id="live-name-suggestions-7-0"'), 'HTML should contain datalist element');
  assert(renderedSlotHtml.includes('💡候補:'), 'HTML should contain suggestion chips');
  assert(renderedSlotHtml.includes('applyLiveNameSuggestion(7, 0,'), 'HTML should wire click handler');
  console.log('PASS: renderLiveSlotHtml generates datalist and clickable suggestion chips');

  // Insert rendered slot into DOM to test applyLiveNameSuggestion
  run(`
    const testContainer = document.createElement('div');
    testContainer.id = 'test-live-slot-container';
    testContainer.innerHTML = renderLiveSlotHtml(7, 0, { liveVenue: 'Zepp Nagoya', liveName: '', liveDates: ['2026-07-15'] });
    document.body.appendChild(testContainer);
    applyLiveNameSuggestion(7, 0, '3rdシングルアンダーライブ');
  `);
  const inputVal = run(`document.getElementById('live-name-7-0').value`);
  assert.strictEqual(inputVal, '3rdシングルアンダーライブ', 'applyLiveNameSuggestion should update input field');
  console.log('PASS: applyLiveNameSuggestion successfully populated input field to "3rdシングルアンダーライブ"');

  // 8-7: Testing saveDecisionPlan records past live name
  run(`
    recordPastLiveName('アニバーサリーツアー2026');
  `);
  const recorded = run(`pastLiveNames.includes('アニバーサリーツアー2026')`);
  assert(recorded, 'recordPastLiveName should persist name to pastLiveNames');
  console.log('PASS: recordPastLiveName successfully recorded new live name into state');

  console.log('\n=== 9. Testing Real Benefit Event Goods Sales and Sell-Through Rates ===');
  // Set up mock members with specific popularity
  run(`
    idolRoster[0].isSelected = true;
    idolRoster[0].stats.popularity = 80; // 80/80 = 1.0 (100%)
    idolRoster[1].isSelected = true;
    idolRoster[1].stats.popularity = 40; // 40/80 = 0.5 (50%)
    idolRoster[2].isSelected = true;
    idolRoster[2].stats.popularity = 100; // Min(1, 100/80) = 1.0 (100%)
    idolRoster[3].isSelected = false; // Not selected
    // Deselect other members for controlled calculation
    for (let i = 4; i < idolRoster.length; i++) {
      idolRoster[i].isSelected = false;
    }
    eventMerchandiseStock = 500;
    liveMerchandiseStock = 300;
    merchandiseStock = 800;
    merchandiseUnitsSold = 0;
    funds = 10000000;
  `);

  // Expected demand: member 0 (1.0 * 180) + member 1 (0.5 * 180) + member 2 (1.0 * 180) = 180 + 90 + 180 = 450
  // With event stock = 500, unitsSold = Min(500, 450) = 450
  // Event goods selling price = 1500 yen (revenue = 450 * 1500 = 675,000 yen)
  const goodsResult = run(`sellMerchandiseAtRealEvent()`);
  assert.strictEqual(goodsResult.demand, 450, `Demand should be 450, got ${goodsResult.demand}`);
  assert.strictEqual(goodsResult.unitsSold, 450, `Units sold should be 450, got ${goodsResult.unitsSold}`);
  assert.strictEqual(goodsResult.revenue, 450 * 1500, `Revenue should be 675,000, got ${goodsResult.revenue}`);
  assert.strictEqual(run('eventMerchandiseStock'), 50, `Remaining event stock should be 50, got ${run('eventMerchandiseStock')}`);
  assert.strictEqual(run('liveMerchandiseStock'), 300, `Live stock should remain unchanged at 300, got ${run('liveMerchandiseStock')}`);
  assert.strictEqual(run('merchandiseStock'), 350, `Total stock should be 350, got ${run('merchandiseStock')}`);
  assert.strictEqual(run('merchandiseUnitsSold'), 450, `Merchandise units sold should be 450, got ${run('merchandiseUnitsSold')}`);
  assert.strictEqual(run('funds'), 10000000 + 675000, `Funds should increase by 675,000`);
  console.log('PASS: sellMerchandiseAtRealEvent calculates demand, stock cap, and revenue correctly with event goods price (1500 yen)');

  // Test Stock capping: eventStock = 200, demand = 450 -> unitsSold = 200
  run(`
    eventMerchandiseStock = 200;
    liveMerchandiseStock = 300;
    merchandiseStock = 500;
    merchandiseUnitsSold = 0;
    funds = 10000000;
  `);
  const cappedGoodsResult = run(`sellMerchandiseAtRealEvent()`);
  assert.strictEqual(cappedGoodsResult.unitsSold, 200, `Units sold capped by stock should be 200, got ${cappedGoodsResult.unitsSold}`);
  assert.strictEqual(cappedGoodsResult.revenue, 200 * 1500, `Revenue should be 300,000`);
  assert.strictEqual(run('eventMerchandiseStock'), 0, 'Remaining event stock should be 0');
  assert.strictEqual(run('liveMerchandiseStock'), 300, 'Live stock should remain 300');
  assert.strictEqual(run('merchandiseStock'), 300, 'Total stock should be 300');
  console.log('PASS: sellMerchandiseAtRealEvent caps at eventMerchandiseStock when stock < demand');

  // Test recordReleaseBenefitSales for real events: sellThrough = Min(1, popularity/80)
  const benefitResult = run(`recordReleaseBenefitSales('real-greeting', 'real-meeguri')`);
  // Capacity of real-greeting is 80
  // Member 0: pop 80 -> sellThrough 1.0 -> unitsSold 80
  // Member 1: pop 40 -> sellThrough 0.5 -> unitsSold 40
  // Member 2: pop 100 -> sellThrough 1.0 -> unitsSold 80
  // Total available = 80 * 3 = 240, Total unitsSold = 80 + 40 + 80 = 200
  // Average sellThrough = 200 / 240 = 0.8333...
  assert.strictEqual(benefitResult.available, 240, `Available capacity should be 240`);
  assert.strictEqual(benefitResult.unitsSold, 200, `Units sold should be 200`);
  assert(Math.abs(benefitResult.sellThrough - (200 / 240)) < 0.001, `Average sell-through should be approx 83%`);
  console.log('PASS: recordReleaseBenefitSales uses Min(1, popularity/80) for real events');

  // Test processPlanEvents execution on real event date
  run(`
    gameDate = '2027-04-18';
    eventMerchandiseStock = 1000;
    liveMerchandiseStock = 500;
    merchandiseStock = 1500;
    productionSchedule['1-4'] = {
      release: 'none',
      planEvents: [
        {
          name: 'リアルミーグリ',
          benefitId: 'real-meeguri',
          venue: 'パルス品川',
          dates: ['2027-04-18'],
          completedDates: []
        }
      ]
    };
    processPlanEvents('2027-04-18');
  `);
  // Event stock should be deducted: 1000 - 450 = 550, Live stock untouched: 500, Total: 1050
  assert.strictEqual(run('eventMerchandiseStock'), 550, `Event stock after processPlanEvents should be 550, got ${run('eventMerchandiseStock')}`);
  assert.strictEqual(run('liveMerchandiseStock'), 500, `Live stock after processPlanEvents should be 500, got ${run('liveMerchandiseStock')}`);
  assert.strictEqual(run('merchandiseStock'), 1050, `Total stock after processPlanEvents should be 1050, got ${run('merchandiseStock')}`);
  console.log('PASS: processPlanEvents on real event sells merchandise and updates stock');

  console.log('\n=== 10. Testing Live Goods Price (2400) and Goods Production Unit Cost (1200) ===');
  // 10-1: Live goods unit price is 2400 in sellMerchandiseAtLive
  run(`
    merchandiseProducts = 2;
    liveMerchandiseStock = 100;
    eventMerchandiseStock = 50;
    merchandiseStock = 150;
    merchandiseUnitsSold = 0;
  `);
  const liveGoodsResult = run(`sellMerchandiseAtLive()`);
  assert(liveGoodsResult.unitsSold > 0, 'Live goods unitsSold should be > 0');
  assert.strictEqual(liveGoodsResult.revenue, liveGoodsResult.unitsSold * 2400, 'Live goods revenue should equal unitsSold * 2400');
  assert.strictEqual(run('eventMerchandiseStock'), 50, 'Event stock should remain untouched during live sales');
  console.log(`PASS: sellMerchandiseAtLive uses live goods price 2400 yen (${liveGoodsResult.unitsSold} units -> ${liveGoodsResult.revenue} yen) and only draws from live stock`);

  // 10-2: Goods production cost is 1200 yen per unit and splits 3:2
  run(`
    funds = 10000000;
    liveMerchandiseStock = 0;
    eventMerchandiseStock = 0;
    merchandiseStock = 0;
    merchandiseProducts = 1;
  `);
  const activeCount = run(`(Array.isArray(idolRoster) ? idolRoster : []).filter(m => m && !m.injury).length`);
  const expectedUnits = activeCount * 1 * 100;
  const expectedLiveUnits = Math.round(expectedUnits * 3 / 5);
  const expectedEventUnits = expectedUnits - expectedLiveUnits;
  const expectedCost = 1200 * expectedUnits;
  const prodLog = run(`applyOfficeAction('goods-production')`);
  assert.strictEqual(run('liveMerchandiseStock'), expectedLiveUnits, `Live stock should increase by ${expectedLiveUnits}`);
  assert.strictEqual(run('eventMerchandiseStock'), expectedEventUnits, `Event stock should increase by ${expectedEventUnits}`);
  assert.strictEqual(run('merchandiseStock'), expectedUnits, `Total stock should increase by ${expectedUnits}`);
  assert.strictEqual(run('funds'), 10000000 - expectedCost, `Funds should be deducted by ${expectedCost}`);
  assert(prodLog.includes(expectedLiveUnits.toLocaleString()) && prodLog.includes(expectedEventUnits.toLocaleString()), `Log should include produced live and event units: ${prodLog}`);
  console.log(`PASS: Goods production produces ${expectedUnits} units (live: ${expectedLiveUnits}, event: ${expectedEventUnits}) at 1,200 yen/unit (total cost: ${expectedCost} yen)`);

  // 10-3: UI card rendering in group tab
  run(`renderGroupTab();`);
  const uiLiveStock = run(`document.getElementById('txt-live-merchandise-stock')?.textContent`);
  const uiEventStock = run(`document.getElementById('txt-event-merchandise-stock')?.textContent`);
  const uiTotalStock = run(`document.getElementById('txt-merchandise-stock')?.textContent`);
  assert.strictEqual(uiLiveStock, expectedLiveUnits.toLocaleString(), `UI live stock should be ${expectedLiveUnits.toLocaleString()}`);
  assert.strictEqual(uiEventStock, expectedEventUnits.toLocaleString(), `UI event stock should be ${expectedEventUnits.toLocaleString()}`);
  assert.strictEqual(uiTotalStock, expectedUnits.toLocaleString(), `UI total stock should be ${expectedUnits.toLocaleString()}`);
  console.log('PASS: renderGroupTab displays separate live, event, and total stock numbers correctly');

  console.log('\nALL CHECKS PASSED SUCCESSFULLY!');
})();
