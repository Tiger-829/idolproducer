// ==========================================
// 07-schedule.js : 日次進行・新諸経費・イベントキュー新進行エンジン ＆ 休養条件緩和（全休1回＋合計4枠以上）対応版
// ==========================================

let lastWeekSchedule = null;
let savedCleanWeekSchedule = null;

// 特別個別レッスン（特別強化統合）の固定倍率
const SPECIAL_INDIVIDUAL_MULTIPLIER = 10.1;
const MUSIC_PREP_BONUS_MULTIPLIER = 5;
const MUSIC_PREP_ITEMS = ['full-run-through', 'coordination'];

// モーダル・レポート待機キュー
let pendingReports = [];

// ==========================================
// 1. スケジュール確定
// ==========================================

// 週次スケジュールを整備する。
function ensureWeeklySchedule() {
  if (typeof weeklySchedule === 'undefined' || !weeklySchedule || typeof weeklySchedule !== 'object') {
    window.weeklySchedule = {};
  }
  return window.weeklySchedule;
}

// 週次スケジュールを確定。
function confirmWeeklySchedule() {
  try {
    const today = getGameDateObject();
    if (today.getDay() !== 3) {
      alert("水曜日のみスケジュールを設定・確定できます。");
      return;
    }
    if (!validateWeeklySchedule()) {
      return;
    }

    rememberWeeklySchedule(weeklySchedule);
    markMusicPreparations();
    applyWeeklySchedule();

    // 次の停止地点（月末・千秋楽・水曜日）まで自動進行
    advanceUntilNextSchedulePoint();
  } catch (error) {
    console.error("【進行エラー】", error);
    alert(`進行中にエラーが発生しました:\n${error.message}`);
  }
}

// 画面側の「水曜日まで進行」「イベントまで進行」ボタンからの共通エントリーポイント
// ==========================================
// 2. 次の停止地点まで進行（自動スキップ対応版）
// ==========================================
function advanceUntilNextSchedulePoint() {
  let currentDate = getGameDateObject();
  let loopSafety = 0; // 無限ループ保護（最大60日）

  while (loopSafety++ < 60) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // ① もし現在地が水曜日でなく、かつ当日・翌日等にプレイヤー待ちの保留モーダルがある場合は止まる
    if (hasPendingEvents()) {
      break;
    }

    // ② 本日が水曜日（スケジュール設定日）なら、編成・予定確認のため必ず停止
    if (currentDate.getDay() === 3 && loopSafety > 1) {
      break;
    }

    // ③ 本日に自グループのライブや外部イベント・リリースがある場合は停止
    const dateKey = toDateKey(currentDate);
    const hasEventsToday = (typeof getEventsForDate === 'function' && getEventsForDate(dateKey).length > 0);
    if (hasEventsToday && loopSafety > 1) {
      break;
    }

    // 1日分の世界進行（予定がない平日の場合はそのまま進める）
    processDailyFlow(currentDate, nextDate);

    currentDate = nextDate;
    gameDate = toDateKey(currentDate);
    syncGameCalendar();

    // 停止条件（キュー蓄積・月末・水曜日）に達したか判定
    if (shouldStopProgress(currentDate)) {
      break;
    }
  }

  // 停止後のUI更新＆保留モーダル表示
  resetWeeklySchedule();
  updateWeeklyGroupFans();
  updateUI();
  openPendingModal();
}


// 保留中イベント・オファーの有無を判定するヘルパー
function hasPendingEvents() {
  return (
    (typeof pendingReports !== 'undefined' && pendingReports.length > 0) ||
    (typeof pendingSelectionEvent !== 'undefined' && pendingSelectionEvent) ||
    (typeof pendingCrisisResponse !== 'undefined' && pendingCrisisResponse) ||
    (typeof pendingFanClubEvent !== 'undefined' && pendingFanClubEvent) ||
    (typeof pendingRandomEvent !== 'undefined' && pendingRandomEvent) ||
    (typeof pendingEquipmentEvent !== 'undefined' && pendingEquipmentEvent) ||
    (typeof pendingPerformanceOffers !== 'undefined' && pendingPerformanceOffers.length > 0)
  );
}

// ボタンから呼び出される共通エントリーポイント
function advanceOneWeek() {
  try {
    if (typeof advanceUntilNextSchedulePoint === 'function') {
      advanceUntilNextSchedulePoint();
    } else {
      console.warn("advanceUntilNextSchedulePoint is not defined");
    }
  } catch (error) {
    console.error("【進行エラー】", error);
    alert(`進行中にエラーが発生しました:\n${error.message}`);
  }
}

// ==========================================
// 2. 次の停止地点まで進行（メインループ）
// ==========================================
function advanceUntilNextSchedulePoint() {
  let currentDate = getGameDateObject();
  let loopSafety = 0; // 無限ループ保護（最大60日）

  while (loopSafety++ < 60) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // 1日分の世界進行
    processDailyFlow(currentDate, nextDate);

    currentDate = nextDate;
    gameDate = toDateKey(currentDate);
    syncGameCalendar();

    // 停止条件（キュー蓄積・月末・水曜日）に達したか判定
    if (shouldStopProgress(currentDate)) {
      break;
    }
  }

  // 停止後のUI更新＆保留モーダル表示
  resetWeeklySchedule();
  updateWeeklyGroupFans();
  updateUI();
  openPendingModal();
}

// ==========================================
// 3. 停止判定
// ==========================================
function shouldStopProgress(date) {
  // ① 進行中に「ライブ収支」や「月次決算」がキューに積まれたら即座に停止
  if (pendingReports && pendingReports.length > 0) {
    return true;
  }
  // ② 月末（最終日）に到達した場合：月次決算モーダルのため停止
  if (isMonthEnd(date)) {
    return true;
  }
  // ③ 次の編成・スケジュール設定日（水曜日）に到達した場合：編成のため停止
  if (date.getDay() === 3) {
    return true;
  }
  return false;
}

// ==========================================
// 4. 日次進行（1日単位のイベント処理）
// ==========================================
function processDailyFlow(fromDate, toDate) {
  const toDateStr = toDateKey(toDate);
  const wasWednesday = toDate.getDay() === 3;

  processBirthdays(fromDate, toDate);
  processPlanEvents(toDateStr);
  processReleaseEvents(toDateStr);
  processLiveEvents(fromDate, toDate);

  if (typeof processScheduledPerformances === 'function') {
    processScheduledPerformances(toDateStr);
  }

  if (wasWednesday) {
    processWeeklyCycle(toDate);
  }

  if (typeof processYearEndEvents === 'function') {
    processYearEndEvents(toDateStr);
  }

  processMonthlyClosing(fromDate, toDate);
}

// ==========================================
// 5. ライブ共通処理
// ==========================================
function processLiveEvents(fromDate, toDate) {
  processPlayerLives(fromDate, toDate);
  processEventLives(fromDate, toDate);
}

// ==========================================
// 6. 自前ライブ新諸経費計算
// ==========================================
function calculateLiveExpenses(cap, totalDays, streamDays) {
  const d = Math.max(1, Number(totalDays) || 1);
  const dStream = Math.max(0, Number(streamDays) || 0);
  const isDome = (cap === 'SS' || cap === 'S');

  const baseManYen = isDome ? (4800 * d + 14000) : (2300 * d + 7600);
  const streamManYen = isDome ? (1200 * dStream) : (800 * dStream);

  const baseCost = baseManYen * 10000;
  const streamCost = streamManYen * 10000;

  return {
    baseCost,
    streamCost,
    totalCost: baseCost + streamCost
  };
}

