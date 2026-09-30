const fs = require('fs');
const { JSDOM } = require('jsdom');

const out = [];
const log = (...a) => out.push(a.join(' '));
const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name} => ${JSON.stringify(actual)}${ok ? '' : ' (expected ' + JSON.stringify(expected) + ')'}`);
  return ok;
};

const html = fs.readFileSync('/workspaces/managementgame/index.html', 'utf8');

// 旧形式（1か所だけライブを持つ）のセーブデータを枠1へ
const legacySave = {
  currentYear: 1, currentMonth: 1, currentWeek: 1,
  gameDate: '2027-01-06', calendarYear: 2027, totalWeeksElapsed: 0,
  funds: 123456789,
  idolRoster: [],
  productionSchedule: {
    '1-2': { release: 'single', liveVenue: null },
    '1-6': { release: 'none', liveVenue: '原宿体育館', liveName: '定期公演', liveDate: '2027-06-12', seatPrices: { arena: 12000 }, seatOptions: {} }
  }
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.alert = () => {};
    win.confirm = () => true;
    win.prompt = () => '1';
    win.localStorage.setItem('idol_manager_save_slot_1', JSON.stringify(legacySave));
  }
});
const win = dom.window;
const doc = win.document;
const ev = expr => win.eval(expr);
const errors = [];
win.addEventListener('error', e => errors.push('window error: ' + e.message));
dom.virtualConsole.on('jsdomError', e => errors.push('jsdomError: ' + e.message));

function setMonthSlot(month, index, venue, date) {
  const sel = doc.getElementById(`sel-ven-${month}-${index}`);
  sel.value = venue;
  sel.dispatchEvent(new win.Event('change'));
  if (date) {
    const input = doc.getElementById(`live-date-${month}-${index}`);
    input.value = date;
    input.dispatchEvent(new win.Event('change'));
  }
}

setTimeout(() => {
  log('=== 1. タイトル画面 ===');
  const slots = doc.querySelectorAll('#save-slots .save-slot');
  check('セーブ枠3つ', slots.length, 3);
  check('枠1に「続きから」', [...slots[0].querySelectorAll('button')].map(b => b.textContent), ['続きから', '新規開始', '削除']);
  log('  枠1表示:', slots[0].querySelector('.save-slot-info').textContent.trim());
  check('タイトル中はゲーム画面非表示', doc.getElementById('game-screen').hidden, true);

  log('');
  log('=== 2. 資金の表示単位 ===');
  [[0, '0円'], [850, '850円'], [99999, '99,999円'], [100000, '10万円'], [123456, '12.3万円'],
   [999999, '100万円'], [12345678, '1235万円'], [99999999, '1億円'], [100000000, '1億円'],
   [250000000, '2.5億円'], [1234567890, '12.3億円'], [12345678901234, '123457億円'],
   [-123456, '-12.3万円'], [-250000000, '-2.5億円']].forEach(([v, want]) => {
    const got = win.formatMoney(v);
    check(`formatMoney(${v})`, got, want);
    log(`  ${v} -> ${got}`);
  });
  log('');
  log('=== 3. 旧セーブの読み込み ===');
  win.initGame(1, false);
  check('資金表示', doc.getElementById('txt-funds').textContent, '1.23億円');
  check('正確な円額の併記', doc.getElementById('txt-funds-exact').textContent, '（123,456,789円）');
  check('旧形式のライブを読み込み', win.getScheduledLiveEntries().map(e => `${e.planKey}/${e.liveVenue}/${e.liveDate}/${e.isPrimary}`), ['1-6/原宿体育館/2027-06-12/true']);

  // ライブ収支の計算に必要なメンバーを用意
  ev('idolRoster = [createMember(18), createMember(19)]; idolRoster[0].isSelected = true; idolRoster[0].isCenter = true; idolRoster[1].isSelected = true;');

  log('');
  log('=== 4. 1か月に複数回のライブを計画 ===');
  win.openDecisionModal('テスト計画', 1, 5, 6);
  check('6月の既存枠', doc.querySelectorAll('#live-slots-6 .live-slot').length, 1);
  check('枠1の会場', doc.getElementById('sel-ven-6-0').value, '原宿体育館');
  check('枠1の開催日', doc.getElementById('live-date-6-0').value, '2027-06-12');

  win.addLiveSlot(6);
  win.addLiveSlot(6);
  check('追加後の枠数（上限3）', doc.querySelectorAll('#live-slots-6 .live-slot').length, 3);
  check('上限到達でボタン無効', doc.querySelector('#live-slots-6 .plan-add-live-btn').disabled, true);
  win.addLiveSlot(6);
  check('上限超過でも増えない', doc.querySelectorAll('#live-slots-6 .live-slot').length, 3);

  setMonthSlot(6, 1, '大宮アリーナ', '2027-06-05');
  setMonthSlot(6, 2, 'パルス八王子', '2027-06-19');
  check('枠2の開催日', doc.getElementById('live-date-6-1').value, '2027-06-05');
  check('枠3の開催日', doc.getElementById('live-date-6-2').value, '2027-06-19');
  doc.getElementById('live-name-6-1').value = '大宮公演';
  doc.getElementById('live-name-6-2').value = '八王子公演';
  doc.getElementById('live-date-6-2').dispatchEvent(new win.Event('change'));

  win.saveDecisionPlan();
  const plan = ev("productionSchedule['1-6']");
  check('メインライブ', [plan.liveVenue, plan.liveDate], ['原宿体育館', '2027-06-12']);
  check('追加ライブ2件', plan.additionalLives.map(l => [l.liveVenue, l.liveDate, l.liveName]),
    [['大宮アリーナ', '2027-06-05', '大宮公演'], ['パルス八王子', '2027-06-19', '八王子公演']]);
  check('6月のライブ総数', win.getScheduledLiveEntries().filter(e => e.planKey === '1-6').length, 3);
  log('');
  log('=== 5. 再オープンで復元 ===');
  win.openDecisionModal('再確認', 1, 5, 6);
  check('復元後の枠数', doc.querySelectorAll('#live-slots-6 .live-slot').length, 3);
  check('復元した会場', [0, 1, 2].map(i => doc.getElementById(`sel-ven-6-${i}`).value),
    ['原宿体育館', '大宮アリーナ', 'パルス八王子']);
  check('復元した開催日', [0, 1, 2].map(i => doc.getElementById(`live-date-6-${i}`).value),
    ['2027-06-12', '2027-06-05', '2027-06-19']);
  win.removeLiveSlot(6, 1);
  check('枠2を削除', doc.querySelectorAll('#live-slots-6 .live-slot').length, 2);
  check('削除後の会場', [0, 1].map(i => doc.getElementById(`sel-ven-6-${i}`).value), ['原宿体育館', 'パルス八王子']);
  check('メイン枠には削除ボタンなし', doc.querySelectorAll('#live-slots-6 .live-slot')[0].querySelectorAll('button').length, 0);
  win.removeLiveSlot(6, 0);
  check('メイン枠は削除できない', doc.querySelectorAll('#live-slots-6 .live-slot').length, 2);

  log('');
  log('=== 6. 同じ会場・同じ日付の重複拒否 ===');
  setMonthSlot(6, 1, '原宿体育館', '2027-06-12');
  let alerted = '';
  win.alert = m => { alerted = m; };
  win.saveDecisionPlan();
  check('重複時は保存されない', alerted.includes('重複'), true);
  log('  警告:', alerted);
  check('保存後も3件のまま', win.getScheduledLiveEntries().filter(e => e.planKey === '1-6').length, 3);
  win.alert = () => {};

  log('');
  log('=== 7. 当日のライブをすべて開催（コア） ===');
  ev('gameDate = "2027-06-05"; syncGameCalendar();');
  const fundsBefore = ev('funds');
  const audienceBefore = ev('yearlyStats.audience');
  ev('processMonthlyReleaseAndLive()');
  const entries = win.getScheduledLiveEntries().filter(e => e.planKey === '1-6');
  check('6/5のライブは開催済み', entries.filter(e => e.liveDate === '2027-06-05').map(e => e.completed), [true]);
  check('6/12・6/19はまだ未開催', entries.filter(e => e.liveDate !== '2027-06-05').map(e => e.completed), [false, false]);
  check('6/5のライブで資金と動員が発生', ev('funds') !== fundsBefore && ev('yearlyStats.audience') > audienceBefore, true);
  log('  ログ:', doc.getElementById('log-box').textContent);
  log('  6/12の週イベント:', ev('getCurrentWeekEvents()').join(' / '));

  log('');
  log('=== 8. 同日開催のライブ ===');
  ev("productionSchedule['1-7'] = { release: 'none', liveVenue: '大宮アリーナ', liveName: '昼公演', liveDate: '2027-07-10', additionalLives: [{ liveVenue: '栄ドーム', liveName: '夜公演', liveDate: '2027-07-10' }] };");
  ev('gameDate = "2027-07-10"; syncGameCalendar();');
  ev('processMonthlyReleaseAndLive()');
  const july = win.getScheduledLiveEntries().filter(e => e.planKey === '1-7');
  check('同日の2公演とも開催', july.map(e => e.completed), [true, true]);
  log('  ログ:', doc.getElementById('log-box').textContent);

  log('');
  log('=== 9. カレンダーのライブ日マーカー ===');
  ev('gameDate = "2027-06-15"; syncGameCalendar();');
  win.renderGameCalendar();
  const liveCells = [...doc.querySelectorAll('.calendar-day.live-day')];
  check('6月のライブ日セル', liveCells.map(c => c.textContent), ['5', '19']);
  log('  title:', liveCells.map(c => c.getAttribute('title')).join(' / '));

  log('');
  log('=== 10. 開催済みフラグの引き継ぎ ===');
  win.getScheduledLiveEntries().forEach(e => win.markLiveEntryCompleted(e));
  check('全ライブ完了', win.getScheduledLiveEntries().filter(e => !e.completed).length, 0);
  win.openDecisionModal('再計画', 1, 6, 6);
  win.saveDecisionPlan();
  const plan2 = ev("productionSchedule['1-6']");
  check('メインライブの開催済み維持', plan2.liveCompleted, true);
  check('追加ライブの開催済み維持', plan2.additionalLives.map(l => l.liveCompleted), [true, true]);

  log('');
  log('=== 11. セーブ再読込 ===');
  ev('activeSaveSlot = 1; updateUI();');
  const saved = JSON.parse(win.localStorage.getItem('idol_manager_save_slot_1'));
  check('保存データに複数ライブ', saved.productionSchedule['1-6'].additionalLives.map(l => l.liveVenue), ['大宮アリーナ', 'パルス八王子']);
  win.returnToTitle();
  check('タイトルへ戻ってもセーブ枠表示', doc.querySelectorAll('#save-slots .save-slot').length, 3);
  log('  枠1表示:', doc.querySelectorAll('#save-slots .save-slot')[0].querySelector('.save-slot-info').textContent.trim());

  log('');
  log('=== 12. 実行時エラー ===');
  log(errors.length ? errors.join(' | ') : 'なし');

  log('');
  log('########## 判定サマリ ##########');
  results.forEach(r => log(r));
  const failed = results.filter(r => r.startsWith('FAIL'));
  log(`合計 ${results.length} 件 / 失敗 ${failed.length} 件`);

  fs.writeFileSync('/tmp/testout.txt', out.join('\n'));
}, 300);
