// ==========================================
// 進行（週次判定・危機・設備）
// ==========================================
// ==========================================
// 6. 進行 ＆ イベントシステム
// ==========================================
function getBirthdayMembersBetween(startDate, endDate) {
  const birthdays = [];
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  idolRoster.forEach(member => {
    const month = member.birthdayMonth || 1;
    const day = member.birthdayDay || ((member.birthdayWeek - 1) * 7 + 1) || 1;
    for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year++) {
      const birthday = getBirthdayDate(year, month, day);
      if (birthday.getTime() <= startTime) continue;
      if (birthday.getTime() > endTime) break;
      birthdays.push(member);
      break;
    }
  });
  return birthdays;
}

// メンバーBirthdaysを処理する。
function processMemberBirthdays(startDate, endDate) {
  const birthdayMembers = getBirthdayMembersBetween(startDate, endDate);
  // 年齢の更新は syncMemberAges が生年月日から行うため、ここではログのみ
  if (birthdayMembers.length) {
    setLog(`【誕生日】${birthdayMembers.map(member => member.name).join('、')}が誕生日を迎えました。`);
  }
}

// 現在週キーを取得する。
function getCurrentWeekKey() {
  return gameDate;
}

// 最初Wednesday月を判定する。
function isFirstWednesdayOfMonth(date = getGameDateObject()) {
  return date.getDay() === 3 && date.getDate() <= 7;
}

// 最後Wednesday月を判定する。
function isLastWednesdayOfMonth(date = getGameDateObject()) {
  return date.getDay() === 3 && date.getTime() === getLastWednesday(date.getFullYear(), date.getMonth()).getTime();
}

// 指定期間の次に開催される自分のライブ日・テレビ出演日を探す
function hasUpcomingSpecialBroadcastOffer() {
  return pendingPerformanceOffers.some(offer => offer.isSpecial);
}

// 今週に自グループ設定ライブがあるか（ある場合は週間スケジュールを組めない）
function hasLiveWithinWeek(date = getGameDateObject()) {
  return Boolean(findWeekLiveStop(date));
}

// 今週の自グループ設定ライブ日（なければ null）
function findWeekLiveStop(date = getGameDateObject()) {
  const dateKey = toDateKey(date);
  const liveIsToday = getScheduledLiveEntries().some(entry =>
    !entry.completed && getLiveEntryShowDates(entry).includes(dateKey)
  );
  if (liveIsToday) return new Date(date);
  return findNextGroupLiveDate(date, getNextWednesday(date));
}

// 外部ライブはスケジュールを止めず、今週の予定として注記する
function getEditableSpecialLiveEventsForWeek(date = getGameDateObject()) {
  const weekEnd = getNextWednesday(date);
  return specialLiveEvents.filter(event => {
    if (event.completed || !event.liveDate) return false;
    const liveDate = getGameDateObject(event.liveDate);
    return liveDate > date && liveDate <= weekEnd;
  });
}

// グループライブ日付を次へ進行する。
function findNextGroupLiveDate(startDate, endDate) {
  let nextLiveDate = null;
  getScheduledLiveEntries().forEach(entry => {
    if (entry.completed) return;
    getLiveEntryShowDates(entry).forEach(dateKey => {
      const candidate = getGameDateObject(dateKey);
      if (candidate > startDate && candidate <= endDate
        && (!nextLiveDate || candidate < nextLiveDate)) {
        nextLiveDate = candidate;
      }
    });
  });
  return nextLiveDate;
}

// 週次危機イベントを抽選する。
function rollWeeklyCrisisEvent() {
  const weekKey = getCurrentWeekKey();
  if (crisisCheckWeekKey === weekKey) return;

  crisisCheckWeekKey = weekKey;
  crisisEventWeekKey = '';
  crisisEventType = '';
  const risk = Math.max(0.5, (100 - calculateGroupCrisisResilience()) * 0.12);
  if (Math.random() * 100 < risk) {
    crisisEventWeekKey = weekKey;
    crisisEventType = Math.random() < 0.5 ? 'information-leak' : 'sns-scandal';
  }
}

