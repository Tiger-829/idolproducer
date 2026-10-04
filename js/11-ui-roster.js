// ==========================================
// UI描画（編成・楽曲・updateUI）
// ==========================================
function updateUI() {
  document.getElementById('txt-year').textContent = currentYear;
  document.getElementById('txt-month').textContent = currentMonth;
  document.getElementById('txt-week').textContent = currentWeek;
  document.getElementById('txt-calendar-date').textContent = getGameDateObject().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  document.getElementById('txt-funds').textContent = formatMoney(funds);
  // 万円・億円表示のときは正確な円額を併記する
  document.getElementById('txt-funds-exact').textContent = Math.abs(funds) >= 100000
    ? `（${Math.round(funds).toLocaleString()}円）`
    : '';
  document.getElementById('txt-year-sales').textContent = `${yearlyStats.sales.toLocaleString()} 枚`;
  document.getElementById('txt-year-audience').textContent = `${yearlyStats.audience.toLocaleString()} 人`;
  const streamEl = document.getElementById('txt-year-stream');
  if (streamEl) {
    const net = (yearlyStats.streamRevenue || 0) - (yearlyStats.streamCost || 0);
    streamEl.textContent = `${formatMoney(net)}${yearlyStats.streamCost ? '（制作費込）' : ''}`;
  }
  document.getElementById('txt-roster-count').textContent = idolRoster.length;
  const selectedCountEl = document.getElementById('txt-selected-count');
  if (selectedCountEl) selectedCountEl.textContent = idolRoster.filter(member => member.isSelected).length;
  // 選抜が確定している間は変更ボタンを無効化する
  const selectionButton = document.getElementById('btn-selection-setup');
  if (selectionButton) {
    const locked = isSelectionLocked();
    selectionButton.disabled = locked;
    selectionButton.textContent = locked
      ? `選抜確定済み（${selectionLock.year}年${selectionLock.month}月）`
      : '選抜・センターを変更する';
    selectionButton.style.opacity = locked ? '0.6' : '1';
  }
  const groupFans = calculateGroupFans();
  // ファン数はヘッダー（年月日表示の下）に固定して、どの画面からでも参照できるようにする
  const fansEl = document.getElementById('txt-header-fans');
  fansEl.textContent = formatFanCount(groupFans);
  // 6桁以上は見単位が省略されるため、正確な人数をツールチップに出す
  fansEl.title = groupFans >= 100000 ? `${groupFans.toLocaleString()}人` : '';
  // ファン内訳（コア／ファン／ライト）をパーセントバーで可視化
  const fanTiers = getFanTiers();
  const tierEl = document.getElementById('txt-group-fan-tiers');
  if (tierEl) {
    const share = fanTiers.shares;
    const pct = value => Math.round(value * 100);
    // 実際の参加率（ライブ）を配分表から取る（ハードコード禁止）
    const liveRates = FAN_TIER_PARTICIPATION.live;
    const liveRate = getTierParticipationRate('live');
    const segs = [
      { key: 'core', name: 'コア', share: share.core, count: fanTiers.core, rate: liveRates.core },
      { key: 'fan', name: 'ファン', share: share.fan, count: fanTiers.fan, rate: liveRates.fan },
      { key: 'light', name: 'ライト', share: share.light, count: fanTiers.light, rate: liveRates.light },
    ];
    tierEl.innerHTML = `
      <div class="fan-share-bar" role="img" aria-label="${segs.map(s => `${s.name}${pct(s.share)}%`).join('、')}">
        ${segs.map(s => `<i class="fan-share-seg fan-share-${s.key}" style="width:${pct(s.share)}%"
          title="${s.name} ${pct(s.share)}\%（${formatFanCount(s.count)}）"></i>`).join('')}
      </div>
      <div class="fan-share-legend">
        ${segs.map(s => `<span class="fan-share-legend-item"><i class="fan-share-dot fan-share-${s.key}"></i>${s.name}${pct(s.share)}%</span>`).join('')}
      </div>
      <div class="fan-share-note">ライブ参加 ${(liveRate * 100).toFixed(1)}%（参加者 ${formatFanCount(getParticipatingFans('live'))}）</div>
    `;
    tierEl.title = segs.map(s =>
      `${s.name}：${pct(s.share)}%（${s.count.toLocaleString()}人）\n ライブ参加率 ${(s.rate * 100).toFixed(1)}% ／ イベント参加率 ${(FAN_TIER_PARTICIPATION.event[s.key] * 100).toFixed(1)}%`
    ).join('\n');
  }
  document.getElementById('txt-group-crisis').textContent = groupCrisis;
  document.getElementById('txt-effective-crisis').textContent = calculateGroupCrisisResilience();
  document.getElementById('txt-fanclub').textContent = fanClub
    ? `${FANCLUB_TIERS.find(t => t.id === fanClub.tierId)?.name || ''} ${formatMoney(fanClub.fee)}/月・${Number(fanClub.members).toLocaleString()}人`
    : '未設立';
  document.getElementById('goods-sales-stats').textContent =
    `グッズ在庫 ${merchandiseStock.toLocaleString()}個 / 累計販売 ${merchandiseUnitsSold.toLocaleString()}個 / 直近完売率 ${Number.isFinite(merchandiseSellThrough) ? `${Math.round(merchandiseSellThrough * 100)}%` : '実績なし'}`;

  const summary = calculateTeamAverages();
  document.getElementById('txt-center-name').textContent = summary.centerName;
  // アイドル力は体力値と総評の間に置く
  const idolPowerEl = document.getElementById('txt-team-idol-power');
  if (idolPowerEl) idolPowerEl.textContent = calculateTeamIdolPower();
  document.getElementById('team-overall-score').textContent = summary.overall;
  
  const badge = document.getElementById('team-rank-badge');
  badge.textContent = summary.rankData.rank;
  badge.style.color = summary.rankData.color;
  badge.style.backgroundColor = summary.rankData.bg;
  badge.style.border = `1px solid ${summary.rankData.color}`;

  const avgGrid = document.getElementById('team-avg-grid');
  avgGrid.innerHTML = '';
  STATUS_KEYS.forEach(k => {
    const val = summary.averages[k.id] || 0;
    // 内部計算は小数のまま（averages）、表示だけ整数に丸める
    const displayVal = Math.round(val);
    const rInfo = getRankData(displayVal);
    avgGrid.innerHTML += `
      <div class="avg-item">
        <span class="avg-label">${k.name}</span>
        <span class="avg-val" style="color:${rInfo.color};">${displayVal}</span>
      </div>
    `;
  });

  renderSongLibrary();
  renderRosterNameBar();
  renderRosterList();
  renderRankingPanel();
  renderOfficeUpgrades();
  renderManagerPanel();
  renderManagerMarketPanel();
  renderSalaryPanel();
  renderGameCalendar();
  renderWeeklyActionPanel();

  // 自動セーブ
  if (activeSaveSlot) localStorage.setItem(saveSlotKey(activeSaveSlot), JSON.stringify({
    currentYear, currentMonth, currentWeek, gameDate, calendarYear, totalWeeksElapsed, draftCount, funds,
    merchandiseProducts, merchandiseStock, merchandiseUnitsSold, merchandiseSellThrough,
    nextLivePromotionPoints, monthlyCdRevenue, monthlyTieUpRevenue, promoSongId,
    monthlyLedger, pendingMonthlyReport,
    crisisCheckWeekKey, crisisEventWeekKey, crisisEventType,
    pendingCrisisResponse, randomEventCheckWeekKey, pendingRandomEvent, armedRandomEvents, pendingSelectionEvent, selectionLock, lastAnnouncedCenterId,
    fanClub, fanClubFoundedYear, pendingFanClubEvent,
    industryOfferCheckWeekKey, pendingIndustryOffer, specialLiveEvents,
    pendingEquipmentEvent, equipmentDowngradeCheckWeekKey, groupCrisis, officeUpgrades,
    yearlyStats, lifetimeSales, fansFromSales, idolRoster, productionSchedule, leagueTeams,
    songs, pendingPerformanceOffers, scheduledPerformances, specialOffersSent,
    rivalLiveBookings, managers, managerMarketCandidates, groupFansAtYearStart, previousYearGroupFansAtYearStart,
    yearEndAwardProcessed, yearEndKohakuProcessed, lastLiveDate,
    weeklySchedule, // 週間スケジュール状態（手動休養設定等）も合わせて保存
    savedAt: Date.now()
  }));
}

