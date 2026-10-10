// 共通UI更新・ログ表示

// UIを更新する。
function updateUI() {
  // テキストを設定する。
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // 1. 最優先でタブバーを生成・同期
  try {
    if (typeof renderPageNav === 'function') {
      renderPageNav(typeof currentPageTab !== 'undefined' ? currentPageTab : 'office');
    }
  } catch (e) {
    console.warn('renderPageNav failed:', e);
  }

  // 2. ヘッダー・基本情報
  try {
    setText('txt-year', typeof currentYear !== 'undefined' ? currentYear : 1);
    setText('txt-month', typeof currentMonth !== 'undefined' ? currentMonth : 1);
    setText('txt-week', typeof currentWeek !== 'undefined' ? currentWeek : 1);

    if (typeof getGameDateObject === 'function') {
      setText('txt-calendar-date', getGameDateObject().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }));
    }

  } catch (e) {
    console.warn('Header stats error:', e);
  }

  // 3. 各パネルの描画
  const runSafe = (fn) => {
    try {
      if (typeof fn === 'function') fn();
    } catch (err) {
      console.warn('Panel render warning:', err);
    }
  };

  runSafe(renderGroupTab);
  runSafe(renderFormationTab);
  runSafe(renderOfficeTab);
  runSafe(renderFundsTab);
  runSafe(renderRankingTab);
  runSafe(renderRecordsPanel);

  // 4. セーブ
  if (typeof activeSaveSlot !== 'undefined' && activeSaveSlot && typeof saveSlotKey === 'function') {
    try {
      localStorage.setItem(saveSlotKey(activeSaveSlot), JSON.stringify({
        currentYear, currentMonth, currentWeek, gameDate, calendarYear, totalWeeksElapsed, draftCount, funds,
        merchandiseProducts, merchandiseStock, merchandiseUnitsSold, merchandiseSellThrough, merchandiseItems,
        currentRosterTab, liveHistory, salesHistory, logHistory,
        nextLivePromotionPoints, monthlyCdRevenue, monthlyTieUpRevenue, promoSongId,
        monthlyLedger, pendingMonthlyReport,
        crisisCheckWeekKey, crisisEventWeekKey, crisisEventType,
        pendingCrisisResponse, randomEventCheckWeekKey, pendingRandomEvent, armedRandomEvents, pendingSelectionEvent, selectionLock, lastAnnouncedCenterId,
        fanClub, fanClubFoundedYear, pendingFanClubEvent,
        industryOfferCheckWeekKey, pendingIndustryOffer, specialLiveEvents,
        pendingEquipmentEvent, equipmentDowngradeCheckWeekKey, groupCrisis, officeUpgrades,
        yearlyStats, lifetimeSales, fansFromSales, idolRoster, productionSchedule, leagueTeams,
        songs, pendingPerformanceOffers, scheduledPerformances, specialOffersSent,
        rivalLiveBookings, managers, managerMarketCandidates, groupFansAtYearStart, previousYearGroupFansAtYearStart,
        yearEndAwardProcessed, yearEndKohakuProcessed, lastLiveDate,
        weeklySchedule, lastWeekSchedule, savedCleanWeekSchedule, pendingReports, draftState,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }
}


// Logを設定する。
function setLog(msg) {
  if (!Array.isArray(logHistory)) logHistory = [];
  logHistory.unshift({ date: gameDate, text: String(msg) });
  const limit = typeof LOG_HISTORY_LIMIT !== 'undefined' ? LOG_HISTORY_LIMIT : 60;
  if (logHistory.length > limit) logHistory.length = limit;
  
  const box = document.getElementById('log-box');
  if (box) {
    box.textContent = msg;
  }
  
  if (typeof renderLogList === 'function') renderLogList();
  if (typeof playTvEffectFromLog === 'function') playTvEffectFromLog(msg);
}
