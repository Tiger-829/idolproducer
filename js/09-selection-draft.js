// ==========================================
// 選抜・卒業・ドラフト会議
// ==========================================
// ==========================================
// 選抜・センターの選定（ユーザー自身が選ぶ）
// ==========================================

// 選抜が確定してロック中か
function isSelectionLocked() {
  return Boolean(selectionLock);
}

// 発表確定時にロックする
function lockSelection(year, month, releaseType) {
  selectionLock = { year, month, releaseType };
}

// 事件などでロックを解除する
function unlockSelection(reason) {
  if (!selectionLock) return false;
  selectionLock = null;
  setLog(`【選抜】${reason}のため、選抜とセンターを変更できるようになりました。`);
  return true;
}

// 編成ページから手動で開く
function openSelectionSetup() {
  if (isSelectionLocked()) {
    setLog(`【選抜】${selectionLock.year}年${selectionLock.month}月発表分は確定済みです。次作の選抜発表まで変更できません。`);
    return;
  }
  if (!pendingSelectionEvent) pendingSelectionEvent = createSelectionEvent({ trigger: 'manual' });
  openSelectionModal();
}

function getSelectionSelectedIds() {
  if (!pendingSelectionEvent) return new Set();
  return new Set(pendingSelectionEvent.selectedIds || []);
}

// 選抜のチェックを切り替える
function toggleSelectionMember(memberId) {
  if (!pendingSelectionEvent) return;
  const ids = new Set(pendingSelectionEvent.selectedIds || []);
  if (ids.has(memberId)) {
    if (ids.size <= MIN_SELECTION_SIZE) {
      setLog(`【選抜】最少${MIN_SELECTION_SIZE}名は必要です。`);
      return;
    }
    ids.delete(memberId);
    if (pendingSelectionEvent.centerId === memberId) {
      pendingSelectionEvent.centerId = ids.values().next().value ?? null;
    }
  } else {
    ids.add(memberId);
  }
  pendingSelectionEvent.selectedIds = [...ids];
  renderSelectionModal();
}

// センターを変更する（選抜内に限定）
function setSelectionCenter(memberId) {
  if (!pendingSelectionEvent) return;
  const ids = getSelectionSelectedIds();
  if (!ids.has(memberId)) return;
  pendingSelectionEvent.centerId = memberId;
  renderSelectionModal();
}

// 選抜とセンターを確定する
function confirmSelection() {
  if (!pendingSelectionEvent) return;
  const ids = getSelectionSelectedIds();
  if (ids.size < MIN_SELECTION_SIZE) {
    setLog(`【選抜】少なくとも${MIN_SELECTION_SIZE}名を選んでください。`);
    return;
  }
  const centerId = ids.has(pendingSelectionEvent.centerId)
    ? pendingSelectionEvent.centerId
    : [...ids][0];
  idolRoster.forEach(member => {
    member.isSelected = ids.has(member.id);
    member.isCenter = member.id === centerId;
  });
  const center = idolRoster.find(member => member.id === centerId);
  const isRelease = pendingSelectionEvent.trigger === 'release';
  // 発表で確定した場合は、次作の発表まで変更不可になる
  if (isRelease) {
    lockSelection(pendingSelectionEvent.year, pendingSelectionEvent.month, pendingSelectionEvent.releaseType);
    // 発表済みのセンターを記録する（個別レッスンの候補順に使う）
    lastAnnouncedCenterId = centerId;
  }
  pendingSelectionEvent = null;
  document.getElementById('selection-modal').style.display = 'none';
  setLog(isRelease
    ? `【選抜決定】センターは【${center ? center.name : '未定'}】！ ${ids.size}名の選抜体制を敷きました。`
    : `【編成変更】センターは【${center ? center.name : '未定'}】！ ${ids.size}名の選抜に変更しました。`);
  updateUI();
}

function cancelSelection() {
  pendingSelectionEvent = null;
  document.getElementById('selection-modal').style.display = 'none';
  setLog('【編成】選抜の変更を中止しました。');
  updateUI();
}

// 選抜画面の並び替え項目（6項目）
const SELECTION_SORT_KEYS = [
  { id: 'overall', name: '総評', get: member => calculateSingleOverall(member.stats) },
  { id: 'idolPower', name: 'アイドル力', get: member => calculateIdolPower(member.stats) },
  { id: 'height', name: '身長', get: member => member.height ?? 0 },
  { id: 'age', name: '年齢', get: member => member.age ?? 0 },
  { id: 'vocal', name: '歌唱力', get: member => member.stats.vocal || 0 },
  { id: 'dance', name: 'ダンス', get: member => member.stats.dance || 0 }
];

// 選抜画面を並び替える（同じ項目を再押すと昇順／降順が反転する）
function setSelectionSort(sortKey) {
  if (!pendingSelectionEvent) return;
  if (!SELECTION_SORT_KEYS.some(key => key.id === sortKey)) return;
  if (pendingSelectionEvent.sortKey === sortKey) {
    pendingSelectionEvent.sortDesc = pendingSelectionEvent.sortDesc === false;
  } else {
    pendingSelectionEvent.sortKey = sortKey;
    pendingSelectionEvent.sortDesc = true;
  }
  renderSelectionModal();
}

// 選抜画面を項目順に並べる（元の並びは崩さない）
function sortSelectionMembers(members) {
  const key = SELECTION_SORT_KEYS.find(entry => entry.id === pendingSelectionEvent?.sortKey);
  if (!key) return members;
  const dir = pendingSelectionEvent.sortDesc === false ? 1 : -1;
  return [...members].sort((a, b) => {
    const diff = (key.get(a) - key.get(b)) * dir;
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ja');
  });
}

