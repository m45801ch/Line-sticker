import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegPromise = null;
let loadProgressHandler = null;

/**
 * 註冊 FFmpeg 載入進度與 log 回呼（供 UI 顯示）。
 */
export const onFFmpegEvent = (handler) => {
  loadProgressHandler = handler;
};

// 自行託管在 public/ffmpeg/ 的 FFmpeg core（部署時隨網站一起送出，無需外部 CDN）
const CORE_BASE = `${import.meta.env.BASE_URL}ffmpeg`;

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

      try {
        const loadConfig = {
          coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        };
        if (isIsolated) {
          // 多執行緒版本（SharedArrayBuffer 加速）
          loadConfig.coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core-mt.js`, 'text/javascript');
          loadConfig.wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core-mt.wasm`, 'application/wasm');
          loadConfig.workerURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core-mt.worker.js`, 'text/javascript');
        }
        await ffmpeg.load(loadConfig);
      } catch (err) {
        // 退回單執行緒 core
        await ffmpeg.load({
          coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
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
