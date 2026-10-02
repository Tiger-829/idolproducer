// ==========================================
// 週間スケジュールと週進行
// ==========================================
// ==========================================
// 週間スケジュール（グループレッスン／休養日／特別強化）
// ==========================================

// 直前週に確定したスケジュール（次週の初期値に使う）
let lastWeekSchedule = null;

function createEmptyWeeklySchedule() {
  // 1週間は14枠（7日×午前/午後）で固定。休養を1日フル＋2枠あけて、残りをレッスンで埋める
  const slots = [...DEFAULT_WEEK_SLOTS];
  while (slots.length < WEEK_SLOT_COUNT) slots.push('');
  slots.length = WEEK_SLOT_COUNT;
  const availableMembers = idolRoster.filter(member => member.isSelected && !member.injury);
  const defaultMember = availableMembers[0]?.id ?? idolRoster.find(member => !member.injury)?.id ?? '';
  // 休養を指示されるメンバー（体力値が閾値を下回る人不参加）
  const restDayMembers = idolRoster
    .filter(member => (member.staminaValue ?? MAX_STAMINA_VALUE) < STAMINA_WARNING_THRESHOLD)
    .map(member => member.id);
  return { slots, vacation: false, individualMemberId: defaultMember, individualStat: 'vocal', focusMemberIds: [defaultMember].filter(Boolean), restDayMembers, officeAction: '' };
}

function ensureWeeklySchedule() {
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) {
    weeklySchedule = lastWeekSchedule ? createScheduleFromLastWeek() : createEmptyWeeklySchedule();
    return;
  }
  // 旧セーブ（可変長の枠）を14枠へ移行する
  const slots = weeklySchedule.slots.slice(0, WEEK_SLOT_COUNT);
  while (slots.length < WEEK_SLOT_COUNT) slots.push('');
  weeklySchedule.slots = slots;
  weeklySchedule.vacation = Boolean(weeklySchedule.vacation);
  if (!Array.isArray(weeklySchedule.restDayMembers)) weeklySchedule.restDayMembers = [];
  if (!Array.isArray(weeklySchedule.focusMemberIds)) {
    // 旧セーブ（focusMemberId 単一）を複数人対応へ移行する
    weeklySchedule.focusMemberIds = weeklySchedule.focusMemberId ? [weeklySchedule.focusMemberId] : [];
  }
  delete weeklySchedule.focusMemberId;
  if (!INDIVIDUAL_LESSON_STATS.includes(weeklySchedule.individualStat)) weeklySchedule.individualStat = 'vocal';
  // 事務作業は「未選択 or 定義済みの1件」のみ認める
  if (!OFFICE_ACTIONS.some(action => action.id === weeklySchedule.officeAction)) weeklySchedule.officeAction = '';
  // 強化人数の上限はマネージャー側で管理するため、ここではトリムしない
}

// 1週間の休暇を切り替える（オンなら14枠すべてが休養になる。テレビ出演枠がある週は不可）
function toggleWeekVacation() {
  ensureWeeklySchedule();
  if (getWeekFixedSlots().size) {
    setLog('【週間スケジュール】テレビ出演がある週は1週間の休暇をとれません。');
    return;
  }
  weeklySchedule.vacation = !weeklySchedule.vacation;
  renderWeeklyActionPanel();
}

// 枠に内容（itemId）を割り当てる（休暇中・テレビ出演で固定された枠は変更できない）
function setWeeklyScheduleSlot(index, itemId) {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return;
  if (index < 0 || index >= weeklySchedule.slots.length) return;
  if (getWeekFixedSlots().has(index)) return;
  // 週の上限がある項目は、超過分をここで弾く（明示して黙って無視しない）
  const blocked = getWeeklyLimitBlocker(itemId, index);
  if (blocked) {
    setLog(`【週間スケジュール】${blocked.message}`);
    renderWeeklyActionPanel();
    return;
  }
  weeklySchedule.slots[index] = itemId;
  renderWeeklyActionPanel();
}

// 週の上限を超える項目を弾く理由（なければnull）
function getWeeklyLimitBlocker(itemId, excludeIndex = -1) {
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

// 特定の項目の今週の枠数（excludeIndex の枠は数えない）
function countWeekSlots(itemId, excludeIndex = -1) {
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) return 0;
  return weeklySchedule.slots.filter((slotId, index) => slotId === itemId && index !== excludeIndex).length;
}

