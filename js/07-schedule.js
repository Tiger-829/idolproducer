// ==========================================
// 07-schedule.js : 週間スケジュール・進行ロジック完全版
// ==========================================

let lastWeekSchedule = null;
let savedCleanWeekSchedule = null;

// 特別個別レッスン（特別強化統合）の固定倍率
const SPECIAL_INDIVIDUAL_MULTIPLIER = 10.1;

// 歌番組リハーサル前の準備ボーナス定数
const MUSIC_PREP_BONUS_MULTIPLIER = 5;
const MUSIC_PREP_ITEMS = ['full-run-through', 'coordination'];

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

function getWeekDayIndexForOffset(offsetDays) {
  const len = (typeof WEEK_DAY_LABELS !== 'undefined' && WEEK_DAY_LABELS.length) ? WEEK_DAY_LABELS.length : 7;
  return (((offsetDays - 1) % len) + len) % len;
}

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

  const pList = Array.isArray(scheduledPerformances) ? scheduledPerformances : [];
  pList.forEach(performance => {
    if (!performance || !performance.airDate) return;
    const airDate = getGameDateObject(performance.airDate);
    const offsetDays = Math.round((airDate - startDate) / 86400000);
    const dayLabelsLen = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS.length : 7;
    const periodLabelsLen = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS.length : 2;

    if (offsetDays < 1 || offsetDays > dayLabelsLen - 1) return;

    const dayBase = getWeekDayIndexForOffset(offsetDays) * periodLabelsLen;
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
    const dayLabelsLen = typeof WEEK_DAY_LABELS !== 'undefined' ? WEEK_DAY_LABELS.length : 7;
    const periodLabelsLen = typeof WEEK_PERIOD_LABELS !== 'undefined' ? WEEK_PERIOD_LABELS.length : 2;

    if (offsetDays < 1 || offsetDays > dayLabelsLen) return;

    const liveBase = getWeekDayIndexForOffset(offsetDays) * periodLabelsLen;
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
  const reqFull = typeof REQUIRED_FULL_REST_DAYS !== 'undefined' ? REQUIRED_FULL_REST_DAYS : 1;
  const reqExtra = typeof REQUIRED_EXTRA_REST_SLOTS !== 'undefined' ? REQUIRED_EXTRA_REST_SLOTS : 2;
  if (daysWithBothFree < reqFull) return false;
  if (freeSlots < reqFull * 2 + reqExtra) return false;
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
  if (!item || item.rest) return { exp: 0, levels: 0 };

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

  const maxProd = typeof MAX_MERCHANDISE_PRODUCTS !== 'undefined' ? MAX_MERCHANDISE_PRODUCTS : 10;
  const devCost = typeof GOODS_DEVELOPMENT_COST !== 'undefined' ? GOODS_DEVELOPMENT_COST : 3000000;
  if (weeklySchedule.officeAction === 'goods-development' && typeof merchandiseProducts !== 'undefined' && merchandiseProducts < maxProd && devCost > funds) {
    alert(`グッズの開発費 ${formatMoney(devCost)} が資金を超えています。`);
    return false;
  }

  const rest = getWeekRestBreakdown();
  const reqFull = typeof REQUIRED_FULL_REST_DAYS !== 'undefined' ? REQUIRED_FULL_REST_DAYS : 1;
  const reqExtra = typeof REQUIRED_EXTRA_REST_SLOTS !== 'undefined' ? REQUIRED_EXTRA_REST_SLOTS : 2;

  if (typeof isRestRequirementAchievable === 'function' && isRestRequirementAchievable()) {
    const restShort = [];
    if (rest.fullRestDays < reqFull) {
      restShort.push(`・1日フル休養（午前・午後とも休養の日）：現在 ${rest.fullRestDays}日 / 必要 ${reqFull}日`);
    }
    if (rest.extraSlots < reqExtra) {
      restShort.push(`・半休枠（午前または午後の休養）：現在 ${rest.extraSlots}枠 / 必要 ${reqExtra}枠`);
    }

    if (restShort.length > 0) {
      alert(`【休養不足】スケジュールを実行できません。\n\n${restShort.join('\n')}\n\n※スロットから「休養」を設定してください。`);
      return false;
    }
  }

  const mealCount = getWeekMealPartyCount();
  const mealCost = mealCount * (typeof MEAL_PARTY_COST !== 'undefined' ? MEAL_PARTY_COST : 1000000);
  if (mealCost > funds) {
    alert(`【資金不足】食事会の経費（${formatMoney(mealCost)}）が所持金を超えています。食事会を減らしてください。`);
    return false;
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

function applyWeeklySchedule() {
  ensureWeeklySchedule();

  const participants = Array.isArray(idolRoster) ? idolRoster : [];
  const restingMemberIds = new Set(weeklySchedule.restDayMembers || []);
  const fixedSlots = getWeekFixedSlots();

  const officeMessage = applyOfficeAction(weeklySchedule.officeAction);

  const fullVacationRec = typeof FULL_VACATION_RECOVERY !== 'undefined' ? FULL_VACATION_RECOVERY : 50;
  if (weeklySchedule.vacation) {
    participants.forEach(member => {
      if (typeof recoverMemberStamina === 'function') recoverMemberStamina(member, fullVacationRec);
    });
    setLog(`【1週間の休暇】全員がしっかり休養しました（体力値 +${fullVacationRec}）${officeMessage ? ` / ${officeMessage}` : ''}。`);
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

  let levelUps = 0;
  const injuries = [];

  const targetMemberId = weeklySchedule.individualMemberId;
  const targetStat = weeklySchedule.individualStat || 'vocal';
  const maxStamina = typeof MAX_STAMINA_VALUE !== 'undefined' ? MAX_STAMINA_VALUE : 100;
  const autoRestTarget = typeof AUTO_REST_STAMINA_TARGET !== 'undefined' ? AUTO_REST_STAMINA_TARGET : 80;
  const restSlotRec = typeof REST_SLOT_RECOVERY !== 'undefined' ? REST_SLOT_RECOVERY : 10;
  const mealRec = typeof MEAL_PARTY_RECOVERY !== 'undefined' ? MEAL_PARTY_RECOVERY : 15;
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
          remainingStamina = Math.min(maxStamina, remainingStamina + restSlotRec);
          return;
        }
        if (isCurrentlyResting) return;

        const fixedCost = fixed.kind === 'rehearsal' ? rehCost : (fixed.kind === 'broadcast' ? bcastCost : 0);
        staminaCost += fixedCost;
        remainingStamina = Math.max(0, remainingStamina - fixedCost);
        return;
      }

      if (slotId === 'rest-day') {
        remainingStamina = Math.min(maxStamina, remainingStamina + restSlotRec);
        return;
      }
      if (slotId === 'meal-party') {
        remainingStamina = Math.min(maxStamina, remainingStamina + mealRec);
        return;
      }
      if (!slotId || isCurrentlyResting) return;

      const item = itemsList.find(row => row.id === slotId);
      if (!item) return;

      const periodIndex = (typeof getWeekSlotPeriod === 'function') ? getWeekSlotPeriod(index) : (index % 2);
      const slotEffect = periodIndex === 0 ? morningMultiplier : 1;

      // 個別レッスン枠：選ばれた1名が10.1倍、他全員は休養回復
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
          const recoveryAmount = Math.round(restSlotRec * slotEffect);
          remainingStamina = Math.min(maxStamina, remainingStamina + recoveryAmount);
        }
        return;
      }

      if (item.groupOnly && !groupOnlyAvailableSlots.has(index)) return;

      memberLevels += applyMemberLesson(member, slotId, 1, null, slotEffect).levels;
      const cost = getLessonStaminaCost(item, remainingStamina, slotEffect);
      staminaCost += cost;
      remainingStamina = Math.max(0, remainingStamina - cost);
    });

    levelUps += memberLevels;

    if (staminaCost > 0) {
      if (typeof consumeMemberStamina === 'function') consumeMemberStamina(member, staminaCost);
      if (typeof rollMemberInjury === 'function' && rollMemberInjury(member, 0)) {
        const type = member.injury?.type || 'ケガ';
        const formattedWeeks = (typeof formatInjuryWeeks === 'function') ? formatInjuryWeeks(member.injury) : '';
        injuries.push(`${member.name}（${type}・${formattedWeeks}）`);
      }
    }

    const stayedRestingAllWeek = isRestDesignated && releaseIndex === -1;
    let recovery = (typeof getMemberWeeklyRecovery === 'function') ? getMemberWeeklyRecovery(member, stayedRestingAllWeek) : 20;
    const restSlotCount = weeklySchedule.slots.filter(s => s === 'rest-day').length;
    recovery += restSlotCount * restSlotRec;
    recovery += mealCount * mealRec;
    if (typeof recoverMemberStamina === 'function') recoverMemberStamina(member, recovery);

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

  if (mealCount > 0) parts.push(`食事会 ${mealCount}回（${formatMoney(mealCount * mealCostSingle)}）`);
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

  const alphaStep = typeof RELEASE_PROMO_ALPHA_STEP !== 'undefined' ? RELEASE_PROMO_ALPHA_STEP : 0.005;
  if (!song.released) {
    const alpha = song.promoCount * alphaStep;
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
  if (typeof addGroupSales === 'function') addGroupSales(addedSales);
  if (typeof addMonthlyCdRevenue === 'function' && typeof getSongUnitPrice === 'function') {
    addMonthlyCdRevenue(addedSales * getSongUnitPrice(song));
  }

  return { addedSales, cumulativeSales, weeks: k, mode: 'post-release' };
}