// ==========================================
// 7. 自主ライブ（細分化収支・新経費集計）
// ==========================================
function processPlayerLives(fromDate, toDate) {
  const scheduled = getScheduledLiveEntries();

  scheduled.forEach(entry => {
    if (entry.completed) return;

    const showDates = getLiveEntryShowDates(entry);
    if (!showDates || !showDates.length) return;

    const finalDateStr = showDates[showDates.length - 1];
    const finalDateObj = getGameDateObject(finalDateStr);

    // 最終公演日（千秋楽／単独公演日）に到達した瞬間に全日程分を精算
    if (finalDateObj > fromDate && finalDateObj <= toDate) {
      const v = VENUE_DATA.find(item => item.name === entry.liveVenue);
      if (!v) return;

      const totalShowCount = showDates.length;
      const isMultiDay = totalShowCount > 1;
      const isDome = (v.cap === 'SS' || v.cap === 'S');

      const streamDateSet = new Set(
        Array.isArray(entry.streamDates)
          ? entry.streamDates
          : [finalDateStr]
      );
      const streamDaysCount = showDates.filter(d => streamDateSet.has(d)).length;

      const expenses = calculateLiveExpenses(v.cap, totalShowCount, streamDaysCount);
      const streamTicketPrice = typeof STREAM_TICKET_PRICE !== 'undefined' ? STREAM_TICKET_PRICE : 5000;

      const seatCapacities = getLiveSeatCapacities(v, entry.seatOptions);
      const livePromotionMultiplier = 1 + (nextLivePromotionPoints * 0.1) + (Math.max(0, (officeUpgrades.liveProduction || 1) - 1) * 0.05);
      const priceFactor = getPriceDemandFactor(v, entry);

      const seatBreakdownMap = new Map();
      seatCapacities.forEach(seat => {
        seatBreakdownMap.set(seat.id, {
          name: seat.name,
          unitPrice: getEffectiveSeatPrice(v, entry, seat),
          capacityPerShow: seat.capacity,
          totalCapacity: seat.capacity * totalShowCount,
          soldCount: 0,
          totalSales: 0
        });
      });

      let grandTotalAudience = 0;
      let grandTotalTicketRevenue = 0;
      let grandTotalStreamBuyers = 0;
      let grandTotalStreamRevenue = 0;

      let maxDailyAudience = 0;
      let maxDailyDateKey = finalDateStr;

      showDates.forEach((dateKey, index) => {
        const dObj = getGameDateObject(dateKey);
        const isFinale = (index === showDates.length - 1 && isMultiDay);
        const finaleRate = typeof LIVE_FINALE_RATE !== 'undefined' ? LIVE_FINALE_RATE : 0.9;
        
        let demand = Math.floor(getLiveAudienceDemand(v, dObj, isFinale ? finaleRate : null, priceFactor) * livePromotionMultiplier);
        let dayAudience = 0;

        seatCapacities.forEach(seat => {
          const sold = Math.min(seat.capacity, demand);
          demand -= sold;

          const data = seatBreakdownMap.get(seat.id);
          if (data) {
            data.soldCount += sold;
            data.totalSales += sold * data.unitPrice;
          }
          grandTotalAudience += sold;
          dayAudience += sold;
          grandTotalTicketRevenue += sold * getEffectiveSeatPrice(v, entry, seat);
        });

        if (dayAudience > maxDailyAudience) {
          maxDailyAudience = dayAudience;
          maxDailyDateKey = dateKey;
        }

        if (streamDateSet.has(dateKey)) {
          const dayStreamBuyers = getStreamTicketBuyers(dObj);
          grandTotalStreamBuyers += dayStreamBuyers;
          grandTotalStreamRevenue += dayStreamBuyers * streamTicketPrice;
        }
      });

      // ライブ実績履歴への保存（ランキング項目⑤用）
      if (!Array.isArray(window.liveHistory)) window.liveHistory = [];
      window.liveHistory.push({
        venueName: v.name,
        liveName: entry.liveName || v.name,
        date: maxDailyDateKey,
        dailyAudience: maxDailyAudience,
        totalAudience: grandTotalAudience,
        showCount: totalShowCount
      });

      // 新しいグッズ売上・在庫計算式の適用
      const firstDayFans = calculateGroupFans();
      const determinedFans = Number.isFinite(entry.determinedFans) ? entry.determinedFans : firstDayFans;
      const currentStock = typeof merchandiseStock !== 'undefined' ? merchandiseStock : 0;

      const salesCap = 5000 * (firstDayFans * 3 - determinedFans * 2);
      const stockCap = 5000 * currentStock;
      const goodsRevenue = Math.max(0, Math.min(salesCap, stockCap));
      const unitsSoldCalc = Math.round(goodsRevenue / 5000);

      merchandiseStock = Math.max(0, currentStock - (firstDayFans * 3 + determinedFans * 2));
      merchandiseUnitsSold = (merchandiseUnitsSold || 0) + unitsSoldCalc;

      const grossRevenue = grandTotalTicketRevenue + goodsRevenue + grandTotalStreamRevenue;
      const profit = grossRevenue - expenses.totalCost;

      funds += profit;
      yearlyStats.audience += grandTotalAudience;
      yearlyStats.streamRevenue = (yearlyStats.streamRevenue || 0) + grandTotalStreamRevenue;
      yearlyStats.streamCost = (yearlyStats.streamCost || 0) + expenses.streamCost;

      applyLiveExperience(v, grandTotalAudience, totalShowCount);
      applyLiveStaminaCost(v, isMultiDay, false);

      entry.completed = true;
      markLiveEntryCompleted(entry);
      nextLivePromotionPoints = 0;

      const seatDetails = [...seatBreakdownMap.values()].filter(s => s.totalCapacity > 0);

      const liveDetailedReport = {
        liveName: entry.liveName || v.name,
        venueName: v.name,
        venueCap: v.cap,
        showCount: totalShowCount,
        showDates: showDates,
        isMultiDay: isMultiDay,
        seatDetails: seatDetails,
        totalAudience: grandTotalAudience,
        ticketRevenue: grandTotalTicketRevenue,
        merchandiseRevenue: goodsRevenue,
        merchandiseSold: unitsSoldCalc,
        streamDaysCount: streamDaysCount,
        streamDates: [...streamDateSet],
        streamBuyers: grandTotalStreamBuyers,
        streamRevenue: grandTotalStreamRevenue,
        streamCostPerDay: isDome ? 12000000 : 8000000,
        streamCost: expenses.streamCost,
        baseCost: expenses.baseCost,
        grossRevenue: grossRevenue,
        totalCost: expenses.totalCost,
        profit: profit
      };

      pendingReports.push({
        type: "live-detail",
        report: liveDetailedReport
      });

      setLog(`【ライブ千秋楽】${liveDetailedReport.liveName}（${v.name} / 全${totalShowCount}公演[配信${streamDaysCount}日] 動員 ${grandTotalAudience.toLocaleString()}人 / 収支 ${profit >= 0 ? '+' : ''}${formatMoney(profit)}）`);
    }
  });
}

// ==========================================
// 8. イベントライブ（フェス・特番・外部招待）
// ==========================================
function processEventLives(fromDate, toDate) {
  if (!Array.isArray(specialLiveEvents)) return;

  specialLiveEvents
    .filter(event => {
      if (event.completed || !event.liveDate) return false;
      const liveDate = getGameDateObject(event.liveDate);
      return liveDate > fromDate && liveDate <= toDate;
    })
    .forEach(event => {
      const venue = VENUE_DATA.find(item => item.name === event.venue);
      const capacity = venue ? CAPACITY_MAP[venue.cap] : 20000;
      const multiplier = (event.type === 'festival' ? 1.4 : 1.2);
      const audience = Math.min(capacity, Math.floor(getLiveAudienceDemand(venue, getGameDateObject(event.liveDate)) * multiplier));

      adjustTargetPopularity(2);
      groupCrisis = Math.min(100, groupCrisis + 1);

      const fanGain = Math.floor(calculateGroupFans() * 0.003);
      fansFromSales = Math.min(GROUP_FAN_MAX, fansFromSales + fanGain);

      yearlyStats.audience += audience;
      event.completed = true;

      setLog(`【イベント出演】${event.name}（${event.venue} / 動員 ${audience.toLocaleString()}人 / 人気+2 / ファン+${fanGain.toLocaleString()}人）`);
    });
}