// 週の起点（水曜）から offsetDays 日後が、週グリッドの何番目の曜目に当たるかを求める
// WEEK_DAY_LABELS は「木曜起点」で並んでいるため、
// offset 1（木曜）= index 0 / offset 7（水曜）= index 6 となる。
function getWeekDayIndexForOffset(offsetDays) {
  return (((offsetDays - 1) % WEEK_DAY_LABELS.length) + WEEK_DAY_LABELS.length) % WEEK_DAY_LABELS.length;
}

// 今週のテレビ出演（歌番組・大型特番）を週枠に固定する
// 放送日の「午後」＝出演、その直前の「午前」＝リハーサル として埋め込む
function getWeekFixedSlots() {
  const startDate = getGameDateObject();
  const fixedSlots = new Map();
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
  scheduledPerformances.forEach(performance => {
    if (!performance.airDate) return;
    const airDate = getGameDateObject(performance.airDate);
    const offsetDays = Math.round((airDate - startDate) / 86400000);
    // 起点の翌日から週の最終日（次の水曜の1日前）までを枠に埋め込む
    if (offsetDays < 1 || offsetDays > WEEK_DAY_LABELS.length - 1) return;
    const dayBase = getWeekDayIndexForOffset(offsetDays) * WEEK_PERIOD_LABELS.length;
    addFixed({ index: dayBase + 1, kind: 'broadcast', label: `テレビ出演: ${performance.name}`, names: [performance.name] }, performance.airDate);
    addFixed({ index: dayBase, kind: 'rehearsal', label: 'リハーサル', names: [] }, performance.airDate);
  });
  return fixedSlots;
}

