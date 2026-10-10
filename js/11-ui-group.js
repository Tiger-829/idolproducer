function renderGroupStatus() {
  const setText = (id, text) => {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  };
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
}

// グループタブ
// 楽曲ライブラリを描画する。
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


function renderGroupTab() {
  const merchStock = typeof merchandiseStock !== 'undefined' ? merchandiseStock : 0;
  const merchProds = typeof merchandiseProducts !== 'undefined' ? merchandiseProducts : 0;
  const stockElement = document.getElementById('txt-merchandise-stock');
  const productsElement = document.getElementById('txt-merchandise-products');
  if (stockElement) stockElement.textContent = merchStock.toLocaleString();
  if (productsElement) productsElement.textContent = String(merchProds);
  renderGroupStatus();
  renderSongLibrary();
}
