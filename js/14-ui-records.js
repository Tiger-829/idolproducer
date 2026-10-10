// ==========================================
// UI描画（記録タブ：全5項目・レイアウト完全修復版）
// ==========================================

// 記録タブの表示要素をまとめて描画する
function renderRecordsPanel() {
  renderSalesTrendChart();        // ① 過去5作CD売上の推移
  renderFanHistoryTrendChart();   // ③ 過去1年のファン数推移（千人単位）
  renderSongList();               // ④ 楽曲一覧
  renderLiveMaxAudienceRanking(); // ⑤ ライブ1日当たりの最大動員数ランキング
  renderFirstWeekRanking();       // ② 初週売上ランキング（曲名・発売日・枚数）
  renderRecordsHelpBlock();       // ⑥ ページ最下部のヘルプボタンエリア（一箇所に統合）
}

// 履歴の週キーを「◯月/◯日」形式にする
function formatChartWeekLabel(weekKey) {
  const date = new Date(`${weekKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(weekKey);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 外部ライブラリなしで折れ線グラフのSVGを描く
function buildLineChartSvg(points, options = {}) {
  const width = options.width || 320;
  const height = options.height || 120;
  const padding = { top: 8, right: 8, bottom: 18, left: 45 };
  const list = (points || []).filter(point => Number.isFinite(Number(point.value)));
  if (list.length < 2) return '<div class="chart-empty">データが集まると表示されます</div>';
  const values = list.map(point => Math.max(0, Number(point.value)));
  const max = Math.max(...values, 1);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  
  const xAt = index => padding.left + (index / (list.length - 1)) * innerW;
  const yAt = value => padding.top + innerH - (value / max) * innerH;
  const line = list
    .map((point, index) => `${index ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(values[index]).toFixed(1)}`)
    .join(' ');
  const baseY = (padding.top + innerH).toFixed(1);
  const area = `${line} L${xAt(list.length - 1).toFixed(1)},${baseY} L${xAt(0).toFixed(1)},${baseY} Z`;
  
  const gridLines = [0, 0.5, 1].map(ratio => {
    const y = (padding.top + innerH - ratio * innerH).toFixed(1);
    const rawVal = max * ratio;
    const label = options.unitFormatter ? options.unitFormatter(rawVal) : formatMoney(Math.round(rawVal));
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid" />
      <text x="${padding.left - 4}" y="${Number(y) + 3}" class="chart-axis-label" text-anchor="end">${escapeHtml(label)}</text>`;
  }).join('');

  const lastIndex = list.length - 1;
  const gradientId = options.gradientId || '';
  const gradient = gradientId ? `<linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28" />
      <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02" />
    </linearGradient>` : '';
  const fill = gradientId ? `url(#${gradientId})` : 'var(--primary)';
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
      aria-label="${escapeHtml(options.ariaLabel || '推移グラフ')}">
    <defs>${gradient}</defs>
    ${gridLines}
    <path d="${area}" fill="${fill}" class="chart-area" />
    <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2" class="chart-line" />
    <circle cx="${xAt(lastIndex).toFixed(1)}" cy="${yAt(values[lastIndex]).toFixed(1)}" r="3" fill="var(--primary)" />
    <text x="${padding.left}" y="${height - 4}" class="chart-axis-label">${escapeHtml(list[0].label)}</text>
    <text x="${width - padding.right}" y="${height - 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(list[lastIndex].label)}</text>
  </svg>`;
}

// ① 過去5作CD売上の推移

// ① 過去5作CD売上の推移
function renderSalesTrendChart() {
  const chart = document.getElementById('records-sales-chart');
  const note = document.getElementById('records-sales-note');
  if (!chart) return;
  const blockTitle = chart.previousElementSibling;
  if (blockTitle) blockTitle.innerHTML = '過去5作CD売上の推移 <small>縦: 枚数 / 横: 発売からの経過日数</small>';

  const releasedSongs = [...songs]
    .filter(song => song.released && Array.isArray(song.salesHistory) && song.salesHistory.length > 0)
    .sort((a, b) => String(b.releaseDateKey || '').localeCompare(String(a.releaseDateKey || '')))
    .slice(0, 5);

  if (!releasedSongs.length) {
    chart.innerHTML = '<div class="chart-empty">まだ発売された楽曲がありません</div>';
    if (note) note.textContent = '発売や販促を行うと、週ごとの売上推移が記録されます。';
    return;
  }

  const targetSong = releasedSongs[0];
  const history = normalizeSalesHistory(targetSong.salesHistory, SONG_HISTORY_WEEKS);
  const points = history.map((entry, index) => ({
    label: index === 0 ? '発売' : `${index * 7}日`,
    value: Math.max(0, entry.sales)
  }));

  // ★ unitFormatter を追加して、縦軸を「〇枚」表示に修正
  chart.innerHTML = `<div style="font-size:11px; color:#555; margin-bottom:4px;">直近曲『${escapeHtml(targetSong.title)}』の推移</div>` +
    buildLineChartSvg(points, { 
      gradientId: 'records-sales-gradient', 
      ariaLabel: '過去5作CD売上推移',
      unitFormatter: val => `${Math.round(val).toLocaleString()}枚`
    });

  if (note) {
    const first = history[0];
    const last = history[history.length - 1];
    note.textContent = `期間 ${formatChartWeekLabel(first.weekKey)} → ${formatChartWeekLabel(last.weekKey)}（${history.length - 1}週）／ 累計 ${last.sales.toLocaleString()}枚`;
  }
}
// ② 初週売上ランキング（曲名・発売日・枚数）
function renderFirstWeekRanking() {
  const list = document.getElementById('records-firstweek-list');
  if (!list) return;
  const blockTitle = list.previousElementSibling;
  if (blockTitle) blockTitle.innerHTML = '初週売上ランキング <small>曲名・発売日</small>';

  const ranked = songs
    .filter(song => song.released && Number.isFinite(song.firstWeekSales))
    .sort((a, b) => b.firstWeekSales - a.firstWeekSales)
    .slice(0, 10);

  if (!ranked.length) {
    list.innerHTML = '<div class="chart-empty">まだ発売した楽曲がありません</div>';
    return;
  }
  const max = Math.max(...ranked.map(song => song.firstWeekSales), 1);
  list.innerHTML = ranked.map((song, index) => {
    const width = Math.max(2, Math.round((song.firstWeekSales / max) * 100));
    const releaseDateStr = song.releaseDateKey ? formatChartWeekLabel(song.releaseDateKey) : '不明';
    return `
      <div class="firstweek-row">
        <span class="firstweek-rank">${index + 1}</span>
        <span class="firstweek-title">${escapeHtml(song.title)} <small style="color:#777; font-weight:normal;">(${releaseDateStr}発売)</small></span>
        <span class="firstweek-bar"><span style="width:${width}%"></span></span>
        <span class="firstweek-value">${song.firstWeekSales.toLocaleString()}枚</span>
      </div>`;
  }).join('');
}


// ③ 過去1年のファン数推移（単位: 千人）
function renderFanHistoryTrendChart() {
  const mainPanel = document.getElementById('page-records');
  if (!mainPanel) return;

  let container = document.getElementById('records-fan-trend-block');
  if (!container) {
    container = document.createElement('div');
    container.id = 'records-fan-trend-block';
    container.className = 'records-block';
    
    // CD売上のブロックのすぐ後ろに挿入する
    const firstBlock = mainPanel.querySelector('.records-block');
    if (firstBlock && firstBlock.nextSibling) {
      mainPanel.insertBefore(container, firstBlock.nextSibling);
    } else {
      mainPanel.appendChild(container);
    }
  }

  // ★ 複数の候補からファン履歴データを安全に取得する
  const history = (typeof player !== 'undefined' && player && Array.isArray(player.fanHistory)) ? player.fanHistory
                : (typeof groupFanHistory !== 'undefined' && Array.isArray(groupFanHistory)) ? groupFanHistory
                : (Array.isArray(window.fanHistory) ? window.fanHistory : []);

  // 直近52週分（1年分）のみを表示対象にする
  const recentHistory = history.slice(-52);

  const points = recentHistory.map(entry => ({
    label: formatChartWeekLabel(entry.date),
    value: Math.round((Number(entry.fans) || Number(entry.count) || 0) / 1000)
  }));

  container.innerHTML = `
    <div class="records-block-title">過去1年のファン数推移 <small>単位: 千人（直近52週・全${history.length}件記録）</small></div>
    <div class="records-chart" style="height:120px;">
      ${buildLineChartSvg(points, { gradientId: 'records-fan-gradient', unitFormatter: val => `${Math.round(val)}千人`, ariaLabel: '過去1年のファン数推移' })}
    </div>
    <div class="records-chart-note">現在のグループファン数: ${formatFanCount(calculateGroupFans())}</div>
  `;
}

  const history = (typeof player !== 'undefined' && player && Array.isArray(player.fanHistory)) ? player.fanHistory : [];
  const points = history.map(entry => ({
    label: formatChartWeekLabel(entry.date),
    value: Math.round((Number(entry.fans) || 0) / 1000)
  }));

  container.innerHTML = `
    <div class="records-block-title">過去1年のファン数推移 <small>単位: 千人（直近52週）</small></div>
    <div class="records-chart" style="height:120px;">
      ${buildLineChartSvg(points, { gradientId: 'records-fan-gradient', unitFormatter: val => `${Math.round(val)}千人`, ariaLabel: '過去1年のファン数推移' })}
    </div>
    <div class="records-chart-note">現在のグループファン数: ${formatFanCount(calculateGroupFans())}</div>
  `;
}

// 曲一覧の概要
function describeSongMeta(song) {
  const typeLabel = song.releaseType === 'album' ? 'アルバム' : 'シングル';
  if (!song.released) return `${song.releaseYear}年${song.releaseMonth}月発売予定（${typeLabel}）`;
  const released = song.releaseDateKey ? String(song.releaseDateKey).slice(0, 7) : `${song.releaseYear}年${song.releaseMonth}月`;
  return `${released}発売 / ${typeLabel} / 累計${(song.totalSales || 0).toLocaleString()}枚`;
}

// ④ 楽曲一覧
function renderSongList() {
  const list = document.getElementById('records-song-list');
  if (!list) return;
  const blockTitle = list.previousElementSibling;
  if (blockTitle) blockTitle.style.display = 'block';
  list.style.display = 'block';

  if (!songs.length) {
    list.innerHTML = '<div class="chart-empty">まだ楽曲がありません</div>';
    return;
  }
  const released = songs.filter(song => song.released)
    .sort((a, b) => String(b.releaseDateKey || '').localeCompare(String(a.releaseDateKey || '')));
  const upcoming = songs.filter(song => !song.released);
  
  const renderItem = song => `
    <button type="button" class="song-row${song.released ? '' : ' is-upcoming'}"
      onclick="openSongDetail('${escapeHtml(song.id)}')">
      <span class="song-row-title">${escapeHtml(song.title)}</span>
      <span class="song-row-meta">${escapeHtml(describeSongMeta(song))}</span>
    </button>`;
  const sections = [];
  if (released.length) sections.push(`<div class="song-group-title">発売済み</div>${released.map(renderItem).join('')}`);
  if (upcoming.length) sections.push(`<div class="song-group-title">発売予定</div>${upcoming.map(renderItem).join('')}`);
  list.innerHTML = sections.join('');
}

// ⑤ ライブ1日当たりの最大動員数ランキング
function renderLiveMaxAudienceRanking() {
  const mainPanel = document.getElementById('page-records');
  if (!mainPanel) return;

  let container = document.getElementById('records-live-ranking-block');
  if (!container) {
    container = document.createElement('div');
    container.id = 'records-live-ranking-block';
    container.className = 'records-block';
    mainPanel.appendChild(container);
  }

  const history = Array.isArray(window.liveHistory) ? [...window.liveHistory] : [];
  history.sort((a, b) => b.dailyAudience - a.dailyAudience);
  const topLive = history.slice(0, 10);

  const rows = topLive.length > 0
    ? topLive.map((item, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #eee; font-size:12px;">
          <span><strong>${idx + 1}.</strong> ${escapeHtml(item.venueName)} <small style="color:#777;">(${escapeHtml(item.date)})</small></span>
          <span style="font-weight:bold; color:#1976d2;">${item.dailyAudience.toLocaleString()} 人/日</span>
        </div>
      `).join('')
    : '<div class="chart-empty">まだライブ開催の実績がありません</div>';

  container.innerHTML = `
    <div class="records-block-title">ライブ1日当たりの最大動員数ランキング <small>会場名 (日付) (人/日)</small></div>
    <div style="background:#fff; border:1px solid #eee; border-radius:6px; padding:8px; max-height:220px; overflow-y:auto;">
      ${rows}
    </div>
  `;
}