// 今週のテレビ出演一覧（画面への説明用）
function getWeekBroadcastSummaries() {
  return [...getWeekFixedSlots().values()]
    .filter(slot => slot.kind === 'broadcast')
    .map(slot => ({ date: slot.date, names: slot.names }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// テレビ出演の枠数（リハーサル／出演の内訳）
function getWeekBroadcastCounts() {
  const counts = { rehearsal: 0, broadcast: 0 };
  getWeekFixedSlots().forEach(slot => { counts[slot.kind] += 1; });
  return counts;
}

// スケジュールを複製する（参照を共有しないため）
function cloneWeeklySchedule(schedule) {
  if (!schedule) return null;
  return {
    slots: Array.isArray(schedule.slots) ? schedule.slots.slice() : [],
    vacation: Boolean(schedule.vacation),
    individualMemberId: schedule.individualMemberId || '',
    individualStat: schedule.individualStat || 'vocal',
    focusMemberIds: Array.isArray(schedule.focusMemberIds) ? schedule.focusMemberIds.slice() : [],
    restDayMembers: Array.isArray(schedule.restDayMembers) ? schedule.restDayMembers.slice() : [],
    officeAction: schedule.officeAction || ''
  };
}

// 確定した週のスケジュールを「直前週」として保存する
function rememberWeeklySchedule(schedule) {
  lastWeekSchedule = cloneWeeklySchedule(schedule);
}

// 直前週のスケジュールから下書きを作る
// テレビ出演などの固定枠は今週の予定で上書きする
function createScheduleFromLastWeek() {
  const base = createEmptyWeeklySchedule();
  if (!lastWeekSchedule) return base;
  const slots = lastWeekSchedule.slots.map(slot => slot || '');
  while (slots.length < WEEK_SLOT_COUNT) slots.push('');
  slots.length = WEEK_SLOT_COUNT;
  // 固定枠（リハーサル／テレビ出演）を今週の予定で上書きする
  getWeekFixedSlots().forEach((slot, index) => {
    if (index >= 0 && index < slots.length) slots[index] = slot.kind;
  });
  base.slots = slots;
  base.vacation = lastWeekSchedule.vacation;
  base.individualMemberId = lastWeekSchedule.individualMemberId || base.individualMemberId;
  base.individualStat = lastWeekSchedule.individualStat || base.individualStat;
  // 特別強化の対象は、在籍するメンバーだけを残す
  base.focusMemberIds = lastWeekSchedule.focusMemberIds.filter(id =>
    idolRoster.some(member => member.id === id)
  );
  base.officeAction = lastWeekSchedule.officeAction || '';
  return base;
}

// 週が変わったら下書きを作り直す
// 直前週に確定したスケジュールがあれば、それを初期値として引き継ぐ
function resetWeeklySchedule() {
  weeklySchedule = lastWeekSchedule ? createScheduleFromLastWeek() : null;
  weeklyRecoveryDone = false;
}

function setWeeklyScheduleField(field, value) {
  ensureWeeklySchedule();
  weeklySchedule[field] = value;
  renderWeeklyActionPanel();
}

// 特別強化の対象メンバーをトグルする（人数はスケジュール管理力で制限）
function toggleFocusMember(memberId) {
  ensureWeeklySchedule();
  const list = weeklySchedule.focusMemberIds;
  const index = list.indexOf(memberId);
  if (index >= 0) {
    list.splice(index, 1);
  } else {
    if (list.length >= getSpecialTrainingTargetLimit()) {
      setLog(`【特別強化】同時に強化できるのは${getSpecialTrainingTargetLimit()}名までです。`);
      return;
    }
    list.push(memberId);
  }
  renderWeeklyActionPanel();
}

// 休養日の対象メンバーをトグルする
function toggleRestDayMember(memberId) {
  ensureWeeklySchedule();
  const list = weeklySchedule.restDayMembers;
  const index = list.indexOf(memberId);
  if (index >= 0) list.splice(index, 1);
  else list.push(memberId);
  renderWeeklyActionPanel();
}

// その週にグループレッスン（特別強化の対象になるレッスン）が組まれているか
function hasScheduledLessons() {
  if (!weeklySchedule || weeklySchedule.vacation) return false;
  return weeklySchedule.slots.some(slotId => slotId && slotId !== 'rest-day' && slotId !== 'meal-party');
}

// 休養が「1日フル（午前午後とも）＋余り何枠」に分かっているか
// ※「空き」は休養に数えません（体力回復が得られないため、「休養」を選ぶ必要があります）
function getWeekRestBreakdown() {
  ensureWeeklySchedule();
  const isRest = value => value === 'rest-day';
  let fullRestDays = 0;
  let restSlots = 0;
  for (let day = 0; day < WEEK_DAY_LABELS.length; day++) {
    const morning = weeklySchedule.slots[day * WEEK_PERIOD_LABELS.length];
    const afternoon = weeklySchedule.slots[day * WEEK_PERIOD_LABELS.length + 1];
    if (isRest(morning) && isRest(afternoon)) {
      fullRestDays += 1;
      restSlots += 2;
    } else if (isRest(morning) || isRest(afternoon)) {
      restSlots += 1;
    }
  }
  return { fullRestDays, restSlots, extraSlots: Math.max(0, restSlots - fullRestDays * 2) };
}

// 指定した曜日が「1日フル休養」（午前も午後も休養）か
function isWeekRestDay(dayIndex) {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return true;
  const base = dayIndex * WEEK_PERIOD_LABELS.length;
  const isRest = value => value === 'rest-day';
  return isRest(weeklySchedule.slots[base]) && isRest(weeklySchedule.slots[base + 1]);
}

// 食事会が今週何回組まれているか
function getWeekMealPartyCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  return weeklySchedule.slots.filter(slotId => slotId === 'meal-party').length;
}

// レッスン（特別強化の対象）が今週何枠あるか
function getWeekLessonCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  return weeklySchedule.slots.filter(slotId => slotId && slotId !== 'rest-day' && slotId !== 'meal-party').length;
}

// グループレッスン1回あたりの基礎経験値（事務所設備で変動。マネージャーはかからない）
function getWeeklyLessonExperience() {
  const lessonLevel = officeUpgrades.lessons || 0;
  const lessonMultiplier = 1 + lessonLevel * 0.12;
  return Math.round(LESSON_BASE_EXP * lessonMultiplier);
}

// 1人のメンバーに週次レッスン効果をかける
function applyMemberLesson(member, itemId, multiplier = 1, individualStat = null) {
  if (!member || member.injury) return { exp: 0, levels: 0 };
  const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === itemId);
  if (!item || item.rest) return { exp: 0, levels: 0 };

  const exp = Math.round(getWeeklyLessonExperience() * multiplier);
  let levels = 0;
  const primaryStat = itemId === 'individual-lesson'
    ? (INDIVIDUAL_LESSON_STATS.includes(individualStat) ? individualStat : 'vocal')
    : item.expStat;
  if (primaryStat) levels += addMemberStatExp(member, primaryStat, exp);
  Object.entries(item.secondaryExp || {}).forEach(([secondaryStat, ratio]) => {
    levels += addMemberStatExp(member, secondaryStat, exp * ratio);
  });
  return { exp, levels };
}

