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
    const gridLine = options.showGrid === false ? '' : `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid" />`;
    return `${gridLine}<text x="${padding.left - 4}" y="${Number(y) + 3}" class="chart-axis-label" text-anchor="end">${escapeHtml(label)}</text>`;
  }).join('');

  const lastIndex = list.length - 1;
  const gradientId = options.gradientId || '';
  const gradient = gradientId ? `<linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28" />
      <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02" />
    </linearGradient>` : '';
  const fill = gradientId ? `url(#${gradientId})` : 'var(--primary)';
  const areaPath = options.showFill === false ? '' : `<path d="${area}" fill="${fill}" class="chart-area" />`;
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
      aria-label="${escapeHtml(options.ariaLabel || '推移グラフ')}">
    <defs>${gradient}</defs>
    ${gridLines}
    ${areaPath}
    <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2" class="chart-line" />
    <circle cx="${xAt(lastIndex).toFixed(1)}" cy="${yAt(values[lastIndex]).toFixed(1)}" r="3" fill="var(--primary)" />
    <text x="${padding.left}" y="${height - 4}" class="chart-axis-label">${escapeHtml(list[0].label)}</text>
    <text x="${width - padding.right}" y="${height - 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(list[lastIndex].label)}</text>
  </svg>`;
}

// 複数系列（曲）を色分けして重ね描きする折れ線グラフのSVGを生成する。
// seriesList: [{ name, color, points: [{ weekKey, value }] }]
// 横軸は「日付」（全系列の週キーの集合）で、1年間の売上推移を時系列で比較できる。
function buildMultiLineChartSvg(seriesList, options = {}) {
  const width = options.width || 320;
  const height = options.height || 120;
  const padding = { top: 8, right: 8, bottom: 22, left: 45 };
  const series = (seriesList || [])
    .filter(s => s && Array.isArray(s.points) && s.points.length)
    .map(s => ({
      name: s.name || '無題',
      color: s.color || 'var(--primary)',
      points: s.points
        .filter(p => p && typeof p.weekKey === 'string')
        .map(p => ({ weekKey: p.weekKey, value: Math.max(0, Number(p.value) || 0) }))
    }))
    .filter(s => s.points.length);

  const weekKeys = [...new Set(series.flatMap(s => s.points.map(p => p.weekKey)))].sort();
  if (weekKeys.length < 2) return '<div class="chart-empty">データが集まると表示されます</div>';

  const indexOf = new Map(weekKeys.map((key, i) => [key, i]));
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.value)));
  const xAt = i => padding.left + (i / (weekKeys.length - 1)) * innerW;
  const yAt = v => padding.top + innerH - (v / max) * innerH;

  const gridLines = [0, 0.5, 1].map(ratio => {
    const y = (padding.top + innerH - ratio * innerH).toFixed(1);
    const rawVal = max * ratio;
    const label = options.unitFormatter ? options.unitFormatter(rawVal) : formatMoney(Math.round(rawVal));
    const gridLine = options.showGrid === false ? '' : `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid" />`;
    return `${gridLine}<text x="${padding.left - 4}" y="${Number(y) + 3}" class="chart-axis-label" text-anchor="end">${escapeHtml(label)}</text>`;
  }).join('');

  const lines = series.map(s => {
    const pts = s.points
      .map(p => ({ i: indexOf.get(p.weekKey), v: p.value }))
      .filter(p => Number.isFinite(p.i))
      .sort((a, b) => a.i - b.i);
    if (!pts.length) return '';
    if (pts.length < 2) {
      const p = pts[0];
      return `<circle cx="${xAt(p.i).toFixed(1)}" cy="${yAt(p.v).toFixed(1)}" r="3" fill="${s.color}" />`;
    }
    const d = pts.map((p, idx) => `${idx ? 'L' : 'M'}${xAt(p.i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(' ');
    const lastPt = pts[pts.length - 1];
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" class="chart-line" />` +
      `<circle cx="${xAt(lastPt.i).toFixed(1)}" cy="${yAt(lastPt.v).toFixed(1)}" r="3" fill="${s.color}" />`;
  }).join('');

  const firstLabel = formatChartWeekLabel(weekKeys[0]);
  const lastLabel = formatChartWeekLabel(weekKeys[weekKeys.length - 1]);

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
      aria-label="${escapeHtml(options.ariaLabel || '推移グラフ')}">
    ${gridLines}
    ${lines}
    <text x="${padding.left}" y="${height - 4}" class="chart-axis-label">${escapeHtml(firstLabel)}</text>
    <text x="${width - padding.right}" y="${height - 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(lastLabel)}</text>
  </svg>`;
}

// ① 過去5作CD売上の推移（曲ごとに色分けした折れ線を重ね描き）
const SALES_SERIES_COLORS = ['#e91e63', '#3f51b5', '#00897b', '#fb8c00', '#8e24aa'];

function renderSalesTrendChart() {
  const chart = document.getElementById('records-sales-chart');
  const note = document.getElementById('records-sales-note');
  if (!chart) return;
  const blockTitle = chart.previousElementSibling;
  if (blockTitle) blockTitle.innerHTML = '過去5作CD売上の推移 <small>曲ごとに色分け / 横: 日付</small>';

  const releasedSongs = [...songs]
    .filter(song => song.released && Array.isArray(song.salesHistory) && song.salesHistory.length > 0)
    .sort((a, b) => String(b.releaseDateKey || '').localeCompare(String(a.releaseDateKey || '')))
    .slice(0, 5);

  if (!releasedSongs.length) {
    chart.innerHTML = '<div class="chart-empty">まだ発売された楽曲がありません</div>';
    if (note) note.textContent = '発売や販促を行うと、週ごとの売上推移が記録されます。';
    return;
  }

  // 曲ごとに色を割り当てて系列化（累計売上の週次推移）
  const seriesList = releasedSongs.map((song, index) => {
    const history = normalizeSalesHistory(song.salesHistory, SONG_HISTORY_WEEKS);
    return {
      name: song.title || `楽曲${index + 1}`,
      color: SALES_SERIES_COLORS[index % SALES_SERIES_COLORS.length],
      points: history.map(entry => ({ weekKey: entry.weekKey, value: Math.max(0, entry.sales) }))
    };
  }).filter(series => series.points.length > 0);

  // 凡例（色＋曲名）
  const legend = `<div class="records-chart-legend">` +
    seriesList.map(series =>
      `<span class="records-legend-item"><i class="records-legend-swatch" style="background:${series.color}"></i>${escapeHtml(series.name)}</span>`
    ).join('') +
    `</div>`;

  chart.innerHTML =
    buildMultiLineChartSvg(seriesList, {
      ariaLabel: '過去5作CD売上推移',
      showGrid: false,
      unitFormatter: val => `${Math.round(val).toLocaleString()}枚`
    }) + legend;

  if (note) {
    // 期間は全系列の週キーから、累計はグループの売上履歴（最新値）から求める
    const groupHistory = normalizeSalesHistory(salesHistory, SONG_HISTORY_WEEKS);
    const allWeeks = [...new Set(seriesList.flatMap(s => s.points.map(p => p.weekKey)))].sort();
    const first = allWeeks[0];
    const last = allWeeks[allWeeks.length - 1];
    let total = groupHistory.length ? groupHistory[groupHistory.length - 1].sales : 0;
    if (!total) total = Math.max(0, ...seriesList.flatMap(s => s.points.map(p => p.value)));
    note.textContent = `期間 ${formatChartWeekLabel(first)} → ${formatChartWeekLabel(last)}（${seriesList.length}曲）／ 累計 ${total.toLocaleString()}枚`;
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
    
    const firstBlock = mainPanel.querySelector('.records-block');
    if (firstBlock && firstBlock.nextSibling) {
      mainPanel.insertBefore(container, firstBlock.nextSibling);
    } else {
      mainPanel.appendChild(container);
    }
  }

  const history = (typeof player !== 'undefined' && player && Array.isArray(player.fanHistory)) ? player.fanHistory
                : (typeof groupFanHistory !== 'undefined' && Array.isArray(groupFanHistory)) ? groupFanHistory
                : (Array.isArray(window.fanHistory) ? window.fanHistory : []);

  const recentHistory = history.slice(-52);

  const points = recentHistory.map(entry => ({
    label: formatChartWeekLabel(entry.date),
    value: Math.round((Number(entry.fans) || Number(entry.count) || 0) / 1000)
  }));

  container.innerHTML = `
    <div class="records-block-title">過去1年のファン数推移 <small>単位: 千人（直近52週）</small></div>
    <div class="records-chart" style="height:120px;">
      ${buildLineChartSvg(points, { gradientId: 'records-fan-gradient', showGrid: false, showFill: false, unitFormatter: val => `${Math.round(val)}千人`, ariaLabel: '過去1年のファン数推移' })}
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

  const history = Array.isArray(liveHistory) ? [...liveHistory] : [];
  history.sort((a, b) => b.dailyAudience - a.dailyAudience);
  const topLive = history.slice(0, 10);

  const rows = topLive.length > 0
    ? topLive.map((item, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #eee; font-size:12px;">
          <span><strong>${idx + 1}.</strong> ${escapeHtml(item.venueName)} <small style="color:#777;">(${escapeHtml(item.date)})</small></span>
          <span style="font-weight:bold; color:#1976d2;">${item.dailyAudience.toLocaleString()} 人</span>
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

  let helpBlocks = mainPanel.querySelectorAll('.records-help');
  let helpBlock;
  
  if (helpBlocks.length > 0) {
    helpBlock = helpBlocks[0];
    for (let i = 1; i < helpBlocks.length; i++) {
      helpBlocks[i].remove();
    }
  } else {
    helpBlock = document.createElement('div');
    helpBlock.className = 'records-help';
  }

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

function playTvEffectFromLog(message) {
  const text = String(message || '');
  const hasLabel = label => text.includes(`【${label}】`);
  const isRandomEvent = hasLabel('ランダムイベント');
  const isRelease = hasLabel('発売');
  const isLive = /【ライブ[^】]*】|【イベント出演】/.test(text);
  const isSpecialBroadcast = hasLabel('大型特番');
  const isBroadcast = hasLabel('テレビ出演');
  const infoMedia = typeof INFO_MEDIA !== 'undefined'
    ? Object.values(INFO_MEDIA).find(media => media.label && hasLabel(media.label))
    : null;
  const benefitEvent = typeof BENEFIT_EVENT_TYPE_OPTIONS !== 'undefined'
    ? BENEFIT_EVENT_TYPE_OPTIONS.find(event => event.name && hasLabel(event.name))
    : null;

  let title = '';
  let cardKind = '';
  if (isRandomEvent) {
    title = 'ランダムイベント結果';
  } else if (isRelease) {
    title = 'CD発売報告';
  } else if (isLive) {
    title = 'ライブ・イベント報告';
  } else if (isSpecialBroadcast) {
    title = '大型特番出演報告';
    cardKind = 'special';
  } else if (isBroadcast) {
    title = 'テレビ出演報告';
    cardKind = 'broadcast';
  } else if (infoMedia) {
    title = `${infoMedia.label}の報道`;
    cardKind = 'info';
  } else if (benefitEvent) {
    title = 'CD関連イベント報告';
  } else {
    return;
  }

  if (cardKind) playTvEventEffect(cardKind, text);
  if (!Array.isArray(pendingReports)) pendingReports = [];
  pendingReports.push({
    type: 'tv-report',
    report: {
      title,
      text
    }
  });
}

function showTvReportModal(report) {
  const modal = document.getElementById('tv-report-modal');
  const title = document.getElementById('tv-report-title');
  const body = document.getElementById('tv-report-body');
  if (!modal || !title || !body || !report) return;

  title.textContent = report.title || '活動報告';
  body.textContent = report.text || '';
  modal.style.display = 'flex';
}

function closeTvReportModal() {
  const modal = document.getElementById('tv-report-modal');
  if (modal) modal.style.display = 'none';
  if (typeof resumeProgressAfterReport === 'function') resumeProgressAfterReport();
}