// ==========================================
// 9. 月末決算
// ==========================================
function processMonthlyClosing(fromDate, toDate) {
  if (!isMonthEnd(toDate)) {
    return;
  }

  if (typeof settleMonthlyIncome === 'function') {
    settleMonthlyIncome();
  }

  let report = null;
  if (typeof finalizeMonthlyLedger === 'function') {
    report = finalizeMonthlyLedger(toDate.getFullYear(), toDate.getMonth() + 1);
  }

  if (report) {
    pendingReports.push({
      type: "monthly",
      report: report
    });
  }
}

function isMonthEnd(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next.getMonth() !== date.getMonth();
}

function hasFinishedPlayerLive(date) {
  const dateKey = toDateKey(date);
  return getScheduledLiveEntries().some(entry => {
    if (!entry.completed) return false;
    const showDates = getLiveEntryShowDates(entry);
    return showDates[showDates.length - 1] === dateKey;
  });
}

// ==========================================
// 10. モーダル待機キュー消化
// ==========================================
function openPendingModal() {
  if (pendingReports && pendingReports.length > 0) {
    const item = pendingReports.shift();
    if (item.type === "live-detail" || item.type === "live") {
      if (typeof showLiveDetailedFinanceModal === 'function') {
        showLiveDetailedFinanceModal(item.report || item);
      } else if (typeof showLiveFinanceModal === 'function') {
        showLiveFinanceModal(item.rows || []);
      }
      return;
    }
    if (item.type === "monthly") {
      if (typeof showMonthlyReportModal === 'function') {
        showMonthlyReportModal(item.report);
      }
      return;
    }
  }

  if (pendingSelectionEvent) return openSelectionModal();
  if (pendingCrisisResponse) return openCrisisResponseModal();
  if (pendingFanClubEvent) return openFanClubModal();
  if (pendingRandomEvent) return openRandomEventModal();
  if (pendingEquipmentEvent) return openEquipmentEventModal();
  if (Array.isArray(pendingPerformanceOffers) && pendingPerformanceOffers.length) return openMusicOfferModal();
}

// ==========================================
// 11. サブフロー・ヘルパー処理
// ==========================================
function processBirthdays(fromDate, toDate) {
  if (typeof processMemberBirthdays === 'function') {
    processMemberBirthdays(fromDate, toDate);
  }
  if (typeof syncMemberAges === 'function') {
    syncMemberAges(toDate);
  }
}

function calculateFanBasedSales(F, n = 0) {
  const fans = Math.max(0, Math.round(Number(F) || 0));
  if (fans <= 0 || n < 0) return 0;

  let totalSales = 0;
  for (let w = 0; w <= n; w++) {
    const weeklySales = (fans / 20) * Math.pow(10, 1 - w);
    if (weeklySales < 0.5) break;
    totalSales += weeklySales;
  }
  return Math.round(totalSales);
}

function processReleaseEvents(reachDateStr) {
  const planKey = `${currentYear}-${currentMonth}`;
  const plan = productionSchedule ? productionSchedule[planKey] : null;
  const summary = calculateTeamAverages();

  if (plan && isPlanReleaseDue(plan, reachDateStr)) {
    const isSingle = (plan.release === 'single');
    const song = ensureScheduledSong(currentYear, currentMonth, plan);

    const F = calculateGroupFans();
    const baseFirstWeek = calculateFanBasedSales(F, 0);

    const qualityMultiplier = 1.0 + (summary.overall / 100);
    const songLevelMultiplier = 1.0 + (((song.level || 1) - 1) * 0.02);
    const promoAlpha = (song.promoCount || 0) * (typeof RELEASE_PROMO_ALPHA_STEP !== 'undefined' ? RELEASE_PROMO_ALPHA_STEP : 0.005);
    const promoMultiplier = 1.0 + promoAlpha;
    const typeFactor = isSingle ? 1.0 : 0.7;
    const randomFactor = 0.95 + Math.random() * 0.10;

    const sales = Math.round(baseFirstWeek * qualityMultiplier * songLevelMultiplier * promoMultiplier * typeFactor * randomFactor);

    addGroupSales(sales);
    addMonthlyCdRevenue(sales * getSongUnitPrice(song));
    song.totalSales = (song.totalSales || 0) + sales;
    song.released = true;
    song.releaseDateKey = gameDate;
    song.releasePromoAlpha = promoAlpha;
    song.firstWeekSales = sales;
    song.salesHistory = [{ weekKey: gameDate, sales }];

    const benefit = CD_BENEFITS.find(item => item.id === plan.releaseBenefit);
    if (benefit) {
      funds -= benefit.cost;
      recordMonthlyExpense(`CD特典（${benefit.name}）`, benefit.cost);
      recordReleaseBenefitSales(benefit.id);
    }
    plan.releaseCompleted = true;

    scheduleInfoMedia('release', {
      releaseType: plan.release,
      songTitle: song.title,
      sales,
      songId: song.id,
      releaseNth: songs.filter(s => s.releaseType === plan.release).length,
      releaseDate: formatPlanDayLabel(gameDate),
      centerText: getCurrentCenterText()
    });

    setLog(`【発売】${isSingle ? 'シングル' : 'アルバム'}『${song.title}』発売！ 初週売上: ${sales.toLocaleString()}枚！`);
  }
}

// 週次サイクル処理（ファン履歴記録 ＋ グッズ1年自動減衰）
function processWeeklyCycle(toDate) {
  totalWeeksElapsed++;

  rollWeeklyCrisisEvent();
  rollRandomEvent();
  rollEquipmentDowngradeEvent();
  checkFanClubYearlyEvent();
  checkSpecialBroadcastOffers();

  try { processManagerResignations(); } catch (e) {}
  try { refreshManagerMarket(); } catch (e) {}
  processMemberInjuries();
  decayLiveFatigue();
  syncPlayerTeamStats();

  if (Array.isArray(leagueTeams)) {
    leagueTeams.forEach(team => {
      if (!team || team.id === 'player') return;
      const monthPrefix = `${calendarYear}-${String(currentMonth).padStart(2, '0')}-`;
      const rBookings = Array.isArray(rivalLiveBookings) ? rivalLiveBookings : [];
      const showCount = rBookings.filter(booking =>
        booking.groupId === team.id && (booking.venueDates || [booking.liveDate]).some(key => key && key.startsWith(monthPrefix))
      ).length;
      const power = getRivalTeamPower(team);
      team.sales = (team.sales || 0) + Math.floor(power * 550 + Math.random() * 7000 + showCount * 6000);
      team.audience = (team.audience || 0) + Math.floor(power * 220 + Math.random() * 3000 + showCount * 2500);
      team.showCount = (team.showCount || 0) + showCount;
    });
  }

  const summary = calculateTeamAverages();
  checkSenbatsuTrigger();
  checkMusicProgramOffers();
  resolveIndustryOffer();
  trainSongs(summary);
  recordAllSongSalesHistory();

  maintainOfficeFacilities();

  // グッズ1年自動減衰処理
  if (Array.isArray(merchandiseItems) && merchandiseItems.length > 0) {
    const currentDateObj = getGameDateObject();
    const oneYearAgo = new Date(currentDateObj);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const beforeCount = merchandiseItems.length;
    merchandiseItems = merchandiseItems.filter(item => {
      if (!item || !item.createdAt) return false;
      const createdDate = new Date(item.createdAt);
      return createdDate >= oneYearAgo;
    });
    merchandiseProducts = merchandiseItems.length;
    const decreased = beforeCount - merchandiseProducts;
    if (decreased > 0) {
      setLog(`【グッズ更新】開発から1年以上経過したグッズ ${decreased}種が人気低迷のためラインナップから外れました（現在 ${merchandiseProducts}種）。`);
    }
  }

  recordWeeklyFanHistory(gameDate, calculateGroupFans());

  if (totalWeeksElapsed > 0 && totalWeeksElapsed % 120 === 0) {
    startDraftMeeting();
  }

  checkYearlyTransition();
}

