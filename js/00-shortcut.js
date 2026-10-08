// ==========================================
// 00-shortcut.js : PC限定 ショートカットキー管理モジュール
// ==========================================

document.addEventListener('keydown', (e) => {
  // 1. テキスト入力中（インプットやテキストエリア、コンテンツエディタ）はゲーム用ショートカットを無効化
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
    return;
  }

  // 2. Ctrlキー（またはMacのCommandキー）が押されている場合のショートカット
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();

    switch (key) {
      case 'g': // グループタブへ移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('group');
        break;
      case 'f': // 編成タブへ移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('roster');
        break;
      case 'o': // 事務所タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('office');
        break;
      case 'm': // 資金タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('funds');
        break;
      case 'r': // 順位タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('ranking');
        break;
      case 'a': // 記録タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('history');
        break;
      case 'c': // モーダルを閉じる
        e.preventDefault();
        if (typeof closeDecisionModal === 'function') closeDecisionModal();
        document.querySelectorAll('.modal, [id$="-modal"]').forEach(m => {
          if (m.style.display === 'flex' || m.style.display === 'block') {
            m.style.display = 'none';
          }
        });
        break;
      case 's': // 半年計画策定モーダルを開く
        e.preventDefault();
        if (typeof openPlanningManual === 'function') openPlanningManual();
        break;
      case 'q': // タイトルに戻る
        e.preventDefault();
        if (typeof returnToTitle === 'function') returnToTitle();
        break;
      case 'h': // ヘルプを開く
        e.preventDefault();
        if (typeof openHelpModal === 'function') openHelpModal();
        break;
    }
  }

  // 3. 修飾キーなし、または特定の単体キーによるショートカット
  // PageUp: ページ・モーダルの最上部までスクロールアップ
  if (e.key === 'PageUp') {
    e.preventDefault();
    const activeModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display: block"], .modal-content');
    if (activeModal) {
      activeModal.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Enter: 計画を策定する（半年計画モーダル内などでの決定）
  if (e.key === 'Enter') {
    const decisionModal = document.getElementById('decision-modal');
    if (decisionModal && decisionModal.style.display === 'flex') {
      e.preventDefault();
      if (typeof saveDecisionPlan === 'function') saveDecisionPlan();
    }
  }

  // 数字キー 1 / 2 : ランダムイベント等の選択肢
  if (e.key === '1' || e.key === '2') {
    const choiceIndex = e.key === '1' ? 0 : 1;
    const choiceButtons = document.querySelectorAll('.random-event-choice-btn, .event-choice-btn');
    if (choiceButtons.length > choiceIndex) {
      e.preventDefault();
      choiceButtons[choiceIndex].click();
    }
  }
});
