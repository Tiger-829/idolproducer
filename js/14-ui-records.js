// ==========================================
// UI描画（記録タブ：売上推移・楽曲一覧・初週売上ランキング）
// ==========================================

// 記録タブの表示要素をまとめて描画する
function renderRecordsPanel() {
  renderSalesTrendChart();
  renderFirstWeekRanking();
  renderSongList();
}

// 履歴の週キーを「◯月/◯日」形式にする
function formatChartWeekLabel(weekKey) {
  const date = new Date(`${weekKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(weekKey);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ==========================================
// 記録タブ（売上推移・楽曲一覧・初週売上ランキング）
// ==========================================
// 保持するログの件数（古いものから捨てる）
const LOG_HISTORY_LIMIT = 60;

// ログ履歴を「新しい順」のリストとして描画する
function renderLogList() {
  const box = document.getElementById('log-box');
  if (!box) return;
  if (!Array.isArray(logHistory) || !logHistory.length) return;
  box.innerHTML = logHistory.map((entry, index) => `
    <div class="log-entry${index === 0 ? ' is-latest' : ''}">
      <span class="log-date">${escapeHtml(String(entry.date || ''))}</span>
      <span class="log-text">${escapeHtml(String(entry.text || ''))}</span>
    </div>`).join('');
}
// 外部ライブラリなしで折れ線グラフのSVGを描く
// points は [{ label, value }] の配列
function buildLineChartSvg(points, options = {}) {
  const width = options.width || 320;
  const height = options.height || 120;
  const padding = { top: 8, right: 8, bottom: 18, left: 40 };
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
    const label = formatMoney(Math.round(max * ratio));
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
      aria-label="${escapeHtml(options.ariaLabel || '累積売上の推移')}">
    <defs>${gradient}</defs>
    ${gridLines}
    <path d="${area}" fill="${fill}" class="chart-area" />
    <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2" class="chart-line" />
    <circle cx="${xAt(lastIndex).toFixed(1)}" cy="${yAt(values[lastIndex]).toFixed(1)}" r="3" fill="var(--primary)" />
    <text x="${padding.left}" y="${height - 4}" class="chart-axis-label">${escapeHtml(list[0].label)}</text>
    <text x="${width - padding.right}" y="${height - 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(list[lastIndex].label)}</text>
  </svg>`;
}

// 履歴を「週ごとの増加量」のグラフ用データへ変換する
function buildSalesTrendPoints(history) {
  const list = normalizeSalesHistory(history, SALES_HISTORY_WEEKS);
  return list.map((entry, index) => {
    const previous = index > 0 ? list[index - 1].sales : 0;
    return {
      label: formatChartWeekLabel(entry.weekKey),
      value: Math.max(0, entry.sales - previous)
    };
  });
}

// 直近1年間のCD累積売上グラフ
function renderSalesTrendChart() {
  const chart = document.getElementById('records-sales-chart');
  const note = document.getElementById('records-sales-note');
  if (!chart) return;
  const points = buildSalesTrendPoints(salesHistory);
  chart.innerHTML = buildLineChartSvg(points, {
    gradientId: 'records-sales-gradient',
    ariaLabel: '直近1年間のCD累積売上推移'
  });
  if (!note) return;
  const history = normalizeSalesHistory(salesHistory, SALES_HISTORY_WEEKS);
  if (history.length < 2) {
    note.textContent = '発売や販促を行うと、週ごとの売上推移が記録されます。';
    return;
  }
  const first = history[0];
  const last = history[history.length - 1];
  note.textContent = `期間 ${formatChartWeekLabel(first.weekKey)} → ${formatChartWeekLabel(last.weekKey)}（${history.length - 1}週）／ 累計 ${last.sales.toLocaleString()}枚`;
}

// 初週売上ランキング（自グループの作品のみ）
function renderFirstWeekRanking() {
  const list = document.getElementById('records-firstweek-list');
  if (!list) return;
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
    return `
      <div class="firstweek-row">
        <span class="firstweek-rank">${index + 1}</span>
        <span class="firstweek-title">${escapeHtml(song.title)}</span>
        <span class="firstweek-bar"><span style="width:${width}%"></span></span>
        <span class="firstweek-value">${song.firstWeekSales.toLocaleString()}枚</span>
      </div>`;
  }).join('');
}

// 曲一覧に出す概要（発売月・種別・累計売上）
function describeSongMeta(song) {
  const typeLabel = song.releaseType === 'album' ? 'アルバム' : 'シングル';
  if (!song.released) return `${song.releaseYear}年${song.releaseMonth}月発売予定（${typeLabel}）`;
  const released = song.releaseDateKey ? String(song.releaseDateKey).slice(0, 7) : `${song.releaseYear}年${song.releaseMonth}月`;
  return `${released}発売 / ${typeLabel} / 累計${(song.totalSales || 0).toLocaleString()}枚`;
}

// 楽曲一覧（発売済み／予定を分けて、曲名で詳細を開ける）
function renderSongList() {
  const list = document.getElementById('records-song-list');
  if (!list) return;
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

// 楽曲詳細（発売後1年間の累積売上推移）をモーダルで開く
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
    // 発売からの経過週数をラベルにする（発売時は0週）
    const points = history.map((entry, index) => {
      const previous = index > 0 ? history[index - 1].sales : 0;
      const weeksAgo = history.length - 1 - index;
      return {
        label: weeksAgo === 0 ? '発売' : `${weeksAgo}週`,
        value: Math.max(0, entry.sales - previous)
      };
    });
    chartEl.innerHTML = song.released
      ? buildLineChartSvg(points, { gradientId: 'song-detail-gradient', height: 150, ariaLabel: `${song.title}の発売後1年間の売上推移` })
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

// ==========================================
// TVイベント時の演出
// ==========================================
// テレビ出演／大型特番／情報メディアの放送で画面演出を出す
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
  // 演出は自動消去する（次の描画で残らないようタイマーで消す）
  setTimeout(() => card.remove(), 2600);
}

// ログにテレビ関連の放送が書かれていれば演出を出す（setLog からのフック）
function playTvEffectFromLog(message) {
  const text = String(message || '');
  if (text.includes('【大型特番】')) {
    playTvEventEffect('special', text.replace('【大型特番】', '').split('で')[0]);
    return true;
  }
  if (text.includes('【テレビ出演】')) {
    playTvEventEffect('broadcast', text.replace('【テレビ出演】', '').split('で')[0]);
    return true;
  }
  const mediaMatch = text.match(/【[^】]+】/);
  if (mediaMatch && /(報道|掲載|番組|ニュース|ウェブ|メディア|取材)/.test(mediaMatch[0])) {
    playTvEventEffect('info', text.replace(/【[^】]*】/, '').split('。')[0].slice(0, 40));
    return true;
  }
  return false;
}