// 週間スケジュールの実行前チェック（食事会の経費など）
function validateWeeklySchedule() {
  ensureWeeklySchedule();
  // テレビ出演があるのに休暇が選択されていたら解除する（出演は取り消せない）
  if (weeklySchedule.vacation && getWeekFixedSlots().size) {
    weeklySchedule.vacation = false;
    setLog('【週間スケジュール】テレビ出演があるため、1週間の休暇を解除しました。');
  }
  // 週の上限を超えた項目がないか（セーブ読み込み直後の最終防衛線）
  const overLimit = WEEKLY_SCHEDULE_ITEMS
    .filter(item => item.weeklyLimit)
    .map(item => ({ item, used: countWeekSlots(item.id) }))
    .find(entry => entry.used > entry.item.weeklyLimit);
  if (overLimit) {
    alert(`「${overLimit.item.name}」は1週間で${overLimit.item.weeklyLimit}枠までです（現在${overLimit.used}枠）。枠を減らすか、別の内容に変更してください。`);
    return false;
  }
  // グッズ開発は開発費が資金を超えないよう、足りなくなる前に確認する
  if (weeklySchedule.officeAction === 'goods-development' && merchandiseProducts < MAX_MERCHANDISE_PRODUCTS
    && GOODS_DEVELOPMENT_COST > funds) {
    alert(`グッズの開発費 ${formatMoney(GOODS_DEVELOPMENT_COST)} が資金（${formatMoney(funds)}）を超えています。事務作業を変更するか、資金を増やしてください。`);
    return false;
  }
  if (weeklySchedule.vacation) return true;
  const mealCost = getWeekMealPartyCount() * MEAL_PARTY_COST;
  if (mealCost > funds) {
    alert(`食事会の経費 ${formatMoney(mealCost)} が資金（${formatMoney(funds)}）を超えています。食事会の枠を減らすか、資金を増やしてください。`);
    return false;
  }
  return true;
}