function checkYearlyTransition() {
  const d = getGameDateObject();
  const actualYear = d.getFullYear();
  if (calendarYear && actualYear !== calendarYear) {
    yearlyStats = { sales: 0, audience: 0 };
    if (Array.isArray(leagueTeams)) {
      leagueTeams.forEach(team => { if (team) { team.sales = 0; team.audience = 0; team.showCount = 0; } });
    }
    previousYearGroupFansAtYearStart = groupFansAtYearStart || calculateGroupFans();
    groupFansAtYearStart = calculateGroupFans();
    yearEndAwardProcessed = false;
    yearEndKohakuProcessed = false;

    if (currentMonth === 1) openDecisionModal("当年7月〜12月の計画策定", currentYear, 7, 12);
    else if (currentMonth === 7) openDecisionModal("翌年1月〜6月の計画策定", currentYear + 1, 1, 6);
  }
}

// ==========================================
// 12. スケジュール設定・適用ロジック
// ==========================================
function createEmptyWeeklySchedule() {
  const defaultSlots = typeof DEFAULT_WEEK_SLOTS !== 'undefined' ? DEFAULT_WEEK_SLOTS : [];
  const slotCount = typeof WEEK_SLOT_COUNT !== 'undefined' ? WEEK_SLOT_COUNT : 14;
  const slots = [...defaultSlots];
  while (slots.length < slotCount) slots.push('');
  slots.length = slotCount;

  const roster = Array.isArray(idolRoster) ? idolRoster : [];
  const availableMembers = roster.filter(member => member && member.isSelected && !member.injury);
  const defaultMember = availableMembers[0]?.id ?? roster.find(member => member && !member.injury)?.id ?? '';

  return {
    slots,
    vacation: false,
    individualMemberId: defaultMember,
    individualStat: 'vocal',
    restDayMembers: [],
    officeAction: ''
  };
}

function ensureWeeklySchedule() {
  const slotCount = typeof WEEK_SLOT_COUNT !== 'undefined' ? WEEK_SLOT_COUNT : 14;
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) {
    weeklySchedule = getDraftSourceSchedule() ? createScheduleFromLastWeek() : createEmptyWeeklySchedule();
  } else {
    const slots = weeklySchedule.slots.slice(0, slotCount);
    while (slots.length < slotCount) slots.push('');
    weeklySchedule.slots = slots;
    weeklySchedule.vacation = Boolean(weeklySchedule.vacation);
    if (!Array.isArray(weeklySchedule.restDayMembers)) weeklySchedule.restDayMembers = [];

    delete weeklySchedule.focusMemberIds;
    delete weeklySchedule.focusMemberId;
    delete weeklySchedule.autoRestMemberIds;

    const validStats = typeof INDIVIDUAL_LESSON_STATS !== 'undefined' ? INDIVIDUAL_LESSON_STATS : ['vocal', 'dance'];
    if (!validStats.includes(weeklySchedule.individualStat)) weeklySchedule.individualStat = 'vocal';

    const actions = typeof OFFICE_ACTIONS !== 'undefined' ? OFFICE_ACTIONS : [];
    if (!actions.some(action => action.id === weeklySchedule.officeAction)) weeklySchedule.officeAction = '';
  }

  getWeekFixedSlots().forEach((slot, index) => {
    if (index >= 0 && index < slotCount) weeklySchedule.slots[index] = slot.slotId || slot.kind;
  });
}

function toggleWeekVacation() {
  ensureWeeklySchedule();
  if (getWeekFixedSlots().size) {
    setLog('【週間スケジュール】固定予定がある週は1週間の休暇をとれません。');
    return;
  }
  weeklySchedule.vacation = !weeklySchedule.vacation;
  renderWeeklyActionPanel();
}

function setWeeklyScheduleSlot(index, itemId) {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return;
  if (index < 0 || index >= weeklySchedule.slots.length) return;
  if (getWeekFixedSlots().has(index)) return;

  const blocked = getWeeklyLimitBlocker(itemId, index);
  if (blocked) {
    setLog(`【週間スケジュール】${blocked.message}`);
    renderWeeklyActionPanel();
    return;
  }
  weeklySchedule.slots[index] = itemId;
  renderWeeklyActionPanel();
}

function getWeeklyLimitBlocker(itemId, excludeIndex = -1) {
  if (typeof WEEKLY_SCHEDULE_ITEMS === 'undefined') return null;
  const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === itemId);
  if (!item || !item.weeklyLimit) return null;
  const used = countWeekSlots(itemId, excludeIndex);
  if (used < item.weeklyLimit) return null;
  return {
    message: `「${item.name}」は1週間で${item.weeklyLimit}枠までです（現在${used}枠）。`,
    item,
    used
  };
}

function countWeekSlots(itemId, excludeIndex = -1) {
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) return 0;
  return weeklySchedule.slots.filter((slotId, index) => slotId === itemId && index !== excludeIndex).length;
}