function claimPromotionSong(song) {
  if (typeof promoSongId !== 'undefined') {
    promoSongId = song.id;
  }
}

function getSongPromoBaseSales(song) {
  const sRatio = typeof SINGLE_PROMO_FAN_RATIO !== 'undefined' ? SINGLE_PROMO_FAN_RATIO : 1.5;
  const aRatio = typeof ALBUM_PROMO_FAN_RATIO !== 'undefined' ? ALBUM_PROMO_FAN_RATIO : 2.0;
  const ratio = song?.releaseType === 'album' ? aRatio : sRatio;
  const fans = typeof calculateGroupFans === 'function' ? calculateGroupFans() : 50000;
  return Math.round(fans * ratio);
}

function describeSinglePromotionStatus() {
  if (typeof getSinglePromotionTarget !== 'function') return '';
  const target = getSinglePromotionTarget();
  if (!target) return '対象の楽曲がまだありません（PV中の人気Upで代替します）。';
  const song = target.song;
  const label = target.isUpcoming ? '次作' : '今作';
  const alphaStep = typeof RELEASE_PROMO_ALPHA_STEP !== 'undefined' ? RELEASE_PROMO_ALPHA_STEP : 0.005;

  if (!song.released) {
    const count = song.promoCount || 0;
    return `対象: ${label}「${song.title}」／ 発売前の販促${count}回 → 発売時の売上が${formatMultiplier(1 + count * alphaStep)}倍になります。`;
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
    const maxProd = typeof MAX_MERCHANDISE_PRODUCTS !== 'undefined' ? MAX_MERCHANDISE_PRODUCTS : 10;
    const devCost = typeof GOODS_DEVELOPMENT_COST !== 'undefined' ? GOODS_DEVELOPMENT_COST : 3000000;
    const devStock = typeof GOODS_DEVELOPMENT_STOCK !== 'undefined' ? GOODS_DEVELOPMENT_STOCK : 1000;

    if (typeof merchandiseProducts !== 'undefined' && merchandiseProducts >= maxProd) {
      return `グッズ開発（上限${maxProd}種のため未実施）`;
    }
    if (typeof merchandiseProducts !== 'undefined') merchandiseProducts++;
    if (typeof merchandiseStock !== 'undefined') merchandiseStock += devStock;
    funds -= devCost;
    if (typeof recordMonthlyExpense === 'function') recordMonthlyExpense('グッズ開発', devCost);
    return `グッズ開発（全${merchandiseProducts}種 / 在庫${merchandiseStock.toLocaleString()}個 / -${formatMoney(devCost)}）`;
  }
  return '';
}

