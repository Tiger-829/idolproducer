(function (globalScope) {
  const SAVE_SLOT_PREFIX = 'idol_manager_save_slot_';
  const USER_ID_KEY = 'idol_manager_user_id';

  function safeStorage() {
    try {
      if (!globalScope || !globalScope.localStorage) return null;
      const probe = '__idol_manager_probe__';
      globalScope.localStorage.setItem(probe, '1');
      globalScope.localStorage.removeItem(probe);
      return globalScope.localStorage;
    } catch (error) {
      return null;
    }
  }

  function normalizeUserId(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return 'guest-user';
    const normalized = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return (normalized || 'guest-user').slice(0, 64);
  }

  function getStorage() {
    return safeStorage();
  }

  function getUserId(storage = getStorage()) {
    if (!storage) return 'guest-user';
    const stored = storage.getItem(USER_ID_KEY);
    return normalizeUserId(stored || 'guest-user');
  }

  function setUserId(userId, storage = getStorage()) {
    const nextUserId = normalizeUserId(userId || getUserId(storage));
    if (!storage) return nextUserId;
    storage.setItem(USER_ID_KEY, nextUserId);
    return nextUserId;
  }

  function collectSaveSlots(storage = getStorage()) {
    const map = {};
    if (!storage) return map;

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(SAVE_SLOT_PREFIX)) continue;

      const slotLabel = key.replace(SAVE_SLOT_PREFIX, '');
      const slotNumber = Number(slotLabel);
      if (!Number.isInteger(slotNumber) || slotNumber < 1) continue;

      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        map[slotNumber] = JSON.parse(raw);
      } catch (error) {
        console.warn('同期用セーブデータの読み取りに失敗しました:', error);
      }
    }
    return map;
  }

  function buildSyncEnvelope({ userId, saveSlots } = {}) {
    const targetUserId = normalizeUserId(userId || getUserId());
    const targetSaveSlots = saveSlots && typeof saveSlots === 'object' ? saveSlots : collectSaveSlots();

    return {
      version: 1,
      type: 'idolproducer-save-sync',
      userId: targetUserId,
      exportedAt: Date.now(),
      saves: Object.keys(targetSaveSlots).reduce((result, slotKey) => {
        const slotNumber = Number(slotKey);
        if (!Number.isInteger(slotNumber) || slotNumber < 1) return result;
        const value = targetSaveSlots[slotKey];
        if (value && typeof value === 'object') {
          result[slotNumber] = value;
        }
        return result;
      }, {})
    };
  }

  function exportSyncPayload(options = {}) {
    return JSON.stringify(buildSyncEnvelope(options), null, 2);
  }

  function importSyncPayload(payload, storage = getStorage()) {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!parsed || typeof parsed !== 'object') throw new Error('同期データの形式が無効です。');
    if (parsed.type !== 'idolproducer-save-sync') throw new Error('同期データの形式が不正です。');

    const targetUserId = normalizeUserId(parsed.userId || getUserId(storage));
    setUserId(targetUserId, storage);

    const saves = parsed.saves && typeof parsed.saves === 'object' ? parsed.saves : {};
    let importedSlots = 0;

    Object.keys(saves).forEach((slotKey) => {
      const slotNumber = Number(slotKey);
      if (!Number.isInteger(slotNumber) || slotNumber < 1) return;
      const value = saves[slotKey];
      if (!storage) {
        importedSlots += 1;
        return;
      }
      storage.setItem(`${SAVE_SLOT_PREFIX}${slotNumber}`, JSON.stringify(value));
      importedSlots += 1;
    });

    return { userId: targetUserId, importedSlots };
  }

  function importSyncPayloadFromText(payloadText, storage = getStorage()) {
    const trimmed = typeof payloadText === 'string' ? payloadText.trim() : '';
    if (!trimmed) {
      throw new Error('同期コードが空です。');
    }

    const result = importSyncPayload(trimmed, storage);
    if (typeof renderSaveSlots === 'function') {
      renderSaveSlots();
    }
    return result;
  }

  async function importSyncPayloadFromFile(file, storage = getStorage()) {
    if (!file) return null;

    const text = typeof file.text === 'function'
      ? await file.text()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('同期ファイルの読み込みに失敗しました。'));
          reader.readAsText(file);
        });

    return importSyncPayloadFromText(text, storage);
  }

  function writeSyncPayloadToField() {
    const field = document && document.getElementById('save-sync-json-output');
    if (!field) return '';
    const payload = exportSyncPayload({ userId: getUserId() });
    field.value = payload;
    return payload;
  }

  function copySyncPayloadToClipboard() {
    const payload = writeSyncPayloadToField();
    if (!payload) {
      alert('同期コードを生成できませんでした。');
      return false;
    }
    if (!navigator || !navigator.clipboard) {
      alert('この環境ではクリップボードにコピーできません。下の同期コードを手動でコピーしてください。');
      return false;
    }

    navigator.clipboard.writeText(payload)
      .then(() => {
        alert('同期用データをクリップボードにコピーしました。');
      })
      .catch(() => {
        alert('クリップボードへの書き込みに失敗しました。下の同期コードを手動でコピーしてください。');
      });
    return true;
  }

  function importSyncPayloadFromField() {
    const field = document && document.getElementById('save-sync-json-output');
    if (!field || !field.value.trim()) {
      alert('同期コードを入力してください。');
      return null;
    }

    try {
      const result = importSyncPayloadFromText(field.value.trim());
      alert(`ユーザー「${result.userId}」のセーブを ${result.importedSlots} 件取り込みました。`);
      return result;
    } catch (error) {
      console.error(error);
      alert(error.message || '同期データを取り込めませんでした。');
      return null;
    }
  }

  function bindTitleUserIdentity() {
    if (!document) return getUserId();

    const storage = getStorage();
    const legacyValue = storage ? storage.getItem(USER_ID_KEY) : null;
    if (!legacyValue && storage) {
      storage.setItem(USER_ID_KEY, 'guest-user');
    }

    const titleInput = document.getElementById('title-user-name');
    const syncInput = document.getElementById('save-sync-user-id');
    const syncValue = getUserId();

    const applyUserId = (nextValue) => {
      const normalized = normalizeUserId(nextValue || syncValue);
      setUserId(normalized);
      if (titleInput) titleInput.value = normalized;
      if (syncInput) syncInput.value = normalized;
      return normalized;
    };

    if (titleInput) {
      titleInput.value = syncValue;
      titleInput.addEventListener('change', (event) => {
        applyUserId(event.target.value);
      });
      titleInput.addEventListener('blur', (event) => {
        applyUserId(event.target.value);
      });
    }

    if (syncInput) {
      syncInput.value = syncValue;
      syncInput.addEventListener('change', (event) => {
        applyUserId(event.target.value);
      });
      syncInput.addEventListener('blur', (event) => {
        applyUserId(event.target.value);
      });
    }

    return getUserId();
  }

  function registerSaveSyncUi() {
    if (!document) return;

    const userInput = document.getElementById('save-sync-user-id');
    if (userInput) {
      userInput.value = getUserId();
      userInput.addEventListener('change', (event) => {
        setUserId(event.target.value);
        const titleInput = document.getElementById('title-user-name');
        if (titleInput) titleInput.value = getUserId();
      });
    }

    bindTitleUserIdentity();

    const exportButton = document.getElementById('save-sync-export-btn');
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        const field = document.getElementById('save-sync-json-output');
        const targetUserId = document.getElementById('save-sync-user-id')?.value || getUserId();
        const payload = exportSyncPayload({ userId: targetUserId });
        if (field) field.value = payload;
        alert('同期コードを生成しました。');
      });
    }

    const copyButton = document.getElementById('save-sync-copy-btn');
    if (copyButton) copyButton.addEventListener('click', copySyncPayloadToClipboard);

    const importButton = document.getElementById('save-sync-import-btn');
    if (importButton) importButton.addEventListener('click', importSyncPayloadFromField);

    const uploadButton = document.getElementById('save-sync-upload-btn');
    const fileInput = document.getElementById('save-sync-file-input');
    if (uploadButton && fileInput) {
      uploadButton.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const result = await importSyncPayloadFromFile(file);
          if (result) {
            alert(`ユーザー「${result.userId}」のセーブを ${result.importedSlots} 件取り込みました。`);
          }
        } catch (error) {
          console.error(error);
          alert(error.message || '同期ファイルを取り込めませんでした。');
        } finally {
          fileInput.value = '';
        }
      });
    }

    const downloadButton = document.getElementById('save-sync-download-btn');
    if (downloadButton) {
      downloadButton.addEventListener('click', () => {
        const payload = writeSyncPayloadToField();
        if (!payload) return;
        const blob = new Blob([payload], { type: 'application/json' });
        const userId = normalizeUserId(document.getElementById('save-sync-user-id')?.value || getUserId());
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `idol-producer-save-${userId}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      });
    }
  }

  const api = {
    STORAGE_KEYS: Object.freeze({
      USER_ID: USER_ID_KEY,
      SAVE_SLOT_PREFIX: SAVE_SLOT_PREFIX
    }),
    normalizeUserId,
    getUserId,
    setUserId,
    collectSaveSlots,
    buildSyncEnvelope,
    exportSyncPayload,
    importSyncPayload,
    importSyncPayloadFromText,
    importSyncPayloadFromFile,
    bindTitleUserIdentity,
    writeSyncPayloadToField,
    copySyncPayloadToClipboard,
    importSyncPayloadFromField,
    registerSaveSyncUi
  };

  globalScope.saveDataManager = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', registerSaveSyncUi, { once: true });
    } else {
      registerSaveSyncUi();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { saveDataManager: api };
  }
})(typeof window !== 'undefined' ? window : globalThis);