// 週間スケジュールを適用する（経験値・体力値の消費／回復・ケガ判定）
function applyWeeklySchedule() {
  ensureWeeklySchedule();
  const selectedMembers = idolRoster.filter(member => member.isSelected);
  const participants = selectedMembers.length ? selectedMembers : idolRoster;
  const restDayMemberIds = new Set(weeklySchedule.restDayMembers || []);
  const individualMember = idolRoster.find(member => member.id === weeklySchedule.individualMemberId);
  const focusIds = new Set(weeklySchedule.focusMemberIds || []);
  const focusMembers = participants.filter(member => focusIds.has(member.id));
  // マネージャーの能力は特別強化にだけ効く
  const specialMultiplier = getSpecialTrainingMultiplier();
  const staminaReduction = getSpecialTrainingStaminaReduction();
  const riskReduction = getSpecialTrainingRiskReduction();
  // 事務作業はメンバーのレッスンと同じ週に実行する（選択されていなければ何もしない）
  const officeMessage = applyOfficeAction(weeklySchedule.officeAction);

  // 1週間の休暇：14枠すべて休養になる。レッスンも出費もケガも発生しない（事務作業は残る）
  if (weeklySchedule.vacation) {
    idolRoster.forEach(member => recoverMemberStamina(member, FULL_VACATION_RECOVERY));
    setLog(`【1週間の休暇】全員がしっかり休養しました（体力値 +${FULL_VACATION_RECOVERY}）${officeMessage ? ` / ${officeMessage}` : ''}。`);
    return { levelUps: 0, injuries: [] };
  }

  const lessonSlotIds = weeklySchedule.slots
    .filter(slotId => slotId && slotId !== 'rest-day' && slotId !== 'meal-party');
  const restSlotCount = weeklySchedule.slots.filter(slotId => slotId === 'rest-day').length;
  const hasLessons = lessonSlotIds.length > 0;
  // グループ練習のみ項目（連携）の今週の枠数
  const groupOnlySlots = lessonSlotIds.filter(slotId =>
    WEEKLY_SCHEDULE_ITEMS.some(item => item.id === slotId && item.groupOnly)
  );
  // テレビ出演で固定された枠（リハーサル／出演）はレッスン経験値ではなく体力消費だけ
  const broadcastCounts = getWeekBroadcastCounts();
  const fixedStaminaCost = (broadcastCounts.rehearsal * REHEARSAL_STAMINA_COST)
    + (broadcastCounts.broadcast * BROADCAST_STAMINA_COST);
  // 連携はグループ練習のみ：実際に参加できるメンバーが2名未満なら成立しない
  const availableMembers = participants.filter(member =>
    !restDayMemberIds.has(member.id) && !member.injury
  );
  const groupOnlyEnabled = availableMembers.length >= 2;
  const skippedGroupOnly = groupOnlySlots.length > 0 && !groupOnlyEnabled;

  // 食事会：100万円/回。人気とグループ危機回避力をわずかに伸ばし、体力も回復する
  const mealCount = getWeekMealPartyCount();
  if (mealCount > 0) {
    funds -= mealCount * MEAL_PARTY_COST;
    adjustTargetPopularity(MEAL_PARTY_POPULARITY_GAIN);
    groupCrisis = Math.min(100, groupCrisis + MEAL_PARTY_CRISIS_GAIN);
  }

  let levelUps = 0;
  const injuries = [];
  const restNames = (weeklySchedule.restDayMembers || [])
    .map(id => idolRoster.find(member => member.id === id)?.name)
    .filter(Boolean);

  participants.forEach(member => {
    const isResting = restDayMemberIds.has(member.id);
    const isFocus = focusIds.has(member.id) && hasLessons;
    let staminaCost = 0;
    let memberLevels = 0;

    if (!isResting && !member.injury) {
      lessonSlotIds.forEach(slotId => {
        const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === slotId);
        if (!item) return;
        if (slotId === 'individual-lesson') {
          if (member.id !== individualMember?.id) return;
          memberLevels += applyMemberLesson(member, slotId, 1, weeklySchedule.individualStat).levels;
          staminaCost += INDIVIDUAL_LESSON_STAMINA_COST * item.staminaCost;
          return;
        }
        // グループ練習のみの項目は、参加者2名未満では成立しない（経験値も体力消費も発生しない）
        if (item.groupOnly && !groupOnlyEnabled) return;
        // グループレッスンは選抜全員が受講。特別強化の対象は強化倍率
        const multiplier = isFocus ? specialMultiplier : 1;
        memberLevels += applyMemberLesson(member, slotId, multiplier).levels;
        staminaCost += GROUP_LESSON_STAMINA_COST * item.staminaCost;
      });
      // テレビ出演枠（リハーサル＋出演）でも体力を消費する
      staminaCost += fixedStaminaCost;
      // 特別強化の追加消費は「1週間あたり1回」だけ加算する（14枠化で高額になりすぎないように）
      if (isFocus) {
        // メンタルケアで特別強化時の追加消費を抑える
        staminaCost += SPECIAL_TRAINING_EXTRA_COST * (1 - staminaReduction);
      }
    }

    levelUps += memberLevels;

    if (staminaCost > 0) {
      consumeMemberStamina(member, staminaCost);
      // リスクマネジメントで特別強化中のケガ・体調不良を抑える
      if (rollMemberInjury(member, isFocus ? riskReduction : 0)) {
        injuries.push(`${member.name}（${member.injury.type}・${member.injury.weeksLeft}週）`);
      }
    }

    // 体力値の自然回復（休養を指示されたメンバーは大きな倍率、ケガ中は追加回復）
    let recovery = getMemberWeeklyRecovery(member, isResting);
    // 休養枠と食事会による追加回復
    recovery += restSlotCount * REST_SLOT_RECOVERY;
    recovery += mealCount * MEAL_PARTY_RECOVERY;
    recoverMemberStamina(member, recovery);
    if (member.injury) recoverMemberStamina(member, Math.round(recovery * 0.5));
  });

  // 内訳（レッスン種別ごとの枠数）
  const countByLabel = new Map();
  weeklySchedule.slots.forEach(slotId => {
    if (!slotId) return;
    const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === slotId);
    // 参加者が揃わず未実施になったグループ練習（連携）は内訳に含めない
    if (item && item.groupOnly && skippedGroupOnly) return;
    const label = itemIdLabel(slotId);
    countByLabel.set(label, (countByLabel.get(label) || 0) + 1);
  });
  // テレビ出演で固定された枠も内訳に含める
  getWeekFixedSlots().forEach(slot => {
    countByLabel.set(slot.label, (countByLabel.get(slot.label) || 0) + 1);
  });

  const parts = [];
  const breakdown = [...countByLabel.entries()].map(([label, count]) => `${label}${count > 1 ? `×${count}` : ''}`);
  if (breakdown.length) parts.push(`実施: ${breakdown.join(' / ')}`);
  if (restNames.length) parts.push(`休養: ${restNames.join('、')}`);
  if (mealCount > 0) parts.push(`食事会 ${mealCount}回（${formatMoney(mealCount * MEAL_PARTY_COST)}）`);
  if (focusMembers.length && hasLessons) {
    const rounded = Math.round(specialMultiplier * 10) / 10;
    parts.push(`特別強化: ${focusMembers.map(member => member.name).join('、')}（${rounded}倍）`);
  }
  if (officeMessage) parts.push(`事務作業: ${officeMessage}`);
  if (skippedGroupOnly) parts.push('連携: 参加者が2名未満のため未実施');
  if (levelUps > 0) parts.push(`能力UP ${levelUps}件`);
  if (injuries.length) parts.push(`【ケガ】${injuries.join('、')}`);
  if (!breakdown.length && !restNames.length && !officeMessage) parts.push('何もない1週間でした');

  setLog(`【週間スケジュール】${parts.join(' / ')}`);
  // この週の自然回復はスケジュール側で適用済み（ライブ側で重複させない）
  weeklyRecoveryDone = true;
  return { levelUps, injuries };
}