function renderSelectionModal() {
  const event = pendingSelectionEvent;
  if (!event) return;
  const ids = getSelectionSelectedIds();
  const isRelease = event.trigger === 'release';
  const title = isRelease && event.month
    ? `選抜発表（${event.year}年${event.month}月発売）`
    : '選抜・センターを変更';

  const centerOptions = [...ids].map(id => idolRoster.find(member => member.id === id)).filter(Boolean);
  const centerMember = centerOptions.find(member => member.id === event.centerId);
  const centerRow = centerOptions.length
    ? `<div class="selection-center">
        <div class="selection-subtitle">センターを選ぶ<small>選抜の中から1名</small></div>
        <div class="selection-center-list">
          ${centerOptions.map(member => `
            <button type="button" class="selection-center-btn${member.id === event.centerId ? ' active' : ''}"
              onclick="setSelectionCenter(${member.id})">
              ${escapeHtml(formatMemberDisplayName(member))}
              <small>総評${calculateSingleOverall(member.stats)} / 人気${member.stats.popularity || 0}</small>
            </button>
          `).join('')}
        </div>
      </div>`
    : '';

  const memberRows = sortSelectionMembers(idolRoster).map(member => {
    const overall = calculateSingleOverall(member.stats);
    const rInfo = getRankData(overall);
    const selected = ids.has(member.id);
    return `
      <button type="button" class="selection-member${selected ? ' selected' : ''}" data-member-id="${member.id}"
        onclick="toggleSelectionMember(${member.id})">
        <span class="selection-check">${selected ? '✓' : ''}</span>
        <span class="selection-name">${escapeHtml(formatMemberDisplayName(member))}${member.isCenter ? '<i class="selection-crown">C</i>' : ''}</span>
        <span class="selection-meta">${member.age}歳 / 体力${member.staminaValue}${member.injury ? ` / ${escapeHtml(member.injury.type)} ${escapeHtml(formatInjuryWeeks(member.injury))}` : ''}</span>
        <span class="selection-score" style="color:${rInfo.color};">${overall}</span>
      </button>
    `;
  }).join('');

  const confirmDisabled = ids.size < MIN_SELECTION_SIZE ? 'disabled' : '';
  const activeSortKey = event.sortKey || '';
  const sortBar = `
    <div class="draft-sort-bar">
      <span class="draft-sort-label">並び替え</span>
      ${SELECTION_SORT_KEYS.map(key => {
        const active = activeSortKey === key.id;
        const arrow = active ? (event.sortDesc === false ? '（昇順）' : '（降順）') : '';
        return `<button type="button" class="draft-sort-btn${active ? ' active' : ''}" onclick="setSelectionSort('${key.id}')">${escapeHtml(key.name)}${arrow}</button>`;
      }).join('')}
    </div>`;
  document.getElementById('selection-modal').innerHTML = `
    <div class="modal-content">
      <h3 class="page-title" style="margin-top:0;">${escapeHtml(title)}</h3>
      <p style="font-size:11px; color:#666; line-height:1.6;">
        グループ成績・売上・ファン数・レッスン経験値のすべてに反映されます。チェックしたメンバーが選抜になり、選抜の中からセンターを1名選んでください。
      </p>
      <div class="selection-summary">
        選抜 <strong>${ids.size}</strong> / ${idolRoster.length}名
        <span class="selection-summary-center">センター: <strong>${escapeHtml(centerMember ? formatMemberDisplayName(centerMember) : '未選択')}</strong></span>
      </div>
      ${sortBar}
      <div class="selection-grid">${memberRows}</div>
      ${centerRow}
      <div class="actions" style="flex-direction:row; gap:6px; margin-top:12px;">
        <button class="danger-btn" style="flex:1; padding:10px;" onclick="cancelSelection()">やめる</button>
        <button class="main-btn" style="flex:2;" onclick="confirmSelection()" ${confirmDisabled}>この内容で決定</button>
      </div>
    </div>
  `;
}

function openSelectionModal() {
  if (!pendingSelectionEvent) return;
  renderSelectionModal();
  document.getElementById('selection-modal').style.display = 'flex';
}

function openMusicOfferModal() {
  const rows = document.getElementById('music-offer-rows');
  rows.innerHTML = pendingPerformanceOffers.map(offer => {
    const songOptions = songs.map(song => {
      const selected = song.id === offer.songId ? 'selected' : '';
      const status = song.released ? '' : '（発売前）';
      return `<option value="${song.id}" ${selected}>${escapeHtml(song.title)} Lv.${song.level}${status}</option>`;
    }).join('');
    const airDateLabel = offer.airDate
      ? getGameDateObject(offer.airDate).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) + (offer.extraNextDay ? '〜1/1' : '')
      : `${offer.airYear}年${offer.airMonth}月`;
    const effectLabel = offer.isSpecial
      ? `人気 +${REGULAR_PROGRAM_POPULARITY * (offer.popularityMultiplier || 4)} / 出演料 ${formatMoney(offer.appearanceFee || 3000000)}`
      : `人気 +${REGULAR_PROGRAM_POPULARITY} / 出演料 ${formatMoney(REGULAR_PROGRAM_APPEARANCE_FEE)}`;
    return `
      <div class="offer-row${offer.isSpecial ? ' offer-special' : ''}">
        <strong>${escapeHtml(airDateLabel)}放送：${escapeHtml(offer.name)}${offer.isSpecial ? '【大型特番】' : ''}</strong>
        <div class="offer-effect">${escapeHtml(effectLabel)}</div>
        <select id="offer-response-${offer.id}" aria-label="${offer.name}への出演">
          <option value="accept">出演する</option>
          <option value="decline">辞退する</option>
        </select>
        <select id="offer-song-${offer.id}" aria-label="${offer.name}で披露する楽曲">
          <option value="">披露曲を選択</option>
          ${songOptions}
        </select>
      </div>
    `;
  }).join('');
  document.getElementById('music-offer-modal').style.display = 'flex';
}

function resolveMusicOffers() {
  const accepted = [];
  for (const offer of pendingPerformanceOffers) {
    const response = document.getElementById(`offer-response-${offer.id}`).value;
    if (response !== 'accept') continue;

    const songId = document.getElementById(`offer-song-${offer.id}`).value;
    if (!songId) {
      alert(`${offer.name}で披露する楽曲を選んでください。`);
      return;
    }
    accepted.push({ ...offer, songId });
  }

  scheduledPerformances.push(...accepted);
  // 年越しSP（12/31〜1/1）は2日分の出演として登録する
  accepted.filter(offer => offer.extraNextDay && offer.airDate).forEach(offer => {
    const nextDay = getGameDateObject(offer.airDate);
    nextDay.setDate(nextDay.getDate() + 1);
    scheduledPerformances.push({
      ...offer,
      id: `${offer.id}-day2`,
      airDate: toDateKey(nextDay),
      airYear: currentYear + nextDay.getFullYear() - calendarYear,
      airMonth: nextDay.getMonth() + 1
    });
  });
  const declinedCount = pendingPerformanceOffers.length - accepted.length;
  pendingPerformanceOffers = [];
  document.getElementById('music-offer-modal').style.display = 'none';
  setLog(accepted.length
    ? `【出演決定】${accepted.length}番組への出演を決定しました。${declinedCount ? ` ${declinedCount}件は辞退しました。` : ''}`
    : '【出演辞退】今回の出演打診をすべて辞退しました。');
  updateUI();
}

