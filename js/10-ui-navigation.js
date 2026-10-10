// 共通ナビゲーション・タブ設定

// 不足しがちなフォーマット関数の安全な定義（エラー防止用）
if (typeof formatPlanDayLabel !== 'function') {
  window.formatPlanDayLabel = function(dateKey) {
    if (!dateKey) return '';
    const parts = String(dateKey).split('-');
    if (parts.length >= 3) {
      return `${Number(parts[1])}月${Number(parts[2])}日`;
    }
    return dateKey;
  };
}

if (typeof PAGE_TABS === 'undefined') {
  window.PAGE_TABS = [
    { id: 'group', label: 'グループ', icon: 'group' },
    { id: 'formation', label: '編成', icon: 'formation' },
    { id: 'office', label: '事務所', icon: 'office' },
    { id: 'funds', label: '資金', icon: 'funds' },
    { id: 'ranking', label: '順位', icon: 'ranking' },
    { id: 'records', label: '記録', icon: 'records' }
  ];
}

if (typeof DEFAULT_PAGE === 'undefined') {
  window.DEFAULT_PAGE = 'office';
}

// ★ 前回開いていたタブをローカルストレージから復元
if (typeof currentPageTab === 'undefined') {
  const savedTab = localStorage.getItem('idol_last_page_tab');
  window.currentPageTab = savedTab && PAGE_TABS.some(t => t.id === savedTab) ? savedTab : (window.DEFAULT_PAGE || 'office');
}

// safeGetIconSVGを処理する。
function safeGetIconSvg(iconName) {
  if (typeof getIconSvg === 'function') {
    try {
      const res = getIconSvg(iconName);
      if (res) return res;
    } catch (e) {}
  }
  const iconMap = {
    group: '👥',
    formation: '📋',
    office: '🏢',
    funds: '💰',
    ranking: '🏆',
    records: '📊',
    upgrade: '▲',
    downgrade: '▼'
  };
  return `<span class="fallback-icon" style="margin-right:4px;">${iconMap[iconName] || '●'}</span>`;
}

// ページナビゲーションを描画する。
function renderPageNav(activePage) {
  const tabs = (typeof PAGE_TABS !== 'undefined') ? PAGE_TABS : window.PAGE_TABS;
  const def = (typeof DEFAULT_PAGE !== 'undefined') ? DEFAULT_PAGE : 'office';

  const target = tabs.some(tab => tab.id === activePage)
    ? activePage
    : (tabs.some(tab => tab.id === currentPageTab) ? currentPageTab : def);
  currentPageTab = target;

  const nav = document.getElementById('page-nav');
  if (nav) {
    nav.innerHTML = tabs.map(tab => {
      const active = (tab.id === target);
      return `
      <button class="page-tab${active ? ' active' : ''}" id="page-tab-${tab.id}" type="button" role="tab"
        aria-selected="${active}" aria-controls="page-${tab.id}" title="${tab.label}"
        onclick="switchPage('${tab.id}')">
        <span class="tab-icon">${safeGetIconSvg(tab.icon)}</span><span>${tab.label}</span>
      </button>`;
    }).join('');
  }

  tabs.forEach(tab => {
    const panel = document.getElementById(`page-${tab.id}`);
    if (panel) {
      if (tab.id === target) {
        panel.removeAttribute('hidden');
        panel.style.display = 'block';
      } else {
        panel.setAttribute('hidden', '');
        panel.style.display = 'none';
      }
    }
  });
}

// ★ Pageを切替する（切替時にタブ状態を保存）
function switchPage(page) {
  currentPageTab = page;
  try {
    localStorage.setItem('idol_last_page_tab', page);
  } catch (e) {}

  renderPageNav(page);
  if (page === 'records' && typeof renderRecordsPanel === 'function') {
    try { renderRecordsPanel(); } catch (e) { console.warn('renderRecordsPanel skip:', e); }
  }
}

// ライバルチームパワーを取得する。