function itemIdLabel(itemId) {
  if (itemId === 'individual-lesson') {
    const statName = STATUS_KEYS.find(key => key.id === weeklySchedule?.individualStat)?.name || '歌唱力';
    return `個別レッスン（${statName}）`;
  }
  return WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === itemId)?.name || itemId;
}

// 今週の事務作業を選ぶ（同じ項目を再押すと解除する）
function selectOfficeAction(actionId) {
  ensureWeeklySchedule();
  if (actionId && !OFFICE_ACTIONS.some(action => action.id === actionId)) return;
  weeklySchedule.officeAction = weeklySchedule.officeAction === actionId ? '' : actionId;
  renderWeeklyActionPanel();
}

// シングル販促を1回実行する（発売前は回数n、発売後は減衰する売上を積む）
function applySinglePromotion(song) {
  if (!song) return { addedSales: 0, cumulativeSales: 0, weeks: 0, mode: 'none' };
  claimPromotionSong(song);
  song.promoCount = (song.promoCount || 0) + 1;

// 発売前：発売時の売上倍率だけを高める（α = n×0.005） the sales multiplier at release time (α = n×0.005)
  if (!song.released) {
    const alpha = song.promoCount * RELEASE_PROMO_ALPHA_STEP;
    song.releasePromoAlpha = alpha;
    return { addedSales: 0, cumulativeSales: 0, weeks: 0, mode: 'pre-release', alpha };
  }

  // 発売後：週ごとに減衰する売上を積む（発売週のみ8／通常10／過去作100）
  if (!Number.isFinite(song.promoBase) || song.promoBase <= 0) {
    song.promoBase = getSongPromoBaseSales(song);
  }
  if (!Array.isArray(song.promoDivisors)) song.promoDivisors = [];
  song.promoDivisors.push(getSongPromoDivisor(song));
  const cumulativeSales = getPromotionCumulativeSales(song.promoBase, song.promoDivisors);
  const addedSales = Math.max(0, cumulativeSales - (song.promoSales || 0));
  song.promoSales = cumulativeSales;
  song.totalSales = (song.totalSales || 0) + addedSales;
  addGroupSales(addedSales);
  // CD sales are recognized as revenue at 80% per month
  addMonthlyCdRevenue(addedSales * getSongUnitPrice(song));
  return { addedSales, cumulativeSales, weeks: song.promoDivisors.length, mode: 'post-release' };
}

// 販促効果は1作のみに乗る（対象を切り替えると前の作品の販促はリセット）
function claimPromotionSong(song) {
  if (promoSongId === song.id) return;
  if (promoSongId) {
    const previous = songs.find(item => item.id === promoSongId);
    if (previous) {
      previous.promoBase = 0;
      previous.promoWeeks = 0;
      previous.promoDivisors = [];
      previous.promoSales = 0;
      previous.promoCount = 0;
      previous.releasePromoAlpha = 0;
    }
  }
  promoSongId = song.id;
}