// 年末アワード
function executeYearEndAwards() {
  const pTeam = leagueTeams.find(t => t.id === 'player');
  pTeam.sales = yearlyStats.sales;
  pTeam.audience = yearlyStats.audience;

  const sortedForKohaku = [...leagueTeams].sort((a, b) => ((b.sales * 0.6) + (b.audience * 0.4)) - ((a.sales * 0.6) + (a.audience * 0.4)));
  const sortedByAudience = [...leagueTeams].sort((a, b) => b.audience - a.audience);

  const k1 = sortedForKohaku[0];
  const k2 = sortedForKohaku[1];
  const inKohaku = (k1.id === 'player' || k2.id === 'player');
  const isCdTop = (yearlyStats.sales >= 3000000 && sortedByAudience[0].id === 'player');

  let report = `===== 【${currentYear}年 年末アワード】 =====\n`;
  report += `◆ 赤白歌合戦（${KOHAKU_DATE.month}/${KOHAKU_DATE.day} 放送・上位2枠）: 1位 ${k1.name} / 2位 ${k2.name}\n`;
  report += inKohaku ? " ★自グループが赤白歌合戦へ出場決定！\n" : " ×赤白出場を逃しました…\n";
  report += `\n◆ 日本CD大賞（${AWARD_DATE.month}/${AWARD_DATE.day} 発表）: 売上300万枚(${yearlyStats.sales >= 3000000 ? '達成' : '未達'}) ＆ 動員1位(${sortedByAudience[0].id === 'player' ? '獲得' : '逃す'})\n`;
  report += `\n◆ 年間給与: ${formatMoney(yearlyStats.salary || 0)}\n`;
  if (isCdTop) {
    report += " ★★★ 栄冠！ 年間売上300万枚＆動員1位で【CD大賞】を受賞しました！ ★★★\n";
    funds += 50000000;
  }
  if (inKohaku) adjustTargetPopularity(Math.round(REGULAR_PROGRAM_POPULARITY * 3));
  alert(report);
}

// 加齢と卒業・慰留
function processYearEndAgingAndGraduation() {
  idolRoster.forEach(m => { m.yearsActive++; });
  const remaining = [];
  let graduatedCount = 0;

  for (let m of idolRoster) {
    let graduate = false;
    if (m.age >= 22) {
      let chance = (m.age - 21) * 0.08;
      if (m.joinAge <= 15 && m.yearsActive >= 7) chance += 0.20;
      if (m.age >= 30) chance = 1.0;

      if (Math.random() < chance) {
        if (m.retainedCount >= 2 || m.age >= 31) {
          alert(`【卒業】${m.name}（${m.age}歳）が活動をやり切り、グループを卒業しました。`);
          graduate = true;
        } else {
          const nextCount = m.retainedCount + 1;
          const rateTxt = (nextCount === 1) ? "100%" : "50%";
          const regularVenueName = productionSchedule[`${currentYear}-${currentMonth}`]?.liveVenue;
          const regularVenue = VENUE_DATA.find(venue => venue.name === regularVenueName);
          const venueNotice = regularVenue
            ? `\n常設ライブ会場: ${regularVenue.name}（セレモニー利用料 ${formatMoney(CAPACITY_MAP[regularVenue.cap] * 500)} / コンサート利用料 ${formatMoney(CAPACITY_MAP[regularVenue.cap] * 2500)}）`
            : "\n会場を使う場合は会場を選択します。利用料は収容人数に比例します。";
          let choice = Number.parseInt(prompt(
            `【卒業打診】${m.name}（${m.age}歳 / 在籍${m.yearsActive}年）\n1: 慰留する（成功率 ${rateTxt}）\n2: 卒業を承認し、常設ライブ内でセレモニー\n3: 常設ライブに卒業コンサートを追加\n4: 単独の卒業コンサート\n5: 卒業グッズを制作${venueNotice}\n番号を選んでください。`,
            "1"
          ) || "1", 10);
          if (!Number.isInteger(choice) || choice < 1 || choice > 5) choice = 1;

          if (choice === 1) {
            if (nextCount === 1) {
              m.retainedCount = 1;
              alert(`【慰留成功】${m.name}はもう1年残留してくれることになりました。`);
            } else {
              m.retainedCount = 2;
              if (Math.random() < 0.5) {
                alert(`【慰留成功(50%)】説得が通じ、${m.name}は残留を決めました！`);
              } else {
                alert(`【慰留失敗(50%)】本人の意志は固く、${m.name}の卒業が決まりました。`);
                graduate = true;
                choice = promptGraduationPlan(m);
              }
            }
          } else {
            graduate = true;
          }

          if (graduate) runGraduationPlan(m, choice, regularVenueName);
        }
      }
    }

    if (!graduate) {
      remaining.push(m);
    } else {
      graduatedCount += 1;
    }
  }

  idolRoster = remaining;
  if (!idolRoster.some(m => m.isCenter) && idolRoster.length > 0) {
    idolRoster[0].isCenter = true;
  }
  // 卒業で選抜が欠けた場合は編成を見直す
  if (graduatedCount > 0) unlockSelection('メンバーの卒業');
}

function promptGraduationPlan(member) {
  const choice = Number.parseInt(prompt(
    `【卒業プラン】${member.name}の卒業方法を選んでください。\n2: 常設ライブ内でセレモニー\n3: 常設ライブに卒業コンサートを追加\n4: 単独の卒業コンサート\n5: 卒業グッズを制作`,
    "2"
  ) || "2", 10);
  return Number.isInteger(choice) && choice >= 2 && choice <= 5 ? choice : 2;
}

function selectGraduationVenue(feeRate) {
  const defaultIndex = Math.max(0, VENUE_DATA.findIndex(venue => venue.name === '原宿体育館'));
  const venueOptions = VENUE_DATA.map((venue, index) =>
    `${index + 1}: ${venue.name}（${venue.cap} / 利用料 ${formatMoney(CAPACITY_MAP[venue.cap] * feeRate)}）`
  ).join('\n');
  const selected = Number.parseInt(prompt(`会場を選んでください。\n${venueOptions}`, String(defaultIndex + 1)) || String(defaultIndex + 1), 10);
  const index = Number.isInteger(selected) ? Math.max(0, Math.min(VENUE_DATA.length - 1, selected - 1)) : defaultIndex;
  return VENUE_DATA[index];
}