// ⑥ ヘルプ（ゲーム説明を見る）ボタンエリアを重複なくページ最下部に1つだけ配置
function renderRecordsHelpBlock() {
  const mainPanel = document.getElementById('page-records');
  if (!mainPanel) return;

  // 画面内にある既存のヘルプブロックをすべて回収、または新規作成
  let helpBlocks = mainPanel.querySelectorAll('.records-help');
  let helpBlock;
  
  if (helpBlocks.length > 0) {
    helpBlock = helpBlocks[0];
    // 2つ目以降の重複分は削除する
    for (let i = 1; i < helpBlocks.length; i++) {
      helpBlocks[i].remove();
    }
  } else {
    helpBlock = document.createElement('div');
    helpBlock.className = 'records-help';
  }

  // 常に親要素の一番最後（最下部）に移動する
  mainPanel.appendChild(helpBlock);

  helpBlock.innerHTML = `
    <button class="ghost-btn" type="button" onclick="openHelpModal()">ゲーム説明を見る</button>
    <p class="records-help-note">売上計算や動員ルールなど、ゲームの仕様を確認できます。</p>
  `;
}

// 楽曲詳細モーダル
function openSongDetail(songId) {
  const song = songs.find(item => item.id === songId);
  if (!song) return;
  const modal = document.getElementById('song-detail-modal');
  if (!modal) return;
  const titleEl = document.getElementById('song-detail-title');
  const metaEl = document.getElementById('song-detail-meta');
  const chartEl = document.getElementById('song-detail-chart');
  const statsEl = document.getElementById('song-detail-stats');
  if (titleEl) titleEl.textContent = song.title;
  if (metaEl) metaEl.textContent = describeSongMeta(song);
  if (chartEl) {
    const history = normalizeSalesHistory(song.salesHistory, SONG_HISTORY_WEEKS);
    const points = history.map((entry, index) => {
      const previous = index > 0 ? history[index - 1].sales : 0;
      const weeksAgo = history.length - 1 - index;
      return {
        label: weeksAgo === 0 ? '発売' : `${weeksAgo}週`,
        value: Math.max(0, entry.sales - previous)
      };
    });
    chartEl.innerHTML = song.released
      ? buildLineChartSvg(points, { gradientId: 'song-detail-gradient', height: 150, ariaLabel: `${song.title}の売上推移` })
      : '<div class="chart-empty">発売後に推移が表示されます</div>';
  }
  if (statsEl) {
    const weeks = normalizeSalesHistory(song.salesHistory, SONG_HISTORY_WEEKS);
    const rows = [
      ['初週売上', Number.isFinite(song.firstWeekSales) ? `${song.firstWeekSales.toLocaleString()}枚` : '—'],
      ['累計売上', `${(song.totalSales || 0).toLocaleString()}枚`],
      ['記録週数', weeks.length ? `${weeks.length - 1}週` : '—']
    ];
    statsEl.innerHTML = rows.map(([label, value]) => `
      <div class="song-stat">
        <span class="song-stat-label">${escapeHtml(label)}</span>
        <span class="song-stat-value">${escapeHtml(value)}</span>
      </div>`).join('');
  }
  modal.style.display = 'flex';
}

function closeSongDetailModal() {
  const modal = document.getElementById('song-detail-modal');
  if (modal) modal.style.display = 'none';
}

function playTvEventEffect(kind, title) {
  const layer = document.getElementById('tv-fx-layer');
  if (!layer) return;
  const config = {
    broadcast: { label: 'テレビ出演', icon: '📺' },
    special: { label: '大型特番', icon: '🎉' },
    info: { label: 'メディア掲載', icon: '📰' }
  }[kind] || { label: '放送', icon: '📺' };
  const card = document.createElement('div');
  card.className = `tv-fx-card tv-fx-${kind || 'broadcast'}`;
  card.innerHTML = `
    <span class="tv-fx-icon">${config.icon}</span>
    <span class="tv-fx-body">
      <span class="tv-fx-label">${escapeHtml(config.label)}</span>
      <span class="tv-fx-title">${escapeHtml(String(title || ''))}</span>
    </span>
    <span class="tv-fx-bar"></span>`;
  layer.appendChild(card);
  setTimeout(() => card.remove(), 2600);
}
