function renderFormationStatus() {
  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const rosterCount = document.getElementById('txt-roster-count');
  if (rosterCount) rosterCount.textContent = String(roster.length);
  const selectedCount = document.getElementById('txt-selected-count');
  if (selectedCount) selectedCount.textContent = String(roster.filter(member => member && member.isSelected).length);

  const selectionButton = document.getElementById('btn-selection-setup');
  if (selectionButton) {
    const locked = typeof isSelectionLocked === 'function' ? isSelectionLocked() : false;
    selectionButton.disabled = locked;
    selectionButton.textContent = (locked && typeof selectionLock !== 'undefined' && selectionLock)
      ? `選抜確定済み（${selectionLock.year}年${selectionLock.month}月）`
      : '選抜・センターを変更する';
    selectionButton.style.opacity = locked ? '0.6' : '1';
  }
}

// 編成タブ
let rosterSortState = {
  key: 'name',     // ソート基準項目 ('age', 'popularity', 'vocal', 'dance', 'teamwork', 'name')
  direction: 'asc' // 'asc'（昇順）または 'desc'（降順）
};

// ロースターTabを切替する。
function switchRosterTab(tab) {
  currentRosterTab = tab;
  const selBtn = document.getElementById('tab-btn-sel');
  const undBtn = document.getElementById('tab-btn-und');
  if (selBtn) selBtn.classList.toggle('active', tab === 'selected');
  if (undBtn) undBtn.classList.toggle('active', tab === 'under');
  renderRosterList();
}

// ★ 5部門ソートの基準を変更・切替する関数
function setRosterSort(key) {
  if (rosterSortState.key === key) {
    // 同じ項目がクリックされた場合は昇順・降順を反転
    rosterSortState.direction = rosterSortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // 新しい項目の場合はデフォルトで降順（高い順）に設定（年齢のみ初期昇順）
    rosterSortState.key = key;
    rosterSortState.direction = (key === 'age') ? 'asc' : 'desc';
  }
  renderRosterList();
}

// メンバーDisplay名前を整形する。
function formatMemberDisplayName(member) {
  const name = String(member?.name || '');
  const reading = String(member?.reading || '');
  if (!reading) return name;
  const spaceIndex = name.indexOf(' ');
  const givenName = spaceIndex >= 0 ? name.slice(spaceIndex + 1) : name;
  const hasKanaInName = /[\u3041-\u3096\u309D-\u309F]/.test(givenName);
  return hasKanaInName ? name : `${name}（${reading}）`;
}

// ロースター名前Barを描画する。
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

  const restingIds = new Set(Array.isArray(weeklySchedule?.restDayMembers) ? weeklySchedule.restDayMembers : []);
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
// メンバーAbilitiesを切り替えする。
function toggleMemberAbilities(memberId) {
  if (shownAbilityMemberIds.has(memberId)) shownAbilityMemberIds.delete(memberId);
  else shownAbilityMemberIds.add(memberId);
  
  const listUI = document.getElementById('roster-list-ui');
  const openedIds = [];
  if (listUI) {
    listUI.querySelectorAll('.member-details').forEach((el, idx) => {
      if (el.open) openedIds.push(idx);
    });
  }

  renderRosterList();

  if (listUI) {
    const newDetails = listUI.querySelectorAll('.member-details');
    openedIds.forEach(idx => {
      if (newDetails[idx]) newDetails[idx].open = true;
    });
  }
}

// ロースター一覧を描画する（5部門ソート機能組み込み）
function renderRosterList() {
  const listUI = document.getElementById('roster-list-ui');
  if (!listUI) return;
  
  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const filtered = roster.filter(m => currentRosterTab === 'selected' ? m.isSelected : !m.isSelected);

  // ★ 5部門（年齢・人気・歌唱力・ダンス力・連携力）のソート処理
  const sortKey = rosterSortState.key;
  const sortDir = rosterSortState.direction === 'asc' ? 1 : -1;

  filtered.sort((a, b) => {
    let valA = 0;
    let valB = 0;

    if (sortKey === 'age') {
      valA = a.age || 0;
      valB = b.age || 0;
    } else if (sortKey === 'popularity') {
      valA = a.stats?.popularity || 0;
      valB = b.stats?.popularity || 0;
    } else if (sortKey === 'vocal') {
      valA = a.stats?.vocal || 0;
      valB = b.stats?.vocal || 0;
    } else if (sortKey === 'dance') {
      valA = a.stats?.dance || 0;
      valB = b.stats?.dance || 0;
    } else if (sortKey === 'teamwork') {
      valA = a.stats?.teamwork || 0;
      valB = b.stats?.teamwork || 0;
    }

    if (valA !== valB) {
      return (valA - valB) * sortDir;
    }
    // 値が同じ場合は名前順で安定ソート
    return a.name.localeCompare(b.name, 'ja');
  });

  const restingIds = new Set(Array.isArray(weeklySchedule?.restDayMembers) ? weeklySchedule.restDayMembers : []);
  const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
  const warnThreshold = typeof STAMINA_WARNING_THRESHOLD !== 'undefined' ? STAMINA_WARNING_THRESHOLD : 40;
  const statusKeys = typeof STATUS_KEYS !== 'undefined' ? STATUS_KEYS : [];

  // ソート切替ボタンのHTML生成ヘルパー
  const getSortBtnHtml = (key, label) => {
    const isActive = rosterSortState.key === key;
    const arrow = isActive ? (rosterSortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
    const activeStyle = isActive ? 'background: var(--primary); color: #fff; border-color: var(--primary);' : 'background: #fff; color: #555; border-color: #ddd;';
    return `<button type="button" onclick="setRosterSort('${key}')" style="font-size:10px; padding:3px 6px; border-radius:4px; border:1px solid #ddd; cursor:pointer; ${activeStyle}">${label}${arrow}</button>`;
  };

  let htmlContent = `
    <div class="roster-sort-bar">
      <div style="font-size:11px; font-weight:bold; color:#555;">並び替え（ソート）:</div>
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        ${getSortBtnHtml('age', '年齢')}
        ${getSortBtnHtml('popularity', '人気')}
        ${getSortBtnHtml('vocal', '歌唱力')}
        ${getSortBtnHtml('dance', 'ダンス力')}
        ${getSortBtnHtml('teamwork', '連携力')}
      </div>
    </div>
  `;

  if (!filtered.length) {
    htmlContent += '<div class="office-maintenance-note">該当するメンバーがいません。</div>';
    listUI.innerHTML = htmlContent;
    return;
  }

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

    const topStat = [...statusKeys]
      .filter(status => status.id !== 'popularity')
      .sort((a, b) => (m.stats[b.id] || 0) - (m.stats[a.id] || 0))[0];
    const abilitiesShown = shownAbilityMemberIds.has(m.id);

    htmlContent += `
      <details class="member-details" ${m._isOpen ? 'open' : ''}>
        <summary class="member-row member-summary" onclick="onMemberSummaryClick(event, ${m.id})">
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
                  
                  const statRankInfo = typeof getRankData === 'function' ? getRankData(value) : { rank: '', color: '#333' };

                  return `
                    <div class="member-stat">
                      <span>${status.name}</span>
                      <strong style="color: ${statRankInfo.color};">
                        ${statRankInfo.rank}${value}
                      </strong>
                      ${progress > 0 && value < 100
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

  listUI.innerHTML = htmlContent;
}


function renderFormationTab() {
  renderFormationStatus();
  renderRosterNameBar();
  renderRosterList();
}