function runGraduationPlan(member, choice, regularVenueName) {
  if (choice === 5) {
    const copies = Math.max(1, Math.floor(calculateMemberFans(member) * 0.1));
    const revenue = copies * 3000;
    const productionCost = copies * 1200 + 500000;
    const profit = revenue - productionCost;
    funds += profit;
    setLog(`【卒業グッズ】${member.name}のグッズを${copies.toLocaleString()}個制作（収支: ${profit > 0 ? '+' : ''}${formatMoney(profit)}）。`);
    return;
  }

  const isCeremony = choice === 2;
  const isAttached = choice === 2 || choice === 3;
  const feeRate = isCeremony ? 500 : 2500;
  let venue = isAttached ? VENUE_DATA.find(item => item.name === regularVenueName) : null;
  if (!venue) venue = selectGraduationVenue(feeRate);

  const capacity = CAPACITY_MAP[venue.cap];
  const venueFee = Math.floor(capacity * feeRate);
  if (isCeremony) {
    funds -= venueFee;
    setLog(`【卒業セレモニー】${member.name}を常設ライブ内で送り出しました（${venue.name} / 会場利用料 ${formatMoney(venueFee)}）。`);
    return;
  }

  // 卒コンは曜日関係なく0.95で計算する
  const audience = Math.min(capacity, Math.floor(
    getLiveAudienceDemand(venue, getGameDateObject(), GRADUATION_LIVE_RATE)
  ));
  const revenue = audience * 8000;
  const profit = revenue - venueFee;
  funds += profit;
  yearlyStats.audience += audience;
  const eventName = choice === 3 ? '常設ライブ追加の卒業コンサート' : '単独卒業コンサート';
  setLog(`【${eventName}】${member.name}（${venue.name} / 動員 ${audience.toLocaleString()}人 / 会場利用料 ${formatMoney(venueFee)} / 収支 ${profit > 0 ? '+' : ''}${formatMoney(profit)}）。`);
}

// ドラフト会議
// ==========================================
// ドラフト会議（逆ウェーバー方式）
// ==========================================
// 指名パネルの並び替え項目（5項目）
const DRAFT_SORT_KEYS = [
  { id: 'overall', name: '総評', get: member => calculateSingleOverall(member.stats) },
  { id: 'popularity', name: '人気', get: member => member.stats.popularity || 0 },
  { id: 'style', name: 'スタイル', get: member => member.stats.style || 0 },
  { id: 'fashion', name: 'ファッション', get: member => member.stats.fashion || 0 },
  { id: 'vocal', name: '歌唱力', get: member => member.stats.vocal || 0 }
];
const DRAFT_LIST_PAGE_SIZE = 8;
// 1位指名で他チームと重複する確率
const DRAFT_TOP_OVERLAP_RATE = 0.45;
// くじ引きで各チームが獲得できる確率（順位が下がるほど低下）
const DRAFT_LOTTERY_FIRST_CHANCE = 0.6;
const DRAFT_LOTTERY_CHANCE_STEP = 0.4;
// 回転パネルの回転回数（見た目だけ。実際の結果は先に確定している）
const DRAFT_ROULETTE_SPINS = 14;
// 回転パネルに並べるチーム名（所属グループ名）

let draftState = null;

// ==========================================
// 1巡目：全チームの指名確定 → 回転パネル → くじ引き
// ==========================================
// 回転パネルに並べるグループ名（ドラフト参加チーム）
function getDraftRouletteNames() {
  const state = draftState;
  if (!state) return [];
  return (state.pickOrder || []).map(team => team.name);
}

// 1巡目の候補者を1名決めておく（回転パネルで開ける氏名を先に確定する）
function prepareFirstRoundCandidate() {
  const state = draftState;
  if (!state) return null;
  const pool = getDraftPool();
  if (!pool.length) return null;
  // 総評の高い順に並べ、その上からランダムに候補者を1名決める
  const ranked = [...pool].sort(
    (a, b) => calculateSingleOverall(b.stats) - calculateSingleOverall(a.stats)
  );
  const top = ranked.slice(0, Math.min(10, ranked.length));
  const picked = top[Math.floor(Math.random() * top.length)];
  state.firstRoundMember = picked;
  return picked;
}

// 1巡目の開始：全チームの指名を先に確定させ、回転パネルへ進む
function startFirstRoundSequence() {
  const state = draftState;
  if (!state || state.round !== 1 || state.firstRoundResolved) return;
  // 先に他チーム全ての1巡目の指名を確定させる
  recordRivalPicks(state);
  state.firstRoundResolved = true;
  prepareFirstRoundCandidate();
  state.phase = state.firstRoundMember ? 'roulette' : 'picking';
}

// 回転パネル：参加グループの名前を並べる
function renderDraftRouletteStep() {
  const state = draftState;
  const names = getDraftRouletteNames();
  const member = state.firstRoundMember;
  const rivalPicks = (state.pickLog || []).filter(entry => !entry.isPlayer);
    '1巡目の指名です。他グループも同時に指名を終えました。指名が重複するかどうかはくじで決めます。';

  document.getElementById('draft-standings').innerHTML = renderDraftStandings();
  document.getElementById('draft-body').innerHTML = `
    <div class="draft-roulette">
      <div class="draft-roulette-label">１巡目　指名パネル</div>
      <div class="draft-roulette-window${state.spinning ? ' is-spinning' : ''}">
        ${names.map(name => `<span class="draft-roulette-chip${state.spinning ? '' : ' is-open'}">${escapeHtml(name)}</span>`).join('')}
      </div>
      ${state.spinning ? `
        <div class="draft-note">パネルが回転しています…</div>
      ` : `
        <div class="draft-reveal">
          <div class="draft-reveal-label">開いた候補者</div>
          <div class="draft-reveal-name">${escapeHtml(member ? member.name : '---')}</div>
          ${member ? `<div class="draft-reveal-meta">${member.age}歳 / ${formatHeight(member.height)} / 総評${calculateSingleOverall(member.stats)}</div>` : ''}
        </div>
        <div class="draft-note">他の${rivalPicks.length}件の指名は既に確定しています。この候補者が他チームと重複したら、くじを引き続けます。</div>
        <button class="main-btn" type="button" onclick="startDraftLotteryChoice()">くじを引く</button>
      `}
    </div>`;
  document.getElementById('draft-actions').innerHTML = state.spinning
    ? '<div class="draft-progress">パネル回転中…</div>'
    : '<button class="main-btn" type="button" onclick="spinDraftRoulette()">パネルを回す</button>';
}

