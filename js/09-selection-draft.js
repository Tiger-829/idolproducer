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

  const memberRows = idolRoster.map(member => {
    const overall = calculateSingleOverall(member.stats);
    const rInfo = getRankData(overall);
    const selected = ids.has(member.id);
    return `
      <button type="button" class="selection-member${selected ? ' selected' : ''}"
        onclick="toggleSelectionMember(${member.id})">
        <span class="selection-check">${selected ? '✓' : ''}</span>
        <span class="selection-name">${escapeHtml(formatMemberDisplayName(member))}${member.isCenter ? '<i class="selection-crown">C</i>' : ''}</span>
        <span class="selection-meta">${member.age}歳 / 体力${member.staminaValue}${member.injury ? ` / ${escapeHtml(member.injury.type)}` : ''}</span>
        <span class="selection-score" style="color:${rInfo.color};">${overall}</span>
      </button>
    `;
  }).join('');

  const confirmDisabled = ids.size < MIN_SELECTION_SIZE ? 'disabled' : '';
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
const DRAFT_MIN_PICKS = 10;
const DRAFT_MAX_PICKS = 15;
const DRAFT_CANDIDATE_COUNT = 5;
// 1位指名で他チームと重複する確率
const DRAFT_TOP_OVERLAP_RATE = 0.45;

let draftState = null;

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
    pickTotal: DRAFT_MIN_PICKS,
    acquired: [],
    ranked,
    pickOrder,
    playerRank,
    playerTeam,
    phase: 'select-count'
  };
  openDraftModal();
}