function confirmWeeklySchedule() {
  console.log('【進行ボタン押下】処理を開始します...');

  try {
    const gameDateObj = getGameDateObject();
    const dayOfWeek = gameDateObj.getDay();

    if (dayOfWeek !== 3) {
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const msg = `現在は【${dayNames[dayOfWeek]}曜日】です。スケジュール確定は【水曜日】にのみ行えます。\n※画面上の「水曜日まで進行」ボタンを押してください。`;
      alert(msg);
      console.warn(msg);
      return;
    }

    if (typeof hasLiveWithinWeek === 'function' && hasLiveWithinWeek()) {
      const msg = '今週はグループのライブが予定されているため、通常スケジュールは組めません。\n「イベントまで進行」ボタンを押してください。';
      alert(msg);
      console.warn(msg);
      return;
    }

    if (!validateWeeklySchedule()) {
      console.warn('【バリデーション中断】条件を満たしていないため進行を中断しました。');
      return;
    }

    if (typeof rememberWeeklySchedule === 'function') rememberWeeklySchedule(weeklySchedule);
    if (typeof markMusicPreparations === 'function') markMusicPreparations();

    applyWeeklySchedule();
    advanceOneWeek();

  } catch (error) {
    console.error('【スケジュール進行エラー】', error);
    alert(`進行処理中にスクリプトエラーが発生しました:\n\n${error.name}: ${error.message}\n\n（F12の開発者コンソールを確認してください）`);
  }
}

