import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegPromise = null;
let loadProgressHandler = null;
let loadedMode = null;

/**
 * 註冊 FFmpeg 載入進度與 log 回呼（供 UI 顯示）。
 */
export const onFFmpegEvent = (handler) => {
  loadProgressHandler = handler;
};

// 自行託管在 public/ffmpeg/ 的 FFmpeg core（部署時隨網站一起送出，無需外部 CDN）
const CORE_BASE = `${import.meta.env.BASE_URL}ffmpeg`;

// 共用下載進度 callback
const emitProgress = (name, received, total, done) => {
  loadProgressHandler?.({
    type: 'ffmpeg-download',
    name,
    received,
    total,
    done,
  });
};

const toBlobURLWithProgress = async (url, mimeType, label) => {
  return toBlobURL(url, mimeType, true, ({ received, total, done }) => {
    emitProgress(label, received, total, done);
  });
};

const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 載入逾時（超過 ${Math.round(ms / 1000)} 秒）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * 決定要使用的 core 模式。
 * @param {'auto'|'single'|'mt'} mode 使用者選擇的模式
 */
const resolveMode = (mode) => {
  if (mode === 'single') return 'single';
  if (mode === 'mt') return 'mt';
  // auto：瀏覽器具備跨源隔離時用 MT，否則用單執行緒
  const isIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  return isIsolated ? 'mt' : 'single';
};

/**
 * 單例初始化 FFmpeg WASM。
 * @param {'auto'|'single'|'mt'} [mode='auto']
 *   - 'auto'：依瀏覽器 crossOriginIsolated 自動選擇（MT 或單執行緒）。
 *   - 'mt'：強制使用多執行緒 core-mt（SharedArrayBuffer 加速），
 *     需要伺服器設 COOP/COEP header，且瀏覽器支援。
 *   - 'single'：強制使用單執行緒 core（相容性最好，不需特殊 header）。
 * 切換模式時會釋放舊實例並重新載入。
 */
export const getFFmpeg = async (mode = 'auto') => {
  const target = resolveMode(mode);

  // 已載入且模式相同 → 直接回傳
  if (ffmpegPromise && loadedMode === target) {
    return ffmpegPromise;
  }

  // 模式不同 → 先釋放舊實例
  if (ffmpegPromise) {
    try {
      const old = await ffmpegPromise;
      old.terminate?.();
    } catch { /* noop */ }
    ffmpegPromise = null;
  }

  loadedMode = target;
  ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg();

    const onProgress = ({ progress }) => {
      loadProgressHandler?.({ type: 'ffmpeg-progress', progress });
    };
    const onLog = ({ message }) => {
      loadProgressHandler?.({ type: 'ffmpeg-log', message });
    };
    ffmpeg.on('progress', onProgress);
    ffmpeg.on('log', onLog);

    let loadConfig;
    if (target === 'mt') {
      // 多執行緒版本（SharedArrayBuffer 加速）
      loadConfig = {
        coreURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core-mt.js`, 'text/javascript', 'ffmpeg-core-mt.js'),
        wasmURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core-mt.wasm`, 'application/wasm', 'ffmpeg-core-mt.wasm'),
        workerURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core-mt.worker.js`, 'text/javascript', 'ffmpeg-core-mt.worker.js'),
      };
    } else {
      loadConfig = {
        coreURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', 'ffmpeg-core.js'),
        wasmURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', 'ffmpeg-core.wasm'),
      };
    }

    try {
      if (target === 'mt') {
        await withTimeout(ffmpeg.load(loadConfig), 30000, 'MT core');
      } else {
        await ffmpeg.load(loadConfig);
      }
    } catch (err) {
      if (target === 'mt') {
        // 退回單執行緒 core
        loadProgressHandler?.({ type: 'ffmpeg-log', message: `MT core 載入失敗（${err.message}），退回單執行緒` });
        loadedMode = 'single';
        await ffmpeg.load({
          coreURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', 'ffmpeg-core.js'),
          wasmURL: await toBlobURLWithProgress(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', 'ffmpeg-core.wasm'),
        });
      } else {
        throw err;
      }
    }

    return ffmpeg;
  })();
  return ffmpegPromise;
};

/**
 * 釋放 FFmpeg 執行個體（可於離開頁面時呼叫）。
 */
export const releaseFFmpeg = async () => {
  if (ffmpegPromise) {
    const ffmpeg = await ffmpegPromise;
    try { ffmpeg.terminate(); } catch { /* noop */ }
    ffmpegPromise = null;
    loadedMode = null;
  }
};
