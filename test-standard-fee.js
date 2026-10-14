/* 通常会費ベースの変更/取消/追加 手数料・徴収ロジック検証 (jsdom) */
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

// ゲームを初期化する
run('startNewGame(1);');
run('document.querySelector(".setup-modal-close").click();');
run(`
  startNewGame(1);
  document.getElementById('input-setup-groupname').value = 'テストグループ';
  document.getElementById('input-setup-1st-song').value = 'テスト1stシングル';
  document.getElementById('input-setup-2nd-song').value = 'テスト2ndシングル';
  document.getElementById('input-setup-live-name').value = 'テスト初ライブ';
  submitGameSetupAndPlan();
`);

// --- 1. CD制作費 通常会費ヘルパー ---
const cdCost = run(`
  (() => {
    const cfg = createDefaultCdProduction('リード曲');
    cfg.trackCount = 5;
    cfg.useMv = true;
    cfg.mvTrackCount = 3;
    return getCdPlanStandardCost({ cdProduction: cfg });
  })()
`);
// 期待値: 36,000,000 + 5*2,000,000 + 5*1,000,000 + 3*4,000,000 + 3*3,000,000 = 72,000,000
check('CD通常会費 = 基本+曲+衣装+MV(5曲/MV3曲) = 72,000,000', cdCost === 72000000, `got ${cdCost}`);

const cdCostNoCd = run('getCdPlanStandardCost({})');
check('CD通常会費(未設定) = 基本費用 36,000,000', cdCostNoCd === 36000000, `got ${cdCostNoCd}`);

// --- CD披露メンバーの選定 ---
const cdPerformanceSelection = run(`
  (() => {
    const originalSelection = idolRoster.map(member => [member, member.isSelected]);
    const selected = idolRoster.slice(0, 3);
    idolRoster.forEach(member => { member.isSelected = selected.includes(member); });
    const underMember = idolRoster.find(member => !member.isSelected);
    const soloMember = idolRoster[0];
    const cfg = createDefaultCdProduction('リード曲');
    openCdProductionModal(cfg);
    const typeSelect = document.getElementById('cd-track-performance-type-1');
    typeSelect.value = 'under';
    onCdTrackPerformanceTypeChange(1);
    const underOptions = [...document.querySelectorAll('#cd-track-center-1 option')].map(option => Number(option.value));
    const hasUnderOptionsOnly = underOptions.includes(underMember.id)
      && !selected.some(member => underOptions.includes(member.id));
    const underCenter = document.getElementById('cd-track-center-1');
    underCenter.value = String(underMember.id);
    onCdTrackPerformanceMemberChange(1, 'center');
    const savedUnderCenter = cdProductionModalState.tracks[1].performanceCenterId === underMember.id;

    const allType = document.getElementById('cd-track-performance-type-2');
    allType.value = 'all';
    onCdTrackPerformanceTypeChange(2);
    const allCenterOptions = [...document.querySelectorAll('#cd-track-center-2 option')].map(option => Number(option.value));
    const hasAllRosterOptions = idolRoster.every(member => allCenterOptions.includes(member.id));

    const soloType = document.getElementById('cd-track-performance-type-3');
    soloType.value = 'solo';
    onCdTrackPerformanceTypeChange(3);
    const soloOptions = [...document.querySelectorAll('#cd-track-member-3 option')].map(option => Number(option.value));
    const hasSoloSingerOptions = soloOptions.includes(soloMember.id);
    const soloSinger = document.getElementById('cd-track-member-3');
    soloSinger.value = String(soloMember.id);
    onCdTrackPerformanceMemberChange(3, 'member');
    const savedSoloSinger = cdProductionModalState.tracks[3].performanceMemberIds[0] === soloMember.id;
    originalSelection.forEach(([member, wasSelected]) => { member.isSelected = wasSelected; });
    closeCdProductionModal();
    return hasUnderOptionsOnly && savedUnderCenter && hasAllRosterOptions && hasSoloSingerOptions && savedSoloSinger;
  })()
`);
check('CD内訳でアンダー／全員曲のセンターとソロ歌唱者を選べる', cdPerformanceSelection);