function switchRosterTab(tab) {
  currentRosterTab = tab;
  document.getElementById('tab-btn-sel').classList.toggle('active', tab === 'selected');
  document.getElementById('tab-btn-und').classList.toggle('active', tab === 'under');
  renderRosterList();
}

function renderSongLibrary() {
  const listUI = document.getElementById('song-list-ui');
  const recordedSongs = songs.filter(song => Number.isFinite(song.totalSales));
  const totalSales = recordedSongs.reduce((sum, song) => sum + song.totalSales, 0);
  const averageSales = recordedSongs.length ? Math.round(totalSales / recordedSongs.length) : 0;
  document.getElementById('song-sales-summary').innerHTML = `
    <strong>楽曲累計売上: ${totalSales.toLocaleString()}枚</strong>
    <div style="margin-top:4px; color:#666;">売上記録 ${recordedSongs.length}曲 / 1曲平均 ${averageSales.toLocaleString()}枚</div>
  `;

  if (!songs.length) {
    listUI.innerHTML = '<div class="song-row">楽曲はまだ登録されていません。</div>';
    return;
  }

  listUI.innerHTML = [...songs]
    .sort((a, b) => b.releaseYear - a.releaseYear || b.releaseMonth - a.releaseMonth)
    .map(song => {
      const releaseStatus = song.released ? '発売済み' : `${song.releaseYear}年${song.releaseMonth}月発売予定`;
      const sales = Number.isFinite(song.totalSales) ? `${song.totalSales.toLocaleString()}枚` : (song.released ? '過去データなし' : '未発売');
      return `<div class="song-row"><strong>${escapeHtml(song.title)}</strong> Lv.${song.level} <span style="color:#777;">${releaseStatus} / 売上 ${sales}</span></div>`;
    }).join('');
}

