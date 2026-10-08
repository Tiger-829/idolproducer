const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const localStorageMock = (() => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? String(store.get(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    }
  };
})();

globalThis.localStorage = localStorageMock;

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

assert.strictEqual(typeof saveDataManager.getUserId, 'function');
assert.strictEqual(saveDataManager.normalizeUserId('  demo-user  '), 'demo-user');
assert.strictEqual(typeof saveDataManager.bindTitleUserIdentity, 'function');
assert.strictEqual(typeof saveDataManager.exportUserSaveBundle, 'function');
assert.strictEqual(typeof saveDataManager.importUserSaveBundle, 'function');

const compactText = saveDataManager.exportUserSaveBundleText({ userId, saveSlots: sampleSlots });
assert.strictEqual(compactText.includes('\n'), false);
assert.strictEqual(compactText.includes('  "version"'), false);

const bundle = saveDataManager.exportUserSaveBundle({ userId, saveSlots: sampleSlots });
assert.strictEqual(bundle.userId, userId);
assert.deepStrictEqual(bundle.saves[1], sampleSlots[1]);
assert.deepStrictEqual(saveDataManager.importUserSaveBundle(bundle, globalThis.localStorage), { userId, importedSlots: 2 });
assert.deepStrictEqual(saveDataManager.collectSaveSlots(globalThis.localStorage), {
  1: sampleSlots[1],
  2: sampleSlots[2]
});

const largeSaveSlot = {
  currentYear: 7,
  currentMonth: 11,
  currentWeek: 3,
  funds: 999999999,
  idolRoster: Array.from({ length: 40 }, (_, index) => ({
    name: `大島${index + 1}`,
    skillLevels: { vocal: 60 + index, dance: 60 + index, visual: 60 + index, appeal: 60 + index },
    notes: '長いセーブデータの共有テスト用データ'.repeat(12)
  }))
};
const largeShareOptions = { userId, saveSlots: { 1: largeSaveSlot } };
const largePayload = saveDataManager.exportUserSaveBundleText(largeShareOptions);
assert.ok(largePayload.length > 5000);

saveDataManager.setUserId(userId, globalThis.localStorage);
globalThis.localStorage.setItem('idol_manager_save_slot_user-demo-001_1', JSON.stringify(largeSaveSlot));

let capturedShareArgs = null;
let copiedText = null;
Object.defineProperty(globalThis, 'alert', { value: () => {}, configurable: true, writable: true });
Object.defineProperty(globalThis, 'document', {
  value: {
    getElementById() {
      return {
        value: '',
        focus() {},
        select() {},
        style: {},
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {}
      };
    }
  },
  configurable: true,
  writable: true
});
Object.defineProperty(globalThis, 'navigator', {
  value: {
    share(args) {
      capturedShareArgs = args;
      return true;
    },
    clipboard: {
      writeText(value) {
        copiedText = value;
        return Promise.resolve();
      }
    }
  },
  configurable: true,
  writable: true
});

const shareResult = saveDataManager.shareCurrentUserSaveBundle();
assert.strictEqual(shareResult, false);
assert.strictEqual(capturedShareArgs, null);
assert.strictEqual(copiedText, saveDataManager.exportCurrentUserSaveBundleText());

globalThis.localStorage.clear();
saveDataManager.setUserId('username-scope');
globalThis.localStorage.setItem('idol_manager_save_slot_username-scope_1', JSON.stringify(sampleSlots[1]));
globalThis.localStorage.setItem('idol_manager_save_slot_username-scope_2', JSON.stringify(sampleSlots[2]));
globalThis.localStorage.setItem('idol_manager_save_slot_other-user_1', JSON.stringify({ currentYear: 9 }));
assert.deepStrictEqual(saveDataManager.collectSaveSlots(globalThis.localStorage), {
  1: sampleSlots[1],
  2: sampleSlots[2]
});
assert.strictEqual(saveDataManager.getUserId(globalThis.localStorage), 'username-scope');

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