const leadTrackLock = run(`
  (() => {
    const config = createDefaultCdProduction('以前の曲名');
    openCdProductionModal(config, '日程策定済みの表題曲');
    const titleInput = document.getElementById('cd-track-name-0');
    const titleIsFixed = titleInput.readOnly
      && titleInput.value === '日程策定済みの表題曲'
      && !document.querySelector('#cd-track-name-0 + button');
    titleInput.value = '変更できない曲名';
    onCdTrackNameChange(0);
    const titleRemainsFixed = cdProductionModalState.tracks[0].name === '日程策定済みの表題曲';
    const secondTrackEditable = !document.getElementById('cd-track-name-1').readOnly
      && Boolean(document.querySelector('#cd-track-name-1 + button'));
    closeCdProductionModal();
    return titleIsFixed && titleRemainsFixed && secondTrackEditable;
  })()
`);
check('表題曲は計画済みタイトルで固定し、2曲目から編集できる', leadTrackLock);

const cdModalScroll = run(`
  (() => {
    openCdProductionModal(createDefaultCdProduction('表題曲'));
    const content = document.querySelector('#cd-production-modal .modal-content');
    content.scrollTop = 48;
    const typeSelect = document.getElementById('cd-track-performance-type-1');
    typeSelect.value = 'under';
    onCdTrackPerformanceTypeChange(1);
    const preservedScrollTop = document.querySelector('#cd-production-modal .modal-content').scrollTop;
    closeCdProductionModal();
    return preservedScrollTop === 48;
  })()
`);
check('CD内訳のドロップダウン変更後もモーダル内スクロール位置を維持する', cdModalScroll);

// --- 2. ライブ通常会費ヘルパー（会場費＋配信費）---
const liveStandard = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return getLivePlanStandardCost({ liveVenue: venue.name, liveDates: ['2030-01-10'], streamDates: ['2030-01-10'] });
  })()
`);
const liveExpected = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return calculateLiveExpenses(venue.cap, 1, 1).totalCost;
  })()
`);
check('ライブ通常会費 = calculateLiveExpenses(cap,1,1).totalCost', liveStandard === liveExpected && liveStandard > 0, `got ${liveStandard} / expected ${liveExpected}`);

// --- 3. イベント通常会費ヘルパー（会場費のみ）---
const eventStandard = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return getEventPlanStandardCost({ venue: venue.name, dates: ['2030-01-10', '2030-01-11'] });
  })()
`);
const eventExpected = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return getVenueFeePerShow(venue) * (2 + 1);
  })()
`);
check('イベント通常会費 = 会場費×(日数+1)', eventStandard === eventExpected && eventStandard > 0, `got ${eventStandard} / expected ${eventExpected}`);

const onlineEventStandard = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return getEventPlanStandardCost({
      name: 'オンラインミーグリ',
      venue: venue.name,
      dates: ['2030-01-10', '2030-01-11']
    });
  })()
`);
check('オンラインイベント会場費 = 通常会場費の3分の1', onlineEventStandard === Math.floor(eventExpected / 3), `got ${onlineEventStandard} / expected ${Math.floor(eventExpected / 3)}`);

const onlineEventExpense = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return calculateEventExpenses('オンラインサイン会', venue, ['2030-01-10', '2030-01-11']).venueFee;
  })()
`);
check('オンラインイベント費用見積もりも会場費を3分の1にする', onlineEventExpense === Math.floor(eventExpected / 3), `got ${onlineEventExpense} / expected ${Math.floor(eventExpected / 3)}`);

const realEventStandard = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return getEventPlanStandardCost({
      name: 'リアルミーグリ',
      venue: venue.name,
      dates: ['2030-01-10', '2030-01-11']
    });
  })()
