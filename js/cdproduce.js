// ==========================================
// CD制作費システム
// ==========================================
// 選抜決定時にCDの内訳（収録曲数・MV・披露メンバー属性・曲名）を決め、
// 制作費を算出・保存する。算出した制作費は発売月の月末に資金から引き落とし、
// 「合計制作費 ÷ 基本費用」を初週売上のバフとして適用する。

// --- 基本設定 ---
const CD_PRODUCTION_BASE_COST = 36000000; // 基本費用 3600万

const CD_TRACK_COST = 2000000;            // 曲製作費 200万/曲
const CD_MV_LOCATION_COST = 4000000;      // MVロケ地費用 400万/曲
const CD_MV_PRODUCTION_COST = 3000000;    // MV制作費用 300万/曲
const CD_COSTUME_COST = 1000000;          // 衣装費 100万/曲

const CD_TRACK_MIN = 4;                   // 収録曲数の下限
const CD_TRACK_MAX = 7;                   // 収録曲数の上限
const CD_MV_TRACK_MIN = 3;                // MVをつける曲数の下限
const CD_MV_TRACK_MAX = 5;                // MVをつける曲数の上限

// --- 披露メンバー属性 ---
const CD_PERFORMANCE_TYPES = [
  { id: 'senbatsu', name: '選抜', allowCenter: true },
  { id: 'under',    name: 'アンダー', allowCenter: true },
  { id: 'all',      name: '全員', allowCenter: true },
  { id: 'unit',     name: 'ユニット／期別', allowCenter: false },
  { id: 'solo',     name: 'ソロ', allowCenter: false }
];

function getCdPerformanceType(id) {
  return CD_PERFORMANCE_TYPES.find(type => type.id === id) || CD_PERFORMANCE_TYPES[0];
}

