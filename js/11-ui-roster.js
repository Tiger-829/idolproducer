// ==========================================
// 11-ui-roster.js : UI描画（完全防護・連鎖停止防止版）
// ==========================================

function updateUI() {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // 1. まず何よりも最優先でタブバーを生成・同期する（後続のエラーでタブが消えるのを完全防止）
  try {
    if (typeof renderPageNav === 'function') {
      renderPageNav(typeof currentPageTab !== 'undefined' ? currentPageTab : 'office');
    }
  } catch (e) {
    console.warn('renderPageNav error:', e);
  }

  // 2. 基本ステータス・ヘッダー情報の更新
  try {
    setText('txt-year', typeof currentYear !== 'undefined' ? currentYear : 1);
    setText('txt-month', typeof currentMonth !== 'undefined' ? currentMonth : 1);
    setText('txt-week', typeof currentWeek !== 'undefined' ? currentWeek : 1);

    if (typeof getGameDateObject === 'function') {
      setText('txt-calendar-date', getGameDateObject().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }));
    }

    if (typeof formatMoney === 'function' && typeof funds !== 'undefined') {
      setText('txt-funds', formatMoney(funds));
      const exactEl = document.getElementById('txt-funds-exact');
      if (exactEl) {
        exactEl.textContent = Math.abs(funds) >= 100000 ? `（${Math.round(funds).toLocaleString()}円）` : '';
      }
    }

    setText('txt-year-sales', `${(yearlyStats?.sales || 0).toLocaleString()} 枚`);
    setText('txt-year-audience', `${(yearlyStats?.audience || 0).toLocaleString()} 人`);

    const streamEl = document.getElementById('txt-year-stream');
    if (streamEl && typeof formatMoney === 'function') {
      const net = (yearlyStats?.streamRevenue || 0) - (yearlyStats?.streamCost || 0);
      streamEl.textContent = `${formatMoney(net)}${yearlyStats?.streamCost ? '（制作費込）' : ''}`;
    }

    const roster = Array.isArray(idolRoster) ? idolRoster : [];
    setText('txt-roster-count', roster.length);
    const selectedCountEl = document.getElementById('txt-selected-count');
    if (selectedCountEl) selectedCountEl.textContent = roster.filter(member => member && member.isSelected).length;

    const selectionButton = document.getElementById('btn-selection-setup');
    if (selectionButton) {
      const locked = typeof isSelectionLocked === 'function' ? isSelectionLocked() : false;
      selectionButton.disabled = locked;
      selectionButton.textContent = (locked && typeof selectionLock !== 'undefined' && selectionLock)
        ? `選抜確定済み（${selectionLock.year}年${selectionLock.month}月）`
        : '選抜・センターを変更する';
      selectionButton.style.opacity = locked ? '0.6' : '1';
    }

    const groupFans = typeof calculateGroupFans === 'function' ? calculateGroupFans() : 0;
    const fansEl = document.getElementById('txt-header-fans');
    if (fansEl) {
      fansEl.textContent = typeof formatFanCount === 'function' ? formatFanCount(groupFans) : groupFans.toLocaleString();
      fansEl.title = groupFans >= 100000 ? `${groupFans.toLocaleString()}人` : '';
    }

    const fanTiers = typeof getFanTiers === 'function' ? getFanTiers() : null;
    const tierEl = document.getElementById('txt-group-fan-tiers');
    if (tierEl && fanTiers) {
      const share = fanTiers.shares;
      const pct = value => Math.round(value * 100);
      const liveRate = typeof getTierParticipationRate === 'function' ? getTierParticipationRate('live') : 0.1;
      const segs = [
        { key: 'core', name: 'コア', share: share.core, count: fanTiers.core },
        { key: 'fan', name: 'ファン', share: share.fan, count: fanTiers.fan },
        { key: 'light', name: 'ライト', share: share.light, count: fanTiers.light },
      ];
      tierEl.innerHTML = `
        <div class="fan-share-bar" role="img">
          ${segs.map(s => `<i class="fan-share-seg fan-share-${s.key}" style="width:${pct(s.share)}%"></i>`).join('')}
        </div>
        <div class="fan-share-legend">
          ${segs.map(s => `<span class="fan-share-legend-item"><i class="fan-share-dot fan-share-${s.key}"></i>${s.name}${pct(s.share)}%</span>`).join('')}
        </div>
        <div class="fan-share-note">ライブ参加 ${(liveRate * 100).toFixed(1)}%</div>
      `;
    }

    setText('txt-group-crisis', typeof groupCrisis !== 'undefined' ? groupCrisis : '--');
    setText('txt-effective-crisis', typeof calculateGroupCrisisResilience === 'function' ? calculateGroupCrisisResilience() : '--');

    const summary = typeof calculateTeamAverages === 'function' ? calculateTeamAverages() : { averages: {}, overall: 50, rankData: { rank: 'C', color: '#666', bg: '#eee' }, centerName: '未定' };
    setText('txt-center-name', summary.centerName);
    setText('txt-team-idol-power', typeof calculateTeamIdolPower === 'function' ? calculateTeamIdolPower() : '--');
    setText('team-overall-score', summary.overall);

    const badge = document.getElementById('team-rank-badge');
    if (badge && summary.rankData) {
      badge.textContent = summary.rankData.rank;
      badge.style.color = summary.rankData.color;
      badge.style.backgroundColor = summary.rankData.bg;
      badge.style.border = `1px solid ${summary.rankData.color}`;
    }

    const avgGrid = document.getElementById('team-avg-grid');
    if (avgGrid && typeof STATUS_KEYS !== 'undefined') {
      avgGrid.innerHTML = '';
      STATUS_KEYS.forEach(k => {
        const val = summary.averages[k.id] || 0;
        const displayVal = Math.round(val);
        const rInfo = typeof getRankData === 'function' ? getRankData(displayVal) : { color: '#666' };
        avgGrid.innerHTML += `
          <div class="avg-item">
            <span class="avg-label">${k.name}</span>
            <span class="avg-val" style="color:${rInfo.color};">${displayVal}</span>
          </div>
        `;
      });
    }
  } catch (e) {
    console.warn('Status Header update error:', e);
  }

  // 3. 各サブラベル・リストの描画（1つが失敗しても他を止めない安全防御）
  const safeRun = (fnName, fn) => {
    try {
      if (typeof fn === 'function') fn();
    } catch (err) {
      console.warn(`${fnName} execution failed:`, err);
    }
  };

  safeRun('renderSongLibrary', renderSongLibrary);
  safeRun('renderRosterNameBar', renderRosterNameBar);
  safeRun('renderRosterList', renderRosterList);
  safeRun('renderRankingPanel', renderRankingPanel);
  safeRun('renderOfficeUpgrades', renderOfficeUpgrades);
  safeRun('renderManagerPanel', renderManagerPanel);
  safeRun('renderManagerMarketPanel', renderManagerMarketPanel);
  safeRun('renderSalaryPanel', renderSalaryPanel);
  safeRun('renderGameCalendar', renderGameCalendar);
  safeRun('renderWeeklyActionPanel', renderWeeklyActionPanel);

  // 4. 自動セーブ
  if (typeof activeSaveSlot !== 'undefined' && activeSaveSlot) {
    try {
      localStorage.setItem(saveSlotKey(activeSaveSlot), JSON.stringify({
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
        weeklySchedule,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }
}

function switchRosterTab(tab) {
  currentRosterTab = tab;
  const selBtn = document.getElementById('tab-btn-sel');
  const undBtn = document.getElementById('tab-btn-und');
  if (selBtn) selBtn.classList.toggle('active', tab === 'selected');
  if (undBtn) undBtn.classList.toggle('active', tab === 'under');
  renderRosterList();
}

function renderSongLibrary() {
  const listUI = document.getElementById('song-list-ui');
  if (!listUI) return;
  const sList = Array.isArray(songs) ? songs : [];
  const recordedSongs = sList.filter(song => Number.isFinite(song.totalSales));
  const totalSales = recordedSongs.reduce((sum, song) => sum + song.totalSales, 0);
  const averageSales = recordedSongs.length ? Math.round(totalSales / recordedSongs.length) : 0;
  const summaryEl = document.getElementById('song-sales-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <strong>楽曲累計売上: ${totalSales.toLocaleString()}枚</strong>
      <div style="margin-top:4px; color:#666;">売上記録 ${recordedSongs.length}曲 / 1曲平均 ${averageSales.toLocaleString()}枚</div>
    `;
  }

  if (!sList.length) {
    listUI.innerHTML = '<div class="song-row">楽曲はまだ登録されていません。</div>';
    return;
  }

  listUI.innerHTML = [...sList]
    .sort((a, b) => b.releaseYear - a.releaseYear || b.releaseMonth - a.releaseMonth)
    .map(song => {
      const releaseStatus = song.released ? '発売済み' : `${song.releaseYear}年${song.releaseMonth}月発売予定`;
      const sales = Number.isFinite(song.totalSales) ? `${song.totalSales.toLocaleString()}枚` : (song.released ? '過去データなし' : '未発売');
      return `<div class="song-row"><strong>${escapeHtml(song.title)}</strong> Lv.${song.level} <span style="color:#777;">${releaseStatus} / 売上 ${sales}</span></div>`;
    }).join('');
}

function formatMemberDisplayName(member) {
  const name = String(member?.name || '');
  const reading = String(member?.reading || '');
  if (!reading) return name;
  const spaceIndex = name.indexOf(' ');
  const givenName = spaceIndex >= 0 ? name.slice(spaceIndex + 1) : name;
  const hasKanaInName = /[\u3041-\u3096\u309D-\u309F]/.test(givenName);
  return hasKanaInName ? name : `${name}（${reading}）`;
}

function renderRosterNameBar() {
  const bar = document.getElementById('roster-namebar-ui');
  if (!bar) return;
  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  if (!roster.length) {
    bar.innerHTML = '<div class="office-maintenance-note">メンバーが在籍していません。</div>';
    return;
  }
  const ordered = [...roster].sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (a.isCenter !== b.isCenter) return a.isCenter ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });

  const restingIds = new Set(weeklySchedule?.restDayMembers || []);
  const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
  const warnThreshold = typeof STAMINA_WARNING_THRESHOLD !== 'undefined' ? STAMINA_WARNING_THRESHOLD : 40;

  bar.innerHTML = ordered.map(member => {
    const staminaValue = member.staminaValue ?? maxStamina;
    const lowStamina = staminaValue < warnThreshold;
    const isResting = restingIds.has(member.id);
    const injuryMark = member.injury ? ` ${member.injury.type} ${(typeof formatInjuryWeeks === 'function' ? formatInjuryWeeks(member.injury) : '')}` : '';
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

let shownAbilityMemberIds = new Set();
function toggleMemberAbilities(memberId) {
  if (shownAbilityMemberIds.has(memberId)) shownAbilityMemberIds.delete(memberId);
  else shownAbilityMemberIds.add(memberId);
  renderRosterList();
}

function renderRosterList() {
  const listUI = document.getElementById('roster-list-ui');
  if (!listUI) return;
  listUI.innerHTML = '';
  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const filtered = roster.filter(m => currentRosterTab === 'selected' ? m.isSelected : !m.isSelected);
  const restingIds = new Set(weeklySchedule?.restDayMembers || []);
  const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
  const warnThreshold = typeof STAMINA_WARNING_THRESHOLD !== 'undefined' ? STAMINA_WARNING_THRESHOLD : 40;

  filtered.forEach(m => {
    const overall = typeof calculateSingleOverall === 'function' ? calculateSingleOverall(m.stats) : 50;
    const rInfo = typeof getRankData === 'function' ? getRankData(overall) : { color: '#666', bg: '#eee', rank: 'C' };
    const staminaValue = m.staminaValue ?? maxStamina;
    const staminaColor = staminaValue < warnThreshold ? '#c0392b' : (staminaValue < 60 ? '#e08e0b' : '#2e7d32');
    const liveFatigue = m.liveFatigue || 0;
    const isResting = restingIds.has(m.id);

    const injuryTag = m.injury
      ? `<span style="color:#c0392b; font-size:9px;">[${escapeHtml(m.injury.type)} ${escapeHtml(typeof formatInjuryWeeks === 'function' ? formatInjuryWeeks(m.injury) : '')}]</span>`
      : '';
    const restTag = isResting && !m.injury
      ? `<span style="color:#2980b9; font-size:9px;">[休養指定中]</span>`
      : '';

    const statusKeys = typeof STATUS_KEYS !== 'undefined' ? STATUS_KEYS : [];
    const topStat = [...statusKeys]
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
              <span class="member-basic-info">(${m.age}歳/${typeof formatHeight === 'function' ? formatHeight(m.height) : ''}/在籍${m.yearsActive}年・誕生日 ${m.birthdayMonth}月${m.birthdayDay}日)</span>
            </div>
            <span class="member-fan-count">個人推定ファン ${(typeof calculateMemberFans === 'function' ? calculateMemberFans(m) : 0).toLocaleString()}人 / 年収 ${typeof formatMoney === 'function' ? formatMoney(typeof getMemberAnnualSalary === 'function' ? getMemberAnnualSalary(m) : 0) : ''}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:10px; color:${staminaColor};">体力値 ${staminaValue}</span>
            <span style="font-size:10px; color:#666;">アイドル力:${typeof calculateIdolPower === 'function' ? calculateIdolPower(m.stats) : 0}</span>
            <span style="font-size:10px; color:#666;">総評:${overall}</span>
            <span class="rank-badge" style="color:${rInfo.color}; background:${rInfo.bg}; border:1px solid ${rInfo.color}; width:16px; height:16px; line-height:16px; font-size:10px;">
              ${rInfo.rank}
            </span>
            <span class="member-toggle-hint">詳細</span>
          </div>
        </summary>
        <div class="member-vital">
          <span>体力値 ${staminaValue} / ${maxStamina}</span>
          <span class="vital-bar"><i style="width:${Math.max(0, Math.min(100, staminaValue))}%; background:${staminaColor};"></i></span>
          <span>人気 ${m.stats.popularity || 0}</span>
          <span>週あたり回復 +${typeof getMemberWeeklyRecovery === 'function' ? getMemberWeeklyRecovery(m, false) : 20}${liveFatigue > 0 ? ` <small style="color:#c0392b;">（ライブ疲労で鈍化中）</small>` : ''}</span>
          <span>${topStat ? `得意: ${topStat.name}` : ''}</span>
        </div>
        <div class="member-ability-area">
          <button type="button" class="member-ability-btn" onclick="toggleMemberAbilities(${m.id})">
            ${abilitiesShown ? '■ 固有能力値を隠す' : '□ 能力を見る（固有能力11項目）'}
          </button>
          ${abilitiesShown && typeof MEMBER_STAT_GROUPS !== 'undefined' ? `
        <div class="member-stats">
          ${MEMBER_STAT_GROUPS.map(group => `
            <div class="member-stat-group">
              <div class="member-stat-group-label">${group.label}</div>
              <div class="member-stat-group-grid">
                ${group.ids.map(statId => {
                  const status = statusKeys.find(entry => entry.id === statId);
                  if (!status) return '';
                  const value = m.stats[statId] || 0;
                  const progress = typeof getStatExpProgress === 'function' ? getStatExpProgress(m, statId) : 0;
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
  const limit = typeof LOG_HISTORY_LIMIT !== 'undefined' ? LOG_HISTORY_LIMIT : 60;
  if (logHistory.length > limit) logHistory.length = limit;
  
  const box = document.getElementById('log-box');
  if (box) {
    box.textContent = msg;
  }
  
  if (typeof renderLogList === 'function') renderLogList();
  if (typeof playTvEffectFromLog === 'function') playTvEffectFromLog(msg);
}