// 回転パネルを回してから氏名がオープンされる
function spinDraftRoulette() {
  const state = draftState;
  if (!state || state.phase !== 'roulette' || state.spinning) return;
  state.spinning = true;
  renderDraftRouletteStep();
  // 表示の後、回転を止めて氏名をオープンする
  setTimeout(() => {
    if (!draftState || draftState.phase !== 'roulette') return;
    draftState.spinning = false;
    renderDraftRouletteStep();
  }, 1200);
}

// くじを引く段階へ進む（重複しなかった場合はそのまま指名）
function startDraftLotteryChoice() {
  const state = draftState;
  if (!state || state.phase !== 'roulette') return;
  const member = state.firstRoundMember;
  if (!member) {
    state.phase = 'picking';
    openDraftModal();
    return;
  }
  // 開いた候補者をプールから外す（この指名枠を確定させる）
  const pool = getDraftPool();
  const index = pool.findIndex(entry => entry.id === member.id);
  if (index >= 0) pool.splice(index, 1);

  // 他チームと重複しなければそのまま獲得
  if (!rollDraftTopConflict()) {
    draftSignMember(member);
    recordDraftPickLog(state, state.playerTeam, member, false);
    advanceDraftRound();
    return;
  }
  // 重複する場合はくじ引きモードへ
  state.phase = 'lottery';
  state.lottery = {
    member,
    order: buildDraftLotteryOrder(),
    index: 0,
    done: false,
    winner: null,
    keepRound: true
  };
  openDraftModal();
}

function getPlayerTeamOverall() {
  return calculateTeamAverages().overall;
}

// 前回ドラフト時点のグループ総合値で順位付けし、弱い方から指名順を決める
function buildDraftStandings() {
  const teams = leagueTeams.map(team => ({
    id: team.id,
    name: team.name,
    isPlayer: team.id === 'player',
    overall: team.id === 'player' ? getPlayerTeamOverall() : (team.basePower || 0)
  }));
  const ranked = [...teams].sort((a, b) => b.overall - a.overall);
  ranked.forEach((team, index) => { team.rank = index + 1; });
  // 逆ウェーバー：下位（rank が大きい順）から指名を回す
  const pickOrder = [...ranked].sort((a, b) => b.rank - a.rank);
  return { ranked, pickOrder };
}

function getDraftRivalNames(excludeCount) {
  return buildDraftStandings().ranked
    .filter(team => !team.isPlayer)
    .slice(0, excludeCount)
    .map(team => team.name);
}

// 参加グループ1つあたり20名の候補者を生成するプール
const DRAFT_CANDIDATES_PER_TEAM = 20;
const DRAFT_MIN_AGE = 14;
const DRAFT_MAX_AGE = 20;

function getDraftTeamCount() {
  return Math.max(1, leagueTeams.length);
}

// ドラフト開始時点の年齢が14〜20歳になる生年を引く
function pickDraftBirthYear() {
  const today = getGameDateObject();
  const age = DRAFT_MIN_AGE + Math.floor(Math.random() * (DRAFT_MAX_AGE - DRAFT_MIN_AGE + 1));
  const birthYear = today.getFullYear() - age;
  return birthYear;
}

// 生年から年齢を計算する（2月29日生まれは平年では3月1日を満年齢の基準日とする）
function calculateAgeFromBirth(birthYear, onDate, birthdayMonth, birthdayDay) {
  const year = onDate.getFullYear();
  const birthday = getBirthdayDate(year, birthdayMonth || 1, birthdayDay || 1);
  const age = year - birthYear;
  return onDate.getTime() >= birthday.getTime() ? age : age - 1;
}


// 参加グループ1つあたり20名分の候補者を一度に生成する
function buildDraftCandidatePool() {
  const total = getDraftTeamCount() * DRAFT_CANDIDATES_PER_TEAM;
  const policies = ['vocal', 'dance', 'talk', 'variety', null];
  const usedNames = new Set(idolRoster.map(member => member.name));
  const pool = [];
  const today = getGameDateObject();
  let guard = 0;
  while (pool.length < total && guard < total * 30) {
    guard++;
    const birthYear = pickDraftBirthYear();
    const member = createMember(0, policies[pool.length % policies.length], birthYear);
    // 開始日時点で14〜20歳になる生年だけを採用する
    // 誕生日ごとに年齢を計算し、開始日時点で14〜20歳になる組だけを採用する
    const ageNow = calculateAgeFromBirth(birthYear, today, member.birthdayMonth, member.birthdayDay);
    if (ageNow < DRAFT_MIN_AGE || ageNow > DRAFT_MAX_AGE) continue;
    member.age = ageNow;
    member.joinAge = ageNow;
    if (usedNames.has(member.name)) continue;
    usedNames.add(member.name);
    member.isDraftCandidate = true;
    pool.push(member);
  }
  return pool;
}


function startDraftMeeting() {
  draftCount++;
  if (draftCount % 2 === 0) {
    leagueTeams.push({
      id: createRivalTeamId(),
      name: generateRivalGroupName(leagueTeams.map(team => team.name)),
      sales: 0,
      audience: 0,
      basePower: 75 + Math.floor(Math.random() * 12)
    });
  }
  const { ranked, pickOrder } = buildDraftStandings();
  const playerTeam = ranked.find(team => team.isPlayer);
  const playerRank = pickOrder.findIndex(team => team.isPlayer) + 1;
  draftState = {
    round: 1,
    acquired: [],
    ranked,
    pickOrder,
    playerRank,
    playerTeam,
    page: 0,
    pickLog: [],
    lostCount: 0,
    phase: 'picking'
  };
  openDraftModal();
}

function openDraftModal() {
  if (!draftState) return;
  const state = draftState;
  // 練習モードはタイトルで明示する（本番ドラフトと混同しないため）
  const roundLabel = state.isPractice ? '練習' : `第${draftCount}回`;
  document.getElementById('draft-title').textContent =
    state.phase === 'done' ? `ドラフト会議 结果（${roundLabel}）` : `ドラフト会議（${roundLabel}）`;
  const notice = document.getElementById('draft-notice');
  if (notice) notice.textContent = state.isPractice ? '疑似体験：獲得した候補者は実際の名簿に入りません。' : '';
  // 1巡目は「全チームの指名確定 → 回転パネル」の順に進める
  startFirstRoundSequence();

  if (state.phase === 'roulette') renderDraftRouletteStep();
  else if (state.phase === 'picking') renderDraftPickStep();
  else if (state.phase === 'lottery') renderDraftLotteryStep();
  else renderDraftDoneStep();

  document.getElementById('draft-modal').style.display = 'flex';
}

