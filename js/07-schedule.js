// ==========================================
// 07-schedule.js : 週間スケジュール・進行ロジック
// ==========================================

// 直前週に確定したスケジュール
let lastWeekSchedule = null;
// 歌番組（テレビ出演）で枠が潰されていない週のスケジュール
let savedCleanWeekSchedule = null;

// 特別個別レッスン（特別強化統合）の固定倍率
const SPECIAL_INDIVIDUAL_MULTIPLIER = 10.1;

// 歌番組リハーサル直前の準備ボーナス定数
const MUSIC_PREP_BONUS_MULTIPLIER = 5;
const MUSIC_PREP_ITEMS = ['full-run-through', 'coordination'];

/**
 * 空の週間スケジュールオブジェクトを生成
 * （特別強化は個別レッスンに統合されたため、対象は1名・1能力のみ保持）
 */
function createEmptyWeeklySchedule() {
  const slots = [...DEFAULT_WEEK_SLOTS];
  while (slots.length < WEEK_SLOT_COUNT) slots.push('');
  slots.length = WEEK_SLOT_COUNT;

  const availableMembers = idolRoster.filter(member => member.isSelected && !member.injury);
  const defaultMember = availableMembers[0]?.id ?? idolRoster.find(member => !member.injury)?.id ?? '';

  return {
    slots,
    vacation: false,
    individualMemberId: defaultMember, // 統合された対象メンバー（1名のみ）
    individualStat: 'vocal',           // 統合された強化対象能力（1項目のみ）
    restDayMembers: [],                // ユーザー指定の休養メンバー
    officeAction: ''
  };
}

/**
 * 週間スケジュールオブジェクトの構造を保証・正規化
 */
