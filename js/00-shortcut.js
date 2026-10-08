// ==========================================
// 00-shortcut.js : PC限定 ショートカットキー管理モジュール
// ==========================================

document.addEventListener('keydown', (e) => {
  // 1. テキスト入力中はゲーム用ショートカットを無効化
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
    return;
  }

  // 2. すべてのショートカットを「Ctrlキー（またはMacのCommandキー）＋ 各キー」に統一
  if (e.ctrlKey || e.metaKey) {
    const key = e.key;
    const lowerKey = key.toLowerCase();

    // Shiftキーの判定（Ctrl + Shift で最上部までスクロール）
    if (e.shiftKey) {
      e.preventDefault();
      console.log('Ctrl + Shift shortcut triggered: Scrolling to top');

      // ① 現在開いているモーダルを特定
      const openModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display: block"], #decision-modal, [id$="-modal"]');
      const isModalOpen = openModal && window.getComputedStyle(openModal).display !== 'none';

      if (isModalOpen) {
        // モーダルが開いている場合：モーダル内またはその内部で実際にスクロール可能な要素を探索してトップへ
        let target = openModal.querySelector('.modal-content, .modal-body');
        if (!target || target.scrollHeight <= target.clientHeight) {
          // もし専用クラスがなければ、モーダル内の子要素でスクロールバーを持つものを探す
          const allEls = openModal.querySelectorAll('*');
          for (const el of allEls) {
            const style = window.getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
              target = el;
              break;
            }
          }
        }
        
        // 見つかったターゲット、またはモーダル本体を最上部に
        const finalTarget = target || openModal;
        finalTarget.scrollTop = 0;
        finalTarget.scrollTo({ top: 0, behavior: 'smooth' });
        console.log('Scrolled modal target to top:', finalTarget);
      } else {
        // 通常ウィンドウの場合：ウィンドウ全体を最上部に
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        console.log('Scrolled window to top');
      }
      return;
    }

    // Enterキーの判定（計画を策定する）
    if (lowerKey === 'enter') {
      const decisionModal = document.getElementById('decision-modal');
      if (decisionModal && decisionModal.style.display === 'flex') {
        e.preventDefault();
        if (typeof saveDecisionPlan === 'function') saveDecisionPlan();
      }
      return;
    }

    // アルファベットおよび数字の判定
    switch (lowerKey) {
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
      case '1': // Ctrl + 1 : ランダムイベント等で上の選択肢を選択
      case '2': // Ctrl + 2 : ランダムイベント等で下の選択肢を選択
        {
          const choiceIndex = lowerKey === '1' ? 0 : 1;
          const choiceButtons = document.querySelectorAll('.random-event-choice-btn, .event-choice-btn');
          if (choiceButtons.length > choiceIndex) {
            e.preventDefault();
            choiceButtons[choiceIndex].click();
          }
        }
        break;
    }
  }
});