// 疑似体験（練習モード）のドラフト会議を起動する
// 実際の名簿・リーグ構成・開催回数には一切影響しない
function startPracticeDraft() {
  if (draftState) return;
  const { ranked, pickOrder } = buildDraftStandings();
  const playerTeam = ranked.find(team => team.isPlayer);
  const playerRank = pickOrder.findIndex(team => team.isPlayer) + 1;
  draftState = {
    round: 1,
    acquired: [],
    ranked,
    pickOrder,
    playerRank,
    playerTeam,
    isPractice: true,
    page: 0,
    pickLog: [],
    lostCount: 0,
    phase: 'picking'
  };
  openDraftModal();
}

// ドラフト経験の入口（記録タブのボタンから呼ぶ）
function openDraftPractice() {
  if (draftState) {
    openDraftModal();
    return;
  }
  startPracticeDraft();
}

function renderDraftStandings() {
  const state = draftState;
  const rows = state.ranked.map(team => `
    <div class="draft-standing-row${team.isPlayer ? ' player' : ''}">
      <span class="draft-stand-rank">${team.rank}</span>
      <span class="draft-stand-name">${escapeHtml(team.name)}${team.isPlayer ? '（自グループ）' : ''}</span>
      <span class="draft-stand-power">${team.overall}</span>
      <span class="draft-stand-pick">${state.pickOrder.findIndex(t => t.id === team.id) + 1}位</span>
    </div>`).join('');
  return `<div class="draft-standings">${rows}</div>`;
}

// 名簿プールの参照（指名候補はここで生成し、以後は並び替えのみ行う）
function getDraftPool() {
  const state = draftState;
  if (!state) return [];
  if (!state.pool) state.pool = buildDraftCandidatePool();
  return state.pool;
}

// 候補者を指定の項目で並べ替える（元の追加を保持したまま、見た目だけ並べる）
function sortDraftCandidates(pool, sortKey, sortDesc) {
  const key = DRAFT_SORT_KEYS.find(entry => entry.id === sortKey) || DRAFT_SORT_KEYS[0];
  const dir = sortDesc ? -1 : 1;
  return pool
    .map((member, index) => ({ member, index }))
    .sort((a, b) => {
      const diff = (key.get(a.member) - key.get(b.member)) * dir;
      // 同じ値なら名前順にして、並びが毎回入れ替わらないようにする
      return diff !== 0 ? diff : a.member.name.localeCompare(b.member.name, 'ja');
    });
}

// 並び替え項目を選ぶ（同じ項目を再押すと昇順／降順が反転する）
function setDraftSort(sortKey) {
  const state = draftState;
  if (!state || state.phase !== 'picking') return;
  if (!DRAFT_SORT_KEYS.some(entry => entry.id === sortKey)) return;
  if (state.sortKey === sortKey) state.sortDesc = !state.sortDesc;
  else {
    state.sortKey = sortKey;
    state.sortDesc = true;
  }
  state.page = 0;
  renderDraftPickStep();
}

// 並び替えボタン（5項目）
function renderDraftSortBar() {
  const state = draftState;
  const active = state.sortKey || DRAFT_SORT_KEYS[0].id;
  return `
    <div class="draft-sort-bar">
      <span class="draft-sort-label">並び替え</span>
      ${DRAFT_SORT_KEYS.map(key => {
        const isActive = active === key.id;
        const arrow = isActive ? (state.sortDesc === false ? '（昇順）' : '（降順）') : '';
        return `<button type="button" class="draft-sort-btn${isActive ? ' active' : ''}" onclick="setDraftSort('${key.id}')">${escapeHtml(key.name)}${arrow}</button>`;
      }).join('')}
    </div>`;
}

// 指名済みリスト（このドラフトで既に獲得した候補者）
function renderDraftAcquiredList() {
  const state = draftState;
  const acquired = state.acquired || [];
  if (!acquired.length) {
    return '<div class="draft-acquired-list is-empty">指名済みの人はまだいません</div>';
  }
  return `
    <div class="draft-acquired-list">
      <div class="draft-acquired-head">指名済み（${acquired.length}名）</div>
      <div class="draft-acquired-tags">
        ${acquired.map(member => `<span>${escapeHtml(member.name)}（${member.age}歳 / 総評${calculateSingleOverall(member.stats)}）</span>`).join('')}
      </div>
    </div>`;
}