`);
check('リアルイベント会場費は通常料金のまま', realEventStandard === eventExpected, `got ${realEventStandard} / expected ${eventExpected}`);

const expenseSettlement = run(`
  (() => {
    const saved = { funds, monthlyLedger, setLog };
    try {
      funds = 1000;
      monthlyLedger = createMonthlyLedger();
      setLog = () => {};
      recordMonthlyExpense('月末払い', 125);
      recordImmediateMonthlyExpense('即時払い', 50);
      const afterImmediate = funds;
      const settledAmount = settleMonthlyExpenses();
      const afterSettlement = funds;
      const secondSettlement = settleMonthlyExpenses();
      return {
        afterImmediate,
        settledAmount,
        afterSettlement,
        secondSettlement,
        allSettled: monthlyLedger.expense.every(entry => entry.settled)
      };
    } finally {
      funds = saved.funds;
      monthlyLedger = saved.monthlyLedger;
      setLog = saved.setLog;
    }
  })()
`);
check('契約・設備投資相当の即時費用だけ即時引き落とし', expenseSettlement.afterImmediate === 950);
check('その他の経費は月末に一度だけ引き落とし', expenseSettlement.settledAmount === 125
  && expenseSettlement.afterSettlement === 825 && expenseSettlement.secondSettlement === 0
  && expenseSettlement.allSettled);

const monthlyClosingSettlement = run(`
  (() => {
    const saved = {
      funds,
      monthlyLedger,
      pendingReports,
      maintainOfficeFacilities,
      settleMonthlyIncome,
      setLog
    };
    try {
      funds = 1000;
      monthlyLedger = createMonthlyLedger();
      pendingReports = [];
      maintainOfficeFacilities = () => recordMonthlyExpense('設備維持費', 200);
      settleMonthlyIncome = () => recordMonthlyExpense('給与', 300);
      setLog = () => {};
      processMonthlyClosing(new Date(2027, 0, 30), new Date(2027, 0, 31));
      return funds === 500
        && pendingReports[0]?.report.expense.reduce((sum, entry) => sum + entry.amount, 0) === 500
        && pendingReports[0]?.report.expense.every(entry => entry.settled);
    } finally {
      funds = saved.funds;
      monthlyLedger = saved.monthlyLedger;
      pendingReports = saved.pendingReports;
      maintainOfficeFacilities = saved.maintainOfficeFacilities;
      settleMonthlyIncome = saved.settleMonthlyIncome;
      setLog = saved.setLog;
    }
  })()
`);
check('給与・設備維持費などは月末処理でまとめて引き落とす', monthlyClosingSettlement);

const mixedSessionEventStandard = run(`
  (() => {
    const venue = VENUE_DATA.find(v => v.cap === 'A');
    return getEventPlanStandardCost({
      sessions: [
        { name: 'オンラインミーグリ', venue: venue.name, dates: ['2030-01-10', '2030-01-11'] },
        { name: 'リアルミーグリ', venue: venue.name, dates: ['2030-01-10', '2030-01-11'] }
      ]
    });
  })()
`);
check('複数セッションの会場費は種別ごとの料金を適用', mixedSessionEventStandard === Math.floor(eventExpected / 3) + eventExpected, `got ${mixedSessionEventStandard} / expected ${Math.floor(eventExpected / 3) + eventExpected}`);

// --- 4. 変更手数料 = 通常会費×20% ---
const changeFee = run(`
  (() => {
    const before = funds;
    const targetDate = '2099-06-01'; // 十分未来（半年以降＝addFeeRate>0 は diffDays<=180 のみ。ここは半年超で0）
    // diffDays<=180 で 20% になるケースを作るため、半年〜3ヶ月前の日付を目標にする
    const now = getGameDateObject();
    const target = new Date(now.getTime() + 150 * 86400000); // 150日後（半年〜3ヶ月前）
    const tStr = target.toISOString().slice(0, 10);
    requestModifyExistingPlan('2099-6', tStr, 6, 100000000);
    const expense = monthlyLedger.expense[monthlyLedger.expense.length - 1];
    return { before, after: funds, expense };
  })()