// 名前の表示：フルネーム（苗字＋名）に読みを括弧で添える
// 名前にひらがなが既に含まれている場合はそのまま表示する（読みが重複するため付けない）
function formatMemberDisplayName(member) {
  const name = String(member?.name || '');
  const reading = String(member?.reading || '');
  if (!reading) return name;
  const spaceIndex = name.indexOf(' ');
  const givenName = spaceIndex >= 0 ? name.slice(spaceIndex + 1) : name;
  const hasKanaInName = /[\u3041-\u3096\u309D-\u309F]/.test(givenName);
  return hasKanaInName ? name : `${name}（${reading}）`;
}

// 常時表示のメンバー名一覧（手動休養中の表示に対応）
function renderRosterNameBar() {
  const bar = document.getElementById('roster-namebar-ui');
  if (!bar) return;
  if (!idolRoster.length) {
    bar.innerHTML = '<div class="office-maintenance-note">メンバーが在籍していません。</div>';
    return;
  }
  // 選抜 → センター → 名前順の順に並べる
  const ordered = [...idolRoster].sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (a.isCenter !== b.isCenter) return a.isCenter ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });

  const restingIds = new Set(weeklySchedule?.restDayMembers || []);

  bar.innerHTML = ordered.map(member => {
    const staminaValue = member.staminaValue ?? MAX_STAMINA_VALUE;
    const lowStamina = staminaValue < STAMINA_WARNING_THRESHOLD;
    const isResting = restingIds.has(member.id);
    const injuryMark = member.injury ? ` ${member.injury.type} ${formatInjuryWeeks(member.injury)}` : '';
    const restMark = isResting && !member.injury ? ' [休養中]' : '';

    const classes = [
      'roster-namebar-item',
      member.isSelected ? 'selected' : '',
      member.isCenter ? 'center' : '',
      lowStamina ? 'low' : '',
      isResting ? 'resting' : ''
    ].filter(Boolean).join(' ');

    return `
      <span class="${classes}">
        ${member.isCenter ? '<span class="roster-namebar-crown">C</span>' : ''}
        ${escapeHtml(member.name)}
        <span class="roster-namebar-meta">${member.age}歳・体力${staminaValue}${escapeHtml(injuryMark)}${escapeHtml(restMark)}</span>
      </span>
    `;
  }).join('');
}

// 固有能力値（11項目）を表示中のメンバーID。再描画しても維持する
let shownAbilityMemberIds = new Set();
function toggleMemberAbilities(memberId) {
  if (shownAbilityMemberIds.has(memberId)) shownAbilityMemberIds.delete(memberId);
  else shownAbilityMemberIds.add(memberId);
  renderRosterList();
}