// 指名パネル：指名状況と他チームの指名履歴を揃えて、候補者リストを並べ替え・ページ送りで閲覧する
function renderDraftPickStep() {
  const state = draftState;
  const pool = getDraftPool();
  if (!pool.length) {
    finishDraft();
    return;
  }
  const size = DRAFT_LIST_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(pool.length / size));
  const page = Math.min(Math.max(0, state.page || 0), totalPages - 1);
  state.page = page;
  const sortKey = state.sortKey || DRAFT_SORT_KEYS[0].id;
  const sortDesc = state.sortDesc !== false;
  const ordered = sortDraftCandidates(pool, sortKey, sortDesc);
  const rows = ordered.slice(page * size, page * size + size);
  const isTopRound = state.round === 1 && !state.lostCount;
  const lost = state.lostCount || 0;
  const rivalTotal = (state.pickLog || []).filter(entry => !entry.isPlayer).length;
  const conflictRivals = isTopRound ? getDraftRivalNames(3) : [];

  // 現在の状況を一言で示す（レイアウトの案内）
  const statusLines = [];
  statusLines.push(`${state.round}巡目・あなたの指名枠`);
  statusLines.push(`獲得 ${state.acquired.length} 名`);
  statusLines.push(`他チームの指名 ${rivalTotal} 件`);
  if (lost) statusLines.push(`くじ落選 ${lost} 回（同じ指名枠で再指名できます）`);

  const conflictNote = isTopRound
    ? `<div class="draft-note">1巡目の指名は他のグループも注目しています。指名した候補者が重複するとくじ引きになります。</div>`
    : '';

  document.getElementById('draft-intro').textContent = isTopRound
    ? `1位指名です。他グループも注目している可能性があり、名指しした候補者は重複する可能性があります。${conflictRivals.length ? `（${conflictRivals.join('、')}が注目）` : ''}`
    : `${state.round}位指名。候補者リストから 1 名を選んでください。${lost ? `（くじを引き落とした回数：${lost}回。同じ指名枠で続けて指名できます）` : ''}`;

  document.getElementById('draft-standings').innerHTML = renderDraftStandings();
  document.getElementById('draft-body').innerHTML = `
    <div class="draft-status">
      ${statusLines.map(text => `<span>${escapeHtml(text)}</span>`).join('')}
    </div>
    ${conflictNote}
    ${renderDraftAcquiredList()}
    ${renderDraftPickLog()}
    ${renderDraftSortBar()}
    <div class="draft-list-head">
      <span>候補者 ${pool.length}名</span>
      <span>${page + 1} / ${totalPages} ページ</span>
    </div>
    <div class="draft-candidates">
      ${rows.map(row => {
        const member = row.member;
        return `
          <button class="draft-candidate" type="button" onclick="resolveDraftPick(${row.index})">
            <div class="draft-candidate-name">${escapeHtml(member.name)} <small>${member.age}歳 / ${formatHeight(member.height)}（${member.birthYear}年${member.birthdayMonth}月${member.birthdayDay}日生）</small></div>
            <div class="draft-candidate-score">総評 ${calculateSingleOverall(member.stats)}</div>
            <div class="draft-candidate-stats">
              ${STATUS_KEYS.slice(0, 4).map(key =>
                `<span>${key.name} ${member.stats[key.id] || 0}</span>`).join('')}
            </div>
          </button>`;
      }).join('')}
    </div>
    <div class="draft-pager">
      <button type="button" class="ghost-btn small" onclick="changeDraftPage(-1)" ${page === 0 ? 'disabled' : ''}>前へ</button>
      <button type="button" class="ghost-btn small" onclick="changeDraftPage(1)" ${page >= totalPages - 1 ? 'disabled' : ''}>次へ</button>
    </div>`;
  document.getElementById('draft-actions').innerHTML = `
    <div class="draft-progress">指名済み ${state.acquired.length} 名</div>
    <button class="main-btn" type="button" onclick="finishDraft()">ここまででドラフトを終了する</button>`;
}


// 他チームの指名履歴（巡ごとに下位のグループから指名している）
function renderDraftPickLog() {
  const state = draftState;
  const log = state.pickLog || [];
  if (!log.length) {
    return '<div class="draft-picklog is-empty">まだ他チームの指名はありません</div>';
  }
  const recent = log.slice(-12).reverse();
  return `
    <div class="draft-picklog">
      <div class="draft-picklog-head">指名履歴（直近12件）</div>
      ${recent.map(entry => `
        <div class="draft-picklog-row${entry.isPlayer ? ' is-player' : ''}">
          <span class="draft-picklog-round">${entry.round}巡</span>
          <span class="draft-picklog-team">${escapeHtml(entry.teamName)}</span>
          <span class="draft-picklog-member">${escapeHtml(entry.memberName)}（${entry.age}歳 / 総評${entry.overall}）</span>
          ${entry.viaLottery ? '<span class="draft-picklog-tag">くじ引き</span>' : ''}
        </div>`).join('')}
    </div>`;
}


// 候補者リストのページを送る
function changeDraftPage(delta) {
  const state = draftState;
  if (!state || state.phase !== 'picking') return;
  state.page = Math.max(0, (state.page || 0) + delta);
  renderDraftPickStep();
}

// 任意の人数で終了する（開始時に人数を絞り込ばない）
function finishDraft() {
  const state = draftState;
  if (!state) return;
  state.phase = 'done';
  openDraftModal();
}

// 1位指名のみ、他チームと重複する可能性がある
function rollDraftTopConflict() {
  return draftState.round === 1 && Math.random() < DRAFT_TOP_OVERLAP_RATE;
}

// くじを引く権利が回ってきたチームから順に回ります
function buildDraftLotteryOrder() {
  const state = draftState;
  const order = state.pickOrder || [];
  const startIndex = order.findIndex(team => team.isPlayer);
  if (startIndex < 0 || !order.length) return order.slice();
  const rotated = [];
  for (let i = 0; i < order.length; i++) rotated.push(order[(startIndex + i) % order.length]);
  return rotated;
}

function resolveDraftPick(candidateIndex) {
  const state = draftState;
  if (!state || state.phase !== 'picking') return;
  const pool = getDraftPool();
  const candidate = pool[candidateIndex];
  if (!candidate) return;

  if (rollDraftTopConflict()) {
    // 重複した場合はくじ引き画面に移り、回ってきたチームから順に引きます
    pool.splice(candidateIndex, 1);
    state.phase = 'lottery';
    state.lottery = {
      member: candidate,
      order: buildDraftLotteryOrder(),
      index: 0,
      done: false,
      winner: null,
      keepRound: true
    };
    openDraftModal();
    return;
  }
  pool.splice(candidateIndex, 1);
  draftSignMember(candidate);
  recordDraftPickLog(state, state.playerTeam, candidate, false);
  advanceDraftRound();
}

function draftSignMember(member) {
  member.isDraftCandidate = false;
  // 疑似体験では実際の名簿に加えない
  if (!draftState || !draftState.isPractice) idolRoster.push(member);
  if (draftState) draftState.acquired.push(member);
}

// 指名履歴に 1 件追記する
function recordDraftPickLog(state, team, member, viaLottery) {
  if (!state || !team || !member) return;
  if (!Array.isArray(state.pickLog)) state.pickLog = [];
  state.pickLog.push({
    round: state.round,
    teamId: team.id,
    teamName: team.name,
    isPlayer: Boolean(team.isPlayer),
    memberName: member.name,
    age: member.age,
    overall: calculateSingleOverall(member.stats),
    viaLottery: Boolean(viaLottery)
  });
}

// 同じ巡のうちに他チームも指名し、その履歴を残す
function recordRivalPicks(state) {
  const pool = getDraftPool();
  const order = state.pickOrder || [];
  order.forEach(team => {
    if (team.isPlayer || !pool.length) return;
    const index = Math.floor(Math.random() * pool.length);
    const member = pool.splice(index, 1)[0];
    recordDraftPickLog(state, team, member, false);
  });
}


