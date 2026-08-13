import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.10';

let ffmpegPromise = null;
let loadProgressHandler = null;

/**
 * 註冊 FFmpeg 載入進度與 log 回呼（供 UI 顯示）。
 */
export const onFFmpegEvent = (handler) => {
  loadProgressHandler = handler;
};

/**
 * 單例初始化 FFmpeg WASM。
 * - 若瀏覽器為 crossOriginIsolated（已設 COOP/COEP header），使用 multi-threaded core-mt，
 *   並搭配 SharedArrayBuffer 加速。
 * - 否則自動退回單執行緒 core（無需特殊 header 也能運作）。
 */
export const getFFmpeg = async () => {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const isIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

      const onProgress = ({ progress }) => {
        loadProgressHandler?.({ type: 'ffmpeg-progress', progress });
      };
      const onLog = ({ message }) => {
        loadProgressHandler?.({ type: 'ffmpeg-log', message });
      };
      ffmpeg.on('progress', onProgress);
      ffmpeg.on('log', onLog);

      const coreType = isIsolated ? 'core-mt' : 'core';
      const base = `https://unpkg.com/@ffmpeg/${coreType}@${CORE_VERSION}/dist/umd`;

      try {
        const loadConfig = {
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        };
        if (isIsolated) {
          loadConfig.workerURL = await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript');
        }
        await ffmpeg.load(loadConfig);
      } catch (err) {
        // 退回單執行緒 core
        const fb = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${fb}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${fb}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      return ffmpeg;
    })();
  }
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
  }
};