// ----------------------------------------------------
// 固定枠取得関数（1/1午前：歌番組 ／ 1/1午後〜1/9午後：休暇）
// ----------------------------------------------------
function getWeekFixedSlots() {
  const fixedSlots = new Map();
  if (typeof getWeekAnchorDate !== 'function') return fixedSlots;
  const startDate = getWeekAnchorDate();

  const addFixed = (slot, date) => {
    const existing = fixedSlots.get(slot.index);
    if (!existing) {
      fixedSlots.set(slot.index, { ...slot, date });
      return;
    }
    fixedSlots.set(slot.index, {
      ...existing,
      label: `${existing.label}＋${slot.label}`,
      names: existing.names.concat(slot.names)
    });
  };

  const dayLabelsLen = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS.length : 7;
  const periodLabelsLen = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS.length : 2;

  const anchorYear = startDate.getFullYear();

  for (let d = 0; d < dayLabelsLen; d++) {
    const checkDateMorning = new Date(startDate);
    checkDateMorning.setDate(checkDateMorning.getDate() + d);
    checkDateMorning.setHours(9, 0, 0, 0);

    const checkDateAfternoon = new Date(checkDateMorning);
    checkDateAfternoon.setHours(15, 0, 0, 0);

    const diffTime = checkDateMorning.getTime() - startDate.getTime();
    const offsetDays = Math.round(diffTime / 86400000);
    if (offsetDays < 1 || offsetDays > dayLabelsLen) continue;

    const dayBase = (offsetDays - 1) * periodLabelsLen;

    const isCurrentYear = (checkDateMorning.getFullYear() === anchorYear);
    const m = checkDateMorning.getMonth() + 1;
    const day = checkDateMorning.getDate();

    if (!isCurrentYear || m !== 1 || day > 9) {
      continue;
    }

    if (day === 1) {
      addFixed({
        index: dayBase,
        kind: 'broadcast',
        slotId: 'broadcast',
        label: '歌番組出演',
        names: ['歌番組出演'],
        description: '1/1午前：歌番組出演'
      }, toDateKey(checkDateMorning));

      addFixed({
        index: dayBase + 1,
        kind: 'rest-day',
        slotId: 'rest-day',
        label: '休暇',
        names: ['休暇'],
        description: '1/1午後からの年始休暇'
      }, toDateKey(checkDateMorning));
    }
    else if (day >= 2 && day <= 8) {
      for (let p = 0; p < periodLabelsLen; p++) {
        const slotDate = new Date(checkDateMorning);
        if (p === 1) slotDate.setHours(15, 0, 0, 0);
        addFixed({
          index: dayBase + p,
          kind: 'rest-day',
          slotId: 'rest-day',
          label: '休暇',
          names: ['休暇'],
          description: '年始休暇期間'
        }, toDateKey(slotDate));
      }
    }
    else if (day === 9) {
      addFixed({
        index: dayBase,
        kind: 'rest-day',
        slotId: 'rest-day',
        label: '休暇',
        names: ['休暇'],
        description: '1/9午前の年始休暇'
      }, toDateKey(checkDateMorning));

      addFixed({
        index: dayBase + 1,
        kind: 'rest-day',
        slotId: 'rest-day',
        label: '休暇',
        names: ['休暇'],
        description: '1/9午後の年始休暇'
      }, toDateKey(checkDateAfternoon));
    }
  }

  const pList = Array.isArray(scheduledPerformances) ? scheduledPerformances : [];
  pList.forEach(performance => {
    if (!performance || !performance.airDate) return;
    const airDate = getGameDateObject(performance.airDate);
    const offsetDays = Math.round((airDate - startDate) / 86400000);

    if (offsetDays < 1 || offsetDays > dayLabelsLen - 1) return;

    const dayBase = (((offsetDays - 1) % dayLabelsLen + dayLabelsLen) % dayLabelsLen) * periodLabelsLen;
    addFixed({
      index: dayBase + 1,
      kind: 'broadcast',
      label: `テレビ出演: ${performance.name}`,
      names: [performance.name],
      performanceId: performance.id
    }, performance.airDate);
    addFixed({
      index: dayBase,
      kind: 'rehearsal',
      label: 'リハーサル',
      names: [],
      performanceId: performance.id
    }, performance.airDate);
  });

  const sList = Array.isArray(specialLiveEvents) ? specialLiveEvents : [];
  sList.forEach(event => {
    if (!event || event.completed || !event.liveDate) return;
    const liveDate = getGameDateObject(event.liveDate);
    const offsetDays = Math.round((liveDate - startDate) / 86400000);

    if (offsetDays < 1 || offsetDays > dayLabelsLen) return;

    const liveBase = (((offsetDays - 1) % dayLabelsLen + dayLabelsLen) % dayLabelsLen) * periodLabelsLen;
    [liveBase - 2, liveBase - 1, liveBase].forEach(index => {
      addFixed({
        index,
        kind: 'rehearsal',
        slotId: 'rehearsal',
        label: 'リハーサル',
        names: [event.name],
        description: `${event.name}の前日〜当日午前の固定リハーサル`
      }, event.liveDate);
    });
    addFixed({
      index: liveBase + 1,
      kind: 'external-live',
      slotId: 'external-live',
      label: event.name,
      names: [event.name],
      description: `${event.name}の出演枠`
    }, event.liveDate);
    [liveBase + 2, liveBase + 3].forEach(index => {
      addFixed({
        index,
        kind: 'rest-day',
        slotId: 'rest-day',
        label: '出演翌日・休養',
        names: [event.name],
        description: `${event.name}出演翌日の固定休養`
      }, event.liveDate);
    });
  });

  if (typeof productionSchedule !== 'undefined' && productionSchedule) {
    Object.values(productionSchedule).forEach(plan => {
      if (!plan) return;
      const events = Array.isArray(plan.planEvents) ? plan.planEvents : [];
      events.forEach(ev => {
        if (!ev) return;
        const evDates = Array.isArray(ev.dates) && ev.dates.length > 0 ? ev.dates : (ev.date ? [ev.date] : []);
        const evTitle = ev.name || 'その他イベント';

        evDates.forEach(dateStr => {
          if (!dateStr) return;
          const evDateObj = getGameDateObject(dateStr);
          const offsetDays = Math.round((evDateObj - startDate) / 86400000);

          if (offsetDays >= 1 && offsetDays <= dayLabelsLen - 1) {
            const dayBase = (((offsetDays - 1) % dayLabelsLen + dayLabelsLen) % dayLabelsLen) * periodLabelsLen;
            for (let p = 0; p < periodLabelsLen; p++) {
              addFixed({
                index: dayBase + p,
                kind: 'event-slot',
                slotId: 'event-slot',
                label: evTitle,
                names: [evTitle],
                description: `${evTitle}の開催日`
              }, dateStr);
            }
          }
        });
      });
    });
  }

  return fixedSlots;
}

function getWeekBroadcastSummaries() {
  return [...getWeekFixedSlots().values()]
    .filter(slot => slot.kind === 'broadcast')
    .map(slot => ({ date: slot.date, names: slot.names }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function cloneWeeklySchedule(schedule) {
  if (!schedule) return null;
  return {
    slots: Array.isArray(schedule.slots) ? schedule.slots.slice() : [],
    vacation: Boolean(schedule.vacation),
    individualMemberId: schedule.individualMemberId || '',
    individualStat: schedule.individualStat || 'vocal',
    restDayMembers: Array.isArray(schedule.restDayMembers) ? schedule.restDayMembers.slice() : [],
    officeAction: schedule.officeAction || ''
  };
}

function isFixedSlotId(slotId) {
  if (!slotId) return false;
  if (typeof WEEKLY_SCHEDULE_ITEMS === 'undefined') return false;
  const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === slotId);
  return !item || item.fixed;
}

function hasFixedSlotInSchedule(schedule) {
  return Boolean(schedule && Array.isArray(schedule.slots) && schedule.slots.some(isFixedSlotId));
}

function rememberWeeklySchedule(schedule) {
  lastWeekSchedule = cloneWeeklySchedule(schedule);
  if (!hasFixedSlotInSchedule(schedule)) {
    savedCleanWeekSchedule = cloneWeeklySchedule(schedule);
  }
}

function getDraftSourceSchedule() {
  if (hasFixedSlotInSchedule(lastWeekSchedule) && savedCleanWeekSchedule) {
    return savedCleanWeekSchedule;
  }
  return lastWeekSchedule;
}

function createScheduleFromLastWeek() {
  const base = createEmptyWeeklySchedule();
  const source = getDraftSourceSchedule();
  if (!source) return base;

  const slotCount = typeof WEEK_SLOT_COUNT !== 'undefined' ? WEEK_SLOT_COUNT : 14;
  const slots = source.slots.map(slotId => (isFixedSlotId(slotId) ? '' : slotId || ''));
  while (slots.length < slotCount) slots.push('');
  slots.length = slotCount;

  getWeekFixedSlots().forEach((slot, index) => {
    if (index >= 0 && index < slots.length) slots[index] = slot.slotId || slot.kind;
  });

  base.slots = slots;
  base.vacation = source.vacation;
  base.individualMemberId = source.individualMemberId || base.individualMemberId;
  base.individualStat = source.individualStat || base.individualStat;

  const targetStamina = typeof AUTO_REST_STAMINA_TARGET !== 'undefined' ? AUTO_REST_STAMINA_TARGET : 80;
  const roster = Array.isArray(idolRoster) ? idolRoster : [];

  base.restDayMembers = (source.restDayMembers || []).filter(id => {
    const member = roster.find(entry => entry.id === id);
    if (!member || member.injury) return false;
    const stamina = member.staminaValue ?? (typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100);
    return stamina < targetStamina;
  });

  base.officeAction = source.officeAction || '';
  return base;
}

function resetWeeklySchedule() {
  weeklySchedule = getDraftSourceSchedule() ? createScheduleFromLastWeek() : null;
  weeklyRecoveryDone = false;
}

function setWeeklyScheduleField(field, value) {
  ensureWeeklySchedule();
  weeklySchedule[field] = value;
  renderWeeklyActionPanel();
}

function toggleRestDayMember(memberId) {
  ensureWeeklySchedule();
  const list = weeklySchedule.restDayMembers;
  const index = list.indexOf(memberId);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    list.push(memberId);
  }
  renderWeeklyActionPanel();
}

function getWeekRestBreakdown() {
  ensureWeeklySchedule();
  const isRest = value => value === 'rest-day';
  let fullRestDays = 0;
  let restSlots = 0;
  const dayCount = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS.length : 7;
  const periodCount = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS.length : 2;

  for (let day = 0; day < dayCount; day++) {
    const morning = weeklySchedule.slots[day * periodCount];
    const afternoon = weeklySchedule.slots[day * periodCount + 1];
    if (isRest(morning) && isRest(afternoon)) {
      fullRestDays += 1;
      restSlots += 2;
    } else if (isRest(morning) || isRest(afternoon)) {
      restSlots += 1;
    }
  }
  return { fullRestDays, restSlots, extraSlots: Math.max(0, restSlots - fullRestDays * 2) };
}

function isWeekRestDay(dayIndex) {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return true;
  const periodCount = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS.length : 2;
  const base = dayIndex * periodCount;
  const isRest = value => value === 'rest-day';
  return isRest(weeklySchedule.slots[base]) && isRest(weeklySchedule.slots[base + 1]);
}

// ★ 休養の義務数ルール（全休1回を含む合計4枠の休養を必須、全日2日以上も可）に更新
function isRestRequirementAchievable() {
  ensureWeeklySchedule();
  const fixed = getWeekFixedSlots();
  let freeSlots = 0;
  let daysWithBothFree = 0;
  const dayCount = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS.length : 7;
  const periodCount = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS.length : 2;

  for (let day = 0; day < dayCount; day++) {
    let bothFree = true;
    for (let period = 0; period < periodCount; period++) {
      const index = day * periodCount + period;
      if (fixed.has(index)) { bothFree = false; continue; }
      freeSlots += 1;
    }
    if (bothFree) daysWithBothFree += 1;
  }
  // フル休養（両方空いている日）が1日以上必要、かつ自由枠の合計が4枠以上必要
  if (daysWithBothFree < 1) return false;
  if (freeSlots < 4) return false;
  return true;
}

function getWeekMealPartyCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  return weeklySchedule.slots.filter(slotId => slotId === 'meal-party').length;
}

function getWeekGoodsProductionCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  return weeklySchedule.slots.filter(slotId => slotId === 'goods-production').length;
}

function getWeekLessonCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  const fixed = getWeekFixedSlots();
  return weeklySchedule.slots.filter((slotId, index) =>
    !fixed.has(index) && slotId && slotId !== 'rest-day' && slotId !== 'meal-party' && slotId !== 'goods-production'
  ).length;
}

function getWeeklyLessonExperience() {
  const lessonLevel = (typeof officeUpgrades !== 'undefined' && officeUpgrades?.lessons) ? officeUpgrades.lessons : 0;
  const lessonMultiplier = 1 + lessonLevel * 0.12;
  const baseExp = typeof LESSON_BASE_EXP !== 'undefined' ? LESSON_BASE_EXP : 30;
  return Math.round(baseExp * lessonMultiplier);
}

function collectMusicPreparationFlags() {
  const flags = {};
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) return flags;
  getWeekFixedSlots().forEach((slot, index) => {
    if (slot.kind !== 'rehearsal' || !slot.performanceId) return;
    const before = index > 0 ? weeklySchedule.slots[index - 1] : '';
    flags[slot.performanceId] = MUSIC_PREP_ITEMS.includes(before);
  });
  return flags;
}

function markMusicPreparations() {
  const flags = collectMusicPreparationFlags();
  const pList = Array.isArray(scheduledPerformances) ? scheduledPerformances : [];
  Object.keys(flags).forEach(performanceId => {
    const performance = pList.find(item => item.id === performanceId);
    if (performance) performance.prepared = flags[performanceId];
  });
}

function applyMemberLesson(member, itemId, multiplier = 1, individualStat = null, slotEffect = 1) {
  if (!member || member.injury) return { exp: 0, levels: 0 };
  if (typeof WEEKLY_SCHEDULE_ITEMS === 'undefined') return { exp: 0, levels: 0 };
  const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === itemId);
  if (!item || item.rest || item.production) return { exp: 0, levels: 0 };

  const baseExp = getWeeklyLessonExperience() * slotEffect;
  const primaryStat = itemId === 'individual-lesson'
    ? (typeof INDIVIDUAL_LESSON_STATS !== 'undefined' && INDIVIDUAL_LESSON_STATS.includes(individualStat) ? individualStat : 'vocal')
    : item.expStat;

  const exp = primaryStat ? Math.round(baseExp * multiplier) : 0;
  let levels = 0;
  if (primaryStat && typeof addMemberStatExp === 'function') {
    levels += addMemberStatExp(member, primaryStat, exp);
  }
  Object.entries(item.secondaryExp || {}).forEach(([secondaryStat, ratio]) => {
    if (typeof addMemberStatExp === 'function') {
      levels += addMemberStatExp(member, secondaryStat, Math.round(baseExp * ratio));
    }
  });
  return { exp, levels };
}

function getLessonStaminaCost(item, staminaBefore, slotEffect = 1) {
  if (!item || !Number.isFinite(item.staminaRatio)) return 0;
  return Math.max(0, Math.round(Math.max(0, staminaBefore) * item.staminaRatio * slotEffect));
}

// ★ 休養の義務数ルール（全休1日以上 ＆ 休養スロット合計4枠以上）のバリデーション
function validateWeeklySchedule() {
  ensureWeeklySchedule();

  if (weeklySchedule.vacation && getWeekFixedSlots().size) {
    weeklySchedule.vacation = false;
    setLog('【週間スケジュール】テレビ出演があるため、1週間の休暇を解除しました。');
  }

  if (weeklySchedule.vacation) return true;

  if (typeof WEEKLY_SCHEDULE_ITEMS !== 'undefined' && Array.isArray(WEEKLY_SCHEDULE_ITEMS)) {
    const overLimit = WEEKLY_SCHEDULE_ITEMS
      .filter(item => item.weeklyLimit)
      .map(item => ({ item, used: countWeekSlots(item.id) }))
      .find(entry => entry.used > entry.item.weeklyLimit);

    if (overLimit) {
      alert(`【設定エラー】「${overLimit.item.name}」は1週間に${overLimit.item.weeklyLimit}枠までです（現在${overLimit.used}枠）。枠を減らしてください。`);
      return false;
    }
  }

  const rest = getWeekRestBreakdown();
  const reqFull = 1; // 最低1日フル休養（全休1回）
  const reqTotalRestSlots = 4; // 休養スロット合計最低4枠

  if (typeof isRestRequirementAchievable === 'function' && isRestRequirementAchievable()) {
    const restShort = [];
    if (rest.fullRestDays < reqFull) {
      restShort.push(`・フル休養（午前・午後とも休養の日）：現在 ${rest.fullRestDays}日 / 必要 ${reqFull}日以上`);
    }
    if (rest.restSlots < reqTotalRestSlots) {
      restShort.push(`・休養スロットの合計：現在 ${rest.restSlots}枠 / 必要 ${reqTotalRestSlots}枠以上（全休1回＋半休2枠、または全日2日など）`);
    }

    if (restShort.length > 0) {
      alert(`【休養不足】スケジュールを実行できません。\n\n${restShort.join('\n')}\n\n※スロットから「休養」を設定してください。`);
      return false;
    }
  }

  const mealCount = getWeekMealPartyCount();
  const mealCostSingle = typeof MEAL_PARTY_COST !== 'undefined' ? MEAL_PARTY_COST : 1000000;
  if (mealCount > 0) {
    funds -= mealCount * mealCostSingle;
    if (typeof recordMonthlyExpense === 'function') {
      recordMonthlyExpense(`食事会（${mealCount}回）`, mealCount * mealCostSingle);
    }
    if (typeof adjustTargetPopularity === 'function' && typeof MEAL_PARTY_POPULARITY_GAIN !== 'undefined') {
      adjustTargetPopularity(MEAL_PARTY_POPULARITY_GAIN);
    }
    if (typeof groupCrisis !== 'undefined' && typeof MEAL_PARTY_CRISIS_GAIN !== 'undefined') {
      groupCrisis = Math.min(100, groupCrisis + MEAL_PARTY_CRISIS_GAIN);
    }
  }

  return true;
}