// くじ引き画面：回ってきたチームが順に引く。結果を確定する
function renderDraftLotteryStep() {
  const state = draftState;
  const lottery = state.lottery;
  const member = lottery.member;
  document.getElementById('draft-intro').textContent =
    `同じ候補者をもっと指名しようとしました。${escapeHtml(member.name)}の争いで、回ってきたチームからくじ引きの権利が回ります。`;
  document.getElementById('draft-standings').innerHTML = renderDraftStandings();

  const rows = lottery.order.map((team, index) => {
    let label;
    if (index < lottery.index) label = '引き済み';
    else if (index === lottery.index && !lottery.done) label = 'このくじ';
    else if (lottery.done && lottery.winner === team) label = '獲得';
    else label = '待ち';
    // 「くじを選んで引く」形式：未引きのくじはどれでも選べる
    const pickable = !lottery.done && index >= lottery.index;
    return `
      <div class="draft-lottery-row${index === lottery.index && !lottery.done ? ' is-turn' : ''}${lottery.done && lottery.winner === team ? ' is-winner' : ''}">
        <span class="draft-lottery-no">${index + 1}</span>
        <span class="draft-lottery-name">${escapeHtml(team.name)}${team.isPlayer ? '（自グループ）' : ''}</span>
        <span class="draft-lottery-state">${label}</span>
        ${pickable
          ? `<button type="button" class="draft-lottery-btn" onclick="chooseDraftLottery(${index})">このくじを引く</button>`
          : ''}
      </div>`;
  }).join('');

  document.getElementById('draft-body').innerHTML = `
    <div class="draft-lottery-target">争いの候補：${escapeHtml(member.name)}（総評 ${calculateSingleOverall(member.stats)}）</div>
    <div class="draft-lottery-list">${rows}</div>
    ${lottery.done ? `
      <div class="draft-lottery ${lottery.winner && lottery.winner.isPlayer ? 'win' : 'lose'}">
        ${lottery.winner && lottery.winner.isPlayer
          ? `【獲得】${escapeHtml(lottery.winner.name)}が${escapeHtml(member.name)}を獲得しました。`
          : `【落選】${escapeHtml(lottery.winner ? lottery.winner.name : '他チーム')}が先に獲得しました。`}
      </div>` : ''}`;
  document.getElementById('draft-actions').innerHTML = lottery.done
    ? '<button class="main-btn" type="button" onclick="resolveDraftLottery()">結果を確認する</button>'
    : '<div class="draft-progress">くじを選んで引いてください</div>';
}

// 選んだくじを引く（「くじを選んで引く」形式）
// 選んだ位置より手前のくじは回り済みとして扱う（下位のチームほど確率が高い）
function chooseDraftLottery(lotteryIndex) {
  const state = draftState;
  if (!state || state.phase !== 'lottery' || state.lottery.done) return;
  const lottery = state.lottery;
  const index = Number(lotteryIndex);
  if (!Number.isInteger(index) || index < lottery.index || index >= lottery.order.length) return;
  lottery.index = index;
  const chance = Math.max(0.1, DRAFT_LOTTERY_FIRST_CHANCE - index * DRAFT_LOTTERY_CHANCE_STEP * 0.35);
  if (Math.random() < chance) {
    lottery.done = true;
    lottery.winner = lottery.order[index];
  }
  renderDraftLotteryStep();
}

// くじ引きを1チームだけ進める（順位が下がるほど確率が下がる）
function advanceDraftLottery() {
  const state = draftState;
  if (!state || state.phase !== 'lottery' || state.lottery.done) return;
  const lottery = state.lottery;
  lottery.index++;
  if (lottery.index >= lottery.order.length) {
    lottery.done = true;
    lottery.winner = lottery.order[lottery.order.length - 1];
  } else {
    const chance = Math.max(0.1, DRAFT_LOTTERY_FIRST_CHANCE - lottery.index * DRAFT_LOTTERY_CHANCE_STEP * 0.35);
    if (Math.random() < chance) {
      lottery.done = true;
      lottery.winner = lottery.order[lottery.index];
    }
  }
  renderDraftLotteryStep();
}

function resolveDraftLottery() {
  const state = draftState;
  if (!state || state.phase !== 'lottery') return;
  const lottery = state.lottery;
  const member = lottery.member;
  const winner = lottery.winner;
  const won = Boolean(winner && winner.isPlayer);

  if (won) {
    draftSignMember(member);
    recordDraftPickLog(state, state.playerTeam, member, true);
    advanceDraftRound();
    return;
  }

  // 落選：現実のドラフトと同じく、この指名枠はそのまま次の指名に使える
  recordDraftPickLog(state, winner, member, true);
  state.lottery = null;
  state.page = 0;
  if (getDraftPool().length) {
    state.phase = 'picking';
    state.lostCount = (state.lostCount || 0) + 1;
    openDraftModal();
  } else {
    state.phase = 'done';
    openDraftModal();
  }
}

function advanceDraftRound() {
  const state = draftState;
  // 同じ巡のうちに他チームも指名する（指名順は下位から上位）
  recordRivalPicks(state);
  state.round++;
  state.page = 0;
  state.phase = getDraftPool().length ? 'picking' : 'done';
  openDraftModal();
}


function renderDraftDoneStep() {
  const state = draftState;
  const total = state.acquired.length;
  document.getElementById('draft-intro').textContent =
    `ドラフトが終了しました。合計${total}名を獲得しました。`;
  document.getElementById('draft-standings').innerHTML = renderDraftStandings();
  document.getElementById('draft-body').innerHTML = `
    <div class="draft-acquired">
      ${state.acquired.map(member => `<span>${escapeHtml(member.name)}（${member.age}歳 / ${formatHeight(member.height)}）</span>`).join('')}
    </div>`;
  document.getElementById('draft-actions').innerHTML =
    '<button class="main-btn" type="button" onclick="closeDraftModal()">ドラフトを終了する</button>';
}

function closeDraftModal() {
  document.getElementById('draft-modal').style.display = 'none';
  const acquired = draftState ? draftState.acquired.length : 0;
  const wasPractice = Boolean(draftState && draftState.isPractice);
  draftState = null;
  if (wasPractice) {
    setLog(`【ドラフト・練習】${acquired}名の指名で疑似体験が終了しました（実際の名簿は変化していません）。`);
  } else if (acquired > 0) {
    setLog(`【ドラフト】新たに${acquired}名のメンバーが加入しました。`);
  }
  updateUI();
}
