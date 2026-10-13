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

  console.log('\nALL CHECKS PASSED SUCCESSFULLY!');
})();
