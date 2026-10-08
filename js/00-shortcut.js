// ==========================================
// 00-shortcut.js : PC限定 ショートカットキー管理モジュール
// ==========================================

document.addEventListener('keydown', (e) => {
  // 1. テキスト入力中（インプットやテキストエリア、コンテンツエディタ）はゲーム用ショートカットを無効化
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
    return;
  }

  // 2. すべてのショートカットを「Ctrlキー（またはMacのCommandキー）＋ 各キー」に統一
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();

    switch (key) {
      case 'g': // Ctrl + G : グループタブへ移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('group');
        break;
      case 'f': // Ctrl + F : 編成タブへ移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('formation');
        break;
      case 'o': // Ctrl + O : 事務所タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('office');
        break;
      case 'm': // Ctrl + M : 資金タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('funds');
        break;
      case 'r': // Ctrl + R : 順位タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('ranking');
        break;
      case 'a': // Ctrl + A : 記録タブに移動
        e.preventDefault();
        if (typeof renderPageNav === 'function') renderPageNav('record');
        break;
      case 'c': // Ctrl + C : モーダルを閉じる
        e.preventDefault();
        if (typeof closeDecisionModal === 'function') closeDecisionModal();
        document.querySelectorAll('.modal, [id$="-modal"]').forEach(m => {
          if (m.style.display === 'flex' || m.style.display === 'block') {
            m.style.display = 'none';
          }
        });
        break;
      case 's': // Ctrl + S : 半年計画策定モーダルを開く
        e.preventDefault();
        if (typeof openPlanningManual === 'function') openPlanningManual();
        break;
      case 'q': // Ctrl + Q : タイトルに戻る
        e.preventDefault();
        if (typeof returnToTitle === 'function') returnToTitle();
        break;
      case 'h': // Ctrl + H : ヘルプを開く
        e.preventDefault();
        if (typeof openHelpModal === 'function') openHelpModal();
        break;
      case 'shift': // Ctrl + shift : ページ・モーダルの最上部までスクロール
        e.preventDefault();
        const activeModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display: block"], .modal-content');
        if (activeModal) {
          activeModal.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        break;
      case 'enter': // Ctrl + Enter : 計画を策定する（半年計画モーダル内などでの決定）
        const decisionModal = document.getElementById('decision-modal');
        if (decisionModal && decisionModal.style.display === 'flex') {
          e.preventDefault();
          if (typeof saveDecisionPlan === 'function') saveDecisionPlan();
        }
        break;
      case '1': // Ctrl + 1 : ランダムイベント等で上の選択肢を選択
      case '2': // Ctrl + 2 : ランダムイベント等で下の選択肢を選択
        const choiceIndex = key === '1' ? 0 : 1;
        const choiceButtons = document.querySelectorAll('.random-event-choice-btn, .event-choice-btn');
        if (choiceButtons.length > choiceIndex) {
          e.preventDefault();
          choiceButtons[choiceIndex].click();
        }
        break;
    }
  }
});
