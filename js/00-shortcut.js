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

      // 画面上で現在表示されている（非表示ではない）モーダルやダイアログ要素をすべて取得
      const visibleModals = Array.from(document.querySelectorAll('.modal, [id$="-modal"], div[id*="modal"], div[class*="modal"]'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });

      let scrolled = false;

      // 表示されているモーダルがあれば、その中のスクロール可能な領域を探してトップへ
      for (const modal of visibleModals) {
        // スクロール可能な子要素、またはモーダル自体を探す
        const scrollable = modal.querySelector('.modal-content, .modal-body, div[style*="overflow"]') || modal;
        if (scrollable.scrollHeight > scrollable.clientHeight || scrollable.scrollTop > 0) {
          scrollable.scrollTop = 0;
          scrollable.scrollTo({ top: 0, behavior: 'smooth' });
          console.log('Scrolled active modal:', scrollable);
          scrolled = true;
          break; // 最初に見つかったアクティブなモーダルをスクロールしたら終了
        }
      }

      // モーダルが一切開いていない、またはモーダル側にスクロール要素がなかった場合のみ通常ウィンドウをスクロール
      if (!scrolled) {
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
      case 'p': // Ctrl + P : スケジュール進行 / 確定
        e.preventDefault();
        const today = typeof getGameDateObject === 'function' ? getGameDateObject() : new Date();
        if (today.getDay() === 3 && typeof confirmWeeklySchedule === 'function') {
            confirmWeeklySchedule();
        } else if (typeof advanceUntilNextSchedulePoint === 'function') {
            advanceUntilNextSchedulePoint();
        } else if (typeof advanceOneWeek === 'function') {
            advanceOneWeek();
        }
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