// グループ危機Resilienceを計算する。
function calculateGroupCrisisResilience() {
  const selectedMembers = idolRoster.filter(member => member.isSelected);
  const targets = selectedMembers.length ? selectedMembers : idolRoster;
  const averageSns = targets.length
    ? targets.reduce((total, member) => total + (member.stats.sns || 0), 0) / targets.length
    : 0;
  const dataBonus = ((officeUpgrades.analytics || 1) - 1) * 5;
  const snsBonus = ((officeUpgrades.snsTraining || 1) - 1) * 7;
  // 危機回避力はグループ危機・SNS運用・設備のみで決まる（マネージャーは特別強化専用）
  return Math.min(100, Math.round(groupCrisis * 0.6 + averageSns * 0.4 + dataBonus + snsBonus));
}

// 週次Industryオファーを抽選する。
function rollWeeklyIndustryOffer() {
  if (getGameDateObject().getDay() !== 3) return;
  const weekKey = getCurrentWeekKey();
  if (industryOfferCheckWeekKey === weekKey || pendingIndustryOffer) return;
  industryOfferCheckWeekKey = weekKey;
  if (Math.random() >= 0.035) return;

  const isFestival = Math.random() < 0.5;
  const venues = isFestival
    ? VENUE_DATA.filter(venue => ['A', 'S', 'SS'].includes(venue.cap))
    : VENUE_DATA.filter(venue => ['C', 'D'].includes(venue.cap));
  const venue = venues[Math.floor(Math.random() * venues.length)];
  const offerDate = getGameDateObject();
  offerDate.setDate(offerDate.getDate() + (isFestival ? 60 : 45));
  pendingIndustryOffer = {
    id: `industry-${gameDate}-${isFestival ? 'festival' : 'battle'}`,
    type: isFestival ? 'festival' : 'battle',
    name: isFestival ? '大型フェス出演打診' : '有名アーティストとの対バン打診',
    venue: venue.name,
    liveDate: toDateKey(offerDate)
  };
}

// 設備強化の打診で候補になる設備（寮・グッズ技術・ライブ演出の追加対応版）
function getEquipmentUpgradeCandidates() {
  const weekKey = getCurrentWeekKey();
  const candidates = [];
  const currentScore = calculateTeamAverages().overall;
  const rivalTeams = leagueTeams.filter(team => team.id !== 'player');
  const rivalAverage = rivalTeams.length
    ? rivalTeams.reduce((total, team) => total + team.basePower, 0) / rivalTeams.length
    : currentScore;
  const strongestRival = rivalTeams.reduce((strongest, team) => Math.max(strongest, team.basePower), 0);

  // 1. メンバーの体力が低い状態が続いている場合（メンバー寮の改善）
  const lowStaminaCount = (Array.isArray(idolRoster) ? idolRoster : []).filter(m => m && !m.injury && (m.staminaValue ?? 100) < 50).length;
  if (lowStaminaCount >= 3 || (crisisEventType === 'sns-scandal' && crisisEventWeekKey === weekKey)) {
    candidates.push({ 
      facilityId: 'dormitory', 
      reason: 'メンバーの体力が低い状態が続いています。メンバー寮を改善しましょう。' 
    });
  }

  // 2. グッズ完売率が低い場合の判定（新しいグッズ製造技術の導入）
  if (Number.isFinite(merchandiseSellThrough) && merchandiseSellThrough < 0.6) {
    candidates.push({ 
      facilityId: 'merchandise', 
      reason: '市場に新しいグッズ製造技術が広まっています導入しますか。' 
    });
  }

  // 3. ライブの動員や実績が伸び悩んでいる場合の判定（ライブ演出チームの増員）
  const recentLives = Array.isArray(window.liveHistory) ? window.liveHistory.slice(-2) : [];
  const lowLivePerformance = recentLives.some(l => l.dailyAudience < 5000);
  if (lowLivePerformance || currentScore + 5 < rivalAverage) {
    candidates.push({ 
      facilityId: 'liveProduction', 
      reason: 'ライブ演出に対して一部ファンの中が不満を持っています。ライブ演出チームを増員しますか。' 
    });
  }

  if (crisisEventType === 'sns-scandal' && crisisEventWeekKey === weekKey) {
    candidates.push({ facilityId: 'snsTraining', reason: 'SNSスキャンダルを受け、メンバーのSNS教育が必要です。' });
  }
  if (Number.isFinite(merchandiseSellThrough) && merchandiseSellThrough < 0.5) {
    candidates.push({ facilityId: 'analytics', reason: `グッズの直近完売率が${Math.round(merchandiseSellThrough * 100)}%です。販売データの分析が必要です。` });
  }
  if (currentScore + 8 < rivalAverage) {
    candidates.push({ facilityId: 'lessons', reason: '流行に取り残されないためにはレッスン環境の強化が必要です。' });
  }
  if (strongestRival > currentScore + 12) {
    candidates.push({ facilityId: 'analytics', reason: '他グループの影響力が強く、市場データの分析が必要です。' });
  }

  const myAverageLevel = OFFICE_FACILITIES.reduce((sum, f) => sum + (officeUpgrades[f.id] || 0), 0) / OFFICE_FACILITIES.length;
  const behindRivals = OFFICE_FACILITIES.find(f =>
    (officeUpgrades[f.id] || 0) < MAX_OFFICE_LEVEL && (officeUpgrades[f.id] || 0) + 1 < myAverageLevel
  );
  if (behindRivals && currentScore + 3 < rivalAverage) {
    candidates.push({ facilityId: behindRivals.id, reason: `${behindRivals.name}の強化をおすすめします。` });
  }

  const active = candidates.filter(candidate => (officeUpgrades[candidate.facilityId] || 0) < MAX_OFFICE_LEVEL);
  if (active.length) return active;
  // 特に劣る設備がないときは、経営会議での一般的な強化打診が届く
  return OFFICE_FACILITIES
    .filter(facility => (officeUpgrades[facility.id] || 0) < MAX_OFFICE_LEVEL)
    .map(facility => ({ facilityId: facility.id, reason: '経営会議で事務所設備の強化が提案されました。' }));
}