function advanceOneWeek() {
  const currentDate = getGameDateObject();
  const nextWednesday = getNextWednesday(currentDate);
  const nextLiveDate = (typeof findNextGroupLiveDate === 'function') ? findNextGroupLiveDate(currentDate, nextWednesday) : null;
  const nextDate = nextLiveDate || nextWednesday;
  const wasWednesday = currentDate.getDay() === 3;
  const previousMonth = currentMonth;
  const previousYear = currentYear;

  if (typeof processMemberBirthdays === 'function') processMemberBirthdays(currentDate, nextDate);
  if (typeof syncMemberAges === 'function') syncMemberAges(nextDate);

  if (wasWednesday) {
    totalWeeksElapsed++;
    if (typeof rollWeeklyCrisisEvent === 'function') rollWeeklyCrisisEvent();
    if (typeof rollRandomEvent === 'function') rollRandomEvent();
    if (typeof rollEquipmentDowngradeEvent === 'function') rollEquipmentDowngradeEvent();
    if (typeof checkFanClubYearlyEvent === 'function') checkFanClubYearlyEvent();
    if (typeof checkSpecialBroadcastOffers === 'function') checkSpecialBroadcastOffers();
    
    // マネージャーの安全な呼び出し
    if (typeof processManagerResignations === 'function') {
      try { processManagerResignations(); } catch (e) { console.warn('processManagerResignations safe skip:', e); }
    }
    if (typeof refreshManagerMarket === 'function') {
      try { refreshManagerMarket(); } catch (e) { console.warn('refreshManagerMarket safe skip:', e); }
    }

    if (typeof processMemberInjuries === 'function') processMemberInjuries();
    if (typeof decayLiveFatigue === 'function') decayLiveFatigue();
    if (typeof syncPlayerTeamStats === 'function') syncPlayerTeamStats();

    if (Array.isArray(leagueTeams)) {
      leagueTeams.forEach(team => {
        if (!team || team.id === 'player') return;
        const monthPrefix = `${calendarYear}-${String(currentMonth).padStart(2, '0')}-`;
        const rBookings = Array.isArray(rivalLiveBookings) ? rivalLiveBookings : [];
        const showCount = rBookings.filter(booking =>
          booking.groupId === team.id && (booking.venueDates || [booking.liveDate]).some(key => key && key.startsWith(monthPrefix))
        ).length;
        const power = (typeof getRivalTeamPower === 'function') ? getRivalTeamPower(team) : 70;
        team.sales = (team.sales || 0) + Math.floor(power * 550 + Math.random() * 7000 + showCount * 6000);
        team.audience = (team.audience || 0) + Math.floor(power * 220 + Math.random() * 3000 + showCount * 2500);
        team.showCount = (team.showCount || 0) + showCount;
      });
    }

    if (typeof crisisEventWeekKey !== 'undefined' && typeof getCurrentWeekKey === 'function' && crisisEventWeekKey === getCurrentWeekKey()) {
      pendingCrisisResponse = { type: crisisEventType, weekKey: crisisEventWeekKey };
      setLog(crisisEventType === 'information-leak'
        ? '【情報漏洩】内部情報が外部に流出しました。対応方針を決めましょう。'
        : '【SNSスキャンダル】SNS上の騒動が広がっています。対応方針を決めましょう。');
    }

    const summary = (typeof calculateTeamAverages === 'function') ? calculateTeamAverages() : { overall: 50 };
    if (typeof checkSenbatsuTrigger === 'function') checkSenbatsuTrigger();
    if (typeof checkMusicProgramOffers === 'function') checkMusicProgramOffers();
    if (typeof resolveIndustryOffer === 'function') resolveIndustryOffer();
    if (typeof trainSongs === 'function') trainSongs(summary);
    if (typeof recordAllSongSalesHistory === 'function') recordAllSongSalesHistory();

    if (typeof isLastWednesdayOfMonth === 'function' && isLastWednesdayOfMonth(currentDate) && typeof officeUpgrades !== 'undefined' && officeUpgrades?.snsTraining > 1) {
      const snsGain = officeUpgrades.snsTraining - 1;
      if (Array.isArray(idolRoster)) {
        idolRoster.filter(member => member && member.isSelected).forEach(member => {
          if (member.stats) member.stats.sns = Math.min(100, (member.stats.sns || 0) + snsGain);
        });
      }
    }
  }

  if (typeof processMonthlyReleaseAndLive === 'function') processMonthlyReleaseAndLive(toDateKey(nextDate));
  if (typeof processPlanEvents === 'function') processPlanEvents(toDateKey(nextDate));
  if (wasWednesday && typeof maintainOfficeFacilities === 'function') {
    try { maintainOfficeFacilities(); } catch (e) { console.warn('maintainOfficeFacilities safe skip:', e); }
  }
  if (wasWednesday && totalWeeksElapsed > 0 && totalWeeksElapsed % 120 === 0 && typeof startDraftMeeting === 'function') {
    startDraftMeeting();
  }

  gameDate = toDateKey(nextDate);
  if (typeof syncGameCalendar === 'function') syncGameCalendar();
  resetWeeklySchedule();
  if (typeof updateWeeklyGroupFans === 'function') updateWeeklyGroupFans();

  if (currentYear > previousYear) {
    yearlyStats = { sales: 0, audience: 0 };
    if (Array.isArray(leagueTeams)) {
      leagueTeams.forEach(team => { if (team) { team.sales = 0; team.audience = 0; team.showCount = 0; } });
    }
    previousYearGroupFansAtYearStart = groupFansAtYearStart || ((typeof calculateGroupFans === 'function') ? calculateGroupFans() : 0);
    groupFansAtYearStart = (typeof calculateGroupFans === 'function') ? calculateGroupFans() : 0;
    yearEndAwardProcessed = false;
    yearEndKohakuProcessed = false;
  }

  if (currentMonth !== previousMonth && (currentMonth === 1 || currentMonth === 7) && typeof openDecisionModal === 'function') {
    if (currentMonth === 1) openDecisionModal("当年7月〜12月の計画策定", currentYear, 7, 12);
    else openDecisionModal("翌年1月〜6月の計画策定", currentYear + 1, 1, 6);
  }

  updateUI();
  if (typeof openPendingModal === 'function') openPendingModal();
}