function calculateRestReleaseSlots(restingMemberIds, fixedSlots) {
  const releaseMap = new Map();
  const targetStamina = typeof AUTO_REST_STAMINA_TARGET !== 'undefined' ? AUTO_REST_STAMINA_TARGET : 80;
  const slotRecovery = typeof REST_SLOT_RECOVERY !== 'undefined' ? REST_SLOT_RECOVERY : 10;
  const mealRecovery = typeof MEAL_PARTY_RECOVERY !== 'undefined' ? MEAL_PARTY_RECOVERY : 15;
  const roster = Array.isArray(idolRoster) ? idolRoster : [];

  (restingMemberIds || []).forEach(memberId => {
    const member = roster.find(m => m.id === memberId);
    if (!member) return;

    let stamina = member.staminaValue ?? (typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100);
    if (stamina >= targetStamina) {
      releaseMap.set(memberId, 0);
      return;
    }

    let recoveredSlotIndex = -1;
    for (let i = 0; i < (weeklySchedule.slots || []).length; i++) {
      const fixed = fixedSlots.get(i);
      const slotId = weeklySchedule.slots[i];

      if ((fixed && fixed.kind === 'rest-day') || (!fixed && slotId === 'rest-day')) {
        stamina += slotRecovery;
      } else if (!fixed && slotId === 'meal-party') {
        stamina += mealRecovery;
      }

      if (stamina >= targetStamina) {
        recoveredSlotIndex = i + 1;
        break;
      }
    }
    releaseMap.set(memberId, recoveredSlotIndex);
  });

  return releaseMap;
}

// ==========================================
// 12. スケジュール設定・適用ロジック（体力百分率回復＆UI連動完全修復版）
// ==========================================

function applyWeeklySchedule() {
  ensureWeeklySchedule();

  const participants = Array.isArray(idolRoster) ? idolRoster : [];
  const restingMemberIds = new Set(weeklySchedule.restDayMembers || []);
  const fixedSlots = getWeekFixedSlots();

  const officeMessage = applyOfficeAction(weeklySchedule.officeAction);

  const fullVacationRec = typeof FULL_VACATION_RECOVERY !== 'undefined' ? FULL_VACATION_RECOVERY : 50;
  if (weeklySchedule.vacation) {
    participants.forEach(member => {
      if (!member || member.injury) return;
      const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
      const current = member.staminaValue ?? maxStamina;
      // 休暇は全員一律で大きく回復（現在値ベースまたは固定）
      member.staminaValue = Math.min(maxStamina, current + Math.max(fullVacationRec, current * 1.0));
    });
    setLog(`【1週間の休暇】全員がしっかり休養しました${officeMessage ? ` / ${officeMessage}` : ''}。`);
    
    // UIを最新の状態に更新
    if (typeof updateUI === 'function') updateUI();
    if (typeof renderWeeklyActionPanel === 'function') renderWeeklyActionPanel();
    return { levelUps: 0, injuries: [] };
  }

  const releaseSlots = calculateRestReleaseSlots(restingMemberIds, fixedSlots);
  const fullyRecoveredMembers = [];

  const itemsList = typeof WEEKLY_SCHEDULE_ITEMS !== 'undefined' ? WEEKLY_SCHEDULE_ITEMS : [];
  const groupOnlySlots = weeklySchedule.slots
    .map((slotId, index) => ({ slotId, index }))
    .filter(entry => !fixedSlots.has(entry.index) && itemsList.some(item => item.id === entry.slotId && item.groupOnly));

  const groupOnlyAvailableSlots = new Set(groupOnlySlots
    .filter(entry => participants.filter(member => {
      if (!member || member.injury) return false;
      if (!restingMemberIds.has(member.id)) return true;
      const releaseIdx = releaseSlots.get(member.id);
      return releaseIdx !== -1 && releaseIdx <= entry.index;
    }).length >= 2)
    .map(entry => entry.index));

  const skippedGroupOnly = groupOnlySlots.some(entry => !groupOnlyAvailableSlots.has(entry.index));

  let levelUps = 0;
  const injuries = [];

  const targetMemberId = weeklySchedule.individualMemberId;
  const targetStat = weeklySchedule.individualStat || 'vocal';
  const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
  const autoRestTarget = typeof AUTO_REST_STAMINA_TARGET !== 'undefined' ? AUTO_REST_STAMINA_TARGET : 80;
  const morningMultiplier = typeof MORNING_SLOT_MULTIPLIER !== 'undefined' ? MORNING_SLOT_MULTIPLIER : 0.8;
  const rehCost = typeof REHEARSAL_STAMINA_COST !== 'undefined' ? REHEARSAL_STAMINA_COST : 8;
  const bcastCost = typeof BROADCAST_STAMINA_COST !== 'undefined' ? BROADCAST_STAMINA_COST : 12;

  participants.forEach(member => {
    if (!member || member.injury) return;

    const isRestDesignated = restingMemberIds.has(member.id);
    const releaseIndex = releaseSlots.get(member.id) ?? 0;

    let staminaCost = 0;
    let remainingStamina = member.staminaValue ?? maxStamina;
    let memberLevels = 0;

    weeklySchedule.slots.forEach((slotId, index) => {
      const fixed = fixedSlots.get(index);
      const isCurrentlyResting = isRestDesignated && (releaseIndex === -1 || index < releaseIndex);

      if (fixed) {
        if (fixed.kind === 'rest-day') {
          // 固定の休養枠（半日扱い：100%回復）
          remainingStamina = Math.min(maxStamina, remainingStamina + remainingStamina * 1.0);
          return;
        }
        if (isCurrentlyResting) return;

        const fixedCost = fixed.kind === 'rehearsal' ? rehCost : (fixed.kind === 'broadcast' ? bcastCost : 0);
        staminaCost += fixedCost;
        remainingStamina = Math.max(0, remainingStamina - fixedCost);
        return;
      }

      // 休養スロット（半日休養＝100%回復、フル休養＝150%回復）
      if (slotId === 'rest-day') {
        const periodIndex = (typeof getWeekSlotPeriod === 'function') ? getWeekSlotPeriod(index) : (index % 2);
        const pairIndex = periodIndex === 0 ? index + 1 : index - 1;
        const pairSlotId = weeklySchedule.slots[pairIndex];
        const pairFixed = fixedSlots.get(pairIndex);
        const isPairRest = (pairFixed && pairFixed.kind === 'rest-day') || pairSlotId === 'rest-day';

        if (isPairRest && periodIndex === 0) {
          // 1日フル休養（午前・午後どちらも休養：150%回復。重複を防ぐため午前側で処理）
          remainingStamina = Math.min(maxStamina, remainingStamina + remainingStamina * 1.5);
        } else if (!isPairRest) {
          // 半日休養（100%回復）
          remainingStamina = Math.min(maxStamina, remainingStamina + remainingStamina * 1.0);
        }
        return;
      }

      // 食事会（別枠扱い：しっかり大きめに回復 +30 または 100%）
      if (slotId === 'meal-party') {
        remainingStamina = Math.min(maxStamina, remainingStamina + Math.max(30, remainingStamina * 1.0));
        return;
      }

      if (!slotId || isCurrentlyResting) return;

      const item = itemsList.find(row => row.id === slotId);
      if (!item) return;

      const periodIndex = (typeof getWeekSlotPeriod === 'function') ? getWeekSlotPeriod(index) : (index % 2);
      const slotEffect = periodIndex === 0 ? morningMultiplier : 1;

      if (slotId === 'individual-lesson') {
        if (member.id === targetMemberId) {
          const baseExp = getWeeklyLessonExperience() * slotEffect;
          const gainedExp = Math.round(baseExp * SPECIAL_INDIVIDUAL_MULTIPLIER);
          if (typeof addMemberStatExp === 'function') {
            memberLevels += addMemberStatExp(member, targetStat, gainedExp);
          }
          const cost = getLessonStaminaCost(item, remainingStamina, slotEffect);
          staminaCost += cost;
          remainingStamina = Math.max(0, remainingStamina - cost);
        } else {
          // 休養中の他メンバーは半日休養扱い（100%回復）
          remainingStamina = Math.min(maxStamina, remainingStamina + remainingStamina * 1.0);
        }
        return;
      }

      if (item.groupOnly && !groupOnlyAvailableSlots.has(index)) return;

      memberLevels += applyMemberLesson(member, slotId, 1, null, slotEffect).levels;
      const cost = getLessonStaminaCost(item, remainingStamina, slotEffect);
      staminaCost += cost;
      remainingStamina = Math.max(0, remainingStamina - cost);
    });

   // 修正後：計算結果を実際のメンバーオブジェクトに確実に代入する
  levelUps += memberLevels;
  member.staminaValue = Math.max(0, Math.min(maxStamina, remainingStamina));
  
  if (staminaCost > 0) {
    if (typeof rollMemberInjury === 'function' && rollMemberInjury(member, 0)) {
      const type = member.injury?.type || 'ケガ';
      const formattedWeeks = (typeof formatInjuryWeeks === 'function') ? formatInjuryWeeks(member.injury) : '';
      injuries.push(`${member.name}（${type}・${formattedWeeks}）`);
    }
  }

    if ((member.staminaValue ?? maxStamina) >= autoRestTarget) {
      fullyRecoveredMembers.push(member.id);
    }
  });

  weeklySchedule.restDayMembers = weeklySchedule.restDayMembers.filter(
    id => !fullyRecoveredMembers.includes(id)
  );

  const countByLabel = new Map();
  weeklySchedule.slots.forEach((slotId, index) => {
    if (!slotId || fixedSlots.has(index)) return;
    const item = itemsList.find(entry => entry.id === slotId);
    if (item && item.groupOnly && !groupOnlyAvailableSlots.has(index)) return;
    const label = itemIdLabel(slotId);
    countByLabel.set(label, (countByLabel.get(label) || 0) + 1);
  });
  fixedSlots.forEach(slot => {
    countByLabel.set(slot.label, (countByLabel.get(slot.label) || 0) + 1);
  });

  const parts = [];
  const breakdown = [...countByLabel.entries()].map(([label, count]) => `${label}${count > 1 ? `×${count}` : ''}`);
  if (breakdown.length) parts.push(`実施: ${breakdown.join(' / ')}`);

  const currentRestNames = (weeklySchedule.restDayMembers || [])
    .map(id => participants.find(m => m.id === id)?.name)
    .filter(Boolean);
  if (currentRestNames.length) parts.push(`継続休養: ${currentRestNames.join('、')}`);

  if (fullyRecoveredMembers.length) {
    const recoveredNames = fullyRecoveredMembers
      .map(id => participants.find(m => m.id === id)?.name)
      .filter(Boolean);
    parts.push(`復帰完了: ${recoveredNames.join('、')}`);
  }

  const targetMember = participants.find(m => m.id === targetMemberId);
  const statusKeysList = typeof STATUS_KEYS !== 'undefined' ? STATUS_KEYS : [];
  const targetStatName = statusKeysList.find(k => k.id === targetStat)?.name || targetStat;
  const individualLessonCount = weeklySchedule.slots.filter(s => s === 'individual-lesson').length;
  if (individualLessonCount > 0 && targetMember) {
    parts.push(`個別レッスン: ${targetMember.name}（${targetStatName} 10.1倍 / 他メンバー休養）`);
  }

  const mealCount = getWeekMealPartyCount();
  const mealCostSingle = typeof MEAL_PARTY_COST !== 'undefined' ? MEAL_PARTY_COST : 1000000;
  if (mealCount > 0) parts.push(`食事会 ${mealCount}回（${formatMoney(mealCount * mealCostSingle)}）`);

  if (officeMessage) parts.push(`事務作業: ${officeMessage}`);
  if (skippedGroupOnly) parts.push('連携: 参加者不足のため未実施');
  if (levelUps > 0) parts.push(`能力UP ${levelUps}件`);
  if (injuries.length) parts.push(`【ケガ】${injuries.join('、')}`);

  setLog(`【週間スケジュール】${parts.join(' / ')}`);
  weeklyRecoveryDone = true;

  // ★ 処理完了後にUIを最新の状態に強制更新し、スタミナ変動を画面に反映させる
  if (typeof updateUI === 'function') updateUI();
  if (typeof renderWeeklyActionPanel === 'function') renderWeeklyActionPanel();

  return { levelUps, injuries };
}
function itemIdLabel(itemId) {
  if (itemId === 'individual-lesson') {
    const statusKeysList = typeof STATUS_KEYS !== 'undefined' ? STATUS_KEYS : [];
    const statName = statusKeysList.find(key => key.id === weeklySchedule?.individualStat)?.name || '歌唱力';
    return `個別レッスン（${statName}）`;
  }
  const itemsList = typeof WEEKLY_SCHEDULE_ITEMS !== 'undefined' ? WEEKLY_SCHEDULE_ITEMS : [];
  return itemsList.find(entry => entry.id === itemId)?.name || itemId;
}