// 強化対象の設備を1件選ぶ（候補があればその中から、無ければ未強化の設備から）
function pickEquipmentUpgradeCandidate() {
  const candidates = getEquipmentUpgradeCandidates();
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// 資金難によるダウングレード提案（Lv.2以上の設備を対象にする）
function rollEquipmentDowngradeEvent() {
  if (getGameDateObject().getDay() !== 3) return;
  if (pendingEquipmentEvent || equipmentDowngradeCheckWeekKey === getCurrentWeekKey()) return;
  equipmentDowngradeCheckWeekKey = getCurrentWeekKey();

  const weeklyCost = OFFICE_FACILITIES.reduce((sum, f) => sum + getOfficeMaintenanceCost(f), 0);
  
  if (funds >= weeklyCost || Math.random() >= 0.30) return;
  const candidates = OFFICE_FACILITIES
    .filter(f => (officeUpgrades[f.id] || 0) > 1)
    .map(f => ({ facility: f, level: officeUpgrades[f.id] }))
    .sort((a, b) => (getOfficeMaintenanceCost(b.facility, b.level) - getOfficeMaintenanceCost(a.facility, a.level)));
  if (!candidates.length) return;

  const target = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
  const refund = getOfficeDowngradeRefund(target.facility, target.level);
  pendingEquipmentEvent = {
    eventType: 'downgrade',
    facilityId: target.facility.id,
    name: target.facility.name,
    reason: `資金繰りのため、${target.facility.name}のLv.${target.level}を見直す提案が出ました。`,
    eventDate: gameDate
  };
  setLog(`【設備整理提案】${target.facility.name}をLv.${target.level - 1}に縮小すると ${formatMoney(refund)} 回収できます。`);
}

// 設備整理（ダウングレード）提案のモーダル。強化打診はランダムイベントで処理する
function openEquipmentEventModal() {
  if (!pendingEquipmentEvent) return;
  const facility = OFFICE_FACILITIES.find(item => item.id === pendingEquipmentEvent.facilityId);
  if (!facility) return;
  const level = officeUpgrades[facility.id] || 0;
  const button = document.getElementById('equipment-event-upgrade');
  const description = document.getElementById('equipment-event-description');
  const title = document.getElementById('equipment-event-title');

  // ダウングレード提案：Lv.2以上の設備を1段階下げる（売却額は資金に戻る）
  const refund = getOfficeDowngradeRefund(facility, level);
  const saving = getOfficeMaintenanceCost(facility, level) - getOfficeMaintenanceCost(facility, level - 1);
  button.disabled = level <= 1;
  button.textContent = 'ダウングレード';
  if (title) title.textContent = '設備整理の提案';
  description.textContent =
    `${pendingEquipmentEvent.reason} ${facility.name}をLv.${level - 1}に下げますか？\n売却額: ${formatMoney(refund)} / 週間維持費の削減: ${formatMoney(saving)}${level <= 1 ? '（Lv.1未満にはできません）' : ''}`;
  document.getElementById('equipment-event-modal').style.display = 'flex';
}

// 装備イベントを解決する。
function resolveEquipmentEvent(accept) {
  if (!pendingEquipmentEvent) return;
  const event = pendingEquipmentEvent;
  pendingEquipmentEvent = null;
  document.getElementById('equipment-event-modal').style.display = 'none';

  const facility = OFFICE_FACILITIES.find(item => item.id === event.facilityId);
  const level = facility ? (officeUpgrades[event.facilityId] || 0) : 0;
  if (accept && facility && level > 1) {
    const refund = getOfficeDowngradeRefund(facility, level);
    officeUpgrades[event.facilityId] = level - 1;
    funds += refund;
    setLog(`【設備整理】${facility.name}をLv.${level - 1}にダウングレードしました（売却額 ${formatMoney(refund)}）。`);
  } else {
    setLog(`【設備整理】${event.name}の縮小提案を見送りました。`);
  }
  updateUI();
  if (pendingPerformanceOffers.length) openMusicOfferModal();
}

// Industryオファーを解決する。
function resolveIndustryOffer() {
  if (!pendingIndustryOffer) return;
  const offer = pendingIndustryOffer;
  pendingIndustryOffer = null;
  if (!confirm(`【出演打診】${offer.name}\n${offer.liveDate} / ${offer.venue}\n出演を受諾しますか？`)) {
    setLog(`【出演辞退】${offer.name}を辞退しました。`);
    return;
  }
  specialLiveEvents.push({ ...offer, completed: false });
  setLog(`【出演決定】${offer.name}を受諾しました（${offer.liveDate}）。`);
}

// 現在週イベントを取得する。
function getCurrentWeekEvents() {
  const currentDate = getGameDateObject();
  if (currentDate.getDay() === 3) {
    rollWeeklyCrisisEvent();
    rollWeeklyIndustryOffer();
    rollEquipmentDowngradeEvent();
  }
  const events = [];
  const weekKey = getCurrentWeekKey();
  const birthdayMembers = getBirthdayMembersBetween(currentDate, getNextWednesday(currentDate));
  if (birthdayMembers.length) events.push(`誕生日: ${birthdayMembers.map(member => member.name).join('、')}`);
  const rivalEvents = rivalLiveBookings.filter(booking => booking.liveDate === gameDate);
  if (rivalEvents.length) events.push(`他グループのライブ: ${rivalEvents.map(event => event.groupName).join('、')}`);

  if (isFirstWednesdayOfMonth(currentDate)) {
    const targetMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const targetYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const releasePlan = productionSchedule[`${targetYear}-${targetMonth}`];
    if (releasePlan?.release && releasePlan.release !== 'none' && !releasePlan.musicOfferSent) {
      events.push('音楽番組の出演打診');
    }
    if (hasUpcomingSpecialBroadcastOffer(currentDate)) events.push('大型特番の出演打診');

    const targetReleaseDate = new Date(currentDate);
    targetReleaseDate.setDate(targetReleaseDate.getDate() + SENBATSU_LEAD_DAYS);
    const targetReleaseYear = currentYear + targetReleaseDate.getFullYear() - calendarYear;
    const targetReleaseMonth = targetReleaseDate.getMonth() + 1;
    const selectionPlan = productionSchedule[`${targetReleaseYear}-${targetReleaseMonth}`];
    if (selectionPlan?.release && selectionPlan.release !== 'none') events.push('選抜発表');
    if (currentMonth === 1 || currentMonth === 7) events.push('半年活動計画');
  }

  getScheduledLiveEntries().forEach(entry => {
    if (!entry.completed && toDateKey(entry.date) === gameDate) events.push(`ライブ開催: ${entry.liveName || entry.liveVenue}`);
  });
  specialLiveEvents.forEach(event => {
    if (!event.completed && event.liveDate === gameDate) events.push(event.name);
  });
  // テレビ出演（定例番組／大型特番）
  scheduledPerformances.forEach(performance => {
    if (performance.airDate === gameDate) {
      events.push(`${performance.isSpecial ? '大型特番出演' : 'テレビ出演'}: ${performance.name}`);
    }
  });
  // 年末の大型イベント（赤白 12/31 ／ 大賞 12/30）
  if (currentMonth === 12 && currentWeek <= 5) {
    if (!yearEndAwardProcessed && currentDate.getDate() >= AWARD_DATE.day - 3) events.push(`日本CD大賞（${AWARD_DATE.month}/${AWARD_DATE.day}）`);
    if (!yearEndKohakuProcessed && currentDate.getDate() >= KOHAKU_DATE.day - 3) events.push(`赤白歌合戦（${KOHAKU_DATE.month}/${KOHAKU_DATE.day}）`);
  }

  // 計画したCD関連イベント
  getPlanEventEntries().forEach(entry => {
    if (isPlanEventDue(entry, gameDate)) {
      events.push(`${getPlanEventType(entry.event.benefitId)?.name || 'イベント'}: ${formatPlanDayLabel(entry.event.date)}`);
    }
  });

  if (isLastWednesdayOfMonth(currentDate)) events.push('給与支払い');
  if (isPlanReleaseDue(productionSchedule[`${currentYear}-${currentMonth}`], gameDate)) events.push('CD発売');

  if (totalWeeksElapsed > 0 && totalWeeksElapsed % 120 === 0) events.push('ドラフト会議');
  if (crisisEventWeekKey === weekKey) {
    events.push(crisisEventType === 'information-leak' ? '情報漏洩への対応' : 'SNSスキャンダル対応');
  }
  if (pendingIndustryOffer) events.push(pendingIndustryOffer.name);
  if (pendingEquipmentEvent) events.push(`設備整理提案: ${pendingEquipmentEvent.name}`);
  // ランダムイベントは発生するまで伏せているため、ここには出さない
  if (pendingFanClubEvent) events.push(pendingFanClubEvent.type === 'founding' ? 'ファンクラブ設立の打診' : 'ファンクラブ会費の見直し');
  return events;
}

// UpcomingSingle計画を探す。
function findUpcomingSinglePlan() {
  return Object.entries(productionSchedule)
    .map(([key, plan]) => {
      const [year, month] = key.split('-').map(Number);
      return { year, month, plan };
    })
    .filter(item => item.plan.release === 'single' && item.year * 12 + item.month >= currentYear * 12 + currentMonth)
    .sort((a, b) => a.year - b.year || a.month - b.month)[0] || null;
}

// 直近に発売したシングル（今作）。無ければ直近の楽曲
function findLatestReleasedSong() {
  const released = songs.filter(song => song.released);
  if (!released.length) return null;
  const singles = released.filter(song => song.releaseType !== 'album');
  const pool = singles.length ? singles : released;
  return pool.sort((a, b) => b.releaseYear - a.releaseYear || b.releaseMonth - a.releaseMonth)[0] || null;
}

// シングル販促の対象（選抜発表前＝今作／発表後＝次作）
function getSinglePromotionTarget() {
  const upcoming = findUpcomingSinglePlan();
  // 選抜発表が済んだ次作は発売準備中なので、次作を販促する
  if (upcoming && upcoming.plan.senbatsuAnnounced) {
    return { song: ensureScheduledSong(upcoming.year, upcoming.month, upcoming.plan), isUpcoming: true };
  }
  // 発表前（または次作が無い）なら直近の発売曲＝今作を販促する
  const current = findLatestReleasedSong();
  if (current) return { song: current, isUpcoming: false };
  // まだ楽曲が1曲も無い場合は次作を作って販促する
  if (upcoming) return { song: ensureScheduledSong(upcoming.year, upcoming.month, upcoming.plan), isUpcoming: true };
  return null;
}
