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

  function makeSaveSlotKey(slot, userId = getUserId()) {
    const slotNumber = Number(slot);
    if (!Number.isInteger(slotNumber) || slotNumber < 1) return null;
    return `${SAVE_SLOT_PREFIX}${normalizeUserId(userId || getUserId())}_${slotNumber}`;
  }

  function migrateLegacyUserSaveSlots(storage = getStorage()) {
    if (!storage) return false;

    const targetUserId = getUserId(storage);
    const userPrefix = `${SAVE_SLOT_PREFIX}${targetUserId}_`;
    const migrated = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(SAVE_SLOT_PREFIX)) continue;
      if (key.startsWith(userPrefix)) continue;

      const slotLabel = key.slice(SAVE_SLOT_PREFIX.length);
      const slotNumber = Number(slotLabel);
      if (!Number.isInteger(slotNumber) || slotNumber < 1) continue;

      const raw = storage.getItem(key);
      if (!raw) continue;
      const targetKey = makeSaveSlotKey(slotNumber, targetUserId);
      if (targetKey && !storage.getItem(targetKey)) {
        storage.setItem(targetKey, raw);
      }
      storage.removeItem(key);
      migrated.push(key);
    }

    return migrated.length > 0;
  }

  function collectSaveSlots(storage = getStorage()) {
    const map = {};
    if (!storage) return map;

    const activeUserId = getUserId(storage);
    const userPrefix = `${SAVE_SLOT_PREFIX}${activeUserId}_`;

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(userPrefix)) continue;

      const slotLabel = key.slice(userPrefix.length);
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

  function buildUserSaveBundle({ userId, saveSlots } = {}) {
    const targetUserId = normalizeUserId(userId || getUserId());
    const targetSaveSlots = saveSlots && typeof saveSlots === 'object' ? saveSlots : collectSaveSlots();

    return {
      version: 1,
      type: 'idolproducer-user-save-bundle',
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

  function exportUserSaveBundle(options = {}) {
    return buildUserSaveBundle(options);
  }

  function exportUserSaveBundleText(options = {}) {
    return JSON.stringify(exportUserSaveBundle(options));
  }

  function importUserSaveBundle(payload, storage = getStorage()) {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!parsed || typeof parsed !== 'object') throw new Error('セーブデータの形式が無効です。');
    if (parsed.type !== 'idolproducer-user-save-bundle') throw new Error('セーブデータの形式が不正です。');

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
      const saveKey = makeSaveSlotKey(slotNumber, targetUserId);
      if (saveKey) {
        storage.setItem(saveKey, JSON.stringify(value));
      }
      importedSlots += 1;
    });

    return { userId: targetUserId, importedSlots };
  }

  function exportCurrentUserSaveBundle(storage = getStorage()) {
    return exportUserSaveBundle({ userId: getUserId(storage), saveSlots: collectSaveSlots(storage) });
  }

  function exportCurrentUserSaveBundleText(storage = getStorage()) {
    return exportUserSaveBundleText({ userId: getUserId(storage), saveSlots: collectSaveSlots(storage) });
  }

  async function generateQrCodeDataUrl(payloadText, options = {}) {
    if (!payloadText || typeof payloadText !== 'string') return '';
    const qrApi = globalScope && globalScope.QRCode;
    if (!qrApi || typeof qrApi.toDataURL !== 'function') return '';

    if (payloadText.length > 3000) {
      console.warn('Save payload is too large for QR; use text copy/share fallback instead.', {
        length: payloadText.length
      });
      return '';
    }

    const viewportWidth = globalScope && globalScope.window ? globalScope.window.innerWidth || 0 : 0;
    const isMobileViewport = viewportWidth > 0 && viewportWidth <= 480;
    const defaultWidth = isMobileViewport ? Math.min(240, Math.max(180, viewportWidth - 48)) : 260;
    const settings = Object.assign({
      width: defaultWidth,
      margin: 2,
      errorCorrectionLevel: 'L',
      color: { dark: '#1f1f1f', light: '#ffffff' }
    }, options);

    try {
      const qrUrl = await qrApi.toDataURL(payloadText, settings);
      return typeof qrUrl === 'string' ? qrUrl : '';
    } catch (error) {
      console.warn('QR code generation failed:', error);
      return '';
    }
  }

  function setSaveUserQrStatus(message, isError = true) {
    const statusEl = document && document.getElementById('save-user-qr-status');
    if (!statusEl) return;
    if (!message) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
      return;
    }
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.color = isError ? '#b65378' : '#4b5563';
    statusEl.style.background = isError ? '#fff3f7' : '#f8fafc';
  }

  async function updateCurrentUserQrCode() {
    const qrImage = document && document.getElementById('save-user-qr-image');
    const field = document && document.getElementById('save-user-bundle-output');
    const statusEl = document && document.getElementById('save-user-qr-status');
    if (!field) return '';

    const payload = exportCurrentUserSaveBundleText();
    field.value = payload;

    if (payload.length > 3000) {
      setSaveUserQrStatus('セーブデータが大きすぎてQRに収まりません。文字列コピーまたは共有を使ってください。');
      if (qrImage) {
        qrImage.removeAttribute('src');
        qrImage.style.display = 'none';
      }
      return payload;
    }

    if (qrImage) {
      const qrUrl = await generateQrCodeDataUrl(payload);
      qrImage.src = qrUrl || '';
      qrImage.style.display = qrUrl ? 'block' : 'none';
      if (!qrUrl) {
        setSaveUserQrStatus('QRコードを生成できませんでした。ブラウザを再読み込みしてもう一度お試しください。');
        qrImage.removeAttribute('src');
      } else {
        setSaveUserQrStatus('QRコードを表示しました。相手の端末で読み取ってください。', false);
      }
    }

    if (!statusEl && payload && payload.length <= 3000) {
      setSaveUserQrStatus('', false);
    }

    return payload;
  }

  function shareCurrentUserSaveBundle() {
    const payload = exportCurrentUserSaveBundleText();
    if (!payload) {
      alert('共有できるセーブデータがありません。');
      return false;
    }

    if (!globalScope || !globalScope.navigator || !globalScope.navigator.share) {
      updateCurrentUserQrCode();
      alert('この端末では共有APIが使えないため、QRコードを表示して他端末で読み取ってください。');
      return false;
    }

    try {
      globalScope.navigator.share({
        title: 'アイドルプロデューサー セーブデータ',
        text: `ユーザー「${getUserId()}」のセーブデータ`,
        url: `data:application/json,${encodeURIComponent(payload)}`
      });
      return true;
    } catch (error) {
      console.warn('Share API failed:', error);
      updateCurrentUserQrCode();
      alert('共有が失敗したので、QRコードを表示しました。');
      return false;
    }
  }

  function copyCurrentUserSaveBundleToClipboard() {
    const payload = exportCurrentUserSaveBundleText();
    if (!payload) {
      alert('コピーできるセーブデータがありません。');
      return false;
    }

    if (!globalScope || !globalScope.navigator || !globalScope.navigator.clipboard) {
      const field = document && document.getElementById('save-user-bundle-output');
      if (field) {
        field.value = payload;
        field.focus();
        field.select();
      }
      alert('この端末ではクリップボードが使えないため、文字列を手動でコピーしてください。');
      return false;
    }

    globalScope.navigator.clipboard.writeText(payload)
      .then(() => {
        alert('保存データをクリップボードにコピーしました。');
      })
      .catch(() => {
        const field = document && document.getElementById('save-user-bundle-output');
        if (field) {
          field.value = payload;
          field.focus();
          field.select();
        }
        alert('クリップボードにコピーできないため、文字列を手動でコピーしてください。');
      });
    return true;
  }

  function importUserSaveBundleFromField() {
    const field = document && document.getElementById('save-user-bundle-output');
    if (!field || !field.value.trim()) {
      alert('保存データの文字列を入力してください。');
      return null;
    }

    try {
      const result = importUserSaveBundle(field.value.trim());
      if (typeof renderSaveSlots === 'function') {
        renderSaveSlots();
      }
      alert(`ユーザー「${result.userId}」のセーブを ${result.importedSlots} 件取り込みました。`);
      return result;
    } catch (error) {
      console.error(error);
      alert(error.message || 'セーブデータを取り込めませんでした。');
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
    if (storage) migrateLegacyUserSaveSlots(storage);

    const titleInput = document.getElementById('title-user-name');
    const syncInput = document.getElementById('save-sync-user-id');
    const syncValue = getUserId();

    const applyUserId = (nextValue) => {
      const normalized = normalizeUserId(nextValue || syncValue);
      setUserId(normalized, storage);
      if (titleInput) titleInput.value = normalized;
      if (syncInput) syncInput.value = normalized;
      if (typeof renderSaveSlots === 'function') {
        renderSaveSlots();
      }
      return normalized;
    };

    if (!legacyValue || legacyValue === 'guest-user') {
      const promptValue = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt('ユーザー名を入力してください。保存データはこのユーザー名で管理されます。', '')
        : '';
      if (promptValue !== null && String(promptValue).trim()) {
        applyUserId(promptValue);
      }
    }

    if (titleInput) {
      titleInput.value = getUserId(storage);
      titleInput.addEventListener('change', (event) => {
        applyUserId(event.target.value);
      });
      titleInput.addEventListener('blur', (event) => {
        applyUserId(event.target.value);
      });
    }

    if (syncInput) {
      syncInput.value = getUserId(storage);
      syncInput.addEventListener('change', (event) => {
        applyUserId(event.target.value);
      });
      syncInput.addEventListener('blur', (event) => {
        applyUserId(event.target.value);
      });
    }

    return getUserId(storage);
  }

  function registerSaveSyncUi() {
    if (!document) return;
    bindTitleUserIdentity();

    const shareButton = document.getElementById('save-user-share-btn');
    if (shareButton) {
      shareButton.addEventListener('click', () => {
        shareCurrentUserSaveBundle();
      });
    }

    const copyButton = document.getElementById('save-user-copy-btn');
    if (copyButton) {
      copyButton.addEventListener('click', () => {
        copyCurrentUserSaveBundleToClipboard();
      });
    }

    const qrButton = document.getElementById('save-user-qr-btn');
    if (qrButton) {
      qrButton.addEventListener('click', async () => {
        const payload = await updateCurrentUserQrCode();
        if (!payload) {
          setSaveUserQrStatus('QRコードを生成できませんでした。');
          alert('QRコードを生成できませんでした。');
          return;
        }
        if (payload.length > 3000) {
          setSaveUserQrStatus('セーブデータが大きすぎてQRに収まりません。文字列コピーまたは共有を使ってください。');
          alert('セーブデータが大きすぎてQRに収まりません。文字列コピーまたは共有を使ってください。');
        }
      });
    }

    const importButton = document.getElementById('save-user-import-btn');
    if (importButton) {
      importButton.addEventListener('click', importUserSaveBundleFromField);
    }

    const field = document.getElementById('save-user-bundle-output');
    if (field) {
      field.addEventListener('change', () => {
        if (field.value.trim()) {
          importUserSaveBundleFromField();
        }
      });
    }

    updateCurrentUserQrCode();
  }

  const api = {
    STORAGE_KEYS: Object.freeze({
      USER_ID: USER_ID_KEY,
      SAVE_SLOT_PREFIX: SAVE_SLOT_PREFIX
    }),
    makeSaveSlotKey,
    migrateLegacyUserSaveSlots,
    normalizeUserId,
    getUserId,
    setUserId,
    collectSaveSlots,
    buildUserSaveBundle,
    exportUserSaveBundle,
    exportUserSaveBundleText,
    importUserSaveBundle,
    exportCurrentUserSaveBundle,
    exportCurrentUserSaveBundleText,
    generateQrCodeDataUrl,
    updateCurrentUserQrCode,
    shareCurrentUserSaveBundle,
    copyCurrentUserSaveBundleToClipboard,
    bindTitleUserIdentity,
    registerSaveSyncUi
  };

  globalScope.saveDataManager = api;
  globalScope.makeSaveSlotKey = makeSaveSlotKey;

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