function openDraftModal() {
  if (!draftState) return;
  const state = draftState;
  document.getElementById('draft-title').textContent =
    state.phase === 'done' ? 'ドラフト会議 结果' : `ドラフト会議（第${draftCount}回）`;

  if (state.phase === 'select-count') renderDraftCountStep();
  else if (state.phase === 'picking') renderDraftPickStep();
  else renderDraftDoneStep();

  document.getElementById('draft-modal').style.display = 'flex';
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

// 獲得人数（10〜15名）を選ぶ
function renderDraftCountStep() {
  const state = draftState;
  document.getElementById('draft-intro').textContent =
    `全国から13〜20歳の候補生が集結しました。前回ドラフト時点の総合値による順位は下表のとおりで、逆ウェーバー方式のため下位のグループから順に指名できます。あなたは${state.playerRank}位指名です。獲得する人数を選んでください。`;
  document.getElementById('draft-standings').innerHTML = renderDraftStandings();
  document.getElementById('draft-body').innerHTML = `
    <div style="font-size:11px; color:#555; margin-top:6px;">獲得人数</div>
    <div class="draft-pick-count" id="draft-count-picker">
      ${Array.from({ length: DRAFT_MAX_PICKS - DRAFT_MIN_PICKS + 1 }, (_, i) => {
        const count = DRAFT_MIN_PICKS + i;
        return `<button type="button" class="${count === state.pickTotal ? 'active' : ''}" onclick="setDraftPickTotal(${count})">${count}</button>`;
      }).join('')}
    </div>`;
  document.getElementById('draft-actions').innerHTML =
    '<button class="main-btn" type="button" onclick="beginDraftPicking()">ドラフトを開始する</button>';
}

function setDraftPickTotal(count) {
  if (!draftState) return;
  draftState.pickTotal = Math.max(DRAFT_MIN_PICKS, Math.min(DRAFT_MAX_PICKS, count));
  renderDraftCountStep();
}

function beginDraftPicking() {
  if (!draftState) return;
  draftState.phase = 'picking';
  draftState.round = 1;
  openDraftModal();
}

// プールから未指名の候補者を抽選して提示する
function getDraftCandidates() {
  if (!draftState) return [];
  if (!draftState.pool) draftState.pool = buildDraftCandidatePool();
  const picked = [];
  const pool = draftState.pool;
  const take = Math.min(DRAFT_CANDIDATE_COUNT, pool.length);
  for (let i = 0; i < take; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

// 1巡目は他チームと重複する可能性がある
function rollDraftTopConflict() {
  return draftState.round === 1 && Math.random() < DRAFT_TOP_OVERLAP_RATE;
}

function renderDraftPickStep() {
  const state = draftState;
  const candidates = state.candidates || (state.candidates = getDraftCandidates());
  const isTopRound = state.round === 1;
  const conflictRivals = isTopRound ? getDraftRivalNames(3) : [];

  document.getElementById('draft-intro').textContent = isTopRound
    ? `1位指名です。他グループもSetelah注目している可能性があり、候補者が重複する可能性があります。${conflictRivals.length ? `（${conflictRivals.join('、')}が注目）` : ''}`
    : `${state.round}位指名。候補生から1名を選んでください。`;

  document.getElementById('draft-standings').innerHTML = renderDraftStandings();
  document.getElementById('draft-body').innerHTML = `
    <div class="draft-candidates">
      ${candidates.map((member, index) => {
        const overall = calculateSingleOverall(member.stats);
        return `
          <button class="draft-candidate" type="button" onclick="resolveDraftPick(${index})">
            <div class="draft-candidate-name">${escapeHtml(member.name)} <small>${member.age}歳 / ${formatHeight(member.height)}（${member.birthYear}年${member.birthdayMonth}月${member.birthdayDay}日生）</small></div>
            <div class="draft-candidate-score">総評 ${overall}</div>
            <div class="draft-candidate-stats">
              ${STATUS_KEYS.slice(0, 4).map(key =>
                `<span>${key.name} ${member.stats[key.id] || 0}</span>`).join('')}
            </div>
          </button>`;
      }).join('')}
    </div>`;
  document.getElementById('draft-actions').innerHTML =
    `<div style="font-size:11px; color:#777; text-align:center;">${state.acquired.length} / ${state.pickTotal} 名獲得</div>`;
}

function resolveDraftPick(candidateIndex) {
  const state = draftState;
  if (!state || state.phase !== 'picking') return;
  const candidate = state.candidates[candidateIndex];
  if (!candidate) return;
  state.candidates = null;

  const isTopRound = state.round === 1;
  if (isTopRound && rollDraftTopConflict()) {
    // 1位指名のみ、他チームと重複して抽選になる
    const won = Math.random() < 0.6;
    state.phase = 'lottery';
    state.lottery = { member: candidate, won, rivals: getDraftRivalNames(3) };
    openDraftModal();
    return;
  }
  draftSignMember(candidate);
  advanceDraftRound();
}

function draftSignMember(member) {
  member.isDraftCandidate = false;
  idolRoster.push(member);
  if (draftState) draftState.acquired.push(member);
}

function renderDraftLotteryStep() {
  const state = draftState;
  const lottery = state.lottery;
  document.getElementById('draft-intro').textContent = '1位指名の重複抽選が発生しました。';
  document.getElementById('draft-standings').innerHTML = renderDraftStandings();
  document.getElementById('draft-body').innerHTML = `
    <div class="draft-lottery ${lottery.won ? 'win' : 'lose'}">
      ${lottery.won
        ? `【獲得】${escapeHtml(lottery.member.name)}を独占指名しました！`
        : `【落選】${lottery.rivals.join('、')}が先に獲得しました。外れ1位で別の有望株を獲得しました。`}
    </div>`;
  document.getElementById('draft-actions').innerHTML =
    '<button class="main-btn" type="button" onclick="resolveDraftLottery()">結果を確認する</button>';
}

function resolveDraftLottery() {
  const state = draftState;
  if (!state || state.phase !== 'lottery') return;
  if (state.lottery.won) {
    draftSignMember(state.lottery.member);
  } else {
    // 外れ1位：無指名でプールから有望株を1名獲得
    const consolation = getDraftCandidates()[0];
    if (consolation) {
      consolation.isDraftCandidate = false;
      idolRoster.push(consolation);
      state.acquired.push(consolation);
    }
  }
  state.lottery = null;
  advanceDraftRound();
}

function advanceDraftRound() {
  const state = draftState;
  state.round++;
  if (state.acquired.length >= state.pickTotal) {
    state.phase = 'done';
  } else {
    state.phase = 'picking';
  }
  openDraftModal();
}

function renderDraftDoneStep() {
  const state = draftState;
  const total = state.pickTotal;
  document.getElementById('draft-intro').textContent =
    `ドラフトが終了しました。目標だった${total}名に対し${state.acquired.length}名を獲得しました。`;
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
  draftState = null;
  if (acquired > 0) setLog(`【ドラフト】新たに${acquired}名のメンバーが加入しました。`);
  updateUI();
}