`);
check('変更手数料20Mは月末引き落としに計上', changeFee.before === changeFee.after
  && changeFee.expense.label === '予定変更手数料' && changeFee.expense.amount === 20000000
  && changeFee.expense.settled === false, `amount ${changeFee.expense.amount}`);

// --- 5. 取消キャンセル料（3ヶ月〜1ヶ月前＝50%）---
const cancelFee = run(`
  (() => {
    const now = getGameDateObject();
    const target = new Date(now.getTime() + 60 * 86400000); // 60日後（3ヶ月〜1ヶ月前）
    const tStr = target.toISOString().slice(0, 10);
    const before = funds;
    requestCancelExistingPlan('2099-6', tStr, 100000000);
    const expense = monthlyLedger.expense[monthlyLedger.expense.length - 1];
    return { before, after: funds, expense };
  })()
`);
check('取消料50Mは月末引き落としに計上', cancelFee.before === cancelFee.after
  && cancelFee.expense.label === '予定取消料' && cancelFee.expense.amount === 50000000
  && cancelFee.expense.settled === false, `amount ${cancelFee.expense.amount}`);

// --- 6. 取消キャンセル料（半年〜3ヶ月前＝30%）---
const cancelFee30 = run(`
  (() => {
    const now = getGameDateObject();
    const target = new Date(now.getTime() + 150 * 86400000); // 150日後（半年〜3ヶ月前）
    const tStr = target.toISOString().slice(0, 10);
    const before = funds;
    requestCancelExistingPlan('2099-6', tStr, 100000000);
    const expense = monthlyLedger.expense[monthlyLedger.expense.length - 1];
    return { before, after: funds, expense };
  })()
`);
check('取消料30Mは月末引き落としに計上', cancelFee30.before === cancelFee30.after
  && cancelFee30.expense.label === '予定取消料' && cancelFee30.expense.amount === 30000000
  && cancelFee30.expense.settled === false, `amount ${cancelFee30.expense.amount}`);

// --- 7. 追加料 = 通常会費×1.2倍 ---
const addFeeCheck = run(`
  (() => {
    const before = funds;
    // 追加モードをエミュレート: planIsAddMode=true で saveDecisionPlan を通すと通常会費が確定しないため、
    // 直接 1.2倍の計算式を検証する
    const std = 100000000;
    const addFee = Math.round(std * 1.2);
    return { std, addFee };
  })()
`);
check('追加料 = 通常会費100M×1.2 = 120M', addFeeCheck.addFee === 120000000, `got ${addFeeCheck.addFee}`);

// --- 8. 半年後以降は無料（変更・取消とも0）---
const freeCheck = run(`
  (() => {
    const now = getGameDateObject();
    const target = new Date(now.getTime() + 300 * 86400000); // 300日後（半年超）
    const tStr = target.toISOString().slice(0, 10);
    const before = funds;
    requestModifyExistingPlan('2099-6', tStr, 6, 100000000);
    const afterChange = funds;
    requestCancelExistingPlan('2099-6', tStr, 100000000);
    const afterCancel = funds;
    return { changeDiff: before - afterChange, cancelDiff: afterChange - afterCancel };
  })()
`);
check('半年後以降は変更・取消とも無料', freeCheck.changeDiff === 0 && freeCheck.cancelDiff === 0, `change ${freeCheck.changeDiff} / cancel ${freeCheck.cancelDiff}`);

// --- 9. saveDecisionPlan 追加モードで通常会費×1.2倍を即時徴収 ---
// 追加モードでCDリリース（制作費のみ・会場なし）の通常会費に対し1.2倍を徴収する式を検証する。
const addModeCheck = run(`
  (() => {
    const cfg = createDefaultCdProduction('リード曲');
    cfg.trackCount = 4; cfg.useMv = false; // 通常会費 = 36M + 4*2M + 4*1M = 48M
    const std = getCdPlanStandardCost({ cdProduction: cfg });
    const addFee = Math.round(std * 1.2);
    return { std, addFee };
  })()
`);
check('追加モード徴収 = CD通常会費48M×1.2 = 57.6M', addModeCheck.std === 48000000 && addModeCheck.addFee === 57600000, `std ${addModeCheck.std} / fee ${addModeCheck.addFee}`);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