// その曲の初回週売上S（シングル1.5倍／アルバム2倍） (single ×1.5 / album ×2)
function getSongPromoBaseSales(song) {
  const ratio = song?.releaseType === 'album' ? ALBUM_PROMO_FAN_RATIO : SINGLE_PROMO_FAN_RATIO;
  return Math.round(calculateGroupFans() * ratio);
}

// その曲は過去作か。過去作なら減衰率は100に跳ね上がる
function isPastWorkSong(song) {
  if (!song || !song.released) return false;
  const latest = findLatestReleasedSong();
  return Boolean(latest) && latest.id !== song.id;
}

// 今週の販促の減衰率（発売週のみ8／通常10／過去作100）
function getSongPromoDivisor(song) {
  if (isPastWorkSong(song)) return PROMO_DIVISOR_PAST_WORK;
  if (song.releaseDateKey) {
    const releasedDays = Math.round((getGameDateObject() - getGameDateObject(song.releaseDateKey)) / 86400000);
    if (releasedDays >= 0 && releasedDays < 7) return PROMO_DIVISOR_RELEASE_WEEK;
  }
  return PROMO_DIVISOR_NORMAL;
}

// シングル販促を選んだときは、対象曲と次週の取り分を自動表示する
function describeSinglePromotionStatus() {
  const target = getSinglePromotionTarget();
  if (!target) return '対象の楽曲がまだありません（PV中の人気Upで代替します）。';
  const song = target.song;
  const label = target.isUpcoming ? '次作' : '今作';
  if (!song.released) {
    const count = song.promoCount || 0;
    return `対象: ${label}「${song.title}」／ 発売前の販促${count}回 → 発売時の売上が${formatMultiplier(1 + count * RELEASE_PROMO_ALPHA_STEP)}倍になります。`;
  }
  const divisors = Array.isArray(song.promoDivisors) ? song.promoDivisors : [];
  const nextDivisor = getSongPromoDivisor(song);
  const nextDivisors = divisors.concat(nextDivisor);
  const nextSales = getPromotionCumulativeSales(song.promoBase, nextDivisors) - (song.promoSales || 0);
  return `対象: ${label}「${song.title}」／ 減衰率${nextDivisor}で次週+${Math.max(0, nextSales).toLocaleString()}枚（累計${(song.promoSales || 0).toLocaleString()}枚）。`;
}

// 1.0を「1.00倍」の形に整える
function formatMultiplier(value) {
  return (Math.round(value * 1000) / 1000).toFixed(2).replace(/\.?0+$/, '');
}
function applyOfficeAction(actionId) {
  if (actionId === 'single-promotion') {
    const target = getSinglePromotionTarget();
    if (!target) {
      // まだ楽曲も次作も無いときは、選抜メンバーの人気で代用する
      idolRoster.filter(idol => idol.isSelected).forEach(idol => {
        idol.stats.popularity = Math.min(100, (idol.stats.popularity || 0) + 1);
      });
      return 'シングル販促（楽曲が未発表のため選抜メンバーの人気をUp）';
    }
    const result = applySinglePromotion(target.song);
    addSongExperience(target.song, 3);
    const label = target.isUpcoming ? '次作' : '今作';
    return `シングル販促・${label}「${target.song.title}」（+${result.addedSales.toLocaleString()}枚 / 累計${result.cumulativeSales.toLocaleString()}枚）`;
  }
  if (actionId === 'live-promotion') {
    nextLivePromotionPoints++;
    return `ライブ広報（次回ライブの集客効果 累計+${nextLivePromotionPoints}）`;
  }
  if (actionId === 'goods-development') {
    if (merchandiseProducts >= MAX_MERCHANDISE_PRODUCTS) {
      return `グッズ開発（上限${MAX_MERCHANDISE_PRODUCTS}種のため未実施）`;
    }
    merchandiseProducts++;
    merchandiseStock += GOODS_DEVELOPMENT_STOCK;
    funds -= GOODS_DEVELOPMENT_COST;
    return `グッズ開発（全${merchandiseProducts}種 / 在庫${merchandiseStock.toLocaleString()}個 / -${formatMoney(GOODS_DEVELOPMENT_COST)}）`;
  }
  return '';
}

// 週間スケジュールを確定して1週間進める
function confirmWeeklySchedule() {
  if (hasLiveWithinWeek()) return;
  if (!validateWeeklySchedule()) return;
  // 確定した内容は次週の初期値として覚えておく
  rememberWeeklySchedule(weeklySchedule);
  applyWeeklySchedule();
  advanceOneWeek();
}