function ensureWeeklySchedule() {
  if (!weeklySchedule || !Array.isArray(weeklySchedule.slots)) {
    weeklySchedule = getDraftSourceSchedule() ? createScheduleFromLastWeek() : createEmptyWeeklySchedule();
  } else {
    const slots = weeklySchedule.slots.slice(0, WEEK_SLOT_COUNT);
    while (slots.length < WEEK_SLOT_COUNT) slots.push('');
    weeklySchedule.slots = slots;
    weeklySchedule.vacation = Boolean(weeklySchedule.vacation);
    
    if (!Array.isArray(weeklySchedule.restDayMembers)) weeklySchedule.restDayMembers = [];

    // 旧・特別強化プロパティを完全消去して不整合を防止
    delete weeklySchedule.focusMemberIds;
    delete weeklySchedule.focusMemberId;
    delete weeklySchedule.autoRestMemberIds;

    if (!INDIVIDUAL_LESSON_STATS.includes(weeklySchedule.individualStat)) weeklySchedule.individualStat = 'vocal';
    if (!OFFICE_ACTIONS.some(action => action.id === weeklySchedule.officeAction)) weeklySchedule.officeAction = '';
  }

  // 固定枠の上書き適用
  getWeekFixedSlots().forEach((slot, index) => {
    if (index >= 0 && index < WEEK_SLOT_COUNT) weeklySchedule.slots[index] = slot.slotId || slot.kind;
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

function getWeekDayIndexForOffset(offsetDays) {
  return (((offsetDays - 1) % WEEK_DAY_LABELS.length) + WEEK_DAY_LABELS.length) % WEEK_DAY_LABELS.length;
}

function getWeekFixedSlots() {
  const startDate = getWeekAnchorDate();
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
    if (offsetDays < 1 || offsetDays > WEEK_DAY_LABELS.length - 1) return;

    const dayBase = getWeekDayIndexForOffset(offsetDays) * WEEK_PERIOD_LABELS.length;
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

  specialLiveEvents.forEach(event => {
    if (event.completed || !event.liveDate) return;
    const liveDate = getGameDateObject(event.liveDate);
    const offsetDays = Math.round((liveDate - startDate) / 86400000);
    if (offsetDays < 1 || offsetDays > WEEK_DAY_LABELS.length) return;

    const liveBase = getWeekDayIndexForOffset(offsetDays) * WEEK_PERIOD_LABELS.length;
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

/**
 * 直前週のスケジュールから下書きを生成
 * 手動休養指定メンバーのうち、まだ目標未達のメンバーのみ引き継ぐ
 */
function createScheduleFromLastWeek() {
  const base = createEmptyWeeklySchedule();
  const source = getDraftSourceSchedule();
  if (!source) return base;

  const slots = source.slots.map(slotId => (isFixedSlotId(slotId) ? '' : slotId || ''));
  while (slots.length < WEEK_SLOT_COUNT) slots.push('');
  slots.length = WEEK_SLOT_COUNT;

  getWeekFixedSlots().forEach((slot, index) => {
    if (index >= 0 && index < slots.length) slots[index] = slot.slotId || slot.kind;
  });

  base.slots = slots;
  base.vacation = source.vacation;
  base.individualMemberId = source.individualMemberId || base.individualMemberId;
  base.individualStat = source.individualStat || base.individualStat;

  base.restDayMembers = (source.restDayMembers || []).filter(id => {
    const member = idolRoster.find(entry => entry.id === id);
    if (!member || member.injury) return false;
    const stamina = member.staminaValue ?? MAX_STAMINA_VALUE;
    return stamina < AUTO_REST_STAMINA_TARGET;
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

/**
 * 休養対象メンバーの手動トグル
 */
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

function isWeekRestDay(dayIndex) {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return true;
  const base = dayIndex * WEEK_PERIOD_LABELS.length;
  const isRest = value => value === 'rest-day';
  return isRest(weeklySchedule.slots[base]) && isRest(weeklySchedule.slots[base + 1]);
}

function isRestRequirementAchievable() {
  ensureWeeklySchedule();
  const fixed = getWeekFixedSlots();
  let freeSlots = 0;
  let daysWithBothFree = 0;
  for (let day = 0; day < WEEK_DAY_LABELS.length; day++) {
    let bothFree = true;
    for (let period = 0; period < WEEK_PERIOD_LABELS.length; period++) {
      const index = day * WEEK_PERIOD_LABELS.length + period;
      if (fixed.has(index)) { bothFree = false; continue; }
      freeSlots += 1;
    }
    if (bothFree) daysWithBothFree += 1;
  }
  if (daysWithBothFree < REQUIRED_FULL_REST_DAYS) return false;
  if (freeSlots < REQUIRED_FULL_REST_DAYS * 2 + REQUIRED_EXTRA_REST_SLOTS) return false;
  return true;
}

function getWeekMealPartyCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  return weeklySchedule.slots.filter(slotId => slotId === 'meal-party').length;
}

function getWeekLessonCount() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation) return 0;
  const fixed = getWeekFixedSlots();
  return weeklySchedule.slots.filter((slotId, index) =>
    !fixed.has(index) && slotId && slotId !== 'rest-day' && slotId !== 'meal-party'
  ).length;
}

function getWeeklyLessonExperience() {
  const lessonLevel = officeUpgrades?.lessons || 0;
  const lessonMultiplier = 1 + lessonLevel * 0.12;
  return Math.round(LESSON_BASE_EXP * lessonMultiplier);
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
  Object.keys(flags).forEach(performanceId => {
    const performance = scheduledPerformances.find(item => item.id === performanceId);
    if (performance) performance.prepared = flags[performanceId];
  });
}

function applyMemberLesson(member, itemId, multiplier = 1, individualStat = null, slotEffect = 1) {
  if (!member || member.injury) return { exp: 0, levels: 0 };
  const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === itemId);
  if (!item || item.rest) return { exp: 0, levels: 0 };

  const baseExp = getWeeklyLessonExperience() * slotEffect;
  const primaryStat = itemId === 'individual-lesson'
    ? (INDIVIDUAL_LESSON_STATS.includes(individualStat) ? individualStat : 'vocal')
    : item.expStat;

  const exp = primaryStat ? Math.round(baseExp * multiplier) : 0;
  let levels = 0;
  if (primaryStat) levels += addMemberStatExp(member, primaryStat, exp);
  Object.entries(item.secondaryExp || {}).forEach(([secondaryStat, ratio]) => {
    levels += addMemberStatExp(member, secondaryStat, Math.round(baseExp * ratio));
  });
  return { exp, levels };
}

function getLessonStaminaCost(item, staminaBefore, slotEffect = 1) {
  if (!item || !Number.isFinite(item.staminaRatio)) return 0;
  return Math.max(0, Math.round(Math.max(0, staminaBefore) * item.staminaRatio * slotEffect));
}

function validateWeeklySchedule() {
  ensureWeeklySchedule();
  if (weeklySchedule.vacation && getWeekFixedSlots().size) {
    weeklySchedule.vacation = false;
    setLog('【週間スケジュール】テレビ出演があるため、1週間の休暇を解除しました。');
  }

  const overLimit = WEEKLY_SCHEDULE_ITEMS
    .filter(item => item.weeklyLimit)
    .map(item => ({ item, used: countWeekSlots(item.id) }))
    .find(entry => entry.used > entry.item.weeklyLimit);
  if (overLimit) {
    alert(`「${overLimit.item.name}」は1週間で${overLimit.item.weeklyLimit}枠までです（現在${overLimit.used}枠）。`);
    return false;
  }

  if (weeklySchedule.officeAction === 'goods-development' && merchandiseProducts < MAX_MERCHANDISE_PRODUCTS
    && GOODS_DEVELOPMENT_COST > funds) {
    alert(`グッズの開発費 ${formatMoney(GOODS_DEVELOPMENT_COST)} が資金を超えています。`);
    return false;
  }
  if (weeklySchedule.vacation) return true;

  const rest = getWeekRestBreakdown();
  if (isRestRequirementAchievable()) {
    const restShort = [];
    if (rest.fullRestDays < REQUIRED_FULL_REST_DAYS) restShort.push(`休養1日フル（現在${rest.fullRestDays}日）`);
    if (rest.extraSlots < REQUIRED_EXTRA_REST_SLOTS) restShort.push(`半休${REQUIRED_EXTRA_REST_SLOTS}枠（現在${rest.extraSlots}枠）`);
    if (restShort.length) {
      alert(`スケジュールを実行できません。休養日の設定を見直してください。\n不足: ${restShort.join(' / ')}`);
      return false;
    }
  }

  const mealCost = getWeekMealPartyCount() * MEAL_PARTY_COST;
  if (mealCost > funds) {
    alert(`食事会の経費 ${formatMoney(mealCost)} が資金を超えています。`);
    return false;
  }
  return true;
}

/**
 * 手動休養メンバーが目標値に達して復帰するスロットを計算
 */
function calculateRestReleaseSlots(restingMemberIds, fixedSlots) {
  const releaseMap = new Map();

  (restingMemberIds || []).forEach(memberId => {
    const member = idolRoster.find(m => m.id === memberId);
    if (!member) return;

    let stamina = member.staminaValue ?? MAX_STAMINA_VALUE;
    if (stamina >= AUTO_REST_STAMINA_TARGET) {
      releaseMap.set(memberId, 0);
      return;
    }

    let recoveredSlotIndex = -1;
    for (let i = 0; i < weeklySchedule.slots.length; i++) {
      const fixed = fixedSlots.get(i);
      const slotId = weeklySchedule.slots[i];

      if ((fixed && fixed.kind === 'rest-day') || (!fixed && slotId === 'rest-day')) {
        stamina = Math.min(MAX_STAMINA_VALUE, stamina + REST_SLOT_RECOVERY);
      } else if (!fixed && slotId === 'meal-party') {
        stamina = Math.min(MAX_STAMINA_VALUE, stamina + MEAL_PARTY_RECOVERY);
      }

      if (stamina >= AUTO_REST_STAMINA_TARGET) {
        recoveredSlotIndex = i + 1;
        break;
      }
    }
    releaseMap.set(memberId, recoveredSlotIndex);
  });

  return releaseMap;
}

/**
 * 週間スケジュールを適用（特別個別レッスン統合 ＆ 対象外メンバー休養回復）
 */
function applyWeeklySchedule() {
  ensureWeeklySchedule();

  const participants = idolRoster;
  const restingMemberIds = new Set(weeklySchedule.restDayMembers || []);
  const fixedSlots = getWeekFixedSlots();

  const officeMessage = applyOfficeAction(weeklySchedule.officeAction);

  if (weeklySchedule.vacation) {
    idolRoster.forEach(member => recoverMemberStamina(member, FULL_VACATION_RECOVERY));
    setLog(`【1週間の休暇】全員がしっかり休養しました（体力値 +${FULL_VACATION_RECOVERY}）${officeMessage ? ` / ${officeMessage}` : ''}。`);
    return { levelUps: 0, injuries: [] };
  }

  const releaseSlots = calculateRestReleaseSlots(restingMemberIds, fixedSlots);
  const fullyRecoveredMembers = [];

  const groupOnlySlots = weeklySchedule.slots
    .map((slotId, index) => ({ slotId, index }))
    .filter(entry => !fixedSlots.has(entry.index) && WEEKLY_SCHEDULE_ITEMS.some(item => item.id === entry.slotId && item.groupOnly));

  const groupOnlyAvailableSlots = new Set(groupOnlySlots
    .filter(entry => participants.filter(member => {
      if (member.injury) return false;
      if (!restingMemberIds.has(member.id)) return true;
      const releaseIdx = releaseSlots.get(member.id);
      return releaseIdx !== -1 && releaseIdx <= entry.index;
    }).length >= 2)
    .map(entry => entry.index));

  const skippedGroupOnly = groupOnlySlots.some(entry => !groupOnlyAvailableSlots.has(entry.index));

  const mealCount = getWeekMealPartyCount();
  if (mealCount > 0) {
    funds -= mealCount * MEAL_PARTY_COST;
    recordMonthlyExpense(`食事会（${mealCount}回）`, mealCount * MEAL_PARTY_COST);
    adjustTargetPopularity(MEAL_PARTY_POPULARITY_GAIN);
    groupCrisis = Math.min(100, groupCrisis + MEAL_PARTY_CRISIS_GAIN);
  }

  let levelUps = 0;
  const injuries = [];

  const targetMemberId = weeklySchedule.individualMemberId;
  const targetStat = weeklySchedule.individualStat || 'vocal';

  participants.forEach(member => {
    if (member.injury) return;

    const isRestDesignated = restingMemberIds.has(member.id);
    const releaseIndex = releaseSlots.get(member.id) ?? 0;

    let staminaCost = 0;
    let remainingStamina = member.staminaValue ?? MAX_STAMINA_VALUE;
    let memberLevels = 0;

    weeklySchedule.slots.forEach((slotId, index) => {
      const fixed = fixedSlots.get(index);
      const isCurrentlyResting = isRestDesignated && (releaseIndex === -1 || index < releaseIndex);

      if (fixed) {
        if (fixed.kind === 'rest-day') {
          remainingStamina = Math.min(MAX_STAMINA_VALUE, remainingStamina + REST_SLOT_RECOVERY);
          return;
        }
        if (isCurrentlyResting) return;

        const fixedCost = fixed.kind === 'rehearsal'
          ? REHEARSAL_STAMINA_COST
          : (fixed.kind === 'broadcast' ? BROADCAST_STAMINA_COST : 0);
        staminaCost += fixedCost;
        remainingStamina = Math.max(0, remainingStamina - fixedCost);
        return;
      }

      if (slotId === 'rest-day') {
        remainingStamina = Math.min(MAX_STAMINA_VALUE, remainingStamina + REST_SLOT_RECOVERY);
        return;
      }
      if (slotId === 'meal-party') {
        remainingStamina = Math.min(MAX_STAMINA_VALUE, remainingStamina + MEAL_PARTY_RECOVERY);
        return;
      }
      if (!slotId || isCurrentlyResting) return;

      const item = WEEKLY_SCHEDULE_ITEMS.find(row => row.id === slotId);
      if (!item) return;

      const slotEffect = getWeekSlotPeriod(index) === 0 ? MORNING_SLOT_MULTIPLIER : 1;

      // ==========================================
      // 個別レッスン枠：1名が10.1倍、他全員は休養回復
      // ==========================================
      if (slotId === 'individual-lesson') {
        if (member.id === targetMemberId) {
          // 選ばれたメンバー：指定能力に 10.1倍
          const baseExp = getWeeklyLessonExperience() * slotEffect;
          const gainedExp = Math.round(baseExp * SPECIAL_INDIVIDUAL_MULTIPLIER);
          memberLevels += addMemberStatExp(member, targetStat, gainedExp);

          const cost = getLessonStaminaCost(item, remainingStamina, slotEffect);
          staminaCost += cost;
          remainingStamina = Math.max(0, remainingStamina - cost);
        } else {
          // 選ばれなかったメンバー：午前/午後の時間帯に合わせて休養回復
          const recoveryAmount = Math.round(REST_SLOT_RECOVERY * slotEffect);
          remainingStamina = Math.min(MAX_STAMINA_VALUE, remainingStamina + recoveryAmount);
        }
        return;
      }

      // 通常グループレッスン
      if (item.groupOnly && !groupOnlyAvailableSlots.has(index)) return;

      memberLevels += applyMemberLesson(member, slotId, 1, null, slotEffect).levels;
      const cost = getLessonStaminaCost(item, remainingStamina, slotEffect);
      staminaCost += cost;
      remainingStamina = Math.max(0, remainingStamina - cost);
    });

    levelUps += memberLevels;

    if (staminaCost > 0) {
      consumeMemberStamina(member, staminaCost);
      if (rollMemberInjury(member, 0)) {
        injuries.push(`${member.name}（${member.injury.type}・${formatInjuryWeeks(member.injury)}）`);
      }
    }

    const stayedRestingAllWeek = isRestDesignated && releaseIndex === -1;
    let recovery = getMemberWeeklyRecovery(member, stayedRestingAllWeek);
    const restSlotCount = weeklySchedule.slots.filter(s => s === 'rest-day').length;
    recovery += restSlotCount * REST_SLOT_RECOVERY;
    recovery += mealCount * MEAL_PARTY_RECOVERY;
    recoverMemberStamina(member, recovery);

    if ((member.staminaValue ?? MAX_STAMINA_VALUE) >= AUTO_REST_STAMINA_TARGET) {
      fullyRecoveredMembers.push(member.id);
    }
  });

  weeklySchedule.restDayMembers = weeklySchedule.restDayMembers.filter(
    id => !fullyRecoveredMembers.includes(id)
  );

  const countByLabel = new Map();
  weeklySchedule.slots.forEach((slotId, index) => {
    if (!slotId || fixedSlots.has(index)) return;
    const item = WEEKLY_SCHEDULE_ITEMS.find(entry => entry.id === slotId);
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
    .map(id => idolRoster.find(m => m.id === id)?.name)
    .filter(Boolean);
  if (currentRestNames.length) parts.push(`継続休養: ${currentRestNames.join('、')}`);

  if (fullyRecoveredMembers.length) {
    const recoveredNames = fullyRecoveredMembers
      .map(id => idolRoster.find(m => m.id === id)?.name)
      .filter(Boolean);
    parts.push(`復帰完了: ${recoveredNames.join('、')}`);
  }

  const targetMember = idolRoster.find(m => m.id === targetMemberId);
  const targetStatName = STATUS_KEYS.find(k => k.id === targetStat)?.name || targetStat;
  const individualLessonCount = weeklySchedule.slots.filter(s => s === 'individual-lesson').length;
  if (individualLessonCount > 0 && targetMember) {
    parts.push(`個別レッスン: ${targetMember.name}（${targetStatName} 10.1倍 / 他メンバー休養）`);
  }

  if (mealCount > 0) parts.push(`食事会 ${mealCount}回（${formatMoney(mealCount * MEAL_PARTY_COST)}）`);
  if (officeMessage) parts.push(`事務作業: ${officeMessage}`);
  if (skippedGroupOnly) parts.push('連携: 参加者不足のため未実施');
  if (levelUps > 0) parts.push(`能力UP ${levelUps}件`);
  if (injuries.length) parts.push(`【ケガ】${injuries.join('、')}`);

  setLog(`【週間スケジュール】${parts.join(' / ')}`);
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

function selectOfficeAction(actionId) {
  ensureWeeklySchedule();
  if (actionId && !OFFICE_ACTIONS.some(action => action.id === actionId)) return;
  weeklySchedule.officeAction = weeklySchedule.officeAction === actionId ? '' : actionId;
  renderWeeklyActionPanel();
}

/**
 * 販促累積売上計算：Σ(w=1→k) { (S / 20) * 10^(1 - w) }
 */
function getPromotionCumulativeSalesByFormula(baseSales, k) {
  if (baseSales <= 0 || k <= 0) return 0;
  let cumulative = 0;
  for (let w = 1; w <= k; w++) {
    const weeklySales = (baseSales / 20) * Math.pow(0.1, w - 1);
    if (weeklySales < 0.5) break;
    cumulative += weeklySales;
  }
  return Math.round(cumulative);
}

function applySinglePromotion(song) {
  if (!song) return { addedSales: 0, cumulativeSales: 0, weeks: 0, mode: 'none' };
  claimPromotionSong(song);
  song.promoCount = (song.promoCount || 0) + 1;

  if (!song.released) {
    const alpha = song.promoCount * RELEASE_PROMO_ALPHA_STEP;
    song.releasePromoAlpha = alpha;
    return { addedSales: 0, cumulativeSales: 0, weeks: song.promoCount, mode: 'pre-release', alpha };
  }

  if (!Number.isFinite(song.promoBase) || song.promoBase <= 0) {
    song.promoBase = getSongPromoBaseSales(song);
  }

  const k = song.promoCount;
  const cumulativeSales = getPromotionCumulativeSalesByFormula(song.promoBase, k);
  const addedSales = Math.max(0, cumulativeSales - (song.promoSales || 0));

  song.promoSales = cumulativeSales;
  song.totalSales = (song.totalSales || 0) + addedSales;
  addGroupSales(addedSales);
  addMonthlyCdRevenue(addedSales * getSongUnitPrice(song));

  return { addedSales, cumulativeSales, weeks: k, mode: 'post-release' };
}

function claimPromotionSong(song) {
  if (promoSongId === song.id) return;
  promoSongId = song.id;
}

function getSongPromoBaseSales(song) {
  const ratio = song?.releaseType === 'album' ? ALBUM_PROMO_FAN_RATIO : SINGLE_PROMO_FAN_RATIO;
  return Math.round(calculateGroupFans() * ratio);
}

function describeSinglePromotionStatus() {
  const target = getSinglePromotionTarget();
  if (!target) return '対象の楽曲がまだありません（PV中の人気Upで代替します）。';
  const song = target.song;
  const label = target.isUpcoming ? '次作' : '今作';

  if (!song.released) {
    const count = song.promoCount || 0;
    return `対象: ${label}「${song.title}」／ 発売前の販促${count}回 → 発売時の売上が${formatMultiplier(1 + count * RELEASE_PROMO_ALPHA_STEP)}倍になります。`;
  }

  const nextK = (song.promoCount || 0) + 1;
  const currentBase = (Number.isFinite(song.promoBase) && song.promoBase > 0)
    ? song.promoBase
    : getSongPromoBaseSales(song);
  const nextCumulative = getPromotionCumulativeSalesByFormula(currentBase, nextK);
  const nextAdded = Math.max(0, nextCumulative - (song.promoSales || 0));

  return `対象: ${label}「${song.title}」／ 発売後販促${nextK}週目（減衰比率0.1）で次週+${nextAdded.toLocaleString()}枚（累計${(song.promoSales || 0).toLocaleString()}枚）。`;
}

function formatMultiplier(value) {
  return (Math.round(value * 1000) / 1000).toFixed(2).replace(/\.?0+$/, '');
}

function applyOfficeAction(actionId) {
  if (actionId === 'single-promotion') {
    const target = getSinglePromotionTarget();
    if (!target) {
      idolRoster.filter(idol => idol.isSelected).forEach(idol => {
        idol.stats.popularity = Math.min(100, (idol.stats.popularity || 0) + 1);
      });
      return 'シングル販促（楽曲未発表のため選抜メンバーの人気Up）';
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
    recordMonthlyExpense('グッズ開発', GOODS_DEVELOPMENT_COST);
    return `グッズ開発（全${merchandiseProducts}種 / 在庫${merchandiseStock.toLocaleString()}個 / -${formatMoney(GOODS_DEVELOPMENT_COST)}）`;
  }
  return '';
}

/**
 * 週間スケジュールを確定して1週間進める（安全実行パッチ適用）
 */
function confirmWeeklySchedule() {
  try {
    const currentDate = getGameDateObject();
    if (currentDate.getDay() !== 3) {
      setLog('【週間スケジュール】スケジュール設定は水曜日に行えます。');
      return;
    }
    if (typeof hasLiveWithinWeek === 'function' && hasLiveWithinWeek()) return;
    if (!validateWeeklySchedule()) return;

    rememberWeeklySchedule(weeklySchedule);
    markMusicPreparations();
    applyWeeklySchedule();
    advanceOneWeek();
  } catch (err) {
    console.error('【週間スケジュール進行エラー】', err);
    alert(`進行処理中にエラーが発生しました:\n${err.message}`);
  }
}

function advanceOneWeek() {
  const currentDate = getGameDateObject();
  const nextWednesday = getNextWednesday(currentDate);
  const nextLiveDate = findNextGroupLiveDate(currentDate, nextWednesday);
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
    decayLiveFatigue();
    syncPlayerTeamStats();

    leagueTeams.forEach(team => {
      if (team.id === 'player') return;
      const monthPrefix = `${calendarYear}-${String(currentMonth).padStart(2, '0')}-`;
      const showCount = rivalLiveBookings.filter(booking =>
        booking.groupId === team.id && (booking.venueDates || [booking.liveDate]).some(key => key.startsWith(monthPrefix))
      ).length;
      const power = getRivalTeamPower(team);
      team.sales += Math.floor(power * 550 + Math.random() * 7000 + showCount * 6000);
      team.audience += Math.floor(power * 220 + Math.random() * 3000 + showCount * 2500);
      team.showCount = (team.showCount || 0) + showCount;
    });

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
    recordAllSongSalesHistory();

    if (isLastWednesdayOfMonth(currentDate) && officeUpgrades?.snsTraining > 1) {
      const snsGain = officeUpgrades.snsTraining - 1;
      idolRoster.filter(member => member.isSelected).forEach(member => {
        member.stats.sns = Math.min(100, (member.stats.sns || 0) + snsGain);
      });
    }
  }

  processMonthlyReleaseAndLive(toDateKey(nextDate));
  processPlanEvents(toDateKey(nextDate));
  if (wasWednesday) maintainOfficeFacilities();
  if (wasWednesday && totalWeeksElapsed > 0 && totalWeeksElapsed % 120 === 0) startDraftMeeting();

  gameDate = toDateKey(nextDate);
  syncGameCalendar();
  resetWeeklySchedule();
  updateWeeklyGroupFans();

  if (currentYear > previousYear) {
    yearlyStats = { sales: 0, audience: 0 };
    leagueTeams.forEach(team => { team.sales = 0; team.audience = 0; team.showCount = 0; });
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