function renderRosterList() {
  const listUI = document.getElementById('roster-list-ui');
  listUI.innerHTML = '';
  const filtered = idolRoster.filter(m => currentRosterTab === 'selected' ? m.isSelected : !m.isSelected);
  const restingIds = new Set(weeklySchedule?.restDayMembers || []);

  filtered.forEach(m => {
    const overall = calculateSingleOverall(m.stats);
    const rInfo = getRankData(overall);
    const staminaValue = m.staminaValue ?? MAX_STAMINA_VALUE;
    const staminaColor = staminaValue < STAMINA_WARNING_THRESHOLD ? '#c0392b' : (staminaValue < 60 ? '#e08e0b' : '#2e7d32');
    const liveFatigue = m.liveFatigue || 0;
    const isResting = restingIds.has(m.id);

    const injuryTag = m.injury
      ? `<span style="color:#c0392b; font-size:9px;">[${escapeHtml(m.injury.type)} ${escapeHtml(formatInjuryWeeks(m.injury))}]</span>`
      : '';
    const restTag = isResting && !m.injury
      ? `<span style="color:#2980b9; font-size:9px;">[休養指定中]</span>`
      : '';

    const topStat = [...STATUS_KEYS]
      .filter(status => status.id !== 'popularity')
      .sort((a, b) => (m.stats[b.id] || 0) - (m.stats[a.id] || 0))[0];
    const abilitiesShown = shownAbilityMemberIds.has(m.id);

    listUI.innerHTML += `
      <details class="member-details">
        <summary class="member-row member-summary">
          <div class="member-summary-main">
            <div class="member-name-line">
              <span class="member-name-toggle">${escapeHtml(formatMemberDisplayName(m))}</span>
              ${m.isCenter ? '<span style="color:#ff1493; font-size:9px;">[CENTER]</span>' : ''}
              ${injuryTag}
              ${restTag}
              <span class="member-basic-info">(${m.age}歳/${formatHeight(m.height)}/在籍${m.yearsActive}年・誕生日 ${m.birthdayMonth}月${m.birthdayDay}日)</span>
            </div>
            <span class="member-fan-count">個人推定ファン ${calculateMemberFans(m).toLocaleString()}人 / 年収 ${formatMoney(getMemberAnnualSalary(m))}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:10px; color:${staminaColor};">体力値 ${staminaValue}</span>
            <span style="font-size:10px; color:#666;">アイドル力:${calculateIdolPower(m.stats)}</span>
            <span style="font-size:10px; color:#666;">総評:${overall}</span>
            <span class="rank-badge" style="color:${rInfo.color}; background:${rInfo.bg}; border:1px solid ${rInfo.color}; width:16px; height:16px; line-height:16px; font-size:10px;">
              ${rInfo.rank}
            </span>
            <span class="member-toggle-hint">詳細</span>
          </div>
        </summary>
        <div class="member-vital">
          <span>体力値 ${staminaValue} / ${MAX_STAMINA_VALUE}</span>
          <span class="vital-bar"><i style="width:${Math.max(0, Math.min(100, staminaValue))}%; background:${staminaColor};"></i></span>
          <span>人気 ${m.stats.popularity || 0}</span>
          <span>週あたり回復 +${getMemberWeeklyRecovery(m, false)}${liveFatigue > 0 ? ` <small style="color:#c0392b;">（ライブ疲労で鈍化中）</small>` : ''}</span>
          ${liveFatigue > 0
            ? `<span>ライブ疲労 <strong style="color:#c0392b;">${liveFatigue}</strong> /${MAX_LIVE_FATIGUE} <small style="color:#777;">（回復力 -${Math.round(getLiveFatigueRecoveryPenalty(m) * 100)}\% / 毎週-${LIVE_FATIGUE_WEEKLY_DECAY}）</small></span>`
            : ''}
          <span>${topStat ? `得意: ${topStat.name}` : ''}</span>
        </div>
        <div class="member-ability-area">
          <button type="button" class="member-ability-btn" onclick="toggleMemberAbilities(${m.id})">
            ${abilitiesShown ? '■ 固有能力値を隠す' : '□ 能力を見る（固有能力11項目）'}
          </button>
          ${abilitiesShown ? `
        <div class="member-stats">
          ${MEMBER_STAT_GROUPS.map(group => `
            <div class="member-stat-group">
              <div class="member-stat-group-label">${group.label}</div>
              <div class="member-stat-group-grid">
                ${group.ids.map(statId => {
                  const status = STATUS_KEYS.find(entry => entry.id === statId);
                  if (!status) return '';
                  const value = m.stats[statId] || 0;
                  const progress = getStatExpProgress(m, statId);
                  return `
                    <div class="member-stat">
                      <span>${status.name}</span>
                      <strong>${value}</strong>${progress > 0 && value < 100
                        ? `<i class="stat-exp-bar"><b style="width:${Math.round(progress * 100)}%"></b></i>`
                        : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>` : ''}
        </div>
      </details>
    `;
  });
}

function setLog(msg) {
  if (!Array.isArray(logHistory)) logHistory = [];
  logHistory.unshift({ date: gameDate, text: String(msg) });
  if (logHistory.length > LOG_HISTORY_LIMIT) logHistory.length = LOG_HISTORY_LIMIT;
  document.getElementById('log-box').textContent = msg;
  renderLogList();
  playTvEffectFromLog(msg);
}

// 半年計画モーダル
let planYearTarget = 1, planStartM = 7, planEndM = 12;
let planReleaseDates = {};      // 月 → 発売日
let planEventDrafts = {};       // 月 → [{ id, date, benefitId, completed }]
let planBoothDraft = {};        // 月 → { release, songName, releaseBenefit, slots }
let planDraftSignature = '';    // 読み込み済みの計画期間（"1-7-12" 形式）
let planCalendarSelection = []; // 6か月カレンダーで選択中の日付
let planCalendarAnchorKey = '';
let planCalendarRangeMode = false;
let planEventIdSeq = 0;
