// ==========================================
// 10-ui-panels.js : UI描画（タブボタン自動復元版）
// ==========================================

const PAGE_TABS = [
  { id: 'group', label: 'グループ', icon: 'group' },
  { id: 'formation', label: '編成', icon: 'formation' },
  { id: 'office', label: '事務所', icon: 'office' },
  { id: 'funds', label: '資金', icon: 'funds' },
  { id: 'ranking', label: '順位', icon: 'ranking' },
  { id: 'records', label: '記録', icon: 'records' }
];

const DEFAULT_PAGE = 'office';
// 現在開いているタブを保持（画面更新で消えないようにする）
let currentPageTab = DEFAULT_PAGE;

// アイコン取得で絶対に null を返さない安全ラッパー
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
  return `<span class="fallback-icon">${iconMap[iconName] || '●'}</span>`;
}

// タブのボタンを描画し、指定したタブのパネルだけを表示する
function renderPageNav(activePage = currentPageTab) {
  const target = PAGE_TABS.some(tab => tab.id === activePage) ? activePage : DEFAULT_PAGE;
  currentPageTab = target;

  const nav = document.getElementById('page-nav');
  if (nav) {
    nav.innerHTML = PAGE_TABS.map(tab => {
      const active = tab.id === target;
      return `
      <button class="page-tab${active ? ' active' : ''}" id="page-tab-${tab.id}" type="button" role="tab"
        aria-selected="${active}" aria-controls="page-${tab.id}" title="${tab.label}"
        onclick="switchPage('${tab.id}')">
        <span class="tab-icon">${safeGetIconSvg(tab.icon)}</span>${tab.label}
      </button>`;
    }).join('');
  }

  // パネルの表示／非表示を確実に同期
  PAGE_TABS.forEach(tab => {
    const panel = document.getElementById(`page-${tab.id}`);
    if (panel) panel.hidden = (tab.id !== target);
  });
}

function switchPage(page) {
  currentPageTab = page;
  renderPageNav(page);
  if (page === 'records' && typeof renderRecordsPanel === 'function') {
    renderRecordsPanel();
  }
}

// スクリプト読み込み完了時に即座にタブバーを生成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => renderPageNav(currentPageTab));
} else {
  renderPageNav(currentPageTab);
}