function advanceOneWeek() {
  const currentDate = getGameDateObject();
  const nextWednesday = getNextWednesday(currentDate);
  const nextLiveDate = findNextScheduledLiveDate(currentDate, nextWednesday);
  const nextDate = nextLiveDate || nextWednesday;
  const wasWednesday = currentDate.getDay() === 3;
  const previousMonth = currentMonth;
  const previousYear = currentYear;

  processMemberBirthdays(currentDate, nextDate);
  syncMemberAges(nextDate);
  if (wasWednesday) {
    totalWeeksElapsed++;
    rollWeeklyCrisisEvent();
    rollRandomEvent();
    rollEquipmentDowngradeEvent();
    checkFanClubYearlyEvent();
    checkSpecialBroadcastOffers();
    processManagerResignations();
    refreshManagerMarket();
    processMemberInjuries();
    // ライブ疲労は毎週少しずつ解ける
    decayLiveFatigue();
    syncPlayerTeamStats();
    leagueTeams.forEach(team => {
      if (team.id === 'player') return;
      // 公演規模は開催頻度によって変動する
      const monthPrefix = `${calendarYear}-${String(currentMonth).padStart(2, '0')}-`;
      const showCount = rivalLiveBookings.filter(booking =>
        booking.groupId === team.id && (booking.venueDates || [booking.liveDate]).some(key => key.startsWith(monthPrefix))
      ).length;
      const power = getRivalTeamPower(team);
      team.sales += Math.floor(power * 550 + Math.random() * 7000 + showCount * 6000);
      team.audience += Math.floor(power * 220 + Math.random() * 3000 + showCount * 2500);
      team.showCount = (team.showCount || 0) + showCount;
    });

    // 危機対応は選択肢を提示し、プレイヤーの判断で処理する
    if (crisisEventWeekKey === getCurrentWeekKey()) {
      pendingCrisisResponse = { type: crisisEventType, weekKey: crisisEventWeekKey };
      setLog(crisisEventType === 'information-leak'
        ? '【情報漏洩】内部情報が外部に流出しました。対応方針を決めましょう。'
        : '【SNSスキャンダル】SNS上の騒動が広がっています。対応方針を決めましょう。');
    }

    const summary = calculateTeamAverages();
    checkSenbatsuTrigger();
    checkMusicProgramOffers();
    resolveIndustryOffer();
    trainSongs(summary);
    if (isLastWednesdayOfMonth(currentDate) && officeUpgrades.snsTraining > 1) {
      const snsGain = officeUpgrades.snsTraining - 1;
      idolRoster.filter(member => member.isSelected).forEach(member => {
        member.stats.sns = Math.min(100, (member.stats.sns || 0) + snsGain);
      });
    }
  }

  // 発売・CD関連イベントは「移動先の日付将达到した時点」で処理する
  processMonthlyReleaseAndLive(toDateKey(nextDate));
  processPlanEvents(toDateKey(nextDate));
  if (wasWednesday) maintainOfficeFacilities();
  if (wasWednesday && totalWeeksElapsed > 0 && totalWeeksElapsed % 120 === 0) startDraftMeeting();

  gameDate = toDateKey(nextDate);
  syncGameCalendar();
  resetWeeklySchedule();
  // ファン数を毎週更新（売上が伸びれば増え、止まれば緩やかに減る）
  updateWeeklyGroupFans();
  if (currentYear > previousYear) {
    yearlyStats = { sales: 0, audience: 0 };
    leagueTeams.forEach(team => { team.sales = 0; team.audience = 0; team.showCount = 0; });
    // 1月頭のファン数を記録して、次年のメンバー年収に使う
    previousYearGroupFansAtYearStart = groupFansAtYearStart || calculateGroupFans();
    groupFansAtYearStart = calculateGroupFans();
    yearEndAwardProcessed = false;
    yearEndKohakuProcessed = false;
  }
  if (currentMonth !== previousMonth && (currentMonth === 1 || currentMonth === 7)) {
    if (currentMonth === 1) openDecisionModal("当年7月〜12月の計画策定", currentYear, 7, 12);
    else openDecisionModal("翌年1月〜6月の計画策定", currentYear + 1, 1, 6);
  }

  updateUI();
  openPendingModal();
}