function selectOfficeAction(actionId) {
  ensureWeeklySchedule();
  const actions = typeof OFFICE_ACTIONS !== 'undefined' ? OFFICE_ACTIONS : [];
  if (actionId && !actions.some(action => action.id === actionId)) return;
  weeklySchedule.officeAction = weeklySchedule.officeAction === actionId ? '' : actionId;
  renderWeeklyActionPanel();
}

function applyOfficeAction(actionId) {
  if (actionId === 'single-promotion') {
    if (typeof getSinglePromotionTarget !== 'function') return '';
    const target = getSinglePromotionTarget();
    if (!target) {
      if (Array.isArray(idolRoster)) {
        idolRoster.filter(idol => idol && idol.isSelected).forEach(idol => {
          if (idol.stats) idol.stats.popularity = Math.min(100, (idol.stats.popularity || 0) + 1);
        });
      }
      return 'シングル販促（楽曲未発表のため選抜メンバーの人気Up）';
    }
    const result = applySinglePromotion(target.song);
    if (typeof addSongExperience === 'function') addSongExperience(target.song, 3);
    const label = target.isUpcoming ? '次作' : '今作';
    return `シングル販促・${label}「${target.song.title}」（+${result.addedSales.toLocaleString()}枚 / 累計${result.cumulativeSales.toLocaleString()}枚）`;
  }
  if (actionId === 'live-promotion') {
    if (typeof nextLivePromotionPoints !== 'undefined') nextLivePromotionPoints++;
    return `ライブ広報（次回ライブの集客効果 累計+${nextLivePromotionPoints}）`;
  }
  if (actionId === 'goods-development') {
    const maxProd = typeof MAX_MERCHANDISE_PRODUCTS !== 'undefined' ? MAX_MERCHANDISE_PRODUCTS : 20;
    const devCost = typeof GOODS_DEVELOPMENT_COST !== 'undefined' ? GOODS_DEVELOPMENT_COST : 1000000;

    if (!Array.isArray(merchandiseItems)) merchandiseItems = [];
    merchandiseProducts = merchandiseItems.length;

    if (merchandiseProducts >= maxProd) {
      return `グッズ開発（上限${maxProd}種のため未実施）`;
    }

    merchandiseItems.push({ createdAt: gameDate });
    merchandiseProducts = merchandiseItems.length;

    funds -= devCost;
    if (typeof recordMonthlyExpense === 'function') recordMonthlyExpense('グッズ開発', devCost);
    return `グッズ開発（全${merchandiseProducts}種 / 在庫変動なし / -${formatMoney(devCost)}）`;
  }
  if (actionId === 'goods-production') {
    const activeMembersCount = (Array.isArray(idolRoster) ? idolRoster : []).filter(m => m && !m.injury).length;
    const currentProdTypes = typeof merchandiseProducts !== 'undefined' ? merchandiseProducts : 0;
    const productionCost = 3000 * (activeMembersCount * Math.max(1, currentProdTypes) * 100);
    const unitsProduced = activeMembersCount * Math.max(1, currentProdTypes) * 100;

    if (funds < productionCost) {
      return `グッズ制作（資金不足のため未実施）`;
    }

    funds -= productionCost;
    merchandiseStock = (typeof merchandiseStock !== 'undefined' ? merchandiseStock : 0) + unitsProduced;
    if (typeof recordMonthlyExpense === 'function') {
      recordMonthlyExpense('グッズ制作', productionCost);
    }
    return `グッズ制作（在庫 +${unitsProduced.toLocaleString()}個 / -${formatMoney(productionCost)}）`;
  }
  return '';
}
