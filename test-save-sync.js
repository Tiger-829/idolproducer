const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const { saveDataManager } = require('./js/15-save-sync.js');

const source = fs.readFileSync('./js/03-venue.js', 'utf8');
const context = {
  console,
  Date,
  Math,
  Set,
  Array,
  Object,
  Number,
  String,
  Boolean,
  isNaN,
  parseInt,
  parseFloat,
  JSON,
  globalThis: {},
  window: {},
  document: undefined,
  getGameDateObject: () => new Date('2026-01-01T12:00:00Z'),
  normalizeLiveDays: (v) => (Array.isArray(v) ? v.length : 1),
  toDateKey: (d) => d.toISOString().slice(0, 10),
  getLastWednesday: () => new Date('2026-01-07T12:00:00Z')
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);

const sampleSlots = {
  1: { currentYear: 2, currentMonth: 3, currentWeek: 1, funds: 2500000, idolRoster: [{ name: '春日咲' }] },
  2: { currentYear: 1, currentMonth: 5, currentWeek: 2, funds: 1500000, idolRoster: [] }
};

const userId = 'user-demo-001';
const payload = saveDataManager.exportSyncPayload({ userId, saveSlots: sampleSlots });
const parsed = JSON.parse(payload);

assert.strictEqual(typeof saveDataManager.getUserId, 'function');
assert.strictEqual(saveDataManager.normalizeUserId('  demo-user  '), 'demo-user');
assert.strictEqual(parsed.userId, userId);
assert.strictEqual(parsed.saves[1].currentYear, 2);
assert.strictEqual(parsed.saves[2].funds, 1500000);
assert.deepStrictEqual(saveDataManager.importSyncPayload(parsed), { userId, importedSlots: 2 });

const plan = {
  liveVenue: '東京ドーム',
  liveName: '春のライブ',
  liveDates: ['2026-03-01', '2026-03-02'],
  streamDates: ['2026-03-02'],
  additionalLives: [{
    liveVenue: '大阪城ホール',
    liveName: '大阪追加公演',
    liveDates: ['2026-03-05'],
    streamDates: ['2026-03-05']
  }]
};
const entries = context.getMonthLiveEntries(plan);
assert.deepStrictEqual(entries[0].streamDates, ['2026-03-02']);
assert.deepStrictEqual(entries[1].streamDates, ['2026-03-05']);

console.log('PASS : save sync envelope works');
