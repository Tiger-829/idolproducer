const assert = require('assert');

const { saveDataManager } = require('./js/15-save-sync.js');

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

console.log('PASS : save sync envelope works');