function clampCdNumber(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function createDefaultCdTrack(index, name = '') {
  return {
    name,
    role: index === 0 ? 'lead' : 'normal',
    locked: index === 0,
    useMv: false,
    performanceType: 'senbatsu'
  };
}

// --- CD制作設定のデフォルト ---
function createDefaultCdProduction(leadTitle = '') {
  const tracks = Array.from({ length: CD_TRACK_MIN }, (_, index) =>
    createDefaultCdTrack(index, index === 0 ? leadTitle : '')
  );
  return {
    trackCount: CD_TRACK_MIN,
    useMv: false,
    mvTrackCount: CD_MV_TRACK_MIN,
    performanceType: 'senbatsu',
    performanceCenterId: null,
    performanceMemberIds: [],
    tracks,
    totalCost: 0,
    costDeducted: false
  };
}

function prepareCdProductionForModal(cdProduction) {
  const config = cdProduction || createDefaultCdProduction('');
  config.trackCount = clampCdNumber(config.trackCount, CD_TRACK_MIN, CD_TRACK_MAX, CD_TRACK_MIN);
  if (!Array.isArray(config.tracks)) config.tracks = [];

  const legacyUseMv = Boolean(config.useMv);
  const legacyMvTrackCount = legacyUseMv
    ? clampCdNumber(config.mvTrackCount, CD_MV_TRACK_MIN, Math.min(CD_MV_TRACK_MAX, config.trackCount), CD_MV_TRACK_MIN)
    : 0;
  const legacyPerformanceType = getCdPerformanceType(config.performanceType).id;

  while (config.tracks.length < config.trackCount) {
    config.tracks.push(createDefaultCdTrack(config.tracks.length));
  }
  config.tracks.length = config.trackCount;
  config.tracks.forEach((track, index) => {
    if (typeof track.useMv !== 'boolean') track.useMv = index < legacyMvTrackCount;
    if (!CD_PERFORMANCE_TYPES.some(type => type.id === track.performanceType)) {
      track.performanceType = legacyPerformanceType;
    }
    track.role = index === 0 ? 'lead' : 'normal';
    track.locked = index === 0;
  });
  return config;
}

// --- 制作費計算 ---
function calculateCdProductionCost(config) {
  const c = config || {};
  const trackCount = clampCdNumber(c.trackCount, CD_TRACK_MIN, CD_TRACK_MAX, CD_TRACK_MIN);
  const tracksHaveMvSettings = Array.isArray(c.tracks) && c.tracks.some(track => typeof track.useMv === 'boolean');
  const trackMvCount = tracksHaveMvSettings ? c.tracks.filter(track => track.useMv).length : 0;
  const selectedMvTrackCount = tracksHaveMvSettings && (trackMvCount > 0 || !c.useMv)
    ? trackMvCount
    : (c.useMv
      ? clampCdNumber(c.mvTrackCount, CD_MV_TRACK_MIN, Math.min(CD_MV_TRACK_MAX, trackCount), CD_MV_TRACK_MIN)
      : 0);
  const mvTrackCount = Math.min(selectedMvTrackCount, trackCount);
  const useMv = mvTrackCount > 0;

  const trackCost = trackCount * CD_TRACK_COST;
  const costumeCost = trackCount * CD_COSTUME_COST;
  const mvLocationCost = useMv ? mvTrackCount * CD_MV_LOCATION_COST : 0;
  const mvProductionCost = useMv ? mvTrackCount * CD_MV_PRODUCTION_COST : 0;
  const totalCost = CD_PRODUCTION_BASE_COST + trackCost + costumeCost + mvLocationCost + mvProductionCost;

  return {
    trackCount, trackCost, costumeCost,
    useMv, mvTrackCount, mvLocationCost, mvProductionCost,
    totalCost
  };
}

// --- 初週売上バフ（合計制作費 ÷ 基本費用）---
function getCdProductionSalesBuff(cdProduction) {
  if (!cdProduction) return 1;
  const cost = calculateCdProductionCost(cdProduction);
  return cost.totalCost / CD_PRODUCTION_BASE_COST;
}

// --- 通常会費（CD = 制作費）---
function getCdPlanStandardCost(plan) {
  if (!plan || !plan.cdProduction) return CD_PRODUCTION_BASE_COST;
  return calculateCdProductionCost(plan.cdProduction).totalCost;
}

// --- 通常会費（ライブ = 会場費＋配信費）---
function getLivePlanStandardCost(live) {
  if (!live || !live.liveVenue) return 0;
  const venue = (typeof VENUE_DATA !== 'undefined') ? VENUE_DATA.find(v => v.name === live.liveVenue) : null;
  if (!venue) return 0;
  const dates = (Array.isArray(live.liveDates) && live.liveDates.length > 0)
    ? live.liveDates
    : (live.liveDate ? [live.liveDate] : []);
  const showCount = Math.max(1, dates.length);
  const streamDates = Array.isArray(live.streamDates) ? live.streamDates.filter(Boolean) : [];
  const streamDays = streamDates.length;
  if (typeof calculateLiveExpenses === 'function') {
    return calculateLiveExpenses(venue.cap, showCount, streamDays).totalCost;
  }
  return 0;
}

// --- 通常会費（その他イベント = 会場費のみ）---
function getEventPlanStandardCost(ev, eventDates = null) {
  if (!ev || !ev.venue) return 0;
  const venue = (typeof VENUE_DATA !== 'undefined') ? VENUE_DATA.find(v => v.name === ev.venue) : null;
  if (!venue || typeof getVenueFeePerShow !== 'function') return 0;
  const dates = (Array.isArray(eventDates) && eventDates.length > 0)
    ? eventDates
    : (Array.isArray(ev.dates) && ev.dates.length > 0)
    ? ev.dates : (ev.date ? [ev.date] : []);
  const daysCount = dates.length;
  if (daysCount <= 0) return 0;
  return getVenueFeePerShow(venue) * (daysCount + 1);
}


// --- 発売月の月末に制作費を引き落とす（未徴収のみ）---
function deductCdProductionCostIfDue(plan) {
  if (!plan || !plan.cdProduction || plan.cdProduction.costDeducted) return 0;
  const cost = calculateCdProductionCost(plan.cdProduction).totalCost;
  plan.cdProduction.costDeducted = true;
  funds -= cost;
  if (typeof recordMonthlyExpense === 'function') recordMonthlyExpense('CD制作費', cost);
  return cost;
}


// ==========================================
// CD制作モーダル（選抜決定時の内訳設定）
// ==========================================
let cdProductionModalState = null;
let cdProductionConfirmed = null;
let cdProductionTargetPlanKey = null;

function openCdProductionModal(cdProduction) {
  let modal = document.getElementById('cd-production-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cd-production-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10001; align-items:center; justify-content:center;';
    document.body.appendChild(modal);
  }
  cdProductionModalState = prepareCdProductionForModal(cdProduction);
  renderCdProductionModal();
  modal.style.display = 'flex';
}

function closeCdProductionModal() {
  const modal = document.getElementById('cd-production-modal');
  if (modal) modal.style.display = 'none';
}

function onCdTrackNameChange(index) {
  const el = document.getElementById(`cd-track-name-${index}`);
  if (el && cdProductionModalState && cdProductionModalState.tracks[index]) {
    cdProductionModalState.tracks[index].name = el.value;
  }
}

function onCdTrackMvChange(index) {
  const el = document.getElementById(`cd-track-mv-${index}`);
  const track = cdProductionModalState?.tracks[index];
  if (!el || !track) return;
  track.useMv = el.value === 'yes';
  cdProductionModalState.useMv = cdProductionModalState.tracks.some(item => item.useMv);
  cdProductionModalState.mvTrackCount = cdProductionModalState.tracks.filter(item => item.useMv).length;
  renderCdProductionModal();
}

function onCdTrackPerformanceTypeChange(index) {
  const el = document.getElementById(`cd-track-performance-type-${index}`);
  const track = cdProductionModalState?.tracks[index];
  if (!el || !track) return;
  track.performanceType = el.value;
}

function onCdTrackCountChange() {
  const el = document.getElementById('cd-track-count');
  if (!el) return;
  const count = clampCdNumber(el.value, CD_TRACK_MIN, CD_TRACK_MAX, CD_TRACK_MIN);
  cdProductionModalState.trackCount = count;
  const tracks = cdProductionModalState.tracks;
  while (tracks.length < count) tracks.push(createDefaultCdTrack(tracks.length));
  while (tracks.length > count) tracks.pop();
  const mvTracks = tracks.filter(track => track.useMv);
  while (mvTracks.length > Math.min(CD_MV_TRACK_MAX, count)) {
    mvTracks.pop().useMv = false;
  }
  cdProductionModalState.useMv = tracks.some(track => track.useMv);
  cdProductionModalState.mvTrackCount = tracks.filter(track => track.useMv).length;
  renderCdProductionModal();
}

function renderCdProductionModal() {
  const modal = document.getElementById('cd-production-modal');
  if (!modal) return;
  const cfg = cdProductionModalState;
  const cost = calculateCdProductionCost(cfg);

  const trackOptions = [];
  for (let n = CD_TRACK_MIN; n <= CD_TRACK_MAX; n++) {
    trackOptions.push(`<option value="${n}" ${cfg.trackCount === n ? 'selected' : ''}>${n}曲</option>`);
  }
  const mvTrackCount = cfg.tracks.filter(track => track.useMv).length;
  const mvMax = Math.min(CD_MV_TRACK_MAX, cfg.trackCount);
  const mvSelectionInvalid = mvTrackCount > 0 && mvTrackCount < CD_MV_TRACK_MIN;

  const trackRows = cfg.tracks.map((track, i) => {
    const locked = i === 0;
    const canAddMv = track.useMv || mvTrackCount < mvMax;
    return `
      <div style="padding:7px; margin-bottom:6px; border:1px solid #eee; border-radius:5px;">
        <div style="font-size:11px; color:#888; margin-bottom:4px;">${i === 0 ? 'リード曲' : `曲${i + 1}`}</div>
        <input type="text" id="cd-track-name-${i}" value="${escapeHtml(track.name || '')}" maxlength="24"
          placeholder="${i === 0 ? '表題曲（決定済み）' : '曲名を入力'}"
          ${locked ? 'readonly style="background:#f0f0f0;' : 'style="'} padding:5px; font-size:11px; border:1px solid #ddd; border-radius:4px; box-sizing:border-box; width:100%;"
          onchange="onCdTrackNameChange(${i})">
        <div style="display:flex; gap:8px; margin-top:5px;">
          <label style="flex:1; font-size:10px; font-weight:bold; color:#555;">MV
            <select id="cd-track-mv-${i}" onchange="onCdTrackMvChange(${i})"
              style="width:100%; padding:5px; font-size:11px; margin-top:2px;">
              <option value="no" ${!track.useMv ? 'selected' : ''}>なし</option>
              <option value="yes" ${track.useMv ? 'selected' : ''} ${canAddMv ? '' : 'disabled'}>あり</option>
            </select>
          </label>
          <label style="flex:2; font-size:10px; font-weight:bold; color:#555;">披露メンバー属性
            <select id="cd-track-performance-type-${i}" onchange="onCdTrackPerformanceTypeChange(${i})"
              style="width:100%; padding:5px; font-size:11px; margin-top:2px;">
              ${CD_PERFORMANCE_TYPES.map(type =>
                `<option value="${type.id}" ${track.performanceType === type.id ? 'selected' : ''}>${type.name}</option>`
              ).join('')}
            </select>
          </label>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;">
      <h3 class="page-title" style="margin-top:0; font-size:15px;">💿 CD制作の内訳を決定</h3>
      <p style="font-size:11px; color:#666; line-height:1.6; margin:0 0 10px;">
        選抜が決定しました。CDの収録内容を決めて制作費を確定してください。<br>
        <span style="color:#b8742a;">※制作費は発売月の月末に引き落としされます。費用をかけるほど初週売上のバフが上がります。</span>
      </p>
      <div style="display:flex; gap:10px; margin-bottom:6px;">
        <label style="flex:1; font-size:11px; font-weight:bold; color:#555;">収録曲数
          <select id="cd-track-count" onchange="onCdTrackCountChange()" style="width:100%; padding:6px; font-size:11px; margin-top:3px;">${trackOptions.join('')}</select>
        </label>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">各曲の内容</div>
        <p style="font-size:10px; color:#888; margin:0 0 5px;">MVを付ける場合は3〜${mvMax}曲選択してください。</p>
        ${trackRows}
      </div>
      <div style="background:#fdf2f4; border-radius:6px; padding:10px; font-size:11px; color:#555; line-height:1.7; margin-bottom:12px;">
        <div style="font-weight:bold; color:#b8742a; margin-bottom:4px;">💰 制作費の内訳</div>
        <div>基本費用: ${formatMoney(CD_PRODUCTION_BASE_COST)}</div>
        <div>曲製作費: ${cost.trackCount}曲 × ${formatMoney(CD_TRACK_COST)} = ${formatMoney(cost.trackCost)}</div>
        <div>衣装費: ${cost.trackCount}曲 × ${formatMoney(CD_COSTUME_COST)} = ${formatMoney(cost.costumeCost)}</div>
        ${cost.useMv ? `
          <div>MVロケ地費用: ${cost.mvTrackCount}曲 × ${formatMoney(CD_MV_LOCATION_COST)} = ${formatMoney(cost.mvLocationCost)}</div>
          <div>MV制作費用: ${cost.mvTrackCount}曲 × ${formatMoney(CD_MV_PRODUCTION_COST)} = ${formatMoney(cost.mvProductionCost)}</div>
        ` : ''}
        <div style="border-top:1px solid #eadde1; margin-top:4px; padding-top:4px; font-weight:bold;">
          合計制作費: ${formatMoney(cost.totalCost)}　（初週売上バフ ×${getCdProductionSalesBuff(cfg).toFixed(2)}）
        </div>
      </div>
      <div class="actions" style="flex-direction:row; gap:6px;">
        <button class="main-btn" style="flex:2;" onclick="confirmCdProduction()" ${mvSelectionInvalid ? 'disabled' : ''}>この内容で決定（発売月末に引き落とし）</button>
      </div>
    </div>
  `;
}

function confirmCdProduction() {
  const cost = calculateCdProductionCost(cdProductionModalState);
  if (cost.useMv && (cost.mvTrackCount < CD_MV_TRACK_MIN || cost.mvTrackCount > Math.min(CD_MV_TRACK_MAX, cost.trackCount))) {
    setLog(`【CD制作】MVを付ける曲数は3〜${Math.min(CD_MV_TRACK_MAX, cost.trackCount)}曲にしてください。`);
    return;
  }
  cdProductionModalState.useMv = cost.useMv;
  cdProductionModalState.mvTrackCount = cost.mvTrackCount;
  const performanceTypes = cdProductionModalState.tracks.map(track => track.performanceType);
  cdProductionModalState.performanceType = performanceTypes.every(type => type === performanceTypes[0])
    ? performanceTypes[0]
    : null;
  cdProductionModalState.totalCost = cost.totalCost;
  cdProductionModalState.costDeducted = false;
  cdProductionConfirmed = cdProductionModalState;
  // 対象の計画に制作設定を保存する
  if (typeof cdProductionTargetPlanKey !== 'undefined' && cdProductionTargetPlanKey
      && typeof productionSchedule !== 'undefined' && productionSchedule[cdProductionTargetPlanKey]) {
    productionSchedule[cdProductionTargetPlanKey].cdProduction = cdProductionModalState;
  }
  closeCdProductionModal();
  setLog(`【CD制作】収録${cost.trackCount}曲${cost.useMv ? `・MV${cost.mvTrackCount}曲` : ''} / 制作費 ${formatMoney(cost.totalCost)}（初週売上バフ ×${getCdProductionSalesBuff(cdProductionModalState).toFixed(2)}）に決定しました。`);
  if (typeof updateUI === 'function') updateUI();
}
